"""initial schema

Revision ID: 0001
Revises:
Create Date: 2025-02-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "nodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("name", sa.String(100)),
        sa.Column("address", sa.String(255), nullable=False),
        sa.Column("port", sa.Integer, nullable=False),
        sa.Column("quota_bytes", sa.BigInteger, nullable=False),
        sa.Column("used_bytes", sa.BigInteger, default=0),
        sa.Column("disk_free_bytes", sa.BigInteger),
        sa.Column("status", sa.String(20), default="active"),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True)),
        sa.Column("registered_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_nodes_status", "nodes", ["status"])
    op.create_index("idx_nodes_last_heartbeat", "nodes", ["last_heartbeat_at"])

    op.create_table(
        "aes_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("encrypted_key", sa.LargeBinary, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("original_name", sa.String(500), nullable=False),
        sa.Column("size_bytes", sa.BigInteger, nullable=False),
        sa.Column("mime_type", sa.String(100)),
        sa.Column("chunk_count", sa.Integer, nullable=False),
        sa.Column("encryption_key_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("aes_keys.id")),
        sa.Column("status", sa.String(20), default="uploading"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_files_user_id", "files", ["user_id"])
    op.create_index("idx_files_status", "files", ["status"])

    op.create_table(
        "chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("file_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("files.id", ondelete="CASCADE")),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("size_bytes", sa.Integer, nullable=False),
        sa.Column("sha256_hash", sa.String(64), nullable=False),
        sa.Column("iv", sa.String(32), nullable=False),
        sa.Column("replication_factor", sa.Integer, default=3),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("file_id", "chunk_index", name="uq_chunk_file_index"),
    )
    op.create_index("idx_chunks_file_id", "chunks", ["file_id"])

    op.create_table(
        "chunk_replicas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("chunk_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chunks.id", ondelete="CASCADE")),
        sa.Column("node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("nodes.id")),
        sa.Column("status", sa.String(20), default="pending"),
        sa.Column("stored_at", sa.DateTime(timezone=True)),
        sa.Column("last_verified_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_chunk_replicas_chunk_id", "chunk_replicas", ["chunk_id"])
    op.create_index("idx_chunk_replicas_node_id", "chunk_replicas", ["node_id"])
    op.create_index("idx_chunk_replicas_status", "chunk_replicas", ["status"])

    op.create_table(
        "replication_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("chunk_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chunks.id")),
        sa.Column("source_node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("nodes.id")),
        sa.Column("target_node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("nodes.id")),
        sa.Column("status", sa.String(20), default="pending"),
        sa.Column("priority", sa.Integer, default=5),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("error_message", sa.Text),
    )
    op.create_index("idx_replication_jobs_status", "replication_jobs", ["status"])
    op.create_index("idx_replication_jobs_priority", "replication_jobs", ["priority", "created_at"])


def downgrade() -> None:
    op.drop_table("replication_jobs")
    op.drop_table("chunk_replicas")
    op.drop_table("chunks")
    op.drop_table("files")
    op.drop_table("aes_keys")
    op.drop_table("nodes")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
