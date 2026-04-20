# DSN — Google Cloud Platform (GCP) Kurulum Rehberi

Bu belge, DSN projesini **Google Cloud** üzerinde **tek bir sanal makine (Compute Engine)** ve **Docker Compose** ile sıfırdan kurmak için adım adım talimat içerir.  
Deneme kredisi (ör. **300 $ / 90 gün**) kullanıyorsanız bu yapı maliyeti kontrol altında tutmaya uygundur.

> **Önemli:** Postgres ve Redis’i **Docker içinde** çalıştırıyoruz; **Cloud SQL** ve **Memorystore** kullanmıyoruz (maliyet ve karmaşıklık düşük kalır).

---

## İçindekiler

1. [Ön koşullar](#1-ön-koşullar)
2. [Google hesabı ve GCP’ye giriş](#2-google-hesabı-ve-gcpe-giriş)
3. [Yeni proje oluşturma](#3-yeni-proje-oluşturma)
4. [Faturalandırma ve deneme kredisi](#4-faturalandırma-ve-deneme-kredisi)
5. [Bütçe uyarısı (önerilir)](#5-bütçe-uyarısı-önerilir)
6. [Gerekli API’yi açma](#6-gerekli-apiyi-açma)
7. [Sanal makine (VM) oluşturma](#7-sanal-makine-vm-oluşturma)
8. [Güvenlik duvarı kuralları (VPC)](#8-güvenlik-duvarı-kuralları-vpc)
9. [VM’e bağlanma (SSH)](#9-vme-bağlanma-ssh)
10. [Sunucuda Docker kurulumu](#10-sunucuda-docker-kurulumu)
11. [DSN projesini sunucuya alma](#11-dsn-projesini-sunucuya-alma)
12. [Ortam dosyası `.env`](#12-ortam-dosyası-env)
13. [Docker Compose ile servisleri başlatma](#13-docker-compose-ile-servisleri-başlatma)
14. [Tarayıcı ve CORS testi](#14-tarayıcı-ve-cors-testi)
15. [Agent kurulumu (aynı VM’de)](#15-agent-kurulumu-aynı-vmde)
16. [İsteğe bağlı: Alan adı ve HTTPS](#16-isteğe-bağlı-alan-adı-ve-https)
17. [İş bitince: Kaynakları silme](#17-iş-bitince-kaynakları-silme)
18. [Sorun giderme](#18-sorun-giderme)

---

## 1. Ön koşullar

- Bir **Google hesabı** (Gmail veya kurumsal Google hesabı).
- Kredi kartı veya banka kartı bilgisi — deneme için genelde **otomatik ücret kesilmez**; koşulları kayıt sırasında okuyun.
- Yerel bilgisayarınızda **SSH** kullanabileceğiniz bir terminal (Windows: PowerShell veya Windows Terminal; isteğe bağlı [PuTTY](https://www.putty.org/)).
- Proje kodu: Git ile klonlanabilir repo veya zip olarak elinizde olması.

---

## 2. Google hesabı ve GCP’ye giriş

1. Tarayıcıda şu adrese gidin: [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Sağ üstten **Google hesabınızla giriş** yapın.
3. İlk kez kullanıyorsanız **şartları** kabul etmeniz istenebilir.

---

## 3. Yeni proje oluşturma

1. Üst menüde **proje adının** yanındaki açılır listeye tıklayın.
2. **Yeni proje** (veya **New Project**) seçin.
3. **Proje adı:** örn. `dsn-bitirme` (istediğiniz isim).
4. **Oluştur**’a tıklayın. Birkaç saniye sürebilir.
5. Oluşturulan projeyi **seçili proje** olarak ayarlayın (üst çubukta görünmeli).

---

## 4. Faturalandırma ve deneme kredisi

1. Sol menüden **Faturalandırma** (**Billing**) → veya arama kutusuna “Billing” yazın.
2. Hesabınıza bir **faturalandırma hesabı** bağlayın (kredi kartı adımı).
3. **Ücretsiz deneme** / **Free trial** aktifse, konsolda kredi bakiyesi (ör. 300 $) görünebilir.
4. Deneme süresi ve kredi koşullarını [Google Cloud ücretsiz program](https://cloud.google.com/free/docs/free-cloud-features) sayfasından doğrulayın.

> Deneme bittiğinde veya kredi bitince ne olacağını mutlaka okuyun; istenmeyen ücretleri önlemek için [Bölüm 5](#5-bütçe-uyarısı-önerilir) ve [Bölüm 17](#17-iş-bitince-kaynakları-silme) adımlarını uygulayın.

---

## 5. Bütçe uyarısı (önerilir)

1. **Faturalandırma** → **Bütçeler ve uyarılar** (**Budgets & alerts**).
2. **Bütçe oluştur** — örn. ad: `dsn-uyari`.
3. **Kapsam:** Mevcut proje veya faturalandırma hesabı (tercihinize göre).
4. **Tutar:** Örn. **50 $** veya **100 $**; eşiklerde **%50, %90, %100** için e-posta bildirimi açın.
5. Kaydedin.

Böylece beklenmedik kullanımda e-posta alırsınız.

---

## 6. Gerekli API’yi açma

1. Üstteki **arama çubuğuna** `Compute Engine API` yazın veya şu bağlantıyı açın:  
   [Compute Engine API](https://console.cloud.google.com/apis/library/compute.googleapis.com)
2. **Etkinleştir** (**Enable**) düğmesine tıklayın.
3. İlk kez Compute Engine kullanıyorsanız birkaç dakika beklenebilir.

---

## 7. Sanal makine (VM) oluşturma

1. Sol menüden **Compute Engine** → **VM instances** (veya arama: “VM instances”).
2. İlk kez ise bölge seçimi istenebilir; **Compute Engine API** etkinleştikten sonra **VM oluştur** (**Create Instance**) görünür.
3. **Create Instance** ile yeni VM:

| Alan | Önerilen değer |
|------|----------------|
| **Name** | `dsn-server` (veya istediğiniz ad) |
| **Region** | Size yakın, örn. `europe-west3` (Frankfurt) |
| **Zone** | Herhangi bir zone (örn. `europe-west3-a`) |
| **Machine family** | **General-purpose** |
| **Machine type** | Demo için `e2-medium` (4 GB RAM); daha rahat için `e2-standard-2` (8 GB RAM) |
| **Boot disk** | **Change** → **Ubuntu 22.04 LTS** (veya **24.04 LTS**) Minimal **x86/64**, **~30 GB** balanced disk |
| **Firewall (VM ekranındaki kutular)** | **İsteğe bağlı.** Bu kutular yalnızca **80** ve **443** için varsayılan kurallar ekler (`http-server` / `https-server` etiketleri). DSN arayüzü doğrudan **`http://IP:3000`** ile açıldığı için **zorunlu değildir**. İleride VM’de nginx/Caddy ile 80/443 üzerinden yayın yapacaksanız işaretleyebilirsiniz. **Aç kapa yapmadan önce:** Aşağıdaki **Network tags** ile [Bölüm 8](#8-güvenlik-duvarı-kuralları-vpc) birlikte düşünün. |

4. **Networking** bölümünü genişletin:
   - **Network tags:** `dsn-server` yazın ([Bölüm 8](#8-güvenlik-duvarı-kuralları-vpc) firewall kuralı bu etikete göre **3000, 8000, 7777** açar). Üstteki HTTP/HTTPS kutularını işaretlediyseniz otomatik gelen `http-server` / `https-server` etiketleri kalabilir veya sadece `dsn-server` kullanmak için kutuları kaldırıp etiket alanını yalnızca `dsn-server` bırakın.
   - **External IPv4 address:** Sabit adres için **Reserve static** önerilir; DNS veya kalıcı erişim için ephemeral yerine statik IP seçin.

5. **Create** (Oluştur) ile VM’i başlatın. Birkaç dakika sürebilir.

6. VM listesinde **External IP** sütunundaki adresi **not edin** — örn. `34.89.xxx.xxx`. Tarayıcı ve agent ayarlarında kullanacaksınız.

---

## 8. Güvenlik duvarı kuralları (VPC)

Varsayılan kurallar SSH (22) ve işaretlediyseniz 80/443 içerebilir. DSN için ek olarak şu **TCP portları** açılmalı:

| Port | Amaç |
|------|------|
| **3000** | Web arayüzü (Next.js) doğrudan `http://IP:3000` ile |
| **8000** | İsteğe bağlı: API / Swagger (`/docs`) |
| **7777** | Agent chunk HTTP (yükleme/indirme) |

**Oluşturma adımları:**

1. Sol menü: **VPC ağı** → **Firewall** (veya **VPC network** → **Firewall**).
2. **Create Firewall Rule**:
   - **Name:** `dsn-allow-app-ports`
   - **Network:** `default` (veya VM’inizin ağı)
   - **Targets:** **Specified target tags** → etiket: `dsn-server` (veya aşağıdaki adımda VM’e vereceğiniz etiketle aynı)
   - **Source IPv4 ranges:** `0.0.0.0/0` (internetten erişim; demo için; üretimde daraltılabilir)
   - **Protocols and ports:** **Specified protocols and ports** → **tcp:** `3000,8000,7777`
3. **Create**.

**VM’e etiket verme:**

1. **Compute Engine** → **VM instances** → sunucunuzun adına tıklayın → **Edit**.
2. **Network tags** alanına: `dsn-server` yazın (firewall kuralındaki etiketle **aynı** olmalı).
3. **Save**.

> Alternatif: Her port için ayrı kural veya “Allow HTTP/HTTPS” dışında **tüm TCP** açmak güvenlik açısından önerilmez; yukarıdaki gibi sadece gerekli portlar yeterli.

---

## 9. VM’e bağlanma (SSH)

### Yöntem A — Tarayıcıdan (en kolay)

1. **VM instances** listesinde satırınızın sağındaki **SSH** düğmesine tıklayın.
2. Yeni pencerede terminal açılır; doğrudan Linux komut satırına düşersiniz.

### Yöntem B — Kendi bilgisayarınızdan (`gcloud`)

1. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) kurun.
2. Terminalde: `gcloud auth login` ve `gcloud config set project PROJE_ID`
3. Bağlanma:

```bash
gcloud compute ssh VM_ADI --zone=BOLGE
```

Örnek: `gcloud compute ssh dsn-server --zone=europe-west3-a`

---

## 10. Sunucuda Docker kurulumu

SSH ile VM içindesiniz. Aşağıdaki komutlar **Ubuntu** içindir.

```bash
sudo apt update && sudo apt upgrade -y
```

Docker’ı resmi yöntemle kurun:  
https://docs.docker.com/engine/install/ubuntu/

Özet (Ubuntu):

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME:-$(lsb_release -cs)}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Kullanıcıyı `docker` grubuna ekleyin:

```bash
sudo usermod -aG docker $USER
```

**SSH oturumunu kapatıp tekrar açın** (veya `newgrp docker`). Sonra:

```bash
docker compose version
docker ps
```

---

## 11. DSN projesini sunucuya alma

### Seçenek A — Git

```bash
sudo mkdir -p /opt/dsn && sudo chown $USER:$USER /opt/dsn
cd /opt/dsn
git clone <REPO_URL> .
```

### Seçenek B — Zip (yerel bilgisayardan)

Yerel makinede (PowerShell örneği):

```powershell
scp -r "C:\Users\...\Bitirme Projesi\*" kullanici@DIS_IP:/opt/dsn/
```

Sunucuda:

```bash
cd /opt/dsn
```

---

## 12. Ortam dosyası `.env`

```bash
cd /opt/dsn
cp .env.example .env
nano .env
```

**Mutlaka değiştirin:**

| Değişken | Açıklama |
|----------|----------|
| `DB_PASSWORD` | Güçlü parola; yalnızca harf ve rakam önerilir |
| `JWT_SECRET` | En az 32 karakter rastgele (sunucuda: `openssl rand -hex 32`) |
| `MASTER_ENCRYPTION_KEY` | Tam 64 hex karakter (`openssl rand -hex 32`) |

**Dış IP ile web’e girecekseniz** (örnek IP yerine kendi **External IP**’nizi yazın):

```env
CORS_ORIGINS=http://DIS_IP:3000
```

Birden fazla adres virgülle: `http://DIS_IP:3000,https://alanadiniz.com`

Dosyayı kaydedin (`nano`: Ctrl+O, Enter, Ctrl+X).

---

## 13. Docker Compose ile servisleri başlatma

```bash
cd /opt/dsn
docker compose up -d --build
```

Durum:

```bash
docker compose ps
```

Veritabanı migrasyonu (ilk kurulum):

```bash
docker compose exec backend alembic upgrade head
```

Sağlık kontrolleri (VM içinden):

```bash
curl -s http://127.0.0.1:8000/health
curl -s http://127.0.0.1:8000/health/ready
curl -s http://127.0.0.1:3000/api/health
```

Kendi bilgisayarınızdan tarayıcıda:

- `http://DIS_IP:3000` — web arayüzü  
- `http://DIS_IP:8000/docs` — Swagger (isteğe bağlı)

---

## 14. Tarayıcı ve CORS testi

- Kayıt / giriş yapın.
- Hata alırsanız `.env` içindeki `CORS_ORIGINS` tam olarak tarayıcıda yazdığınız adresle (protokol + IP + port) eşleşmeli.
- Değişiklikten sonra: `docker compose up -d --build` (veya en azından backend’i yeniden başlatın).

**Dosya yükleme / indirme (Web Crypto):** Tarayıcıda istemci tarafı şifreleme için `crypto.subtle` kullanılır; bu API yalnızca **güvenli bağlamda** çalışır (**HTTPS** veya **localhost**). **`http://HAM_IP:3000`** ile yükleme çoğu tarayıcıda **çalışmaz**. Üretim veya gerçek test için [Bölüm 16](#16-i̇steğe-bağlı-alan-adı-ve-https) ile HTTPS kullanın veya geliştirme sırasında `http://localhost:3000` üzerinden deneyin.

---

## 15. Agent kurulumu (aynı VM’de)

1. VM’de Go agent binary’si ve `config.yaml` hazırlayın (`agent/linux/USER_GUIDE_LINUX_AGENT.md` veya proje içi `install-dsn-agent.sh` mantığı).
2. `server_url`: `http://DIS_IP:8000` (veya HTTPS kullanıyorsanız public API URL’iniz).
3. `auth_token`: Web’den giriş yapan kullanıcının JWT’si (proje dokümantasyonundaki akış).
4. `listen_port`: `7777` (firewall’da açık).
5. Node kaydında backend’in gördüğü adres: **aynı DIS_IP** ve port **7777**.

UFW kullanıyorsanız (Ubuntu):

```bash
sudo ufw allow 22/tcp
sudo ufw allow 3000,8000,7777/tcp
sudo ufw enable
```

(GCP firewall zaten açıksa UFW opsiyonel; ikisi birlikteyken kuralların çakışmadığından emin olun.)

---

## 16. İsteğe bağlı: Alan adı ve HTTPS

### .com.tr almadan önce (kayıt şartları)

Alan adı kuralları **TRABIS** döneminde güncellenebilir; **kesin metin ve fiyat** için satın almayı düşündüğünüz **registrar’ın** (ör. arama: “com.tr kayıt koşulları” + firma adı) bilgi sayfasını okuyun. Genel olarak `.com.tr`, teknik olarak `.com` ile aynı DNS/HTTPS modelini kullanır; fark çoğunlukla **ticari koşullar, yenileme ve destek** tarafındadır.

### Teknik taraf (.com ile aynı mantık)

1. DNS’te **A kaydı** (ve isteğe bağlı **AAAA**) → GCP VM **External IP**.
2. Yaygın düzen:
   - **Web:** kök `ornek.com.tr` ve/veya `www.ornek.com.tr` → reverse proxy → `127.0.0.1:3000`
   - **API:** `api.ornek.com.tr` → `127.0.0.1:8000` *(aynı VM’de nginx/Caddy ile iki `server` / iki host bloğu)*  
   Tek origin’de birleştirmek (yalnızca `https://www.ornek.com.tr` + API aynı host üzerinden `/api`) da mümkündür; tercih mimarinize bağlıdır.
3. VM’de **Caddy** veya **nginx** ile **443** ve Let’s Encrypt (veya registrar SSL’i).
4. `.env` — tarayıcıda **gerçekten açtığınız** origin’leri yazın (protokol + host + port):

```env
# Örnek: hem kök hem www kullanıyorsanız ikisini de listeleyin
CORS_ORIGINS=https://ornek.com.tr,https://www.ornek.com.tr
```

Yalnızca tek adres kullanıyorsanız: `CORS_ORIGINS=https://www.ornek.com.tr`

5. Frontend public API adresi: `NEXT_PUBLIC_API_URL=https://api.ornek.com.tr` *(API alt alanı kullanıyorsanız)* veya tek domain üzerinden proxy kullanıyorsanız o URL.
6. `docker compose up -d --build` (veya backend/frontend yeniden build).

**Özet:** `.com.tr` seçmek, HTTPS sertifikası, CORS ve `www` / `api` alt alan planını **`.com` ile aynı şekilde** yürütmenizi sağlar; değişen taraf çoğunlukla registrar’daki kayıt metnidir.

Detaylı örnek için proje içi `VPS_KURULUM_REHBERI.md` Bölüm 10’a bakabilirsiniz.

---

## 17. İş bitince: Kaynakları silma

1. Veritabanı yedeği:

```bash
docker compose exec postgres pg_dump -U dsn_user dsn > ~/dsn-yedek.sql
```

Yedeği yerel bilgisayarınıza `scp` ile çekin.

2. **Compute Engine** → VM → **Delete** (sil).

3. **VPC** → **Firewall** → oluşturduğunuz `dsn-allow-app-ports` kuralını silin (isteğe bağlı).

4. **Sabit IP** kullandıysanız: **VPC** → **IP addresses** → kullanılmayan rezervasyonları silin.

5. **Faturalandırma** → dönem özeti kontrolü.

---

## 18. Sorun giderme

| Sorun | Çözüm |
|--------|--------|
| VM oluşturulmuyor | Compute Engine API etkin mi? Kotanız var mı? |
| SSH açılmıyor | Firewall’da 22; doğru proje/zone |
| Site açılmıyor | VM çalışıyor mu? Port 3000 GCP firewall + VM etiketi |
| Giriş / API CORS hatası | `CORS_ORIGINS` ve tarayıcı URL’si birebir uyumlu mu? |
| Chunk hatası | Port **7777** açık mı? Node kaydında doğru dış IP mi? |
| `health/ready` 503 | `docker compose logs postgres redis backend` |

---

## Kısa kontrol listesi

- [ ] GCP hesabı + proje + faturalandırma  
- [ ] Bütçe uyarısı  
- [ ] Compute Engine API etkin  
- [ ] VM (Ubuntu, yeterli RAM/disk)  
- [ ] Firewall: 3000, 8000, 7777 (+ SSH)  
- [ ] VM’e network tag + kural eşleşmesi  
- [ ] Docker + Compose  
- [ ] Proje + `.env` + `docker compose up -d --build`  
- [ ] `alembic upgrade head`  
- [ ] Tarayıcıdan `http://DIS_IP:3000`  
- [ ] Agent + node kaydı  
- [ ] İş bitince VM sil + yedek alındı  

---

*Bu rehber DSN deposundaki `docker-compose.yml` ve `.env.example` ile uyumludur. Güvenlik için güçlü sırlar kullanın ve deneme süresi sonunda kaynakları temizleyin.*
