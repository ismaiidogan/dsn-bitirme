# Dağıtık Dosya Depolama ve Paylaşım Platformu (DSN)
**Distributed Storage Network — Bitirme Projesi Teknik Şartnamesi**

---

## İçindekiler

1. [Proje Özeti](#1-proje-özeti)
2. [Sistem Mimarisi](#2-sistem-mimarisi)
3. [Kullanıcı Tipleri ve Roller](#3-kullanıcı-tipleri-ve-roller)
4. [Teknoloji Kararları](#4-teknoloji-kararları)
5. [Bileşen Detayları](#5-bileşen-detayları)
   - 5.1 [Web Uygulaması (Frontend)](#51-web-uygulaması-frontend)
   - 5.2 [Backend API (Control Plane)](#52-backend-api-control-plane)
   - 5.3 [Storage Provider Agent (Desktop)](#53-storage-provider-agent-desktop)
6. [Veritabanı Şeması](#6-veritabanı-şeması)
7. [API Endpoint Listesi](#7-api-endpoint-listesi)
8. [Dosya Yaşam Döngüsü](#8-dosya-yaşam-döngüsü)
9. [Replikasyon ve Kurtarma Mantığı](#9-replikasyon-ve-kurtarma-mantığı)
10. [Güvenlik Mimarisi](#10-güvenlik-mimarisi)
11. [Agent Protokolü](#11-agent-protokolü)
12. [Docker & Deployment](#12-docker--deployment)
13. [Opsiyonel: Erasure Coding](#13-opsiyonel-erasure-coding)
14. [Test Stratejisi](#14-test-stratejisi)
15. [Kısıtlamalar ve Bilinen Limitler](#15-kısıtlamalar-ve-bilinen-limitler)

---

## 1. Proje Özeti

Bu proje, kullanıcıların dosyalarını merkezi bir sunucu yerine ağdaki diğer kullanıcı bilgisayarlarına dağıtık olarak depolayabildiği bir **Distributed Storage Network (DSN)** platformudur.

**Temel Özellikler:**
- Dosyalar 16 MB'lık chunk'lara bölünür
- Her chunk AES-GCM ile şifrelenir ve SHA-256 ile doğrulanır
- Her dosya varsayılan olarak 3 farklı node'a kopyalanır (replication factor: 3)
- Bir node offline olursa sistem otomatik olarak eksik kopyaları yeniden dağıtır
- Kullanıcılar hem dosya yükleyebilir hem de kendi disklerini ağa sağlayabilir

---

## 2. Sistem Mimarisi

```
┌─────────────────────────────────────────────────────────┐
│                    KULLANICI TARAFLARI                   │
│                                                          │
│  ┌─────────────────┐        ┌──────────────────────┐    │
│  │  Web Browser    │        │  Go Desktop Agent    │    │
│  │  (Next.js)      │        │  (Win/Mac/Linux)     │    │
│  └────────┬────────┘        └──────────┬───────────┘    │
│           │ HTTPS                      │ HTTPS/WS       │
└───────────┼────────────────────────────┼────────────────┘
            │                            │
┌───────────┼────────────────────────────┼────────────────┐
│           ▼            BACKEND         ▼                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │           FastAPI (Control Plane)                │    │
│  │  - Auth  - Node Registry  - File Metadata        │    │
│  │  - Replication Manager  - Scheduler              │    │
│  └────────┬──────────────────────────┬─────────────┘    │
│           │                          │                   │
│  ┌────────▼────────┐      ┌──────────▼──────────┐       │
│  │   PostgreSQL    │      │        Redis         │       │
│  │   (metadata)    │      │   (queue + cache)    │       │
│  └─────────────────┘      └─────────────────────┘       │
└─────────────────────────────────────────────────────────┘
            │ Chunk Transfer (HTTPS)
┌───────────▼────────────────────────────────────────┐
│             STORAGE NODE AĞI                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  Node A  │  │  Node B  │  │  Node C  │  ...     │
│  │ (Agent)  │  │ (Agent)  │  │ (Agent)  │          │
│  └──────────┘  └──────────┘  └──────────┘          │
└────────────────────────────────────────────────────┘
```

---

## 3. Kullanıcı Tipleri ve Roller

Sistemde tek bir kullanıcı tipi vardır, ancak her kullanıcı iki farklı rolü aynı anda üstlenebilir:

### 3.1 Uploader (Dosya Yükleyen)
- Web arayüzü üzerinden dosya yükler
- Dosya listesini görür ve yönetir
- Replikasyon durumunu takip eder
- İstediği zaman dosyasını indirebilir

### 3.2 Storage Provider (Depolama Sağlayıcı)
- Desktop Agent'ı kendi bilgisayarına kurar
- Belirli bir klasör ve kota belirler
- Agent arka planda çalışır, heartbeat gönderir
- Sistemin bu alana chunk yerleştirmesine izin verir

---

## 4. Teknoloji Kararları

| Bileşen | Teknoloji | Versiyon / Not |
|---|---|---|
| Frontend | Next.js | v14+ (App Router) |
| Backend API | Python + FastAPI | Python 3.11+ |
| Desktop Agent | Go | 1.21+ |
| Veritabanı | PostgreSQL | 15+ |
| Kuyruk / Cache | Redis | 7+ |
| Şifreleme | AES-256-GCM | Sunucu tarafı anahtar yönetimi |
| Chunk hash | SHA-256 | Her chunk için ayrı |
| Transfer protokolü | HTTPS (HTTP/2) | Chunk transferleri |
| WebSocket | Heartbeat ve kontrol mesajları | Agent ↔ Backend |
| Container | Docker + Docker Compose | Kubernetes zorunlu değil |
| Auth | JWT (email + şifre) | Access + Refresh token |

### 4.1 Sistem Sabitleri

| Parametre | Değer | Açıklama |
|---|---|---|
| `MAX_FILE_SIZE` | 5 GB | Tek seferde yüklenebilecek maksimum dosya boyutu |
| `CHUNK_SIZE` | 16 MB | Her parçanın hedef boyutu (son chunk daha küçük olabilir) |
| `REPLICATION_FACTOR` | 3 | Her chunk'ın kaç farklı node'da tutulacağı |
| `NODE_ACTIVE_THRESHOLD` | 5 dakika | Son heartbeat'ten bu kadar zaman geçmişse node aktif sayılır |
| `NODE_DEAD_THRESHOLD` | 24 saat | Bu süre heartbeat yoksa node dead sayılır, re-replication tetiklenir |
| `HEARTBEAT_INTERVAL` | 30 saniye | Agent'ın backend'e heartbeat gönderme sıklığı |
| `RE_REPLICATION_CHECK` | 5 dakika | Scheduler'ın eksik replikaları kontrol etme sıklığı |

---

## 5. Bileşen Detayları

### 5.1 Web Uygulaması (Frontend)

**Teknoloji:** Next.js 14 (App Router), TypeScript, TailwindCSS

#### Sayfalar ve Özellikler

**`/login` — Giriş Sayfası**
- Email ve şifre ile giriş
- JWT access token alınır, refresh token HttpOnly cookie olarak saklanır
- Hatalı giriş mesajları

**`/register` — Kayıt Sayfası**
- Email, şifre, şifre tekrar
- Parola: min 8 karakter, en az 1 büyük harf, 1 rakam
- Kayıt sonrası otomatik login

**`/dashboard` — Ana Pano**
- Yüklenen dosyaların listesi (tablo)
- Her dosya için: isim, boyut, yükleme tarihi, replikasyon durumu (kaç node aktif / kaç olmalı), işlemler
- Replikasyon durumu renk kodlu gösterilir:
  - 🟢 Tam (3/3 aktif)
  - 🟡 Kısmi (1-2/3 aktif)
  - 🔴 Kritik (0/3 aktif)
- "Dosya Yükle" butonu

**`/upload` — Dosya Yükleme**
- Drag & drop veya klasik seçim
- Yükleme öncesi: dosya boyutu, tahmini chunk sayısı gösterilir
- Yükleme sırasında: gerçek zamanlı ilerleme çubuğu (chunk bazlı)
- 5 GB limit kontrolü client tarafında da yapılır

**`/files/[id]` — Dosya Detay**
- Dosyanın chunk listesi ve her chunk'ın hangi node'da olduğu
- Node'ların aktif/pasif durumu
- İndirme butonu

**`/agent` — Agent Kurulum Rehberi**
- İşletim sistemine göre indirme linkleri (Win/Mac/Linux)
- Kurulum adımları
- Agent bağlantı durumu göstergesi (WebSocket üzerinden canlı)

**`/settings` — Hesap Ayarları**
- Şifre değiştirme
- Node olarak katkı sağlanıyorsa kota ve klasör bilgisi (salt bilgi amaçlı, değişiklik agent üzerinden)

#### Frontend Teknik Notlar
- Tüm API çağrıları `/api` proxy üzerinden yapılır (Next.js API routes veya rewrites)
- Access token memory'de tutulur (localStorage değil), refresh token HttpOnly cookie
- Token expire olursa refresh endpoint'i ile yenilenir
- Büyük dosya upload'ları için: önce backend'den presigned manifest alınır, sonra chunk'lar node'lara doğrudan gönderilir

---

### 5.2 Backend API (Control Plane)

**Teknoloji:** Python 3.11+, FastAPI, SQLAlchemy (async), Alembic

#### Modüller

**`auth/`**
- `POST /auth/register` — Yeni kullanıcı kaydı
- `POST /auth/login` — JWT access + refresh token üretir
- `POST /auth/refresh` — Access token yeniler
- `POST /auth/logout` — Refresh token geçersiz kılar
- Şifre bcrypt ile hash'lenir

**`files/`**
- Dosya metadata yönetimi
- Upload başlatma: manifest oluşturur (chunk listesi, hangi node'lara gidecek)
- Upload tamamlama: tüm chunk'ların SHA-256 doğrulaması
- İndirme için: manifest döner (chunk ID → node URL eşleşmesi)
- Silme: chunk'lar node'lardan silinir, metadata temizlenir

**`nodes/`**
- Node kayıt ve heartbeat endpoint'leri
- Aktif node listesi (son 5 dakika heartbeat gönderenler)
- Node'un disk alanı, kota, kullanılan alan bilgileri

**`replication/`**
- Eksik replika tespiti
- Yeniden dağıtım görevi oluşturma (Redis kuyruğuna atar)
- Priority queue: en az kopyası olan chunk önce işlenir

**`scheduler/`**
- APScheduler veya Celery Beat ile periyodik görevler
- Re-replication check: her 5 dakikada bir
- Node cleanup: 24 saat heartbeat gelmeyenleri dead işaretle
- Orphan chunk cleanup: sahibi olmayan chunk'ları temizle

**`storage/`**
- Chunk transfer koordinasyonu
- Node seçimi (load balancing: en az yüklü node'lar seçilir)
- Chunk doğrulama endpoint'i

#### Backend Teknik Notlar
- Tüm async operasyonlar `asyncpg` ile PostgreSQL'e bağlanır
- Redis için `aioredis` kullanılır
- Background task'lar için Celery + Redis broker tercih edilebilir (APScheduler daha basit alternatif)
- Rate limiting: upload endpoint'leri için IP bazlı (SlowAPI ile)
- Dosya upload akışı: multipart/form-data değil, **chunk bazlı custom protokol** kullanılır

---

### 5.3 Storage Provider Agent (Desktop)

**Teknoloji:** Go 1.21+, cross-platform (Windows, macOS, Linux)

#### Agent Özellikleri

**Başlangıç Yapılandırması (`config.yaml`)**
```yaml
server_url: "https://dsn-api.example.com"
auth_token: "<JWT token>"
storage_path: "/Users/username/DSN-Storage"
quota_gb: 100
bandwidth_limit_mbps: 50  # 0 = sınırsız
```

**Heartbeat Servisi**
- Her 30 saniyede bir WebSocket üzerinden backend'e gönderilir
- İçerik: `{ node_id, disk_free_bytes, disk_total_bytes, used_quota_bytes, status }`
- WebSocket bağlantısı kesilirse exponential backoff ile yeniden bağlanır

**HTTP Server (agent içinde çalışır)**
- Backend ve diğer node'lar chunk almak/vermek için bu server'a bağlanır
- Endpointler:
  - `PUT /chunks/{chunk_id}` — Chunk yükle (backend'den veya diğer node'dan)
  - `GET /chunks/{chunk_id}` — Chunk indir
  - `DELETE /chunks/{chunk_id}` — Chunk sil
  - `GET /chunks/{chunk_id}/verify` — SHA-256 doğrula, sonucu döndür
  - `GET /health` — Agent sağlık durumu

**Bandwidth Limiter**
- Token bucket algoritması ile `bandwidth_limit_mbps` değeri uygulanır
- Upload ve download ayrı ayrı sınırlandırılabilir

**Kota Kontrolü**
- Her chunk yazımında kota kontrolü yapılır
- Kota doluysa backend'e bildirim gönderilir ve yeni chunk kabul edilmez

**Chunk Verification Worker**
- Arka planda periyodik olarak (günde 1 kez) tüm chunk'ların SHA-256'sını kontrol eder
- Bozuk chunk bulunursa backend'e rapor edilir
- Backend re-replication tetikler

**Sistem Tray Entegrasyonu**
- Windows/macOS/Linux tray ikonu
- Durum göstergesi: bağlı/bağlı değil/hata
- Sağ tık menüsü: Ayarlar, Duraklat, Çıkış
- Tray ikonu için: `getlantern/systray` kütüphanesi

**Güncelleme Mekanizması**
- Agent başlangıçta backend'den versiyon kontrolü yapar
- Yeni versiyon varsa kullanıcıya bildirim gösterir

---

## 6. Veritabanı Şeması

### Tablo: `users`
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tablo: `refresh_tokens`
```sql
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Tablo: `nodes`
```sql
CREATE TABLE nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(100),
    address VARCHAR(255) NOT NULL,   -- IP:PORT veya domain
    port INTEGER NOT NULL,
    quota_bytes BIGINT NOT NULL,
    used_bytes BIGINT DEFAULT 0,
    disk_free_bytes BIGINT,
    status VARCHAR(20) DEFAULT 'active', -- active | inactive | dead
    last_heartbeat_at TIMESTAMP,
    registered_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_nodes_status ON nodes(status);
CREATE INDEX idx_nodes_last_heartbeat ON nodes(last_heartbeat_at);
```

### Tablo: `files`
```sql
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    original_name VARCHAR(500) NOT NULL,
    size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100),
    chunk_count INTEGER NOT NULL,
    encryption_key_id UUID,         -- aes_keys tablosuna ref
    status VARCHAR(20) DEFAULT 'uploading', -- uploading | active | deleting | deleted
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_status ON files(status);
```

### Tablo: `chunks`
```sql
CREATE TABLE chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    iv VARCHAR(32) NOT NULL,        -- AES-GCM initialization vector (hex)
    replication_factor INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(file_id, chunk_index)
);

CREATE INDEX idx_chunks_file_id ON chunks(file_id);
```

### Tablo: `chunk_replicas`
```sql
CREATE TABLE chunk_replicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id UUID REFERENCES chunks(id) ON DELETE CASCADE,
    node_id UUID REFERENCES nodes(id),
    status VARCHAR(20) DEFAULT 'pending', -- pending | stored | verified | failed
    stored_at TIMESTAMP,
    last_verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chunk_replicas_chunk_id ON chunk_replicas(chunk_id);
CREATE INDEX idx_chunk_replicas_node_id ON chunk_replicas(node_id);
CREATE INDEX idx_chunk_replicas_status ON chunk_replicas(status);
```

### Tablo: `aes_keys`
```sql
CREATE TABLE aes_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    encrypted_key BYTEA NOT NULL,   -- AES key, sunucu master key ile şifrelenmiş
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Tablo: `replication_jobs`
```sql
CREATE TABLE replication_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id UUID REFERENCES chunks(id),
    source_node_id UUID REFERENCES nodes(id),
    target_node_id UUID REFERENCES nodes(id),
    status VARCHAR(20) DEFAULT 'pending', -- pending | in_progress | completed | failed
    priority INTEGER DEFAULT 5,           -- 1 (yüksek) - 10 (düşük)
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT
);

CREATE INDEX idx_replication_jobs_status ON replication_jobs(status);
CREATE INDEX idx_replication_jobs_priority ON replication_jobs(priority, created_at);
```

---

## 7. API Endpoint Listesi

### Auth
| Method | Path | Açıklama | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Yeni kullanıcı kaydı | ❌ |
| POST | `/api/v1/auth/login` | Giriş, JWT döner | ❌ |
| POST | `/api/v1/auth/refresh` | Access token yenile | ❌ (refresh token cookie) |
| POST | `/api/v1/auth/logout` | Refresh token iptal | ✅ |

### Files
| Method | Path | Açıklama | Auth |
|---|---|---|---|
| GET | `/api/v1/files` | Kullanıcının dosya listesi | ✅ |
| GET | `/api/v1/files/{file_id}` | Dosya detayı ve chunk durumu | ✅ |
| POST | `/api/v1/files/upload/init` | Upload başlat, manifest döner | ✅ |
| POST | `/api/v1/files/upload/complete` | Upload tamamla, doğrula | ✅ |
| DELETE | `/api/v1/files/{file_id}` | Dosyayı ve chunk'ları sil | ✅ |
| GET | `/api/v1/files/{file_id}/download-manifest` | İndirme için chunk→node haritası | ✅ |

### Chunks
| Method | Path | Açıklama | Auth |
|---|---|---|---|
| POST | `/api/v1/chunks/{chunk_id}/confirm` | Chunk node'a ulaştı bildir | ✅ (node token) |
| POST | `/api/v1/chunks/{chunk_id}/verify-fail` | Chunk bozuk rapor et | ✅ (node token) |

### Nodes
| Method | Path | Açıklama | Auth |
|---|---|---|---|
| POST | `/api/v1/nodes/register` | Agent kayıt, node token döner | ✅ (user JWT) |
| DELETE | `/api/v1/nodes/{node_id}` | Node kaydını sil | ✅ |
| GET | `/api/v1/nodes/my` | Kullanıcının node listesi | ✅ |
| WS | `/api/v1/nodes/{node_id}/ws` | Heartbeat WebSocket | ✅ (node token) |

### Admin (Opsiyonel)
| Method | Path | Açıklama | Auth |
|---|---|---|---|
| GET | `/api/v1/admin/stats` | Sistem istatistikleri | ✅ (admin) |
| GET | `/api/v1/admin/replication-jobs` | Aktif replication job listesi | ✅ (admin) |

---

## 8. Dosya Yaşam Döngüsü

### 8.1 Upload Akışı

```
Client                     Backend                    Nodes
  │                           │                          │
  │  POST /files/upload/init  │                          │
  │  (filename, size, hash)   │                          │
  ├──────────────────────────►│                          │
  │                           │  Chunk'ları hesapla      │
  │                           │  Node seç (3 × chunk)    │
  │                           │  AES key üret/al         │
  │  Upload Manifest döner    │                          │
  │  (chunk_id, node_url, iv) │                          │
  │◄──────────────────────────┤                          │
  │                           │                          │
  │  Dosyayı chunk'lara böl   │                          │
  │  Her chunk'ı şifrele      │                          │
  │                           │                          │
  │  PUT /chunks/{id}  ───────┼─────────────────────────►│
  │  (şifreli chunk)          │                          │  Node kaydeder
  │                           │  POST /chunks/{id}/confirm
  │                           │◄─────────────────────────┤
  │                           │                          │
  │  [Tüm chunk'lar tamamlanınca]                        │
  │  POST /files/upload/complete                         │
  ├──────────────────────────►│                          │
  │                           │  SHA-256 doğrula         │
  │                           │  Dosya status → active   │
  │  200 OK                   │                          │
  │◄──────────────────────────┤                          │
```

### 8.2 Download Akışı

```
Client                     Backend                    Nodes
  │                           │                          │
  │  GET /files/{id}/download-manifest                   │
  ├──────────────────────────►│                          │
  │                           │  Aktif node'ları seç     │
  │  Manifest döner           │  (chunk_id → node_url)   │
  │◄──────────────────────────┤                          │
  │                           │                          │
  │  Paralel chunk indirme ───┼─────────────────────────►│
  │  GET /chunks/{id}         │                          │
  │◄──────────────────────────┼──────────────────────────┤
  │                           │                          │
  │  Her chunk için:          │                          │
  │  - SHA-256 doğrula        │                          │
  │  - AES-GCM decrypt        │                          │
  │  - Sıraya göre birleştir  │                          │
  │                           │                          │
  │  Dosya hazır              │                          │
```

### 8.3 Silme Akışı

```
1. Client: DELETE /api/v1/files/{file_id}
2. Backend: Dosyayı 'deleting' durumuna geçir
3. Her node'a: DELETE /chunks/{chunk_id} isteği gönder
4. Node onayları bekle (veya timeout sonrası devam et)
5. chunk_replicas, chunks, files kayıtlarını sil
6. AES key silinir
```

---

## 9. Replikasyon ve Kurtarma Mantığı

### 9.1 Node Durumları

| Durum | Koşul | Etki |
|---|---|---|
| `active` | Son 5 dakika içinde heartbeat var | Normal operasyon |
| `inactive` | 5 dakika - 24 saat arası heartbeat yok | Yeni chunk atanmaz, mevcutlar korunur |
| `dead` | 24 saat'ten uzun süredir heartbeat yok | Tüm chunk'lar başka node'lara taşınır |

### 9.2 Re-Replication Worker

Scheduler her 5 dakikada bir şu sorguyu çalıştırır:

```sql
-- Aktif replika sayısı replication_factor'ın altındaki chunk'lar
SELECT c.id, c.replication_factor,
       COUNT(cr.id) FILTER (WHERE n.status = 'active') AS active_replicas
FROM chunks c
JOIN chunk_replicas cr ON cr.chunk_id = c.id
JOIN nodes n ON n.id = cr.node_id
GROUP BY c.id, c.replication_factor
HAVING COUNT(cr.id) FILTER (WHERE n.status = 'active') < c.replication_factor
ORDER BY active_replicas ASC;  -- En az kopyası olan önce
```

Bulunan her chunk için Redis'e `replication_job` eklenir:
```json
{
  "chunk_id": "...",
  "current_replicas": 1,
  "needed_replicas": 2,
  "priority": 1
}
```

### 9.3 Replication Job İşleyici

```
1. Redis kuyruğundan job al
2. Chunk'ın mevcut olduğu aktif bir kaynak node seç
3. Hedef için: kota uygun, aktif, bu chunk'ı tutmayan node seç
4. Source Node'a: "Bu chunk'ı Target Node'a kopyala" talimatı gönder
   (veya Backend pull ederek ara iletim yapar)
5. Target Node chunk'ı kaydet, SHA-256 doğrula
6. Backend'e confirm gönder
7. chunk_replicas tablosu güncellenir
8. replication_jobs.status → completed
```

### 9.4 Node Seçim Algoritması

Yeni chunk atanacak node seçiminde şu kriterler öncelik sırasıyla uygulanır:

1. `status = 'active'`
2. `(used_bytes + chunk_size) <= quota_bytes` (kota uygun)
3. Bu chunk'ı zaten tutmuyor olmalı (farklı replika)
4. Mümkünse farklı kullanıcıların node'ları (çeşitlilik)
5. En düşük `used_bytes / quota_bytes` oranı (en boş node)

---

## 10. Güvenlik Mimarisi

### 10.1 Kimlik Doğrulama

- **Kullanıcı JWT:** Kısa ömürlü access token (15 dakika) + uzun ömürlü refresh token (7 gün)
- **Node Token:** Node kaydı sırasında üretilir, sadece heartbeat ve chunk operasyonları için kullanılır
- Tüm token'lar `python-jose` ile üretilir, HS256 algoritması

### 10.2 Şifreleme

**Dosya Şifreleme Akışı:**

```
1. Kullanıcıya ait bir AES-256 anahtarı bulunur veya oluşturulur
2. Bu anahtar sunucunun master key'i ile şifrelenerek aes_keys tablosunda saklanır
3. Upload sırasında: Backend her chunk için benzersiz bir IV (nonce) üretir
4. Şifreleme: AES-256-GCM (key + IV) → şifreli chunk
5. Şifreli chunk node'a gönderilir
6. IV ve chunk hash (SHA-256 of plaintext) metadata olarak saklanır

Download sırasında:
1. Backend aes_keys'den kullanıcının anahtarını alır (master key ile decrypt eder)
2. Her chunk için IV ve encrypted chunk birleştirilir
3. Decrypt edilmiş chunk'lar sıraya göre birleştirilir
```

**Önemli Not:** Bu mimari sunucu tarafı kontrollü anahtar yönetimidir. Kullanıcı şifresini değiştirse bile AES anahtarı etkilenmez çünkü AES anahtarı, kullanıcı şifresiyle değil sunucu master key'i ile şifrelenmektedir.

### 10.3 Chunk Bütünlüğü

- Her chunk'ın SHA-256 hash'i hem gönderilmeden önce hem de alındıktan sonra hesaplanır
- Uyuşmazlık durumunda chunk reddedilir ve kaynak node'a bildirilir
- Periyodik background verification (agent tarafından günde 1 kez)

### 10.4 Transport Güvenliği

- Tüm Backend API bağlantıları HTTPS zorunlu
- Node'lar arasındaki chunk transferleri HTTPS
- WebSocket heartbeat wss:// üzerinden
- Self-signed certificate yerine Let's Encrypt önerilir

### 10.5 Node Güven Modeli

- Node'lar güvenilmez kabul edilir (zero-trust)
- Chunk'lar her zaman şifreli olarak gönderilir
- Node plain-text chunk'a hiçbir zaman erişemez
- Node token'ları sadece chunk operasyonları için yetkilidir, metadata erişimi yoktur

---

## 11. Agent Protokolü

### 11.1 Heartbeat Mesajı (WebSocket, Client → Server)

```json
{
  "type": "heartbeat",
  "node_id": "uuid",
  "timestamp": "2024-01-01T12:00:00Z",
  "disk_free_bytes": 107374182400,
  "disk_total_bytes": 536870912000,
  "used_quota_bytes": 5368709120,
  "chunk_count": 324,
  "status": "active"
}
```

### 11.2 Server → Agent Mesajları (WebSocket)

```json
// Chunk sil
{
  "type": "delete_chunk",
  "chunk_id": "uuid"
}

// Chunk'ı başka node'a kopyala (re-replication)
{
  "type": "replicate_chunk",
  "chunk_id": "uuid",
  "target_node_url": "https://node-b.example.com",
  "target_node_token": "..."
}

// Ayarları güncelle
{
  "type": "update_config",
  "bandwidth_limit_mbps": 25
}
```

### 11.3 Chunk PUT Request (Backend/Node → Agent)

```
PUT /chunks/{chunk_id}
Authorization: Bearer {node_token}
Content-Type: application/octet-stream
X-Chunk-Hash: {sha256_hex}
X-Chunk-Size: {bytes}

[Binary chunk data]
```

Response:
```json
{"status": "stored", "chunk_id": "uuid", "verified": true}
```

### 11.4 Chunk GET Request

```
GET /chunks/{chunk_id}
Authorization: Bearer {node_token}
```

Response: `200 OK` ile binary chunk data veya `404 Not Found`

---

## 12. Docker & Deployment

### 12.1 Servisler

```yaml
# docker-compose.yml (geliştirilecek)
services:
  postgres:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: dsn
      POSTGRES_USER: dsn_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    depends_on:
      - postgres
      - redis
    environment:
      DATABASE_URL: postgresql+asyncpg://dsn_user:${DB_PASSWORD}@postgres/dsn
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      MASTER_ENCRYPTION_KEY: ${MASTER_ENCRYPTION_KEY}

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://backend:8000

volumes:
  postgres_data:
  redis_data:
```

### 12.2 Agent Build (Cross-Platform)

```bash
# Windows
GOOS=windows GOARCH=amd64 go build -o dsn-agent.exe ./cmd/agent

# macOS (Intel)
GOOS=darwin GOARCH=amd64 go build -o dsn-agent-mac-intel ./cmd/agent

# macOS (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o dsn-agent-mac-arm64 ./cmd/agent

# Linux
GOOS=linux GOARCH=amd64 go build -o dsn-agent-linux ./cmd/agent
```

### 12.3 Environment Variables

| Değişken | Açıklama |
|---|---|
| `DATABASE_URL` | PostgreSQL bağlantı string'i |
| `REDIS_URL` | Redis bağlantı URL'i |
| `JWT_SECRET` | JWT imzalama anahtarı (min 32 karakter) |
| `MASTER_ENCRYPTION_KEY` | AES key'lerini şifrelemek için master key (32 byte hex) |
| `MAX_FILE_SIZE_BYTES` | 5368709120 (5 GB) |
| `CHUNK_SIZE_BYTES` | 16777216 (16 MB) |
| `REPLICATION_FACTOR` | 3 |
| `NODE_ACTIVE_THRESHOLD_MIN` | 5 |
| `NODE_DEAD_THRESHOLD_HOURS` | 24 |

---

## 13. Opsiyonel: Erasure Coding

> Bu bölüm, 3x replication yerine daha verimli bir depolama stratejisi istenirse uygulanabilir. Bitirme projesi kapsamında temel gereksinim değildir.

### Neden Erasure Coding?

| Yöntem | 5 GB dosya için toplam alan | Dayanıklılık |
|---|---|---|
| 3x Replication | 15 GB | 2 node kaybına tolerans |
| Reed-Solomon 4+2 | 7.5 GB | 2 node kaybına tolerans |
| Reed-Solomon 6+3 | 7.5 GB | 3 node kaybına tolerans |

### Reed-Solomon 4+2 Konfigürasyonu

- 4 data shard + 2 parity shard = 6 shard
- Herhangi 4 shard yeterli, 6 farklı node'a dağıtılır
- Python için: `liberasurecode` veya `zfec` kütüphanesi

### Implementasyon Notları

- Chunk yapısı değişir: Tek chunk → 6 shard
- `chunk_replicas` tablosuna `shard_index` (0-5) ve `shard_type` (data/parity) alanı eklenir
- Download: En az 4 aktif shard bulunmalı, yoksa indirim mümkün değil
- Karmaşıklık ciddi artar; önce 3x replication ile çalışır hale getirip sonradan eklenebilir

---

## 14. Test Stratejisi

### 14.1 Backend Unit Tests
- Auth endpoint'leri (register, login, token refresh)
- Chunk seçim ve node assignment algoritması
- Re-replication koşul tespiti
- SHA-256 doğrulama mantığı

### 14.2 Backend Integration Tests
- Tam upload → download döngüsü
- Node offline → re-replication tetikleme → tamamlanma
- 5 GB dosya sınırı kontrolü

### 14.3 Agent Tests
- Heartbeat mekanizması (mock WebSocket server ile)
- Bandwidth limiter (token bucket)
- Chunk write → verify → report döngüsü

### 14.4 Frontend Tests
- Upload progress tracking
- Replikasyon durumu renk kodlaması
- Token refresh akışı

### 14.5 Manuel Test Senaryoları

| Senaryo | Adımlar | Beklenen Sonuç |
|---|---|---|
| Temel Upload | 100 MB dosya yükle | 7 chunk, 3×7=21 replika aktif |
| Node Kaybı | Upload sonrası bir node'u durdur | 5 dakika sonra yellow uyarı, 24 saat sonra re-replication |
| İndirme | Dosyayı indir | Orijinal dosya ile byte-by-byte eşit |
| Büyük Dosya | 4.9 GB dosya yükle | Başarılı tamamlanma |
| Limit Aşımı | 5.1 GB dosya dene | Client'ta "Dosya çok büyük" hatası |
| Bozuk Chunk | Node'da chunk dosyasını elle değiştir | Verification fail → re-replication |

---

## 15. Kısıtlamalar ve Bilinen Limitler

- **Dosya paylaşımı:** Dosyalar sadece sahibi tarafından erişilebilir; başkasıyla paylaşım özelliği yoktur.
- **Eş zamanlı upload:** Bir kullanıcı aynı anda birden fazla dosya yükleyebilir ancak her dosya için ayrı manifest ve upload session gerekir.
- **Offline indirme:** Eğer bir dosyanın tüm chunk replika'larını tutan tüm node'lar aynı anda offline olursa, dosya indirilemez. Bu durum replikasyon durumu ekranında görünür.
- **Node IP değişimi:** Bir node'un IP adresi değişirse agent yeniden kayıt yapmalıdır (re-register).
- **Mobile:** Desktop agent Windows, macOS ve Linux için desteklenir; mobile platform için agent yoktur.
- **Maksimum dosya boyutu:** 5 GB. Bu sınır hem client tarafında hem backend'de uygulanır.
- **Eş zamanlı node sayısı:** Test ortamı için 50 node'a kadar test edilmiştir. Daha fazlası için node seçim algoritması optimize edilmelidir.
- **Sunucu tarafı şifreleme:** Şifreleme anahtarları sunucuda tutulduğundan, sunucu güvenliği kritiktir. Gerçek uçtan uca şifreleme bu sürümde yer almamaktadır.

---

*Belge Versiyonu: 1.0*
*Son Güncelleme: Şubat 2025*
*Proje Sahibi: Bitirme Projesi Öğrencisi*
