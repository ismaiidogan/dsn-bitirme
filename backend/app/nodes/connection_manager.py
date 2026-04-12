import asyncio
from fastapi import WebSocket


class ConnectionManager:
    """Tracks active WebSocket connections keyed by node_id."""

    def __init__(self):
        self._connections: dict[str, WebSocket] = {}
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


manager = ConnectionManager()
