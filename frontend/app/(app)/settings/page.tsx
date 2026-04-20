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

export default function SettingsPage() {
  const { user, logout } = useAuth();
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
      setError("Yeni şifreler eşleşmiyor");
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
      setError(toErrorMessage(err, "Şifre değiştirme başarısız"));
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
        <h1 className="text-2xl font-bold">Hesap Ayarları</h1>
        <p className="text-muted-foreground text-sm mt-1">{user?.email}</p>
      </div>

      {/* Role preference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kullanım Tercihim</CardTitle>
          <CardDescription>
            Bu ağı ağırlıklı olarak nasıl kullanmak istediğinizi seçin. Bu sadece varsayılan
            görünümü etkiler; her zaman tüm özelliklere erişebilirsiniz.
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
              <p className="font-medium mb-0.5">Dosya sahibi</p>
              <p className="text-xs text-muted-foreground">
                Ağı çoğunlukla kendi dosyalarımı yüklemek ve yönetmek için kullanıyorum.
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
              <p className="font-medium mb-0.5">Depolama sağlayıcı</p>
              <p className="text-xs text-muted-foreground">
                Ağı çoğunlukla bilgisayarımın boş alanını node olarak paylaşmak için kullanıyorum.
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
              Bu cihazdaki node ayarları
            </CardTitle>
            <CardDescription>
              Bu cihazda çalışan agent&apos;ın kota ve bant genişliği gibi ayarlarını yerel
              dashboard üzerinden değiştirebilirsiniz.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Varsayılan olarak Windows ve Linux agent&apos;ları{" "}
              <code className="px-1 py-0.5 rounded bg-muted border border-border text-[11px]">
                http://localhost:7777
              </code>{" "}
              adresinde bir yerel panel sunar.
            </p>
            <Button asChild variant="outline" size="sm">
              <a href="http://localhost:7777" target="_blank" rel="noreferrer">
                Node ayarlarını aç
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
            Şifre Değiştir
          </CardTitle>
          <CardDescription>
            Güvenli bir şifre seçin: en az 8 karakter, 1 büyük harf, 1 rakam
          </CardDescription>
        </CardHeader>

        <form onSubmit={handlePasswordChange}>
          <CardContent className="space-y-4">
            {success && (
              <div className="rounded-md bg-emerald-900/30 border border-emerald-600/40 px-3 py-2 text-sm text-emerald-400">
                Şifre başarıyla değiştirildi
              </div>
            )}
            {error && (
              <div className="rounded-md bg-destructive/20 border border-destructive/40 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="current">Mevcut Şifre</Label>
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
              <Label htmlFor="new">Yeni Şifre</Label>
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
              <Label htmlFor="confirm">Yeni Şifre Tekrar</Label>
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
              Şifreyi Güncelle
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Çıkış</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleLogout}>
            Hesaptan Çıkış Yap
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
