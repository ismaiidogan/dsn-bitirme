import math
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, Float

from app.nodes.models import Node
from app.config import settings


async def select_nodes_for_chunk(
    db: AsyncSession,
    chunk_size: int,
    exclude_node_ids: list[str] | None = None,
    count: int | None = None,
) -> list[Node]:
    """
    Select active nodes for a chunk using spec 9.4 algorithm:
    1. status = 'active'
    2. available quota >= chunk_size
    3. Not already holding this chunk (via exclude_node_ids)
    4. Prefer different users' nodes (diversity)
    5. Lowest used_bytes / quota_bytes ratio first
    """
    target_count = count or settings.REPLICATION_FACTOR
    exclude = exclude_node_ids or []

    query = (
        select(Node)
        .where(
            Node.status == "active",
            (Node.used_bytes + chunk_size) <= Node.quota_bytes,
        )
    )
    if exclude:
        query = query.where(Node.id.notin_(exclude))

    # Fetch extra candidates (sorted by fill ratio) for diversity selection
    query = query.order_by(
        (Node.used_bytes.cast(Float) / Node.quota_bytes.cast(Float)).asc()
    ).limit(target_count * 5)

    result = await db.execute(query)
    candidates = list(result.scalars().all())

    # Greedy diversity: first pass picks one node per unique user_id (lowest fill first)
    selected: list[Node] = []
    seen_user_ids: set = set()
    for node in candidates:
        if len(selected) >= target_count:
            break
        if node.user_id not in seen_user_ids:
            selected.append(node)
            seen_user_ids.add(node.user_id)

    # Second pass: fill remaining slots from any eligible node not yet selected
    if len(selected) < target_count:
        selected_ids = {n.id for n in selected}
        for node in candidates:
            if len(selected) >= target_count:
                break
            if node.id not in selected_ids:
                selected.append(node)
                selected_ids.add(node.id)

    return selected


def calculate_chunk_count(file_size: int) -> int:
    return math.ceil(file_size / settings.CHUNK_SIZE_BYTES)


def calculate_chunk_size(file_size: int, chunk_index: int) -> int:
    total = calculate_chunk_count(file_size)
    if chunk_index < total - 1:
        return settings.CHUNK_SIZE_BYTES
    remainder = file_size % settings.CHUNK_SIZE_BYTES
    return remainder if remainder > 0 else settings.CHUNK_SIZE_BYTES
