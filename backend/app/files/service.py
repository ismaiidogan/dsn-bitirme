import hashlib
from datetime import datetime, timezone
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from sqlalchemy.orm import selectinload

from app.files.models import File, AesKey
from app.chunks.models import Chunk, ChunkReplica
from app.nodes.models import Node
from app.replication.models import StorageUsage
from app.storage.encryption import generate_aes_key, encrypt_aes_key, decrypt_aes_key, generate_iv, iv_to_hex
from app.storage.service import select_nodes_for_chunk, calculate_chunk_count, calculate_chunk_size
from app.files.schemas import (
    ChunkManifestItem, UploadManifest, ReplicationStatus,
    ChunkInfo, ChunkReplicaInfo, FileDetailResponse, FileResponse,
    DownloadManifest, DownloadManifestChunk,
)
from app.config import settings


def _replication_status(active: int, total: int) -> ReplicationStatus:
    if total == 0:
        return ReplicationStatus(active=0, total=0, health="critical")
    if active >= total:
        health = "full"
    elif active > 0:
        health = "partial"
    else:
        health = "critical"
    return ReplicationStatus(active=active, total=total, health=health)


async def init_upload(
    db: AsyncSession,
    user_id: str,
    filename: str,
    size_bytes: int,
    mime_type: str | None,
    replication_factor: int,
) -> UploadManifest:
    if size_bytes > settings.MAX_FILE_SIZE_BYTES:
        raise ValueError(f"File exceeds maximum size of {settings.MAX_FILE_SIZE_BYTES} bytes")

    chunk_count = calculate_chunk_count(size_bytes)

    # Ensure we have enough active nodes for the requested replication factor
    active_nodes_result = await db.execute(
        select(func.count(Node.id)).where(Node.status == "active")
    )
    active_nodes = active_nodes_result.scalar_one() or 0
    if active_nodes < replication_factor:
        raise ValueError(
            f"Yeterli aktif node yok. İstenen: {replication_factor}, Mevcut: {active_nodes}"
        )

    # Get or create AES key for user
    result = await db.execute(select(AesKey).where(AesKey.user_id == user_id))
    aes_key_record = result.scalar_one_or_none()
    if not aes_key_record:
        raw_key = generate_aes_key()
        aes_key_record = AesKey(user_id=user_id, encrypted_key=encrypt_aes_key(raw_key))
        db.add(aes_key_record)
        await db.flush()
    else:
        raw_key = decrypt_aes_key(aes_key_record.encrypted_key)

    file = File(
        user_id=user_id,
        original_name=filename,
        size_bytes=size_bytes,
        mime_type=mime_type,
        chunk_count=chunk_count,
        replication_factor=replication_factor,
        encryption_key_id=aes_key_record.id,
        status="uploading",
    )
    db.add(file)
    await db.flush()

    from app.auth.utils import create_node_token
    aes_key_hex = raw_key.hex()

    manifest_items: list[ChunkManifestItem] = []
    for idx in range(chunk_count):
        chunk_size = calculate_chunk_size(size_bytes, idx)
        iv = generate_iv()
        iv_hex = iv_to_hex(iv)

        # Placeholder hash — will be confirmed when node reports back
        chunk = Chunk(
            file_id=file.id,
            chunk_index=idx,
            size_bytes=chunk_size,
            sha256_hash="pending",
            iv=iv_hex,
            replication_factor=replication_factor,
            is_compressed=True,
            original_size_bytes=chunk_size,
        )
        db.add(chunk)
        await db.flush()

        nodes = await select_nodes_for_chunk(db, chunk_size, count=replication_factor)
        node_urls = []
        node_tokens = []
        for node in nodes:
            replica = ChunkReplica(chunk_id=chunk.id, node_id=node.id, status="pending")
            db.add(replica)
            node_urls.append(node.url)
            node_tokens.append(create_node_token(str(node.id)))

        manifest_items.append(ChunkManifestItem(
            chunk_index=idx,
            chunk_id=str(chunk.id),
            size_bytes=chunk_size,
            iv=iv_hex,
            aes_key_hex=aes_key_hex,
            node_urls=node_urls,
            node_tokens=node_tokens,
        ))

    await db.commit()
    return UploadManifest(file_id=str(file.id), chunks=manifest_items)


async def complete_upload(db: AsyncSession, user_id: str, file_id: str) -> File:
    result = await db.execute(
        select(File)
        .where(File.id == file_id, File.user_id == user_id)
        .options(selectinload(File.chunks).selectinload(Chunk.replicas))
    )
    file = result.scalar_one_or_none()
    if not file:
        raise ValueError("File not found")

    # Check all replicas are stored (at least one per chunk)
    for chunk in file.chunks:
        stored = [r for r in chunk.replicas if r.status in ("stored", "verified")]
        if not stored:
            raise ValueError(f"Chunk {chunk.chunk_index} has no stored replicas yet")

    file.status = "active"

    # Ensure storage_usage row exists for this file (for billing)
    existing = await db.execute(
        select(StorageUsage).where(
            StorageUsage.file_id == file.id,
            StorageUsage.ended_at.is_(None),
        )
    )
    if not existing.scalar_one_or_none():
        usage = StorageUsage(
            user_id=file.user_id,
            file_id=file.id,
            replication_factor=file.replication_factor,
            bytes_stored=file.size_bytes * file.replication_factor,
        )
        db.add(usage)

    await db.commit()
    await db.refresh(file)
    return file


async def list_files(db: AsyncSession, user_id: str) -> list[FileResponse]:
    result = await db.execute(
        select(File)
        .where(File.user_id == user_id, File.status != "deleted")
        .options(selectinload(File.chunks).selectinload(Chunk.replicas))
        .order_by(File.created_at.desc())
    )
    files = result.scalars().all()

    # Auto-heal: if a file is still "uploading" but all chunks already have a
    # stored/verified replica (e.g. confirm arrived after upload_complete failed),
    # mark it as active.
    changed = False
    for f in files:
        if f.status == "uploading" and f.chunks and all(
            any(r.status in ("stored", "verified") for r in c.replicas) for c in f.chunks
        ):
            f.status = "active"
            changed = True
    if changed:
        await db.commit()

    responses = []
    for f in files:
        total_replicas = sum(len(c.replicas) for c in f.chunks)
        # Count replicas on active nodes — simplified: count stored/verified replicas
        active_replicas = sum(
            1 for c in f.chunks for r in c.replicas if r.status in ("stored", "verified")
        )
        rep = _replication_status(active_replicas, total_replicas)
        resp = FileResponse(
            id=str(f.id),
            original_name=f.original_name,
            size_bytes=f.size_bytes,
            mime_type=f.mime_type,
            chunk_count=f.chunk_count,
            replication_factor=f.replication_factor,
            status=f.status,
            created_at=f.created_at,
            replication=rep,
        )
        responses.append(resp)
    return responses


async def get_file_detail(db: AsyncSession, user_id: str, file_id: str) -> FileDetailResponse | None:
    result = await db.execute(
        select(File)
        .where(File.id == file_id, File.user_id == user_id)
        .options(selectinload(File.chunks).selectinload(Chunk.replicas))
    )
    f = result.scalar_one_or_none()
    if not f:
        return None

    # Same auto-heal as in list_files, but for a single file.
    if f.status == "uploading" and f.chunks and all(
        any(r.status in ("stored", "verified") for r in c.replicas) for c in f.chunks
    ):
        f.status = "active"
        await db.commit()

    # Load nodes for replicas
    node_ids = [r.node_id for c in f.chunks for r in c.replicas]
    node_result = await db.execute(select(Node).where(Node.id.in_(node_ids)))
    node_map = {n.id: n for n in node_result.scalars().all()}

    chunks_info = []
    for c in sorted(f.chunks, key=lambda x: x.chunk_index):
        replicas_info = []
        for r in c.replicas:
            node = node_map.get(r.node_id)
            if node:
                replicas_info.append(ChunkReplicaInfo(
                    replica_id=str(r.id),
                    node_id=str(r.node_id),
                    node_address=node.address,
                    node_port=node.port,
                    node_status=node.status,
                    replica_status=r.status,
                ))
        chunks_info.append(ChunkInfo(
            chunk_id=str(c.id),
            chunk_index=c.chunk_index,
            size_bytes=c.size_bytes,
            sha256_hash=c.sha256_hash,
            replicas=replicas_info,
        ))

    total_replicas = sum(len(c.replicas) for c in f.chunks)
    active_replicas = sum(1 for c in f.chunks for r in c.replicas if r.status in ("stored", "verified"))

    return FileDetailResponse(
        id=str(f.id),
        original_name=f.original_name,
        size_bytes=f.size_bytes,
        mime_type=f.mime_type,
        chunk_count=f.chunk_count,
        replication_factor=f.replication_factor,
        status=f.status,
        created_at=f.created_at,
        replication=_replication_status(active_replicas, total_replicas),
        chunks=chunks_info,
    )


async def get_download_manifest(db: AsyncSession, user_id: str, file_id: str) -> DownloadManifest | None:
    from app.auth.utils import create_node_token

    result = await db.execute(
        select(File)
        .where(File.id == file_id, File.user_id == user_id, File.status == "active")
        .options(selectinload(File.chunks).selectinload(Chunk.replicas))
    )
    f = result.scalar_one_or_none()
    if not f:
        return None

    # Decrypt the user's AES key so the client can decrypt chunks
    key_result = await db.execute(select(AesKey).where(AesKey.user_id == user_id))
    aes_key_record = key_result.scalar_one_or_none()
    if not aes_key_record:
        return None
    aes_key_hex = decrypt_aes_key(aes_key_record.encrypted_key).hex()

    node_ids = [r.node_id for c in f.chunks for r in c.replicas]
    node_result = await db.execute(select(Node).where(Node.id.in_(node_ids), Node.status == "active"))
    node_map = {n.id: n for n in node_result.scalars().all()}

    chunks_dl = []
    for c in sorted(f.chunks, key=lambda x: x.chunk_index):
        # Pick first available active node for this chunk
        active_replica = next(
            (r for r in c.replicas if r.status in ("stored", "verified") and r.node_id in node_map),
            None,
        )
        if not active_replica:
            return None  # File unavailable

        node = node_map[active_replica.node_id]
        chunks_dl.append(DownloadManifestChunk(
            chunk_index=c.chunk_index,
            chunk_id=str(c.id),
            iv=c.iv,
            sha256_hash=c.sha256_hash,
            node_url=node.url,
            node_token=create_node_token(str(node.id)),
        ))

    return DownloadManifest(
        file_id=str(f.id),
        filename=f.original_name,
        size_bytes=f.size_bytes,
        aes_key_hex=aes_key_hex,
        chunks=chunks_dl,
    )


async def delete_file(db: AsyncSession, user_id: str, file_id: str) -> bool:
    from app.nodes.connection_manager import manager

    result = await db.execute(
        select(File)
        .where(File.id == file_id, File.user_id == user_id)
        .options(selectinload(File.chunks).selectinload(Chunk.replicas))
    )
    f = result.scalar_one_or_none()
    if not f:
        return False

    # Mantıksal silme süreci: önce kullanım kaydını kapat, sonra
    # node'lara chunk silme komutu gönder ve dosyayı "deleted" durumuna al.
    f.status = "deleting"
    await db.flush()

    # Mark storage_usage rows as ended for this file (billing için)
    await db.execute(
        text(
            "UPDATE storage_usage "
            "SET ended_at = NOW() "
            "WHERE file_id = :file_id AND ended_at IS NULL"
        ),
        {"file_id": str(f.id)},
    )

    # Notify nodes to delete chunks via WebSocket
    for c in f.chunks:
        for r in c.replicas:
            await manager.send(
                str(r.node_id),
                {
                    "type": "delete_chunk",
                    "chunk_id": str(c.id),
                },
            )

    # Fiziksel silmek yerine statüyü "deleted" yapıyoruz; böylece
    # storage_usage kaydı ended_at ile birlikte korunuyor.
    f.status = "deleted"
    await db.commit()
    return True


async def relay_chunk_upload(
    db: AsyncSession,
    user_id: str,
    chunk_id: str,
    encrypted_data: bytes,
    sha256_hash: str,
) -> dict:
    from app.auth.utils import create_node_token

    try:
        chunk_uuid = UUID(chunk_id)
    except ValueError as exc:
        raise ValueError("Invalid chunk id") from exc

    chunk_result = await db.execute(
        select(Chunk)
        .join(File, Chunk.file_id == File.id)
        .where(
            Chunk.id == chunk_uuid,
            File.user_id == user_id,
            File.status == "uploading",
        )
    )
    chunk = chunk_result.scalar_one_or_none()
    if not chunk:
        raise ValueError("Chunk not found for current user")

    calculated_hash = hashlib.sha256(encrypted_data).hexdigest()
    if calculated_hash != sha256_hash:
        raise ValueError("Chunk hash mismatch")

    replicas_result = await db.execute(
        select(ChunkReplica).where(
            ChunkReplica.chunk_id == chunk_uuid,
            ChunkReplica.status.in_(("pending", "failed")),
        )
    )
    replicas = replicas_result.scalars().all()
    if not replicas:
        raise ValueError("No pending replicas available for this chunk")

    node_ids = [r.node_id for r in replicas]
    nodes_result = await db.execute(select(Node).where(Node.id.in_(node_ids)))
    nodes = {n.id: n for n in nodes_result.scalars().all()}

    errors: list[str] = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        for replica in replicas:
            node = nodes.get(replica.node_id)
            if not node:
                continue

            node_token = create_node_token(str(node.id))
            try:
                response = await client.put(
                    f"{node.url}/chunks/{chunk_id}",
                    headers={
                        "Authorization": f"Bearer {node_token}",
                        "Content-Type": "application/octet-stream",
                        "X-Chunk-Hash": sha256_hash,
                        "X-Chunk-Size": str(len(encrypted_data)),
                    },
                    content=encrypted_data,
                )
                if response.is_success:
                    return {"status": "ok", "node_id": str(node.id)}
                errors.append(f"{node.url} -> {response.status_code}")
            except Exception as exc:
                errors.append(f"{node.url} -> {exc}")

    raise ValueError(
        "Chunk relay failed on all replicas: " + "; ".join(errors[:3])
    )
