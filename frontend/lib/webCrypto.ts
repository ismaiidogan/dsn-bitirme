/**
 * Web Crypto (crypto.subtle) yalnızca "secure context" içinde çalışır:
 * HTTPS veya http://localhost. Ham IP ile HTTP (http://1.2.3.4:3000) üzerinde subtle yoktur.
 */
export function webCryptoAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return typeof crypto !== "undefined" && crypto.subtle != null;
}

export const WEB_CRYPTO_BLOCKED_MSG =
  "Dosya şifrelemesi için tarayıcı güvenli bağlantı ister. Bu siteyi HTTPS ile yayınlayın (ör. ters vekil + Let's Encrypt) veya geliştirme için http://localhost:3000 kullanın. http://IP:3000 adresinde yükleme çalışmaz.";
