# Ortam Değişkenleri

Bu belge, DSN projesinde kullanılan ortam değişkenlerini listeler. **Docker Compose** kullanıyorsanız değişkenleri proje **kökündeki** `.env` dosyasına yazın; Compose bu dosyayı servislere aktarır.

---

## Tablo

| Değişken | Nerede kullanılır | Zorunlu | Varsayılan | Açıklama |
|----------|-------------------|---------|------------|----------|
| `DB_PASSWORD` | Compose → postgres, backend | Hayır | `changeme` | PostgreSQL şifresi. Production'da mutlaka değiştirin. |
| `DATABASE_URL` | Backend | Hayır (Compose'ta türetilir) | — | Async PG bağlantı dizesi. Compose, `DB_PASSWORD` ile otomatik oluşturur. |
| `REDIS_URL` | Backend | Hayır | `redis://redis:6379` (Compose) | Redis bağlantı dizesi. |
| `JWT_SECRET` | Backend | **Evet** (production) | `dev-secret-change-in-production` | JWT imzalama anahtarı. En az 32 karakter, rastgele. |
| `MASTER_ENCRYPTION_KEY` | Backend | **Evet** (production) | 64 sıfır | AES anahtarlarının şifrelenmesi için. Tam 64 hex karakter. |
| `MAX_FILE_SIZE_BYTES` | Backend | Hayır | `5368709120` (5 GB) | Tek dosya için maksimum boyut (byte). |
| `CHUNK_SIZE_BYTES` | Backend | Hayır | `16777216` (16 MB) | Chunk boyutu (byte). |
| `REPLICATION_FACTOR` | Backend | Hayır | `3` | Varsayılan chunk kopya sayısı (1–3). |
| `NODE_ACTIVE_THRESHOLD_MIN` | Backend | Hayır | `5` | Dakika; bu süre heartbeat gelmezse node inactive sayılır. |
| `NODE_DEAD_THRESHOLD_HOURS` | Backend | Hayır | `24` | Saat; re-replication için "ölü" node eşiği. |
| `CORS_ORIGINS` | Backend | Hayır | `http://localhost:3000` | CORS izin verilen origin'ler; virgülle ayrılmış. Production'da frontend URL'inizi ekleyin. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Backend | Hayır | `15` | JWT access token geçerlilik süresi (dakika). |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Backend | Hayır | `7` | Refresh token geçerlilik süresi (gün). |
| `HEARTBEAT_INTERVAL_SEC` | Backend | Hayır | `30` | Node heartbeat aralığı (saniye). |
| `RE_REPLICATION_CHECK_MIN` | Backend | Hayır | `5` | Re-replication kontrol aralığı (dakika). |
| `NEXT_PUBLIC_API_URL` | Frontend (build + runtime) | Hayır | `http://backend:8000` | Backend API adresi. Compose ile çalışırken tarayıcı backend'e bu URL üzerinden istek atar; production'da kendi domain'inizi yazın. |
| `NEXT_PUBLIC_AGENT_WINDOWS_URL` | Frontend (build + runtime) | Hayır | boş | `/agent` sayfasındaki Windows indirme bağlantısı. Örnek: `https://storemyfile.com/downloads/dsn-agent-windows.zip` veya bir release URL'si. |
| `NEXT_PUBLIC_AGENT_LINUX_URL` | Frontend (build + runtime) | Hayır | boş | `/agent` sayfasındaki Linux indirme bağlantısı. Örnek: `https://storemyfile.com/downloads/dsn-agent-linux.zip` veya bir release URL'si. |
| `NEXT_PUBLIC_AGENT_MAC_INTEL_URL` | Frontend (build + runtime) | Hayır | boş | `/agent` sayfasındaki macOS Intel indirme bağlantısı. Örnek: `https://storemyfile.com/downloads/dsn-agent-mac-intel.zip`. |
| `NEXT_PUBLIC_AGENT_MAC_ARM64_URL` | Frontend (build + runtime) | Hayır | boş | `/agent` sayfasındaki macOS Apple Silicon indirme bağlantısı. Örnek: `https://storemyfile.com/downloads/dsn-agent-mac-arm64.zip`. |

---

## Üretim URL örnekleri (.com ve .com.tr)

Teknik yapı aynıdır; yalnızca alan adı uzantısı değişir.

| Senaryo | `CORS_ORIGINS` (örnek) | `NEXT_PUBLIC_API_URL` (örnek) |
|--------|---------------------------|-------------------------------|
| Tek site, `www` | `https://www.ornek.com` veya `https://www.ornek.com.tr` | `https://api.ornek.com` veya `https://api.ornek.com.tr` |
| Kök + `www` ikisi de | `https://ornek.com.tr,https://www.ornek.com.tr` | Yukarıdaki gibi API host’u |

Tarayıcıda yazdığınız origin (şema + host + port), `CORS_ORIGINS` içinde birebir bulunmalıdır. HTTPS + Web Crypto için bkz. `GCP_KURULUM_REHBERI.md` bölüm 14–16.

---

## Ek notlar

- **Backend'i Docker olmadan çalıştırıyorsanız:** `backend/.env.example` dosyasını `backend/.env` olarak kopyalayıp `DATABASE_URL` ve `REDIS_URL` değerlerini kendi ortamınıza göre (örn. `localhost`) güncelleyin.
- **Güvenlik:** Production ortamında `JWT_SECRET`, `MASTER_ENCRYPTION_KEY` ve `DB_PASSWORD` mutlaka güçlü ve rastgele değerler olmalı; `.env` dosyası asla repoya commit edilmemelidir.
