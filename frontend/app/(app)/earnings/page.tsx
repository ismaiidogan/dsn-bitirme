"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { billing, ProviderEarnings } from "@/lib/api";
import { getRolePreference } from "@/lib/role";
import { useLanguage } from "@/contexts/language-context";
import { toErrorMessage } from "@/lib/errors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate } from "@/lib/utils";

function centsToMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export default function EarningsPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const role = useMemo(() => getRolePreference(), []);
  const [data, setData] = useState<ProviderEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await billing.earnings());
    } catch (err: unknown) {
      setError(toErrorMessage(err, t("earnings.loadError")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (role === "consumer") {
      router.replace("/billing");
    }
  }, [role, router]);

  if (role === "consumer") {
    return <div className="py-8 text-sm text-muted-foreground">{t("earnings.forbiddenForConsumer")}</div>;
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

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("earnings.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("earnings.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("earnings.currentPeriodStored")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{formatBytes(data.summary.current_period_bytes_stored)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("earnings.currentPeriodRevenue")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">
              {centsToMoney(data.summary.current_period_estimated_cents, data.summary.currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("earnings.totalRevenue")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{centsToMoney(data.summary.total_estimated_cents, data.summary.currency)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("earnings.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("earnings.noData")}</p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">{t("dashboard.uploadedAt")}</th>
                    <th className="px-4 py-2">{t("earnings.currentPeriodStored")}</th>
                    <th className="px-4 py-2">{t("earnings.currentPeriodRevenue")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2 text-muted-foreground">{formatDate(item.period_start)}</td>
                      <td className="px-4 py-2">{formatBytes(item.bytes_stored)}</td>
                      <td className="px-4 py-2">
                        {centsToMoney(item.estimated_cents, data.summary.currency)}
                      </td>
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

