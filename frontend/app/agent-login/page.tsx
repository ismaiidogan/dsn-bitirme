"use client";

import { useState } from "react";
import { Database, Loader2, CheckCircle2, MonitorDown } from "lucide-react";
import { toErrorMessage } from "@/lib/errors";

export default function AgentLoginPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const callApi = async (path: string, body: object) => {
    const res = await fetch(`/api/v1${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.detail ?? "İstek başarısız");
    }
    return res.json();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      let token: string;
      if (tab === "register") {
        await callApi("/auth/register", { email, password });
        const loginData = await callApi("/auth/login", { email, password });
        token = loginData.access_token;
      } else {
        const data = await callApi("/auth/login", { email, password });
        token = data.access_token;
      }
      setDone(true);
      // Redirect to deep link — OS delivers to Tauri installer
      setTimeout(() => {
        window.location.href = `dsn-agent://auth?token=${encodeURIComponent(token)}`;
      }, 400);
    } catch (err: unknown) {
      setError(toErrorMessage(err, "Bir hata oluştu"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-5">

        {/* Header */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2 text-primary">
            <Database className="h-7 w-7" />
            <span className="text-2xl font-bold tracking-tight">DSN</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-full">
            <MonitorDown className="h-3.5 w-3.5" />
            Agent Kurulum Sihirbazı için giriş
          </div>
        </div>

        {done ? (
          /* Success state */
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <p className="font-semibold text-green-400">Giriş Başarılı</p>
            <p className="text-sm text-muted-foreground">
              Kurulum sihirbazına yönlendiriliyorsunuz...
              <br />
              Bu sekmeyi kapatabilirsiniz.
            </p>
          </div>
        ) : (
          /* Auth form */
          <div className="rounded-xl border bg-card shadow-sm">

            {/* Tabs */}
            <div className="flex border-b">
              {(["login", "register"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setError(""); }}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${
                    tab === t
                      ? "text-foreground border-b-2 border-primary -mb-px"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "login" ? "Giriş Yap" : "Kayıt Ol"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/20 border border-destructive/40 px-3 py-2 text-sm text-red-400">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">E-posta</label>
                <input
                  type="email"
                  placeholder="ornek@mail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Şifre</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={tab === "register" ? "new-password" : "current-password"}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {tab === "login" ? "Giriş Yap" : "Hesap Oluştur"}
              </button>
            </form>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Bu sayfa yalnızca DSN Kurulum Sihirbazı tarafından açılmıştır.
        </p>
      </div>
    </div>
  );
}
