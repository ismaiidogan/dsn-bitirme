"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, KeyRound, Monitor } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getRolePreference, setRolePreference, RolePreference } from "@/lib/role";
import { toErrorMessage } from "@/lib/errors";
import { validatePasswordRules } from "@/lib/validators/password";
import { useLanguage } from "@/contexts/language-context";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [role, setRole] = useState<RolePreference>("consumer");

  useEffect(() => {
    const pref = getRolePreference();
    if (pref) setRole(pref);
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError(t("settings.passwordMismatch"));
      return;
    }
    const passwordError = validatePasswordRules(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    try {
      // Password change endpoint — backend'e eklenmesi gerekiyor (MVP sonrası)
      // Şimdilik placeholder
      await new Promise((r) => setTimeout(r, 500));
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setError(toErrorMessage(err, t("settings.passwordUpdateFailed")));
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{user?.email}</p>
      </div>

      {/* Role preference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.roleTitle")}</CardTitle>
          <CardDescription>
            {t("settings.roleDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setRole("consumer");
                setRolePreference("consumer");
              }}
              className={`rounded-lg border px-3 py-3 text-left text-sm transition-colors ${
                role === "consumer"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/60 hover:bg-muted/30"
              }`}
            >
              <p className="font-medium mb-0.5">{t("settings.consumerTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("settings.consumerDesc")}
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setRole("provider");
                setRolePreference("provider");
              }}
              className={`rounded-lg border px-3 py-3 text-left text-sm transition-colors ${
                role === "provider"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/60 hover:bg-muted/30"
              }`}
            >
              <p className="font-medium mb-0.5">{t("settings.providerTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("settings.providerDesc")}
              </p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Provider rolü için lokal node ayarlarına kısayol */}
      {role === "provider" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              {t("settings.localNodeTitle")}
            </CardTitle>
            <CardDescription>
              {t("settings.localNodeDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              {t("settings.localNodeHintBefore")}{" "}
              <code className="px-1 py-0.5 rounded bg-muted border border-border text-[11px]">
                http://localhost:7777
              </code>{" "}
              {t("settings.localNodeHintAfter")}
              {" "}
              {t("settings.localNodeLocalOnlyNote")}
            </p>
            <Button asChild variant="outline" size="sm">
              <a href="http://localhost:7777" target="_blank" rel="noreferrer">
                {t("settings.openNodeSettings")}
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Password change */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {t("settings.passwordTitle")}
          </CardTitle>
          <CardDescription>
            {t("settings.passwordDesc")}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handlePasswordChange}>
          <CardContent className="space-y-4">
            {success && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-600/40 dark:bg-emerald-900/30 dark:text-emerald-300">
                {t("settings.passwordUpdated")}
              </div>
            )}
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:border-destructive/40 dark:bg-destructive/20">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="current">{t("settings.currentPassword")}</Label>
              <Input
                id="current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">{t("settings.newPassword")}</Label>
              <Input
                id="new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t("settings.confirmNewPassword")}</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("settings.updatePasswordButton")}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">{t("settings.dangerTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleLogout}>
            {t("settings.logoutAccount")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
