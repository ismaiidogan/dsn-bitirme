from pydantic import BaseModel


class ChunkConfirmRequest(BaseModel):
    sha256_hash: str
    size_bytes: int


class ChunkVerifyFailRequest(BaseModel):
    error: str | None = None
