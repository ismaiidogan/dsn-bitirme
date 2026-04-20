"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { billing, BillingInvoice, BillingMe, BillingPlan } from "@/lib/api";
import { getRolePreference } from "@/lib/role";
import { useLanguage } from "@/contexts/language-context";
import { toErrorMessage } from "@/lib/errors";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

function centsToMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export default function BillingPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [summary, setSummary] = useState<BillingMe | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = useMemo(() => getRolePreference(), []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [planList, me, inv] = await Promise.all([billing.plans(), billing.me(), billing.invoices()]);
      setPlans(planList);
      setSummary(me);
      setInvoices(inv);
    } catch (err: unknown) {
      setError(toErrorMessage(err, t("billing.loadError")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (role === "provider") {
      router.replace("/earnings");
    }
  }, [role, router]);

  const activePlan = plans.find((p) => p.code === summary?.subscription.plan_code);

  const handleMockPayment = async () => {
    if (!summary) return;
    setActionLoading(true);
    try {
      await billing.mockCheckout(summary.subscription.plan_code);
      toast.success(t("billing.checkoutSuccess"));
      await load();
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, t("billing.loadError")));
    } finally {
      setActionLoading(false);
    }
  };

  if (role === "provider") {
    return (
      <div className="py-8 text-sm text-muted-foreground">{t("billing.forbiddenForProvider")}</div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={load}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("billing.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("billing.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("billing.plan")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{activePlan?.name ?? summary?.subscription.plan_code}</p>
            <Badge className="mt-2" variant="secondary">
              {summary?.subscription.status}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("billing.usage")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">
              {t("billing.gbHour", { value: summary?.estimate.usage_gb_hour ?? 0 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("billing.estimate")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">
              {centsToMoney(summary?.estimate.estimated_amount_cents ?? 0, summary?.estimate.currency ?? "USD")}
            </p>
            {summary?.latest_invoice_status && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("billing.latestInvoice")}: {summary.latest_invoice_status}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("billing.invoices")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleMockPayment} disabled={actionLoading}>
            {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("billing.simulatePayment")}
          </Button>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("billing.noInvoices")}</p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">{t("billing.usage")}</th>
                    <th className="px-4 py-2">{t("billing.estimate")}</th>
                    <th className="px-4 py-2">{t("dashboard.status")}</th>
                    <th className="px-4 py-2">{t("dashboard.uploadedAt")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-4 py-2 font-medium">{inv.invoice_no}</td>
                      <td className="px-4 py-2">{t("billing.gbHour", { value: inv.usage_gb_hour })}</td>
                      <td className="px-4 py-2">{centsToMoney(inv.amount_cents, "USD")}</td>
                      <td className="px-4 py-2">
                        <Badge variant={inv.status === "paid" ? "success" : "warning"}>{inv.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{formatDate(inv.issued_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

