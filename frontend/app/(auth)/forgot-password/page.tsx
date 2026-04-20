"use client";

import { useState } from "react";
import Link from "next/link";
import { Database, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/language-context";

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Placeholder flow until backend reset endpoint is implemented.
    await new Promise((r) => setTimeout(r, 500));
    setSuccess(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-primary">
            <Database className="h-8 w-8" />
            <span className="text-2xl font-bold tracking-tight">DSN</span>
          </div>
          <p className="text-muted-foreground text-sm">Distributed Storage Network</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("forgotPassword.title")}</CardTitle>
            <CardDescription>{t("forgotPassword.description")}</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {success ? (
                <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-600/40 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <MailCheck className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    {t("forgotPassword.successTitle")}
                    <br />
                    {t("forgotPassword.successDesc")}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="example@mail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              {!success && (
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("forgotPassword.submit")}
                </Button>
              )}
              <p className="text-sm text-muted-foreground text-center">
                <Link href="/login" className="text-primary hover:underline">
                  {t("forgotPassword.backLogin")}
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
