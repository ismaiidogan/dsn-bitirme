import uuid
from datetime import datetime
from pydantic import BaseModel


class NodeRegisterRequest(BaseModel):
    name: str | None = None
    address: str
    port: int
    quota_gb: float

    @property
    def quota_bytes(self) -> int:
        return int(self.quota_gb * 1024 ** 3)


class NodeResponse(BaseModel):
    id: uuid.UUID
    name: str | None
    address: str
    port: int
    quota_bytes: int
    used_bytes: int
    disk_free_bytes: int | None
    status: str
    last_heartbeat_at: datetime | None
    registered_at: datetime

    model_config = {"from_attributes": True}


class NodeUpdateRequest(BaseModel):
    quota_bytes: int
    bandwidth_limit_mbps: float


class NodeRegisterResponse(BaseModel):
    node: NodeResponse
    node_token: str


class HeartbeatMessage(BaseModel):
    type: str  # "heartbeat"
    node_id: str
    timestamp: datetime
    disk_free_bytes: int
    disk_total_bytes: int
    used_quota_bytes: int
    chunk_count: int
    status: str = "active"
