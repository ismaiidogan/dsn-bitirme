/**
 * Build-time defaults (Vite): üretimde tek bir DSN kurulumu için .env ile gömülür.
 * VITE_DEFAULT_DSN_API_URL  → Backend (örn. http://SUNUCU_IP:8000)
 * VITE_DEFAULT_DSN_WEB_URL  → Web arayüzü (örn. http://SUNUCU_IP:3000) — agent-login burada
 */
export function getDefaultApiUrl(): string {
  const v = import.meta.env.VITE_DEFAULT_DSN_API_URL;
  return typeof v === "string" ? v.trim() : "";
}

/** Giriş sayfasının açılacağı taban URL (port 3000 veya .env ile). */
export function resolveWebBaseUrlForLogin(apiUrl: string): string {
  const fixed = import.meta.env.VITE_DEFAULT_DSN_WEB_URL;
  if (typeof fixed === "string" && fixed.trim()) {
    return fixed.trim().replace(/\/$/, "");
  }
  const u = apiUrl.trim().replace(/\/$/, "");
  if (!u) return u;
  try {
    const parsed = new URL(u);
    if (parsed.port === "8000") {
      parsed.port = "3000";
      return parsed.origin;
    }
    return parsed.origin;
  } catch {
    return u.replace(/:8000(\/|$)/, ":3000$1");
  }
}
