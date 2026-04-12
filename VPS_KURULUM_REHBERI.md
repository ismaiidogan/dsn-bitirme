# DSN — VPS Üzerinde Kurulum Rehberi (2 Aylık Demo / Bitirme)

Bu belge, DSN projesini **tek bir VPS** üzerinde **Docker Compose** ile ayağa kaldırmak, uzaktan kullanmak ve süre sonunda kapatmak için adım adım yol haritasıdır.

**Google Cloud (Compute Engine + deneme kredisi)** kullanacaksanız: özet için **[Bölüm 15 — GCP eki](#15-ek-google-cloud-platform-gcp--compute-engine--docker)**; **sıfırdan adım adım tam rehber** için repodaki **`GCP_KURULUM_REHBERI.md`** dosyasına bakın.

---

## 1. Bu rehber neyi hedefliyor?

- **Merkezi sunucu:** PostgreSQL + Redis + Backend (FastAPI) + Frontend (Next.js) tek makinede çalışır.
- **Süre:** Örneğin 2 ay; sonra sunucu iptal edilebilir.
- **Bütçe:** Düşük, tek makine kiralama.
- **Risk:** Repoda hazır `docker-compose.yml` kullanımı; ekstra bulut ürünü zorunluluğu yok.

> **Not:** Agent’lar (depolama düğümleri) ayrı bilgisayarlarda da çalışabilir. Demo için en az bir agent’ı **aynı VPS’e** kurmak NAT sorunlarını azaltır (detay: [Bölüm 9](#9-agent-kurulumu-aynı-vpstte-demo-için)).

---

## 2. Hangi site / sağlayıcı?

Teknik olarak **“hangi marka” şart değil**; aşağıdaki kriterlere uyan bir **VPS (sanal sunucu)** kiralamanız yeterli.

### 2.1. Önerilen minimum kaynaklar

| Kaynak | Minimum | Önerilen (rahat demo) |
|--------|---------|------------------------|
| RAM | 2 GB | **4 GB** |
| CPU | 1 vCPU | 2 vCPU |
| Disk | 20 GB SSD | 40 GB SSD |
| Ağ | Kamuya açık IPv4 | Sabit IPv4 |

### 2.2. Sağlayıcı seçerken dikkat

- **Aylık faturalama**, **taahhüt yok** (2 ay sonra rahatça iptal).
- **Ubuntu 22.04 LTS** veya **24.04 LTS** imajı seçebildiğiniz bir panel.
- Türkiye’den erişim gecikmesi önemliyse **Avrupa lokasyonu** (Frankfurt, Amsterdam vb.) genelde uygundur.

### 2.3. İsim vermeden örnek kategoriler

- **Uluslararası:** Aylık birkaç € ile başlayan, VPS’i çok kullanılan Avrupa sağlayıcıları (ör. Hetzner, DigitalOcean, OVH, Linode/Akamai).
- **Yerel:** Türkiye’de VPS sunan firmalar (fiyatları karşılaştırın; teknik olarak aynı Docker kurulumu geçerlidir).

**Özet:** “Şu site şart” değil; **2 GB+ RAM, Ubuntu, aylık plan, iptal edilebilir** olması yeterli.

---

## 3. Süreç özeti (yüksek seviye)

1. VPS satın al → **SSH** ile bağlan.
2. Sunucuya **Docker** + **Docker Compose** kur.
3. Projeyi sunucuya al (git clone veya `scp` + zip).
4. Kök dizinde **`.env`** oluştur (sırlar, güçlü parola).
5. **`docker compose up -d --build`** çalıştır.
6. Güvenlik duvarında **22, 80, 443, 3000** (ve gerekirse **8000**) portlarını aç.
7. İsteğe bağlı: **Alan adı** + **HTTPS** (Let’s Encrypt).
8. **Agent** kur (aynı VPS veya başka makine).
9. Tarayıcıdan test: kayıt → yükleme → indirme.

---

## 4. Aşama 1 — VPS’i hazırlama

### 4.1. SSH ile bağlanma

Windows’ta **PowerShell** veya **Terminal** (macOS/Linux):

```bash
ssh root@SUNUCU_IP_ADRESI
```

İlk bağlantıda “fingerprint” sorulursa `yes` yazın. Sağlayıcı bazen **root yerine** `ubuntu` kullanıcısı verir:

```bash
ssh ubuntu@SUNUCU_IP_ADRESI
```

### 4.2. Sistem güncellemesi (Ubuntu)

```bash
sudo apt update && sudo apt upgrade -y
```

### 4.3. Docker kurulumu (resmi yöntem — özet)

Docker’ın güncel kurulum talimatları için: https://docs.docker.com/engine/install/ubuntu/

Özet komutlar (Ubuntu için):

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Kullanıcıyı docker grubuna ekleme (root olmadan):

```bash
sudo usermod -aG docker $USER
```

**Oturumu kapatıp tekrar SSH** yapın; sonra `docker ps` çalışmalı.

### 4.4. Docker Compose

Yukarıdaki kurulumda **`docker compose`** (plugin) gelir. Kontrol:

```bash
docker compose version
```

---

## 5. Aşama 2 — Projeyi sunucuya alma

### 5.1. Seçenek A: Git ile (repo public veya deploy key)

```bash
cd /opt
sudo mkdir -p dsn && sudo chown $USER:$USER dsn
cd dsn
git clone <repo-url> .
```

### 5.2. Seçenek B: Kendi bilgisayarınızdan zip

```bash
# Windows PowerShell'de (örnek)
scp -r "C:\Users\...\Bitirme Projesi" ubuntu@SUNUCU_IP:/opt/dsn
```

Sunucuda:

```bash
cd /opt/dsn
```

---

## 6. Aşama 3 — Ortam dosyası (`.env`)

Proje **kökünde** `.env` dosyası oluşturun. `docker-compose.yml` bu dosyayı okur.

```bash
cd /opt/dsn   # veya projenin kökü
cp .env.example .env
nano .env
```

### 6.1. Mutlaka değiştirin

| Değişken | Açıklama |
|----------|----------|
| `DB_PASSWORD` | Sadece harf ve rakam önerilir (Docker/URL uyumu). Örn. `rastgeleUzun32Karakter` |
| `JWT_SECRET` | En az 32 karakter rastgele dize (ör. `openssl rand -hex 32` çıktısı) |
| `MASTER_ENCRYPTION_KEY` | Tam **64 hex** karakter (ör. `openssl rand -hex 32`) |

### 6.2. İnternetten erişim için (frontend URL’iniz)

Tarayıcıdan siteye `http://SUNUCU_IP:3000` veya `https://alanadiniz.com` ile girecekseniz, backend’in CORS listesine bu adresi ekleyin:

```env
CORS_ORIGINS=http://SUNUCU_IP:3000,https://alanadiniz.com
```

Birden fazla adres **virgülle** ayrılır.

> Frontend, API isteklerini tarayıcıda `/api/...` üzerinden yapar; Next.js bunu `docker-compose` içindeki `backend` servisine yönlendirir. Bu yüzden `NEXT_PUBLIC_API_URL` Docker imajında `http://backend:8000` kalabilir; **müşteri tarayıcısı doğrudan 8000 portuna gitmek zorunda değildir.**

---

## 7. Aşama 4 — Docker ile servisleri başlatma

```bash
cd /opt/dsn
docker compose up -d --build
```

İlk seferde imajlar derlenir; birkaç dakika sürebilir.

### 7.1. Kontroller

```bash
docker compose ps
```

`backend` ve `frontend` için `healthy` görünmesi gerekir.

```bash
curl -s http://127.0.0.1:8000/health
curl -s http://127.0.0.1:8000/health/ready
curl -s http://127.0.0.1:3000/api/health
```

Veritabanı migrasyonu (ilk kurulumda tablolar yoksa):

```bash
docker compose exec backend alembic upgrade head
```

### 7.2. Tarayıcı testi

- `http://SUNUCU_IP:3000` — web arayüzü  
- `http://SUNUCU_IP:8000/docs` — Swagger (isteğe bağlı; üretimde kapatabilirsiniz)

---

## 8. Aşama 5 — Güvenlik duvarı (UFW)

Ubuntu’da örnek:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw allow 8000/tcp
sudo ufw enable
sudo ufw status
```

HTTPS kullanacaksanız sonra **80** ve **443** de açılır (Bölüm 10).

---

## 9. Agent kurulumu (aynı VPS’te — demo için)

Tarayıcıda chunk yükleme/indirme, manifestteki **node adresine** gider. En az bir agent’ın **internetten erişilebilir** olması gerekir.

**Aynı VPS’te ikinci port (örn. 7778) ile ikinci agent** veya **7777 portunda tek agent** kullanabilirsiniz.

1. Sunucuda `config.yaml` hazırlayın: `server_url` = `http://SUNUCU_IP:8000` veya domain kullanıyorsanız `https://alanadiniz.com` (API’nin dışarıdan erişilebilir olduğu adres).
2. Kullanıcı JWT’si ile `auth_token` doldurun (web’den giriş yapan kullanıcı için token alma akışı proje dokümantasyonunda).
3. Linux için: `agent/linux/install-dsn-agent.sh` veya `USER_GUIDE_LINUX_AGENT.md`.
4. Güvenlik duvarında **7777** (agent HTTP) açın:

```bash
sudo ufw allow 7777/tcp
```

Backend’de node kaydı sırasında **adres** olarak VPS’in **public IP** veya domain’i ve port **7777** kullanılmalıdır.

---

## 10. Aşama 6 — Alan adı ve HTTPS (isteğe bağlı)

### 10.1. DNS

Alan adı sağlayıcınızda:

- `A` kaydı: `alanadiniz.com` → `SUNUCU_IP`
- İsterseniz `www` için de aynı `A` kaydı

### 10.2. Ters vekil (nginx veya Caddy)

Örnek hedef: `https://alanadiniz.com` → sunucunun `127.0.0.1:3000` (Next.js).

**Caddy** (otomatik Let’s Encrypt):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

`/etc/caddy/Caddyfile` örneği:

```text
alanadiniz.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

Sonra `.env` içinde:

```env
CORS_ORIGINS=https://alanadiniz.com
```

Frontend’e tarayıcıdan `https://alanadiniz.com` ile girin.  
**Not:** `docker compose` içindeki `NEXT_PUBLIC_API_URL` build sırasında `http://backend:8000` kalır; Next.js sunucu tarafında `/api` isteklerini backend’e yönlendirir — bu yapı için ekstra bir şey gerekmez.

---

## 11. Aşama 7 — Günlük işletim

| Görev | Komut / Yer |
|--------|-------------|
| Loglar | `docker compose logs -f backend` veya `frontend` |
| Yeniden başlatma | `docker compose restart` |
| Güncelleme (kod değişince) | `git pull` + `docker compose up -d --build` |
| Yedek (veritabanı) | `docker compose exec postgres pg_dump -U dsn_user dsn > yedek.sql` |

---

## 12. Süre bitince — kapatma ve temizlik

1. **Önemli verileri yedekleyin** (DB dump, gerekirse volume’lar).
2. VPS panelinden **sunucuyu silin** veya **aboneliği iptal** edin.
3. Alan adı kullanıyorsanız DNS kayıtlarını kaldırın / başka yere taşıyın.

---

## 13. Sık karşılaşılan sorunlar

| Sorun | Ne yapılmalı |
|----------|----------------|
| `502` / site açılmıyor | `docker compose ps`, `docker compose logs frontend` |
| Giriş oluyor ama API hata veriyor | `CORS_ORIGINS` tam URL ile mi? `backend` logları |
| `health/ready` 503 | Postgres/Redis ayakta mı? `docker compose logs postgres redis` |
| Chunk yükleme “Failed to fetch” | Agent portu (7777) firewall’da açık mı? Node kaydındaki IP doğru mu? |
| Migrasyon yok | `docker compose exec backend alembic upgrade head` |

---

## 14. Özet tablo

| Soru | Cevap |
|------|--------|
| Hangi site? | Herhangi bir güvenilir VPS sağlayıcısı; **2 GB+ RAM**, **Ubuntu**, **aylık plan**. |
| Ne kuruyoruz? | **Docker Compose** + proje kökündeki **`.env`**. |
| API erişimi? | Tarayıcı → **3000** (veya HTTPS ile 443); Next.js `/api` → backend. |
| Agent? | Aynı VPS veya başka makine; **public IP + port** erişilebilir olmalı. |
| 2 ay sonra? | Yedek al → VPS’i kapat / iptal et. |

---

## 15. Ek: Google Cloud Platform (GCP) — Compute Engine + Docker

Bu bölüm, **herhangi bir VPS** yerine **Google Cloud** deneme kredisi (ör. **300 $ / 90 gün**) ile aynı mimariyi kurmak isteyenler içindir. Uygulama katmanı yukarıdaki rehberle **aynıdır**; fark, sanal makinenin GCP konsolunda oluşturulması ve **GCP güvenlik duvarı kurallarıdır**.

### 15.1. Ne zaman bu yolu seçmeli?

- Zaten **GCP hesabı** ve deneme kredisi kullanacaksanız.
- **Cloud SQL / Memorystore kullanmadan** — Postgres ve Redis’i yine **Docker Compose içinde** çalıştırırsanız maliyet kontrolü kolay kalır (2 ay için 300 $ kredi genelde fazlasıyla yeterli olur; yine de **bütçe uyarısı** kurun).

### 15.2. Maliyeti düşük tutmak için

| Yapın | Yapmayın (bitirme süresi için gereksiz pahalı) |
|--------|------------------------------------------------|
| **Tek VM** (Compute Engine) üzerinde **Docker Compose** | Ayrı **Cloud SQL** + **Memorystore** (küçük planlar bile ek maliyet) |
| Ubuntu LTS + repodaki `docker-compose.yml` | Gereksiz **yük dengeleyici**, çoklu bölge, büyük makine |
| İş bitince VM + diski **silme** | Boşta bırakılan statik IP / disk |

### 15.3. Adımlar (özet)

1. **Google Cloud Console** → yeni proje oluşturun (veya mevcut projeyi seçin).
2. **Billing** ile deneme kredisi / faturalandırma tanımlı olsun (deneme koşullarını okuyun).
3. **Billing → Budgets** üzerinden uyarı oluşturun (örn. 50 $, 100 $ e-posta ile).
4. **Compute Engine → VM instances → Create instance**
   - **Makine ailesi:** `E2` veya `N2` (fiyat/performans dengesi).
   - **Makine tipi:** Örn. `e2-small` (2 vCPU, 2 GB RAM) veya `e2-medium` (daha rahat).
   - **Önyükleme diski:** Ubuntu **22.04 LTS** veya **24.04 LTS**, disk boyutu 20–40 GB yeterli (SSD).
   - **Firewall:** “Allow HTTP traffic” / “Allow HTTPS traffic” işaretleyebilirsiniz (80/443); **SSH** varsayılan olarak açılır.
   - **Bölge:** Size yakın bir bölge (örn. `europe-west3` Frankfurt).
5. VM oluşunca **External IP** not edin (Agent kaydında ve `CORS_ORIGINS` / site erişiminde kullanılacak).
6. **VPC ağ güvenlik duvarı:** DSN için ek kurallar (Compute Engine → **Firewall** veya VM oluştururken etiketlerle):
   - TCP **3000** (web arayüzü, doğrudan erişim için)
   - TCP **8000** (isteğe bağlı Swagger; üretimde kapatılabilir)
   - TCP **7777** (Agent HTTP — chunk yükleme/indirme için **şart**, agent bu VM’de çalışacaksa)

   Örnek: “Target tags” ile VM’e `dsn-server` etiketi verip, kaynak `0.0.0.0/0`, izin verilen portlar `tcp:3000,8000,7777` gibi bir kural ekleyin.

7. **SSH bağlantısı:** Console’daki **SSH** butonu veya yerel terminalden:

   ```bash
   gcloud compute ssh INSTANCE_ADI --zone=BOLGE
   ```

   İlk kez `gcloud` kurulumu: [Google Cloud SDK](https://cloud.google.com/sdk/docs/install).

8. VM içinde **Bölüm 4–7** ile aynı adımlar: Docker kurulumu → proje dosyaları → `.env` → `docker compose up -d --build` → `alembic upgrade head`.

### 15.4. `.env` ve CORS (GCP dış IP ile)

Tarayıcıdan `http://DIS_IP:3000` kullanacaksanız:

```env
CORS_ORIGINS=http://DIS_IP:3000
```

Alan adı ve HTTPS kullanıyorsanız ilgili `https://...` adreslerini virgülle ekleyin (Bölüm 10).

### 15.5. Agent’ı aynı VM’de çalıştırma

- `server_url`: `http://DIS_IP:8000` veya reverse proxy kullanıyorsanız public API adresiniz.
- Node kaydında backend’in gördüğü adres: VM’in **dış IP**’si ve agent portu **7777** (GCP firewall’da açık olmalı).
- Yerel test: VM içinden `curl http://127.0.0.1:7777/health` (agent ayakta mı).

### 15.6. İş / deneme bitince (GCP)

1. Veritabanı yedeği alın (`pg_dump`).
2. **Compute Engine** → VM’yi **silin** (diski de sil seçeneğiyle birlikte, ihtiyaca göre).
3. Kullanılmayan **statik IP** rezervasyonlarını kaldırın.
4. Faturalama sayfasından dönem özeti kontrol edin.

### 15.7. GCP vs klasik VPS (kısa)

| | Klasik VPS | GCP Compute Engine |
|---|------------|---------------------|
| Panel | Sağlayıcı web arayüzü | Google Cloud Console |
| Sunucu | Tek “droplet” / VPS | VM instance |
| Güvenlik duvarı | UFW + sağlayıcı paneli | **VPC firewall kuralları** + isteğe bağlı UFW |
| Maliyet | Aylık sabit fiyat | Kullanım + deneme kredisi; **bütçe uyarısı şart** |

Uygulama (Docker Compose, `.env`, agent mantığı) **aynıdır**; fark çoğunlukla **hesap oluşturma, firewall ve kapanışta kaynak silme** adımlarıdır.

---

*Bu rehber, depodaki `docker-compose.yml` ve `.env.example` yapısına göre yazılmıştır. Güvenlik için üretim ortamında güçlü şifreler, `JWT_SECRET`, `MASTER_ENCRYPTION_KEY` ve düzenli yedek kullanın.*
