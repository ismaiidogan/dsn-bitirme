from datetime import datetime
from pydantic import BaseModel


class BillingPlanResponse(BaseModel):
    code: str
    name: str
    currency: str
    price_per_gb_hour_cents: int
    base_price_cents: int


class BillingSubscriptionResponse(BaseModel):
    plan_code: str
    status: str
    period_start: datetime
    period_end: datetime
    auto_renew: bool


class BillingEstimateResponse(BaseModel):
    usage_gb_hour: float
    estimated_amount_cents: int
    currency: str


class BillingMeResponse(BaseModel):
    subscription: BillingSubscriptionResponse
    estimate: BillingEstimateResponse
    latest_invoice_status: str | None


class BillingInvoiceResponse(BaseModel):
    id: str
    invoice_no: str
    period_start: datetime
    period_end: datetime
    usage_gb_hour: float
    amount_cents: int
    status: str
    issued_at: datetime
    paid_at: datetime | None


class BillingMockCheckoutRequest(BaseModel):
    plan_code: str = "usage-basic"


class BillingMockCheckoutResponse(BaseModel):
    subscription_status: str
    invoice_id: str
    payment_status: str


class ProviderEarningsSummaryResponse(BaseModel):
    current_period_bytes_stored: int
    current_period_estimated_cents: int
    total_estimated_cents: int
    currency: str


class ProviderEarningItemResponse(BaseModel):
    id: str
    period_start: datetime
    period_end: datetime | None
    bytes_stored: int
    estimated_cents: int


class ProviderEarningsResponse(BaseModel):
    summary: ProviderEarningsSummaryResponse
    items: list[ProviderEarningItemResponse]

