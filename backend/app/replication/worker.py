import json
import asyncio

import redis.asyncio as aioredis

from app.config import settings

QUEUE_KEY = "dsn:replication_jobs"

_redis_client: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


async def enqueue_replication_job(chunk_id: str, priority: int = 5, needed_replicas: int = 1) -> None:
    """Push a replication job to the Redis priority queue."""
    client = get_redis()
    job = {
        "chunk_id": chunk_id,
        "needed_replicas": needed_replicas,
        "priority": priority,
    }
    # Use Redis sorted set: score = priority (lower = higher priority)
    await client.zadd(QUEUE_KEY, {json.dumps(job): priority})


async def process_replication_jobs() -> None:
    """Process pending replication jobs from Redis queue."""
    from app.database import AsyncSessionLocal
    from app.chunks.models import Chunk, ChunkReplica
    from app.nodes.models import Node
    from app.replication.models import ReplicationJob
    from app.storage.service import select_nodes_for_chunk
    from app.nodes.connection_manager import manager
    from sqlalchemy import select
    from datetime import datetime, timezone

    client = get_redis()

    # Pop up to 10 jobs with lowest score (highest priority)
    jobs_raw = await client.zpopmin(QUEUE_KEY, count=10)
    if not jobs_raw:
        return

    async with AsyncSessionLocal() as db:
        for job_str, _ in jobs_raw:
            try:
                job = json.loads(job_str)
                chunk_id = job["chunk_id"]
                needed = job.get("needed_replicas", 1)

                # Find chunk and its active replicas
                result = await db.execute(select(Chunk).where(Chunk.id == chunk_id))
                chunk = result.scalar_one_or_none()
                if not chunk:
                    continue

                replica_result = await db.execute(
                    select(ChunkReplica).where(ChunkReplica.chunk_id == chunk_id)
                )
                replicas = replica_result.scalars().all()
                active_replica = next(
                    (r for r in replicas if r.status in ("stored", "verified")), None
                )
                if not active_replica:
                    continue

                source_node_result = await db.execute(
                    select(Node).where(Node.id == active_replica.node_id, Node.status == "active")
                )
                source_node = source_node_result.scalar_one_or_none()
                if not source_node:
                    continue

                existing_node_ids = [str(r.node_id) for r in replicas]
                target_nodes = await select_nodes_for_chunk(
                    db, chunk.size_bytes, exclude_node_ids=existing_node_ids, count=needed
                )

                for target_node in target_nodes:
                    from app.auth.utils import create_node_token
                    target_token = create_node_token(str(target_node.id))

                    # Record the job
                    rep_job = ReplicationJob(
                        chunk_id=chunk.id,
                        source_node_id=source_node.id,
                        target_node_id=target_node.id,
                        status="in_progress",
                        priority=job.get("priority", 5),
                        started_at=datetime.now(timezone.utc),
                    )
                    db.add(rep_job)

                    # Add pending replica record
                    new_replica = ChunkReplica(
                        chunk_id=chunk.id,
                        node_id=target_node.id,
                        status="pending",
                    )
                    db.add(new_replica)
                    await db.flush()

                    # Send replicate_chunk command to source node via WebSocket
                    sent = await manager.send(str(source_node.id), {
                        "type": "replicate_chunk",
                        "chunk_id": str(chunk.id),
                        "target_node_url": target_node.url,
                        "target_node_token": target_token,
                    })

                    if not sent:
                        rep_job.status = "failed"
                        rep_job.error_message = "Source node not connected"
                    else:
                        rep_job.completed_at = datetime.now(timezone.utc)
                        rep_job.status = "completed"

                await db.commit()

            except Exception as e:
                await db.rollback()
                # Re-enqueue on failure
                await enqueue_replication_job(chunk_id, priority=5)
