# DSN Agent macOS (Apple Silicon) - Hızlı Kurulum

Bu paket Apple Silicon (arm64) içindir.

## Paket İçeriği

- `dsn-agent-mac-arm64` -> macOS agent binary
- `install-dsn-agent-mac.sh` -> tek komut installer

## 1) Paketi Aç

```bash
mkdir -p ~/dsn-agent-install
cd ~/dsn-agent-install
unzip /path/to/dsn-agent-mac-arm64-latest.zip
```

## 2) Installer Çalıştır

```bash
chmod +x install-dsn-agent-mac.sh
./install-dsn-agent-mac.sh
```

Installer senden şunları ister:

- DSN sunucu adresi (`https://api.storemyfile.com`)
- Hesap e-postası
- Şifre
- Kota (GB)
- Port (default `7777`)

Kurulum sonunda agent, launchd ile otomatik başlatılır.

## 3) Durum Kontrol

```bash
launchctl print gui/$(id -u)/com.dsn.agent | head -n 40
tail -n 80 ~/.local/share/dsn-agent/logs/agent.out.log
tail -n 80 ~/.local/share/dsn-agent/logs/agent.err.log
```

## 4) Yeniden Başlat / Durdur

```bash
# restart
launchctl kickstart -k gui/$(id -u)/com.dsn.agent

# stop
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.dsn.agent.plist
```

## 5) Kaldırma

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.dsn.agent.plist || true
rm -f ~/Library/LaunchAgents/com.dsn.agent.plist
rm -rf ~/.local/share/dsn-agent
```

