from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.chunks.models import Chunk, ChunkReplica
from app.chunks.schemas import ChunkConfirmRequest, ChunkVerifyFailRequest
from app.files.models import File
from app.nodes.models import Node
from app.dependencies import get_current_node

router = APIRouter(prefix="/chunks", tags=["chunks"])


@router.post("/{chunk_id}/confirm", status_code=status.HTTP_200_OK)
async def confirm_chunk(
    chunk_id: str,
    body: ChunkConfirmRequest,
    node: Node = Depends(get_current_node),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChunkReplica).where(
            ChunkReplica.chunk_id == chunk_id,
            ChunkReplica.node_id == node.id,
        )
    )
    replica = result.scalar_one_or_none()
    if not replica:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replica not found")

    # Update chunk hash from the stored data
    chunk_result = await db.execute(select(Chunk).where(Chunk.id == chunk_id))
    chunk = chunk_result.scalar_one_or_none()
    if chunk:
        if chunk.sha256_hash == "pending":
            chunk.sha256_hash = body.sha256_hash
        # Persist actual stored chunk size reported by node (after compression/encryption).
        chunk.size_bytes = body.size_bytes
        original_size = chunk.original_size_bytes or body.size_bytes
        chunk.is_compressed = body.size_bytes < original_size

    replica.status = "stored"
    replica.stored_at = datetime.now(timezone.utc)

    # Update node used_bytes
    node.used_bytes = (node.used_bytes or 0) + body.size_bytes

    # If the parent file is still "uploading", check whether all chunks now
    # have at least one stored replica; if so, mark the file as active.
    if chunk and chunk.file_id:
        file_result = await db.execute(
            select(File)
            .where(File.id == chunk.file_id, File.status == "uploading")
            .options(selectinload(File.chunks).selectinload(Chunk.replicas))
        )
        file = file_result.scalar_one_or_none()
        if file:
            all_stored = all(
                any(r.status in ("stored", "verified") for r in c.replicas)
                for c in file.chunks
            )
            if all_stored:
                file.status = "active"

    await db.commit()
    return {"status": "ok"}


@router.post("/{chunk_id}/verify-fail", status_code=status.HTTP_200_OK)
async def verify_fail(
    chunk_id: str,
    body: ChunkVerifyFailRequest,
    node: Node = Depends(get_current_node),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChunkReplica).where(
            ChunkReplica.chunk_id == chunk_id,
            ChunkReplica.node_id == node.id,
        )
    )
    replica = result.scalar_one_or_none()
    if not replica:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replica not found")

    replica.status = "failed"
    await db.commit()

    # Trigger re-replication by pushing to Redis queue
    from app.replication.worker import enqueue_replication_job
    await enqueue_replication_job(chunk_id, priority=1)

    return {"status": "ok", "action": "re-replication enqueued"}
