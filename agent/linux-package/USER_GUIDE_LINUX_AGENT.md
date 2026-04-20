### DSN Linux Agent Kurulum Kılavuzu

Bu klasör, Linux makinede DSN agent'ı kolayca kurup sisteme node olarak eklemek için hazırlanmıştır.

- `install-dsn-agent.sh` → Otomatik kurulum script'i
- `dsn-agent-linux-amd64` → Linux için derlenmiş agent binary'si (bunu senin build edip buraya koyman gerekiyor)

> Not: Bu klasörün içeriğini `.tar.gz` veya `.zip` yapıp Linux kullanıcısına gönderebilirsin.

---

### 1. Sunucu (senin makinen) tarafında yapılacaklar

1. Bu repo içinde Linux binary'sini build et:

   ```powershell
   # Windows tarafında, proje kökünden:
   cd agent
   $env:GOOS="linux"
   $env:GOARCH="amd64"
   go build -o .\linux\dsn-agent-linux-amd64 .\cmd\agent
   ```

   - Bu komut başarılı olursa `agent/linux/dsn-agent-linux-amd64` dosyası oluşur.

2. `agent/linux/install-dsn-agent.sh` dosyasındaki aşağıdaki satırı kontrol et:

   ```bash
   DSN_SERVER_URL_DEFAULT="http://172.20.10.3:8000"
   ```

   - Burada kendi backend adresini kullanmalısın:
     - Örn. `http://192.168.1.34:8000` veya dış IP/domain.

3. Bu `agent/linux` klasörünü arşivleyip Linux kullanıcısına gönder:

   ```powershell
   # Örneğin PowerShell'de:
   Compress-Archive -Path .\linux\* -DestinationPath .\dsn-agent-linux-package.zip
   ```

---

### 2. Linux kullanıcı tarafında yapılacaklar

Kullanıcı (agent kuracak kişi) şu adımları izlemeli:

1. Paketi aç:

   ```bash
   mkdir -p ~/dsn-agent-install
   cd ~/dsn-agent-install
   unzip /path/to/dsn-agent-linux-package.zip    # veya tar -xzf ...
   ```

2. Script'i çalıştırılabilir yap:

   ```bash
   chmod +x install-dsn-agent.sh
   ```

3. Kurulumu başlat:

   ```bash
   sudo ./install-dsn-agent.sh
   ```

4. Script şunları soracak:
   - **DSN sunucu adresi**: (senin verdiğin backend URL'i, genelde değişmeden Enter)
   - **DSN e-posta adresi**: Örn. `testkullanici@test.com`
   - **DSN şifresi**: `Test1234!` (veya gerçek şifre)
   - **Kota (GB)**: Bu makinede DSN için ayırmak istediği disk alanı
   - **Port**: Genelde `7777` olarak bırakılabilir.

5. Script otomatik olarak:
   - `dsn-agent` isminde sistem kullanıcısı oluşturur,
   - `/var/lib/dsn-agent` altında gizli bir storage ve config dizini kurar,
   - Backend'e login olup access token alır,
   - `config.yaml` dosyasını yazar,
   - `dsn-agent` binary'sini uygun yere kopyalar,
   - `dsn-agent` isimli systemd servisini oluşturup başlatır.

6. Kurulum sonrası kullanıcı, terminalde özet görecektir. Servisin durumunu görmek için:

   ```bash
   sudo systemctl status dsn-agent
   # Loglar:
   journalctl -u dsn-agent -f
   ```

---

### 3. Sunucu (senin makinen) üzerinden doğrulama

Kurulum bittikten sonra sen, kendi Windows tarafında:

1. Tarayıcıda `http://localhost:3000/agent` sayfasını aç.
2. "Bağlı Node'larım" bölümünde yeni Linux makinenin:
   - IP:port bilgisi (örn. `192.168.1.50:7777`),
   - Durumu **active** (yeşil) olarak görünmeli.

Ardından `http://localhost:3000/upload` üzerinden dosya yükleyerek bu node'un düzgün çalıştığını test edebilirsin.

