## DSN Projesi — Genel Bakış

### Proje nedir?

DSN (Distributed Storage Network), farklı insanların bilgisayarlarındaki boş disk alanını bir araya getirip, dosyaları parçalara bölerek güvenli şekilde saklayan bir depolama sistemidir.  
Klasik “dosyalarımı bir yere yedekleyeyim” mantığını, tek bir şirketin veri merkezine değil, gönüllü katılımcıların bilgisayarlarına dağıtır.  
Dosyalar gönderilirken otomatik şifrelenir, hangi dosyanın hangi bilgisayarda olduğunu kimse tek başına bilemez.  
Son kullanıcı için deneyim, “Google Drive / Dropbox benzeri basit bir web arayüzü + küçük bir masaüstü uygulaması” şeklindedir.

### Hangi problemi çözüyor?

- **Tek noktaya bağımlılık**: Klasik bulut depolamada (Google Drive, Dropbox) veriler tek bir şirketin altyapısında tutulur; şirket kapanırsa veya hesabınız kilitlenirse dosyalarınıza ulaşamazsınız.  
- **Boşta duran disk alanı**: Birçok kişinin bilgisayarında kullanılmayan yüzlerce GB disk alanı vardır; DSN bu alanı ekonomiye kazandırmayı hedefler.  
- **Gizlilik**: Merkezi servisler dosyaların içeriğini görebilir; DSN’de dosyalar, saklanmadan önce tamamen şifrelenir, saklayan kişi içeriği okuyamaz.  
- **Dayanıklılık**: Dosyalar parçalara (chunk’lara) bölünüp birden fazla cihaza kopyalanır; tek bir cihaz bozulsa bile dosya kaybolmaz.

### Nasıl çalışır? — Hikâye

**1. X kişisi (Uploader) yeni bir dosya yüklemek istiyor**
- Tarayıcıdan `http://localhost:3000` adresine girer, kayıt olur ve giriş yapar.  
- “Dosya Yükle” sayfasında dosyasını seçer ve kaç kopya tutulacağını (1, 2 veya 3) belirler.  
- Tarayıcı sadece dosyayı backend’e yükler; **dosyanın işlenmesi (sıkıştırma, parçalama, şifreleme) backend tarafında** gerçekleşir.

**2. Y kişisi (Storage Provider) agent kurar**
- DSN Agent adlı küçük bir masaüstü uygulamasını indirir (`dsn-agent.exe`).  
- İlk açılışta backend’e kaydolur, kendisine bir **Node ID** atanır ve ne kadar alan ayıracağını seçer (örneğin 100 GB).  
- Agent arka planda çalışır, saat yanındaki tray ikonundan durumu görülebilir ve `http://localhost:7777` adresinde küçük bir “Node dashboard” açar.

**3. X’in yüklediği dosya ağda yer bulur**
- Backend, dosyayı önce **zstd ile sıkıştırır**, ardından **chunk’lara böler** ve her chunk’ı **AES-256-GCM ile şifreler**.  
- O anda “aktif” olan node’ları (agent’ları) listeler ve dosyanın parçalarını hangi node’lara gönderileceğine karar verir.  
- Her parça, seçilen node’lara HTTPS benzeri basit HTTP istekleriyle, şifrelenmiş ve sıkıştırılmış olarak yollanır.  
- Node’lar parçayı aldıktan sonra, “şu chunk şu hash ile bende saklandı” diye backend’e haber verir.

**4. Dosya artık “aktif” durumda**
- Tüm parçaların en az bir kopyası başarılı şekilde saklandığında, backend dosyanın durumunu `active` yapar.  
- X kişisi dashboard’da dosyasını, replikasyon durumunu (örneğin “2 cihazda aktif, 1 cihaz çevrimdışı”) ve sağlığını görebilir.

**5. İndirme zamanı geldiğinde**
- X kişi dosyayı indirmek istediğinde, backend ona bir **download manifest** döner:  
  - Hangi chunk’ın hangi node’dan çekileceği,  
  - Hangi anahtar ve IV ile çözüleceği gibi bilgiler bu manifestte yer alır.  
- Tarayıcı tüm parçaları ilgili node’lardan çeker, tekrar birleştirir ve orijinal dosyayı X kişisine sunar.

**6. Y kişisi için (Storage Provider) ne oluyor?**
- Y kişisinin agent’ı belli aralıklarla backend’e “hayattayım” diye heartbeat gönderir.  
- Agent’ın disk kullanım bilgisi, günlük upload/download miktarı kaydedilir.  
- `storage_earnings` ve `storage_usage` tablolarında, hangi node’un ne kadar veri tuttuğu ve hangi kullanıcıların ne kadar alan kullandığı toplanır; ileride bu veriler **ücretlendirme** için temel olacak.

---

### Sistem mimarisi (ASCII diyagram)

```text
                     (1) HTTPS / REST (JSON)
          +--------------------------------------------+
          |                Web Tarayıcı               |
          |      (Next.js frontend, uploader UI)      |
          +------------------------+------------------+
                                   |
                                   v
                        +----------+-----------+
                        |       Backend        |
                        |   FastAPI (Python)   |
                        +----------+-----------+
                                   |
          (2) SQL/TCP              |             (3) TCP
      +----------------+           |        +-------------+
      |  PostgreSQL    |<----------+------->|   Redis     |
      |  users, files, |   ORM /           |  cache /    |
      |  chunks, nodes,|   SQLAlchemy      |  job queue |
      |  storage_* ... |                   +-------------+
      +----------------+


        (4) WebSocket (heartbeat, komutlar)
        (5) HTTP (chunk upload/download)
   +---------------------------+        +---------------------------+
   |        DSN Agent         |        |        DSN Agent         |   ...
   |   (Go HTTP server)       |        |   (isteğe bağlı ek node) |
   |   - /chunks/...          |        |   - /chunks/...          |
   |   - /health              |        |   - /health              |
   |   - /api/stats           |        |   - /api/stats           |
   +-------------+------------+        +-------------+------------+
                 |                                 |
    (6) Yerel dosya sistemi                        |  (6) Yerel dosya sistemi
                 v                                 v
        +-------------------+              +-------------------+
        |  Node Storage     |              |  Node Storage     |
        |  (şifreli chunk’lar)|            |  (şifreli chunk’lar)|
        +-------------------+              +-------------------+


   +-------------------------------------------------------------+
   |             DSN Installer (Tauri desktop app)              |
   | - Deep link ile kullanıcı login                            |
   | - Agent binary’sini kurar ve config.yaml üretir            |
   +-------------------------------------------------------------+
```

---

### Kullanılan teknolojiler ve nedenleri

- **FastAPI (Python 3.11)**: Yüksek performanslı, tip güvenli ve async destekli API geliştirmek için modern bir web çerçevesi.  
- **PostgreSQL**: Güçlü ilişkisel model, UUID desteği ve karmaşık sorgular (replication, billing) için uygun, üretim seviyesinde veritabanı.  
- **Redis**: Re-replication job kuyruğu ve gelecekteki kuyruk işlemleri için hafif ve hızlı bir bellek içi veri deposu.  
- **Next.js 14 (React + TypeScript)**: Modern, SEO dostu ve dosya bazlı yönlendirme sunan frontend çatısı; App Router ile temiz yapı.  
- **TailwindCSS + shadcn/ui**: Hızlı, tutarlı ve koyu tema odaklı arayüz geliştirmeye uygun component seti.  
- **Go (Agent)**: Tek binary, düşük bellek tüketimi ve sistem entegrasyonu (tray, dosya sistemi) için ideal, statik derlenmiş dil.  
- **Tauri (Installer)**: Hafif masaüstü arayüzü ile agent kurulumu ve deep link akışını sağlamak için kullanıldı.  
- **Alembic + SQLAlchemy**: Veritabanı şemasını kontrollü şekilde evrimleştirmek ve Python ORM ile rahatça çalışmak için.  
- **zstd sıkıştırma**: Yüksek hız + iyi sıkıştırma oranı dengesi ile dosya parçalarının ağ ve disk maliyetini düşürmek için.  
- **AES-256-GCM + SHA-256**: Güçlü, modern ve donanım hızlandırmalı şifreleme + bütünlük kontrolü.

---

### Güvenlik modeli (zero-trust node yaklaşımı)

- **Uçtan uca şifreleme**: Dosyalar, node’lara gitmeden önce AES-256-GCM ile şifrelenir; node sadece rastgele görünen byte dizilerini saklar.  
- **Parça bazlı mimari**: Tek bir node, tek bir dosyanın tamamını değil, sadece bazı chunk’larını tutar; chunk’lar da zaten şifreli olduğundan anlamlı bilgi elde edemez.  
- **Node token’ları**: Backend, her node için ayrı bir token üretir; chunk okumak/yazmak için bu token gereklidir. Kullanıcı tokesı node’a asla verilmez.  
- **Zero-trust node**: Y kişisi (Storage Provider) “güvenilir” kabul edilmez; sistem tasarımı, node’un kötü niyetli olabileceğini varsayar ve buna rağmen veri gizliliğini korur.  
- **Yetkilendirme katmanı**:  
  - Kullanıcı tarafında JWT tabanlı auth + refresh token,  
  - Node tarafında ayrı bir imzalı token,  
  - API’de tüm kritik uçlar bu token’larla korunur.

---

### Özellik listesi

**Tamamlanan özellikler**
- Kullanıcı kaydı ve girişi (JWT + refresh token mekanizması).  
- Dosya yükleme: 5 GB’a kadar dosya, 16 MB chunk boyutu, seçilebilir replikasyon faktörü (1–3).  
- Zstd ile sıkıştırma + AES-256-GCM ile chunk şifreleme.  
- Agent HTTP API’si (`/chunks/...`, `/health`, `/api/stats`).  
- Web arayüzü:
  - Dashboard: dosya listesi, replikasyon durumu ve sağlık renkleri.  
  - Dosya detay sayfası: özet kartları (güvenlik durumu, kopya durumu, boyutlar).  
  - Agent yönetimi: bağlı node’ların görünümü, agent indirme linkleri.  
- Agent dashboard (`localhost:7777`): node disk kullanımı, chunk sayısı, günlük trafik.  
- Re-replication altyapısı: node’lar öldüğünde chunk’ların başka node’lara dağıtılması için job sistemi.  
- Ücretlendirme veri tabanı:
  - `storage_usage`: hangi kullanıcı, hangi dosya için ne kadar yer kullanıyor, ne zamandan beri.  
  - `storage_earnings`: hangi node, hangi dönemde ne kadar veri tutmuş (günlük snapshot).  

**Planlanan / altyapısı hazır özellikler**
- Gerçek ücretlendirme ve faturalama (kullanım verilerinden hesaplama, ödeme entegrasyonu).  
- Daha gelişmiş dashboard:
  - Kullanıcı bazlı detaylı kullanım grafikleri.  
  - Node bazlı kazanç tahmini.  
- Çoklu node ortamında otomatik yeniden replikasyon ve sağlık uyarıları (e-posta, push).  
- Agent tarafında daha gelişmiş ayarlar (limitler, zamanlama, otomatik güncelleme).
- Erasure coding (Reed-Solomon) ile daha verimli depolama ve bant/genişlik kullanımının azaltılması.

---

### Proje klasör yapısı (özet)

```text
.
├─ backend/          # FastAPI backend + Alembic migration'lar
│  ├─ app/
│  │  ├─ auth/       # Kullanıcı kaydı, login, JWT, refresh
│  │  ├─ files/      # Dosya modelleri, servis katmanı, router
│  │  ├─ chunks/     # Chunk ve replika modelleri / API'leri
│  │  ├─ nodes/      # Node (agent) kayıt ve durum izleme
│  │  ├─ replication/# Re-replication, scheduler, billing modelleri
│  │  ├─ storage/    # Şifreleme, sıkıştırma ve disk hesapları
│  │  ├─ main.py     # FastAPI app giriş noktası, CORS, router include
│  │  └─ database.py # SQLAlchemy + async session yönetimi
│  ├─ alembic/       # Veritabanı migration script'leri (0001–0004)
│  └─ Dockerfile     # Backend Docker imajı
│
├─ frontend/         # Next.js 14 + TypeScript web arayüzü
│  ├─ app/(app)/
│  │  ├─ dashboard/  # Dosya listesi, replikasyon ve sağlık görünümü
│  │  ├─ upload/     # Dosya yükleme, replikasyon seçimi, zstd tahmini
│  │  ├─ files/[id]/ # Dosya detay ve indirme sayfası
│  │  ├─ agent/      # Agent yönetim ekranı (node listesi)
│  │  └─ settings/   # Kullanıcı ayarları (ileriye dönük)
│  ├─ lib/api.ts     # Frontend API client (auth, files, nodes)
│  └─ Dockerfile     # Frontend Docker imajı
│
├─ agent/            # Go ile yazılmış DSN Agent
│  ├─ cmd/agent/     # main.go – agent giriş noktası
│  ├─ internal/
│  │  ├─ server/     # HTTP server, /chunks, /health, /api/stats, dashboard.html
│  │  ├─ storage/    # Yerel storage yöneticisi (chunk dosyaları)
│  │  ├─ bandwidth/  # Shared token bucket (bant genişliği limiti)
│  │  ├─ tray/       # Windows/macOS tray entegrasyonu
│  │  └─ config/     # config.yaml yükleme/kaydetme
│  └─ dist/dsn-agent.exe # Derlenmiş Windows agent binary'si
│
├─ installer/        # Tauri tabanlı kurulum sihirbazı
│  ├─ src-tauri/     # Rust backend (deep link, single-instance, agent kopyalama)
│  └─ src/           # React wizard arayüzü
│
├─ docker-compose.yml# Tüm sistemi (postgres, redis, backend, frontend) ayağa kaldırır
└─ PROJECT_OVERVIEW.md # Bu doküman
```

---

### Kurulum özeti — 5 adımda çalıştır

1. **Depoları ve bağımlılıkları hazırla**  
   - Proje klasörünü bir dizine klonla/çıkar (`<PROJE_KLASÖRÜ>`).  
   - Docker Desktop yüklü ve çalışır durumda olmalı.

2. **Backend + Frontend + DB + Redis’i başlat**  
   ```powershell
   Set-Location "<PROJE_KLASÖRÜ>"
   docker compose up --build -d   # İlk sefer
   ```
   - Backend: `http://localhost:8000/health` → `{"status":"ok"}`  
   - Frontend: `http://localhost:3000`

3. **Admin kullanıcısı ile giriş yap**  
   - `http://localhost:3000/register` veya `/login` üzerinden bir hesap oluştur (`admin@example.com / Admin1234` gibi).  
   - Sonrasında dashboard’a (`/dashboard`) yönlendirilirsin.

4. **Agent’ı başlat**  
   - `<PROJE_KLASÖRÜ>\agent\dist\dsn-agent.exe` için bir kısayol oluştur:  
     ```text
     "...\dsn-agent.exe" -config "<KULLANICI_KLASÖRÜ>\AppData\Roaming\DSN\config.yaml"
     ```  
   - Kısayola çift tıkla; tray ikonunu veya `http://localhost:7777` dashboard’unu görmelisin.

5. **Test dosyası yükle ve indir**  
   - `http://localhost:3000/upload` sayfasından küçük bir dosya seç, replikasyon faktörünü belirle ve yükle.  
   - Dashboard’da dosyayı **active** durumda gör; detay sayfasından indirip aç.

---

### Demo senaryosu (hoca önünde)

Bu senaryo, projeyi hem konsept hem de teknik açıdan göstermek için ideal bir akış sunar.

1. **Sistemi ayağa kaldır**  
   - Docker ile backend + frontend + veritabanı + redis’i başlat (`docker compose up -d`).  
   - Tarayıcıda:
     - `http://localhost:8000/docs` (API dokümantasyonu),  
     - `http://localhost:3000` (kullanıcı arayüzü).

2. **İki agent başlat (aynı makinede iki node gibi düşünebiliriz)**  
   - Birinci agent (Node 1):
     - Mevcut `config.yaml` ile `dsn-agent.exe` başlat.  
     - `http://localhost:7777` dashboard’unda disk kullanımı ve boş alanı göster.  
   - İkinci agent (Node 2 simülasyonu):
     - `config-node2.yaml` benzeri ikinci bir config oluştur (farklı `storage_path` ve `listen_port: 7778`).  
     - `dsn-agent.exe -config config-node2.yaml` ile çalıştır.  
     - İsteğe bağlı: İkinci node’un health endpoint’ini `http://localhost:7778/health` ile göster.

3. **Web arayüzünden dosya yükle (2 kopya)**  
   - `testuser@example.com` gibi ayrı bir kullanıcı ile giriş yap.  
   - `Upload` sayfasında:
     - Replikasyon seçimini **“Dengeli — 2 kopya”** yap.  
     - ~50 MB civarında bir test dosyası seç.  
   - Yükleme sırasında:
     - Chunk progress noktacıkları ve yüzde ilerleyişini göster.  
     - Agent dashboard’larında (`7777` ve `7778`) disk kullanımı ve günlük trafik artışını göster.

4. **Bir agent’ı kapat ve sistem tepkisini göster**  
   - Örneğin Node 2’yi (7778 portundakini) kapat:  
     - `taskkill /IM dsn-agent.exe /F` veya tray menüsünden çıkış.  
   - Dashboard’da:
     - Dosyanın replikasyon durumu **“kısmi”** hale gelir:  
       - Örnek metin: “1 cihazda aktif, 1 cihaz çevrimdışı”.  
     - Dosya detay sayfasında güvenlik kartı **“Riskli”** durumuna geçer.

5. **Node’u tekrar aç ve dosya indirme**  
   - Node 2’yi tekrar başlat (`dsn-agent.exe` ikinci config ile).  
   - Birkaç saniye sonra heartbeat’ler geldiğinde:
     - Replikasyon durumu tekrar **“Tam / tüm kopyalar aktif”** olarak güncellenir.  
     - Güvenlik kartı tekrar **“Güvende”** olur.
   - Son adımda dosya detay sayfasından **“İndir”** butonuna basarak dosyayı indir,  
     - Dosyanın açıldığını göstererek bütün akışı kapat.

Bu demo ile, hem X kişisinin (Uploader) hem de Y kişisinin (Storage Provider) hikâyesi, dağıtık mimari, güvenlik modeli ve replikasyon mantığı, tek bir akışta anlaşılır şekilde gözlemlenebilir.

