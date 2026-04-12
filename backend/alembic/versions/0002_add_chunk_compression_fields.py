"""add chunk compression fields

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chunks",
        sa.Column("is_compressed", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "chunks",
        sa.Column("original_size_bytes", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chunks", "original_size_bytes")
    op.drop_column("chunks", "is_compressed")

