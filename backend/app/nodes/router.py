import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.nodes.models import Node
from app.nodes.schemas import (
    NodeRegisterRequest,
    NodeResponse,
    NodeRegisterResponse,
    HeartbeatMessage,
    NodeUpdateRequest,
)
from app.nodes.connection_manager import manager
from app.auth.models import User
from app.auth.utils import create_node_token, decode_token
from app.dependencies import get_current_user

router = APIRouter(prefix="/nodes", tags=["nodes"])


@router.post("/register", response_model=NodeRegisterResponse, status_code=status.HTTP_201_CREATED)
async def register_node(
    body: NodeRegisterRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    node = Node(
        user_id=current_user.id,
        name=body.name,
        address=body.address,
        port=body.port,
        quota_bytes=body.quota_bytes,
        status="active",
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)

    node_token = create_node_token(str(node.id))
    return NodeRegisterResponse(
        node=NodeResponse.model_validate(node),
        node_token=node_token,
    )


@router.get("/my", response_model=list[NodeResponse])
async def get_my_nodes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Node).where(Node.user_id == current_user.id))
    return [NodeResponse.model_validate(n) for n in result.scalars().all()]


@router.delete("/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node(
    node_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Node).where(Node.id == node_id, Node.user_id == current_user.id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    await db.delete(node)
    await db.commit()


@router.patch("/{node_id}", response_model=NodeResponse)
async def update_node(
    node_id: str,
    body: NodeUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Node token auth via Authorization: Bearer <token>
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing node token")

    token = auth.split(" ", 1)[1]
    payload = decode_token(token)
    if not payload or payload.get("type") != "node" or payload.get("sub") != node_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid node token")

    if body.quota_bytes <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quota_bytes must be > 0")
    if body.bandwidth_limit_mbps < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="bandwidth_limit_mbps must be >= 0")

    result = await db.execute(select(Node).where(Node.id == node_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")

    node.quota_bytes = body.quota_bytes
    # bandwidth_limit_mbps henüz Node modelinde saklanmıyor; gelecekte eklenebilir.

    await db.commit()
    await db.refresh(node)
    return NodeResponse.model_validate(node)


@router.websocket("/{node_id}/ws")
async def node_websocket(node_id: str, websocket: WebSocket, db: AsyncSession = Depends(get_db)):
    # Authenticate via query param token
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return

    payload = decode_token(token)
    if not payload or payload.get("type") != "node" or payload.get("sub") != node_id:
        await websocket.close(code=4001)
        return

    result = await db.execute(select(Node).where(Node.id == node_id))
    node = result.scalar_one_or_none()
    if not node:
        await websocket.close(code=4004)
        return

    await manager.connect(node_id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type")
            if msg_type == "heartbeat":
                node.last_heartbeat_at = datetime.now(timezone.utc)
                node.disk_free_bytes = data.get("disk_free_bytes")
                node.used_bytes = data.get("used_quota_bytes", node.used_bytes)
                node.status = "active"
                await db.commit()

    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(node_id)
