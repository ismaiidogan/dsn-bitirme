"""add billing tables

Revision ID: 0004
Revises: 0003
Create Date: 2025-02-01 00:10:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "storage_earnings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("nodes.id", ondelete="CASCADE")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True)),
        sa.Column("bytes_stored", sa.BigInteger, server_default="0"),
        sa.Column("bytes_transferred", sa.BigInteger, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_storage_earnings_node_id", "storage_earnings", ["node_id"])
    op.create_index(
        "idx_storage_earnings_period",
        "storage_earnings",
        ["period_start", "period_end"],
    )

    op.create_table(
        "storage_usage",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("file_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("files.id", ondelete="CASCADE")),
        sa.Column("replication_factor", sa.Integer, nullable=False),
        sa.Column("bytes_stored", sa.BigInteger, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
    )
    op.create_index("idx_storage_usage_user_id", "storage_usage", ["user_id"])
    op.create_index(
        "idx_storage_usage_active",
        "storage_usage",
        ["ended_at"],
        postgresql_where=sa.text("ended_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_storage_usage_active", table_name="storage_usage")
    op.drop_index("idx_storage_usage_user_id", table_name="storage_usage")
    op.drop_table("storage_usage")

    op.drop_index("idx_storage_earnings_period", table_name="storage_earnings")
    op.drop_index("idx_storage_earnings_node_id", table_name="storage_earnings")
    op.drop_table("storage_earnings")

