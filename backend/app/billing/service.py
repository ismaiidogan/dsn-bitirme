from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.billing.models import MockSubscription, MockInvoice, MockPayment
from app.billing.schemas import (
    BillingPlanResponse,
    BillingSubscriptionResponse,
    BillingEstimateResponse,
    BillingMeResponse,
    BillingInvoiceResponse,
    BillingMockCheckoutResponse,
    ProviderEarningsResponse,
    ProviderEarningsSummaryResponse,
    ProviderEarningItemResponse,
)
from app.replication.models import StorageUsage, StorageEarning


PLANS = {
    "usage-basic": {
        "name": "Usage Basic",
        "currency": "USD",
        "price_per_gb_hour_cents": 2,
        "base_price_cents": 0,
    },
    "usage-pro": {
        "name": "Usage Pro",
        "currency": "USD",
        "price_per_gb_hour_cents": 1,
        "base_price_cents": 990,
    },
}

PROVIDER_PAYOUT_PER_GB_HOUR_CENTS = 1


def _to_float(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _calculate_usage_gb_hour(bytes_stored: int) -> float:
    gb = bytes_stored / (1024 ** 3)
    # MVP approximation: currently stored bytes as 1-hour equivalent.
    return max(gb, 0.0)


async def _get_or_create_subscription(
    db: AsyncSession,
    user: User,
    plan_code: str = "usage-basic",
) -> MockSubscription:
    result = await db.execute(select(MockSubscription).where(MockSubscription.user_id == user.id))
    subscription = result.scalar_one_or_none()
    if subscription:
        return subscription

    now = datetime.now(timezone.utc)
    next_month = datetime(
        year=now.year + (1 if now.month == 12 else 0),
        month=1 if now.month == 12 else now.month + 1,
        day=1,
        tzinfo=timezone.utc,
    )
    subscription = MockSubscription(
        user_id=user.id,
        plan_code=plan_code if plan_code in PLANS else "usage-basic",
        status="active",
        period_start=now,
        period_end=next_month,
        auto_renew=True,
    )
    db.add(subscription)
    await db.flush()
    return subscription


async def list_plans() -> list[BillingPlanResponse]:
    return [
        BillingPlanResponse(
            code=code,
            name=plan["name"],
            currency=plan["currency"],
            price_per_gb_hour_cents=plan["price_per_gb_hour_cents"],
            base_price_cents=plan["base_price_cents"],
        )
        for code, plan in PLANS.items()
    ]


async def get_billing_me(db: AsyncSession, user: User) -> BillingMeResponse:
    subscription = await _get_or_create_subscription(db, user)

    usage_q = await db.execute(
        select(func.coalesce(func.sum(StorageUsage.bytes_stored), 0)).where(
            StorageUsage.user_id == user.id,
            StorageUsage.ended_at.is_(None),
        )
    )
    active_bytes = int(usage_q.scalar_one() or 0)
    usage_gb_hour = _calculate_usage_gb_hour(active_bytes)

    plan = PLANS.get(subscription.plan_code, PLANS["usage-basic"])
    estimated_amount_cents = int(round(plan["base_price_cents"] + usage_gb_hour * plan["price_per_gb_hour_cents"]))

    latest_invoice_q = await db.execute(
        select(MockInvoice).where(MockInvoice.user_id == user.id).order_by(MockInvoice.issued_at.desc()).limit(1)
    )
    latest_invoice = latest_invoice_q.scalar_one_or_none()

    await db.commit()

    return BillingMeResponse(
        subscription=BillingSubscriptionResponse(
            plan_code=subscription.plan_code,
            status=subscription.status,
            period_start=subscription.period_start,
            period_end=subscription.period_end,
            auto_renew=subscription.auto_renew,
        ),
        estimate=BillingEstimateResponse(
            usage_gb_hour=round(usage_gb_hour, 4),
            estimated_amount_cents=estimated_amount_cents,
            currency=plan["currency"],
        ),
        latest_invoice_status=latest_invoice.status if latest_invoice else None,
    )


async def list_invoices(db: AsyncSession, user: User) -> list[BillingInvoiceResponse]:
    result = await db.execute(
        select(MockInvoice).where(MockInvoice.user_id == user.id).order_by(MockInvoice.issued_at.desc())
    )
    invoices = result.scalars().all()
    return [
        BillingInvoiceResponse(
            id=str(item.id),
            invoice_no=item.invoice_no,
            period_start=item.period_start,
            period_end=item.period_end,
            usage_gb_hour=_to_float(item.usage_gb_hour),
            amount_cents=item.amount_cents,
            status=item.status,
            issued_at=item.issued_at,
            paid_at=item.paid_at,
        )
        for item in invoices
    ]


async def run_mock_checkout(db: AsyncSession, user: User, plan_code: str) -> BillingMockCheckoutResponse:
    safe_plan = plan_code if plan_code in PLANS else "usage-basic"
    subscription = await _get_or_create_subscription(db, user, safe_plan)
    subscription.plan_code = safe_plan
    subscription.status = "active"

    usage_q = await db.execute(
        select(func.coalesce(func.sum(StorageUsage.bytes_stored), 0)).where(
            StorageUsage.user_id == user.id,
            StorageUsage.ended_at.is_(None),
        )
    )
    active_bytes = int(usage_q.scalar_one() or 0)
    usage_gb_hour = _calculate_usage_gb_hour(active_bytes)
    plan = PLANS[safe_plan]
    amount_cents = int(round(plan["base_price_cents"] + usage_gb_hour * plan["price_per_gb_hour_cents"]))

    invoice = MockInvoice(
        user_id=user.id,
        invoice_no=f"INV-{uuid4().hex[:10].upper()}",
        period_start=subscription.period_start,
        period_end=subscription.period_end,
        usage_gb_hour=Decimal(str(round(usage_gb_hour, 4))),
        amount_cents=amount_cents,
        status="paid",
        paid_at=datetime.now(timezone.utc),
    )
    db.add(invoice)
    await db.flush()

    payment = MockPayment(
        user_id=user.id,
        invoice_id=invoice.id,
        amount_cents=amount_cents,
        status="succeeded",
        provider="mock",
    )
    db.add(payment)
    await db.commit()

    return BillingMockCheckoutResponse(
        subscription_status=subscription.status,
        invoice_id=str(invoice.id),
        payment_status=payment.status,
    )


async def get_provider_earnings(db: AsyncSession, user: User) -> ProviderEarningsResponse:
    result = await db.execute(
        select(StorageEarning)
        .where(StorageEarning.user_id == user.id)
        .order_by(StorageEarning.period_start.desc())
        .limit(100)
    )
    rows = result.scalars().all()

    now = datetime.now(timezone.utc)
    current_month_rows = [
        row
        for row in rows
        if row.period_start.year == now.year and row.period_start.month == now.month
    ]
    current_bytes = int(sum((row.bytes_stored or 0) for row in current_month_rows))
    current_gb_hour = _calculate_usage_gb_hour(current_bytes)
    current_estimated = int(round(current_gb_hour * PROVIDER_PAYOUT_PER_GB_HOUR_CENTS))

    total_bytes = int(sum((row.bytes_stored or 0) for row in rows))
    total_gb_hour = _calculate_usage_gb_hour(total_bytes)
    total_estimated = int(round(total_gb_hour * PROVIDER_PAYOUT_PER_GB_HOUR_CENTS))

    items = [
        ProviderEarningItemResponse(
            id=str(row.id),
            period_start=row.period_start,
            period_end=row.period_end,
            bytes_stored=row.bytes_stored or 0,
            estimated_cents=int(round(_calculate_usage_gb_hour(row.bytes_stored or 0) * PROVIDER_PAYOUT_PER_GB_HOUR_CENTS)),
        )
        for row in rows
    ]

    return ProviderEarningsResponse(
        summary=ProviderEarningsSummaryResponse(
            current_period_bytes_stored=current_bytes,
            current_period_estimated_cents=current_estimated,
            total_estimated_cents=total_estimated,
            currency="USD",
        ),
        items=items,
    )

