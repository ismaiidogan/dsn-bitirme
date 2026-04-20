import asyncio
from fastapi import WebSocket


class ConnectionManager:
    """Tracks active WebSocket connections keyed by node_id."""

    def __init__(self):
        self._connections: dict[str, WebSocket] = {}
        self._pending: dict[str, asyncio.Future] = {}
        self._lock = asyncio.Lock()

    async def connect(self, node_id: str, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self._connections[node_id] = websocket

    async def disconnect(self, node_id: str):
        async with self._lock:
            self._connections.pop(node_id, None)

    async def send(self, node_id: str, message: dict) -> bool:
        """Send a JSON message to a specific node. Returns True if sent."""
        ws = self._connections.get(node_id)
        if ws is None:
            return False
        try:
            await ws.send_json(message)
            return True
        except Exception:
            async with self._lock:
                self._connections.pop(node_id, None)
            return False

    def is_connected(self, node_id: str) -> bool:
        return node_id in self._connections

    async def wait_for_response(self, request_id: str, timeout_sec: float = 20.0) -> dict | None:
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        async with self._lock:
            self._pending[request_id] = future
        try:
            return await asyncio.wait_for(future, timeout=timeout_sec)
        except asyncio.TimeoutError:
            return None
        finally:
            async with self._lock:
                self._pending.pop(request_id, None)

    async def resolve_response(self, request_id: str, message: dict):
        async with self._lock:
            future = self._pending.get(request_id)
        if future and not future.done():
            future.set_result(message)


manager = ConnectionManager()
