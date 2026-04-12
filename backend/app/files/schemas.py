import uuid
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, model_validator

from app.config import settings

# Dosya adı için izin verilmeyen karakterler (path traversal vb.)
_FILENAME_FORBIDDEN = ("/", "\\", "\0", "..")


class UploadInitRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255, description="Orijinal dosya adı")
    size_bytes: int = Field(gt=0, description="Dosya boyutu (byte)")
    mime_type: str | None = None
    replication_factor: int = Field(default=3, ge=1, le=3)

    @field_validator("filename")
    @classmethod
    def filename_no_path(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Dosya adı boş olamaz")
        for forbidden in _FILENAME_FORBIDDEN:
            if forbidden in v:
                raise ValueError("Dosya adında geçersiz karakter veya path kullanılamaz")
        return v.strip()

    @model_validator(mode="after")
    def size_within_limit(self):
        if self.size_bytes > settings.MAX_FILE_SIZE_BYTES:
            raise ValueError(
                f"Dosya boyutu en fazla {settings.MAX_FILE_SIZE_BYTES} byte olabilir"
            )
        return self


class ChunkManifestItem(BaseModel):
    chunk_index: int
    chunk_id: str
    size_bytes: int
    iv: str               # hex-encoded 12-byte IV
    aes_key_hex: str      # hex-encoded AES-256 key for this upload session
    node_urls: list[str]  # where to PUT this chunk (same order as node_tokens)
    node_tokens: list[str]  # Bearer tokens for authenticating with each node


class UploadManifest(BaseModel):
    file_id: str
    chunks: list[ChunkManifestItem]


class UploadCompleteRequest(BaseModel):
    file_id: str


class ReplicationStatus(BaseModel):
    active: int
    total: int
    health: str  # "full" | "partial" | "critical"


class FileResponse(BaseModel):
    id: str
    original_name: str
    size_bytes: int
    mime_type: str | None
    chunk_count: int
    replication_factor: int
    status: str
    created_at: datetime
    replication: ReplicationStatus | None = None

    model_config = {"from_attributes": True}


class ChunkReplicaInfo(BaseModel):
    replica_id: str
    node_id: str
    node_address: str
    node_port: int
    node_status: str
    replica_status: str


class ChunkInfo(BaseModel):
    chunk_id: str
    chunk_index: int
    size_bytes: int
    sha256_hash: str
    replicas: list[ChunkReplicaInfo]


class FileDetailResponse(FileResponse):
    chunks: list[ChunkInfo] = []


class DownloadManifestChunk(BaseModel):
    chunk_index: int
    chunk_id: str
    iv: str
    sha256_hash: str
    node_url: str
    node_token: str  # Bearer token for authenticating with the node


class DownloadManifest(BaseModel):
    file_id: str
    filename: str
    size_bytes: int
    aes_key_hex: str  # hex-encoded AES-256 key for client-side decryption
    chunks: list[DownloadManifestChunk]
