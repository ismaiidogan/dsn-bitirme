"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Database, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { getRolePreference, getRoleHomePath } from "@/lib/role";
import { toErrorMessage } from "@/lib/errors";
import { validatePasswordRules } from "@/lib/validators/password";
import { useLanguage } from "@/contexts/language-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    const passwordError = validatePasswordRules(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    try {
      await register(email, password);
      const role = getRolePreference();
      if (!role) {
        router.push("/role");
      } else {
        router.push(getRoleHomePath(role));
      }
    } catch (err: unknown) {
      setError(toErrorMessage(err, t("auth.registerFailed")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-primary">
            <Database className="h-8 w-8" />
            <span className="text-2xl font-bold tracking-tight">DSN</span>
          </div>
          <p className="text-muted-foreground text-sm">{t("common.appSubtitle")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("auth.registerTitle")}</CardTitle>
            <CardDescription>{t("auth.registerDescription")}</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:border-destructive/40 dark:bg-destructive/20">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="ornek@mail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t("auth.passwordRulesHint")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">{t("auth.passwordConfirm")}</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("auth.registerButton")}
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                {t("auth.hasAccount")}{" "}
                <Link href="/login" className="text-primary hover:underline">
                  {t("auth.loginButton")}
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
