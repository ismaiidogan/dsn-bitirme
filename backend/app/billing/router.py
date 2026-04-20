from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import get_db
from app.dependencies import get_current_user
from app.billing import service
from app.billing.schemas import (
    BillingPlanResponse,
    BillingMeResponse,
    BillingInvoiceResponse,
    BillingMockCheckoutRequest,
    BillingMockCheckoutResponse,
    ProviderEarningsResponse,
)

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plans", response_model=list[BillingPlanResponse])
async def get_plans():
    return await service.list_plans()


@router.get("/me", response_model=BillingMeResponse)
async def get_my_billing(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_billing_me(db, current_user)


@router.get("/invoices", response_model=list[BillingInvoiceResponse])
async def get_my_invoices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_invoices(db, current_user)


@router.post("/mock/checkout", response_model=BillingMockCheckoutResponse)
async def mock_checkout(
    body: BillingMockCheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.run_mock_checkout(db, current_user, body.plan_code)


@router.get("/earnings/me", response_model=ProviderEarningsResponse)
async def get_my_provider_earnings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_provider_earnings(db, current_user)

