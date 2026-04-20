#!/usr/bin/env bash
set -euo pipefail

###############################################
# DSN Agent Linux Installer
# 
# Bu script, DSN agent'ı ayrı bir sistem kullanıcısı
# (dsn-agent) altında, gizli bir storage klasörüyle
# otomatik olarak kurar ve systemd servisi olarak başlatır.
#
# Kullanım (Linux tarafında):
#   chmod +x install-dsn-agent.sh
#   sudo ./install-dsn-agent.sh
###############################################

### --- SUNUCU TARAFINDA DÜZENLENECEK ALAN --- ###

# Bu makinedeki (senin Windows sunucun) backend adresi:
# Örnek: http://192.168.1.34:8000
DSN_SERVER_URL_DEFAULT="http://172.20.10.3:8000"

### --- GENEL AYARLAR (GENELLİKLE DOKUNMAYA GEREK YOK) --- ###

DSN_USER="dsn-agent"
DSN_HOME="/var/lib/dsn-agent"
DSN_BIN_DIR="$DSN_HOME/bin"
DSN_STORAGE_DIR="$DSN_HOME/storage"
DSN_CONFIG="$DSN_HOME/config.yaml"
DSN_SERVICE="/etc/systemd/system/dsn-agent.service"

# Bu script ile aynı klasörde duran Linux agent binary'si
AGENT_BINARY_NAME="dsn-agent-linux-amd64"

log()  { echo "[install-dsn-agent] $*"; }
fail() { echo "[install-dsn-agent][ERROR] $*" >&2; exit 1; }

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    fail "Bu script'i sudo ile çalıştırın:  sudo ./install-dsn-agent.sh"
  fi
}

detect_script_dir() {
  local src dir
  src="${BASH_SOURCE[0]}"
  while [ -h "$src" ]; do
    dir="$( cd -P "$( dirname "$src" )" >/dev/null 2>&1 && pwd )"
    src="$(readlink "$src")"
    [[ $src != /* ]] && src="$dir/$src"
  done
  SCRIPT_DIR="$( cd -P "$( dirname "$src" )" >/dev/null 2>&1 && pwd )"
}

check_binary() {
  if [[ ! -x "$SCRIPT_DIR/$AGENT_BINARY_NAME" ]]; then
    fail "Agent binary bulunamadı: $SCRIPT_DIR/$AGENT_BINARY_NAME
Bu klasöre 'dsn-agent-linux-amd64' isimli Linux binary'sini koymanız gerekiyor."
  fi
}

prompt_inputs() {
  echo
  read -rp "DSN sunucu adresi (default: $DSN_SERVER_URL_DEFAULT): " DSN_SERVER_URL
  DSN_SERVER_URL="${DSN_SERVER_URL:-$DSN_SERVER_URL_DEFAULT}"

  echo
  read -rp "Kayıtlı DSN e-posta adresiniz: " DSN_EMAIL
  if [[ -z "${DSN_EMAIL}" ]]; then fail "E-posta boş olamaz."; fi

  echo
  read -rsp "DSN şifreniz: " DSN_PASSWORD
  echo
  if [[ -z "${DSN_PASSWORD}" ]]; then fail "Şifre boş olamaz."; fi

  echo
  read -rp "Bu makinede ayırmak istediğiniz kota (GB) [default: 50]: " DSN_QUOTA_GB
  DSN_QUOTA_GB="${DSN_QUOTA_GB:-50}"

  echo
  read -rp "Agent'ın dinleyeceği port [default: 7777]: " DSN_LISTEN_PORT
  DSN_LISTEN_PORT="${DSN_LISTEN_PORT:-7777}"
}

create_system_user() {
  if id "$DSN_USER" >/dev/null 2>&1; then
    log "Sistem kullanıcısı zaten var: $DSN_USER"
  else
    log "Sistem kullanıcısı oluşturuluyor: $DSN_USER"
    useradd -r -m -d "$DSN_HOME" "$DSN_USER"
  fi
}

setup_directories() {
  log "Dizinler hazırlanıyor: $DSN_HOME, $DSN_BIN_DIR, $DSN_STORAGE_DIR"
  mkdir -p "$DSN_BIN_DIR" "$DSN_STORAGE_DIR"
  chown -R "$DSN_USER:$DSN_USER" "$DSN_HOME"
  chmod -R 700 "$DSN_HOME"
}

copy_binary() {
  log "Agent binary kopyalanıyor → $DSN_BIN_DIR/dsn-agent"
  cp "$SCRIPT_DIR/$AGENT_BINARY_NAME" "$DSN_BIN_DIR/dsn-agent"
  chown "$DSN_USER:$DSN_USER" "$DSN_BIN_DIR/dsn-agent"
  chmod 700 "$DSN_BIN_DIR/dsn-agent"
}

obtain_access_token() {
  log "Backend'e bağlanıp access_token alınıyor..."
  ACCESS_TOKEN="$(
    python3 - <<PY
import json, sys, urllib.request
url = "${DSN_SERVER_URL_DEFAULT.rstrip('/')}/api/v1/auth/login"
body = json.dumps({"email": "${DSN_EMAIL}", "password": "${DSN_PASSWORD}"}).encode("utf-8")
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        token = data.get("access_token")
        if not token:
            sys.stderr.write("No access_token in response\\n")
            sys.exit(1)
        print(token)
except Exception as e:
    sys.stderr.write(str(e) + "\\n")
    sys.exit(1)
PY
  )" || fail "Access token alınamadı. E-posta/şifreyi ve sunucu adresini kontrol edin."

  if [[ -z "$ACCESS_TOKEN" ]]; then
    fail "Access token boş döndü."
  fi
  log "Access token başarıyla alındı."
}

write_config() {
  log "config.yaml yazılıyor → $DSN_CONFIG"
  cat > "$DSN_CONFIG" << EOF
server_url: "${DSN_SERVER_URL}"
auth_token: "${ACCESS_TOKEN}"
storage_path: "${DSN_STORAGE_DIR}"
quota_gb: ${DSN_QUOTA_GB}
bandwidth_limit_mbps: 0
total_bandwidth_limit_mbps: 0
listen_port: ${DSN_LISTEN_PORT}
node_id: ""
node_token: ""
EOF
  chown "$DSN_USER:$DSN_USER" "$DSN_CONFIG"
  chmod 600 "$DSN_CONFIG"
}

write_systemd_service() {
  log "systemd servisi yazılıyor → $DSN_SERVICE"
  cat > "$DSN_SERVICE" << EOF
[Unit]
Description=DSN Agent
After=network-online.target
Wants=network-online.target

[Service]
User=${DSN_USER}
Group=${DSN_USER}
WorkingDirectory=${DSN_HOME}
ExecStart=${DSN_BIN_DIR}/dsn-agent --config ${DSN_CONFIG} --no-tray
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
}

enable_and_start_service() {
  log "systemd daemon reload + service enable/start"
  systemctl daemon-reload
  systemctl enable dsn-agent
  systemctl restart dsn-agent

  sleep 2
  systemctl --no-pager --full status dsn-agent || true
}

summary() {
  cat << EOF

[install-dsn-agent] Kurulum tamamlandı.

- Agent kullanıcısı : ${DSN_USER}
- Storage dizini    : ${DSN_STORAGE_DIR}
- Config dosyası    : ${DSN_CONFIG}
- Servis            : dsn-agent (systemd)

Agent durumu:
  sudo systemctl status dsn-agent

Loglar:
  journalctl -u dsn-agent -f

Web tarafında, sunucudaki dashboard üzerinden:
  http://localhost:3000/agent
node'unuzu 'active' olarak görmelisiniz.

EOF
}

main() {
  require_root
  detect_script_dir
  check_binary
  prompt_inputs
  create_system_user
  setup_directories
  copy_binary
  obtain_access_token
  write_config
  write_systemd_service
  enable_and_start_service
  summary
}

main "$@"

