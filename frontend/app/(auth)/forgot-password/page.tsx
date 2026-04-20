"use client";

import { useState } from "react";
import Link from "next/link";
import { Database, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
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
            <CardTitle>Şifremi Unuttum</CardTitle>
            <CardDescription>
              Hesabınızın e-posta adresini girin.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {success ? (
                <div className="rounded-md bg-emerald-900/30 border border-emerald-600/40 px-3 py-2 text-sm text-emerald-300 flex items-start gap-2">
                  <MailCheck className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    Şifre sıfırlama talebiniz alındı.
                    <br />
                    Otomatik e-posta akışı yakında aktif olacak; şu an için yöneticinizle iletişime geçin.
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="email">E-posta</Label>
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
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              {!success && (
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Talep Oluştur
                </Button>
              )}
              <p className="text-sm text-muted-foreground text-center">
                <Link href="/login" className="text-primary hover:underline">
                  Giriş sayfasına dön
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
