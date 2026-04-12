from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, text, update

from app.config import settings
from app.database import AsyncSessionLocal

scheduler = AsyncIOScheduler()


async def node_status_updater() -> None:
    """Mark nodes inactive or dead based on heartbeat age."""
    now = datetime.now(timezone.utc)
    inactive_threshold = now - timedelta(minutes=settings.NODE_ACTIVE_THRESHOLD_MIN)
    dead_threshold = now - timedelta(hours=settings.NODE_DEAD_THRESHOLD_HOURS)

    async with AsyncSessionLocal() as db:
        from app.nodes.models import Node

        # active → inactive
        await db.execute(
            update(Node)
            .where(
                Node.status == "active",
                Node.last_heartbeat_at < inactive_threshold,
            )
            .values(status="inactive")
        )

        # inactive → dead (triggers re-replication)
        dead_result = await db.execute(
            select(Node).where(
                Node.status == "inactive",
                Node.last_heartbeat_at < dead_threshold,
            )
        )
        dead_nodes = dead_result.scalars().all()
        for node in dead_nodes:
            node.status = "dead"

        await db.commit()


async def re_replication_check() -> None:
    """Find under-replicated chunks and enqueue replication jobs."""
    from app.replication.worker import enqueue_replication_job

    query = text("""
        SELECT c.id::text, c.replication_factor,
               COUNT(cr.id) FILTER (
                   WHERE n.status = 'active' AND cr.status IN ('stored', 'verified')
               ) AS active_replicas
        FROM chunks c
        JOIN chunk_replicas cr ON cr.chunk_id = c.id
        JOIN nodes n ON n.id = cr.node_id
        JOIN files f ON f.id = c.file_id
        WHERE f.status = 'active'
        GROUP BY c.id, c.replication_factor
        HAVING COUNT(cr.id) FILTER (
            WHERE n.status = 'active' AND cr.status IN ('stored', 'verified')
        ) < c.replication_factor
        ORDER BY active_replicas ASC
        LIMIT 100
    """)

    async with AsyncSessionLocal() as db:
        result = await db.execute(query)
        rows = result.fetchall()

    for row in rows:
        chunk_id, replication_factor, active_replicas = row
        needed = replication_factor - active_replicas
        priority = max(1, 10 - needed * 2)  # fewer replicas = higher priority
        await enqueue_replication_job(chunk_id, priority=priority, needed_replicas=needed)


async def process_jobs_tick() -> None:
    """Run the replication worker on each tick."""
    from app.replication.worker import process_replication_jobs
    await process_replication_jobs()


async def update_billing_stats() -> None:
    """Daily rollup for storage_earnings.

    For each active node, snapshot its used_bytes into storage_earnings.
    (storage_usage kayıtları upload/silme akışında oluşturulup kapanıyor.)
    """
    from app.nodes.models import Node
    from app.replication.models import StorageEarning

    now = datetime.now(timezone.utc)
    start_of_day = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)

    async with AsyncSessionLocal() as db:
        # Close previous open earnings periods (if any)
        await db.execute(
            update(StorageEarning)
            .where(StorageEarning.period_end.is_(None))
            .values(period_end=start_of_day)
        )

        # Snapshot current active nodes
        node_result = await db.execute(
            select(Node).where(Node.status == "active")
        )
        nodes = node_result.scalars().all()
        for node in nodes:
            earning = StorageEarning(
                node_id=node.id,
                user_id=node.user_id,
                period_start=start_of_day,
                bytes_stored=node.used_bytes or 0,
                bytes_transferred=0,
            )
            db.add(earning)

        await db.commit()


def start_scheduler() -> None:
    scheduler.add_job(node_status_updater, "interval", minutes=5, id="node_status_updater")
    scheduler.add_job(re_replication_check, "interval", minutes=settings.RE_REPLICATION_CHECK_MIN, id="re_replication_check")
    scheduler.add_job(process_jobs_tick, "interval", minutes=1, id="process_replication_jobs")
    scheduler.add_job(update_billing_stats, "cron", hour=0, minute=0, id="billing_rollup")
    scheduler.start()


def stop_scheduler() -> None:
    scheduler.shutdown(wait=False)
