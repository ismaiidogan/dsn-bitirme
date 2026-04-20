"""add mock billing checkout tables

Revision ID: 0005
Revises: 0004
Create Date: 2025-02-01 00:20:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mock_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("plan_code", sa.String(length=50), nullable=False, server_default="usage-basic"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="active"),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("auto_renew", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "mock_invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invoice_no", sa.String(length=64), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("usage_gb_hour", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("amount_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("invoice_no", name="uq_mock_invoices_invoice_no"),
    )
    op.create_index("idx_mock_invoices_user_id", "mock_invoices", ["user_id"])
    op.create_index("idx_mock_invoices_issued_at", "mock_invoices", ["issued_at"])

    op.create_table(
        "mock_payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("mock_invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="succeeded"),
        sa.Column("provider", sa.String(length=20), nullable=False, server_default="mock"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_mock_payments_user_id", "mock_payments", ["user_id"])
    op.create_index("idx_mock_payments_invoice_id", "mock_payments", ["invoice_id"])


def downgrade() -> None:
    op.drop_index("idx_mock_payments_invoice_id", table_name="mock_payments")
    op.drop_index("idx_mock_payments_user_id", table_name="mock_payments")
    op.drop_table("mock_payments")

    op.drop_index("idx_mock_invoices_issued_at", table_name="mock_invoices")
    op.drop_index("idx_mock_invoices_user_id", table_name="mock_invoices")
    op.drop_table("mock_invoices")

    op.drop_table("mock_subscriptions")

