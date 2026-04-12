# DSN — Dağıtık Depolama Ağı

Dosyalarınızı AES-256-GCM ile şifreleyerek ağdaki farklı node'lara dağıtan, açık kaynaklı bir depolama platformu.

---

## İçindekiler

1. [Sistem Gereksinimleri](#1-sistem-gereksinimleri)
2. [Sunucu Kurulumu (Backend + Frontend)](#2-sunucu-kurulumu)
3. [Agent Kurulumu (Depolama Node'u)](#3-agent-kurulumu)
4. [İlk Kullanım](#4-ilk-kullanım)
5. [Servis Portları](#5-servis-portları)
6. [Yeniden Başlatma](#6-yeniden-başlatma)
7. [Sorun Giderme](#7-sorun-giderme)
8. [Testler](#8-testler)

Tüm ortam değişkenlerinin listesi için **[ENV_VARIABLES.md](ENV_VARIABLES.md)** dosyasına bakın.

---

## 1. Sistem Gereksinimleri

### Sunucu için
| Gereksinim | Minimum | Önerilen |
|---|---|---|
| İşletim Sistemi | Linux / macOS / Windows 10+ | Ubuntu 22.04 LTS |
| RAM | 2 GB | 4 GB |
| Disk | 10 GB | 50 GB |
| **Docker** | 24.0+ | Son sürüm |
| **Docker Compose** | 2.20+ | Son sürüm |

### Agent için
| Gereksinim | Detay |
|---|---|
| İşletim Sistemi | Windows 10+, macOS 11+, Linux (x86-64) |
| Disk | Paylaşmak istediğiniz kadar serbest alan |
| Ağ | Sunucuya erişilebilir internet bağlantısı |

> **Docker kurulumu:** https://docs.docker.com/get-docker/

---

## 2. Sunucu Kurulumu

### Adım 1 — Projeyi İndirin

```bash
git clone <repo-url>
cd "Bitirme Projesi"
```

### Adım 2 — Ortam Değişkenlerini Ayarlayın

**Docker Compose ile çalıştıracaksanız:** Proje **kökündeki** `.env.example` dosyasını kök dizinde `.env` olarak kopyalayın. Compose bu dosyayı kullanır.

```bash
cp .env.example .env
```

**Sadece backend'i yerelde (Docker olmadan) çalıştıracaksanız:** `backend/.env.example` dosyasını `backend/.env` olarak kopyalayın.

Ardından ilgili `.env` dosyasını bir metin editörüyle açın:

```env
# Veritabanı
DATABASE_URL=postgresql+asyncpg://dsn_user:SIFRENIZI_YAZIN@postgres:5432/dsn
DB_PASSWORD=SIFRENIZI_YAZIN          # Yalnızca harf ve rakam kullanın

# Güvenlik (rastgele, en az 32 karakter)
JWT_SECRET=buraya_en_az_32_karakterlik_rastgele_bir_dizi_yazin
MASTER_ENCRYPTION_KEY=buraya_tam_64_hex_karakter_yazin_0123456789abcdef0123456789abcdef01

# Sistem
MAX_FILE_SIZE_BYTES=5368709120       # 5 GB
CHUNK_SIZE_BYTES=16777216            # 16 MB
REPLICATION_FACTOR=3                 # Her chunk kaç farklı node'a yansıtılsın
```

> **JWT_SECRET üretmek için:**
> ```bash
> # Linux/macOS
> openssl rand -hex 32
>
> # Windows PowerShell
> [System.Web.Security.Membership]::GeneratePassword(64, 0)
> ```
>
> **MASTER_ENCRYPTION_KEY üretmek için:**
> ```bash
> openssl rand -hex 32
> ```

### Adım 3 — Servisleri Başlatın

```bash
docker compose up -d
```

Bu komut şunları otomatik olarak yapar:
- PostgreSQL veritabanını başlatır
- Redis önbelleğini başlatır
- Backend API sunucusunu derler ve başlatır
- Frontend web uygulamasını derler ve başlatır
- Veritabanı tablolarını oluşturur

### Adım 4 — Kurulumu Doğrulayın

```bash
# Tüm servislerin çalıştığını kontrol edin
docker compose ps
```

Tüm satırlar `running` veya `healthy` göstermelidir.

```bash
# Backend API sağlık kontrolü
curl http://localhost:8000/docs
# → Swagger arayüzü açılmalı

# Frontend erişim
# Tarayıcıda: http://localhost:3000
```

---

## 3. Agent Kurulumu

Agent, kendi bilgisayarınızdaki diski ağa paylaşmanızı sağlar. **Terminal açmanıza gerek yoktur** — kurulum sihirbazı her şeyi otomatik yapar.

### Adım 1 — Kurulum Sihirbazını İndirin

Sistem yöneticinizden işletim sisteminize uygun kurulum dosyasını alın:

| İşletim Sistemi | Dosya |
|---|---|
| Windows 10/11 | `DSN-Installer.exe` |
| macOS | `DSN-Installer.dmg` |
| Linux (Debian/Ubuntu) | `DSN-Installer.deb` |

### Adım 2 — Sihirbazı Çalıştırın

Dosyayı çift tıklayarak açın. Sihirbaz sizi adım adım yönlendirecek:

1. **Karşılama** — "Başla" butonuna tıklayın
2. **Sunucu Adresi** — Yöneticinizin verdiği adresi yapıştırın (örn. `http://192.168.1.100:8000`)
3. **Hesap Girişi** — "Tarayıcıda Giriş Yap" butonuna basın, tarayıcıda giriş yapın; sihirbaz otomatik devam eder
4. **Depolama Ayarları** — Klasör seçin ve disk kotasını slider ile belirleyin
5. **Kurulum** — Her şey otomatik yapılır (kayıt, servis, otomatik başlangıç)
6. **Tamamlandı** — Node'unuz aktif!

> Kurulum bittikten sonra agent arka planda çalışır ve bilgisayar açılışında otomatik başlar.
> Sistem tepsisindeki DSN simgesinden durumu takip edebilirsiniz.

### Sihirbazı Derlemek İstiyorsanız (geliştiriciler için)

```bash
# 1. Agent binary'sini derle
cd agent && bash build.sh

# 2. Tauri kurulum sihirbazını derle (Rust + Node.js gerekli)
cd installer && npm install && npm run tauri build
# Çıktı: installer/src-tauri/target/release/bundle/
```
```

> **Sistem tepsisi ile çalıştırmak için** (Windows/macOS GUI modunda):
> ```bash
> .\dsn-agent.exe
> ```
> Görev çubuğunda DSN simgesi görünür; durum, duraklat ve çıkış seçenekleri sunar.

### Adım 5 — Node'u Sisteme Kaydedin

Agent ilk kez çalıştığında, `node_id` config'de yoksa **otomatik olarak** sunucuya kendini kaydeder ve `config.yaml`'a `node_id` + `node_token` ekler. Ek bir işlem gerekmez.

Kaydı doğrulamak için web arayüzünde **Agent** sayfasını ziyaret edin — node'unuz listede `active` olarak görünmelidir.

---

## 4. İlk Kullanım

### Hesap Oluşturma

1. `http://SUNUCU_IP:3000/register` adresine gidin
2. Ad, e-posta ve şifre girin
3. Otomatik olarak dashboard'a yönlendirilirsiniz

### Dosya Yükleme

1. Sol menüden **Upload** sekmesine tıklayın
2. Dosyayı sürükleyip bırakın veya tıklayarak seçin (maks. 5 GB)
3. Yükleme sırasında her chunk için ilerleme gösterilir
4. Tamamlandığında **Dashboard**'da dosyanız görünür

### Dosya İndirme

1. **Dashboard**'da dosyanın yanındaki **detay** ikonuna tıklayın
2. **Download** butonuna basın
3. Tüm chunk'lar paralel olarak indirilir, birleştirilir ve şifresi çözülür

### Agent Yönetimi

- Sol menüden **Agent** sekmesine gidin
- Bağlı node'larınızı, disk kullanımını ve heartbeat durumunu görebilirsiniz

---

## 5. Servis Portları

| Servis | Port | Erişim |
|---|---|---|
| Frontend (Web Arayüzü) | **3000** | Herkese açık |
| Backend API | **8000** | Herkese açık (veya proxy arkasında) |
| PostgreSQL | 5432 | Yalnızca dahili (Docker ağı) |
| Redis | 6379 | Yalnızca dahili (Docker ağı) |
| Agent HTTP | **7777** | Backend'in erişebildiği ağ |

> **Güvenlik duvarı notu:** Agent çalıştıran makinelerde `7777` portunu (veya `listen_port`'ta belirlediğiniz portu) TCP için açık tutun.

---

## 6. Yeniden Başlatma

### Sunucu servisleri

```bash
# Tüm servisleri durdur
docker compose down

# Yeniden başlat
docker compose up -d

# Yalnızca backend'i yeniden başlat
docker compose restart backend

# Logları izle
docker compose logs -f backend
docker compose logs -f frontend
```

### Agent

Kurulum sihirbazı tarafından yüklenen agent otomatik başlangıca alınmıştır.
Duraklatmak veya yeniden başlatmak için sistem tepsisindeki DSN simgesini kullanın.

Manuel yeniden başlatma gerekirse:
- **Windows:** Görev Yöneticisi → Servisler → DSNAgent
- **macOS:** `launchctl start com.dsn.agent`
- **Linux:** `systemctl --user restart dsn-agent
```

---

## 7. Sorun Giderme

### Agent bağlanamıyor

```
[heartbeat] dial error: connection refused
```

- `server_url` doğru mu? (`http://` ile başlamalı, port dahil)
- Sunucu çalışıyor mu? `docker compose ps`
- Güvenlik duvarı 8000 portuna izin veriyor mu?

### "quota exceeded" hatası

Agent'ın `quota_gb` değeri doldu. `config.yaml`'da `quota_gb` artırın ve agent'ı yeniden başlatın.

### Dosya yükleme "Internal Server Error"

En az 1 adet `active` node gereklidir. `REPLICATION_FACTOR` kadar aktif node yoksa yükleme başlamaz. Node'un `active` durumda olduğunu web arayüzünden **Agent** sayfasından kontrol edin.

### Backend container başlamıyor

```bash
docker compose logs backend
```

- `.env` dosyasındaki `DB_PASSWORD` yalnızca harf/rakam içermeli (özel karakter sorun yaratabilir)
- `MASTER_ENCRYPTION_KEY` tam 64 hex karakter olmalı

### Veritabanı tabloları eksik

```bash
docker compose exec backend alembic upgrade head
```

### Agent port kullanımda

```
listen tcp :7777: bind: address already in use
```

`config.yaml`'da `listen_port` değerini farklı bir porta (örn. 7778) değiştirin.

---

## 8. Testler

Backend birim testleri için (health, auth doğrulama):

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

Servislerin (PostgreSQL, Redis) çalışıyor olması gerekir; `docker compose up -d` ile başlatıp ardından `pytest` çalıştırabilirsiniz.

Frontend birim testleri (Vitest):

```bash
cd frontend
npm install
npm run test
```

E2E akışı için **USER_X_E2E_TEST.md** dosyasındaki manuel adımları izleyebilirsiniz.

---

## Yapılandırma Referansı

### `.env` (Sunucu)

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `DB_PASSWORD` | PostgreSQL şifresi | — |
| `JWT_SECRET` | JWT imzalama anahtarı (≥32 karakter) | — |
| `MASTER_ENCRYPTION_KEY` | AES anahtarlarını şifreleyen master key (64 hex) | — |
| `REPLICATION_FACTOR` | Her chunk kaç node'da tutulsun | `3` |
| `MAX_FILE_SIZE_BYTES` | Maksimum dosya boyutu | `5368709120` (5 GB) |
| `CHUNK_SIZE_BYTES` | Chunk boyutu | `16777216` (16 MB) |
| `NODE_ACTIVE_THRESHOLD_MIN` | Heartbeat kesilince node'u inactive say | `5` |
| `NODE_DEAD_THRESHOLD_HOURS` | Heartbeat kesilince node'u dead say | `24` |

### `config.yaml` (Agent)

| Alan | Açıklama | Varsayılan |
|---|---|---|
| `server_url` | Backend API adresi | — |
| `auth_token` | Kullanıcı JWT tokeni | — |
| `storage_path` | Chunk'ların saklanacağı klasör | `./dsn-storage` |
| `quota_gb` | Ayrılan disk kotası (GB) | — |
| `bandwidth_limit_mbps` | Bant genişliği limiti (0=sınırsız) | `0` |
| `listen_port` | Agent HTTP port | `7777` |
| `node_id` | Otomatik doldurulur | — |
| `node_token` | Otomatik doldurulur | — |
