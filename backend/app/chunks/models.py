import uuid
from datetime import datetime

from sqlalchemy import String, Integer, BigInteger, DateTime, ForeignKey, Index, UniqueConstraint, func, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id", ondelete="CASCADE"))
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    iv: Mapped[str] = mapped_column(String(32), nullable=False)  # AES-GCM IV hex (12 bytes = 24 hex)
    replication_factor: Mapped[int] = mapped_column(Integer, default=3)
    is_compressed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    original_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    file: Mapped["File"] = relationship(back_populates="chunks", foreign_keys=[file_id])
    replicas: Mapped[list["ChunkReplica"]] = relationship(back_populates="chunk", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("file_id", "chunk_index", name="uq_chunk_file_index"),
        Index("idx_chunks_file_id", "file_id"),
    )


class ChunkReplica(Base):
    __tablename__ = "chunk_replicas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chunk_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("chunks.id", ondelete="CASCADE"))
    node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("nodes.id"))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | stored | verified | failed
    stored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    chunk: Mapped["Chunk"] = relationship(back_populates="replicas")

    __table_args__ = (
        Index("idx_chunk_replicas_chunk_id", "chunk_id"),
        Index("idx_chunk_replicas_node_id", "node_id"),
        Index("idx_chunk_replicas_status", "status"),
    )
