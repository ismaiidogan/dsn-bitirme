#!/usr/bin/env bash
set -euo pipefail

###############################################
# DSN Agent macOS Installer (Apple Silicon)
#
# Usage:
#   chmod +x install-dsn-agent-mac.sh
#   ./install-dsn-agent-mac.sh
#
# Installs DSN agent under current user and registers
# a LaunchAgent for auto-start on login.
###############################################

DSN_SERVER_URL_DEFAULT="https://api.storemyfile.com"
APP_NAME="dsn-agent"
APP_DIR="$HOME/.local/share/$APP_NAME"
BIN_DIR="$APP_DIR/bin"
STORAGE_DIR="$APP_DIR/storage"
LOG_DIR="$APP_DIR/logs"
CONFIG_PATH="$APP_DIR/config.yaml"
PLIST_PATH="$HOME/Library/LaunchAgents/com.dsn.agent.plist"

AGENT_BINARY_CANDIDATES=("dsn-agent-mac-arm64" "dsn-agent-darwin-arm64" "dsn-agent")
AGENT_BINARY_PATH=""

log()  { echo "[install-dsn-agent-mac] $*"; }
fail() { echo "[install-dsn-agent-mac][ERROR] $*" >&2; exit 1; }

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

check_requirements() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    fail "Bu installer yalnızca macOS içindir."
  fi
  if [[ "$(uname -m)" != "arm64" ]]; then
    fail "Bu paket Apple Silicon (arm64) içindir."
  fi
  command -v python3 >/dev/null 2>&1 || fail "python3 bulunamadı. Önce Python 3 kurun."
  command -v launchctl >/dev/null 2>&1 || fail "launchctl bulunamadı."
}

check_binary() {
  for candidate in "${AGENT_BINARY_CANDIDATES[@]}"; do
    if [[ -f "$SCRIPT_DIR/$candidate" ]]; then
      AGENT_BINARY_PATH="$SCRIPT_DIR/$candidate"
      return
    fi
  done
  fail "Agent binary bulunamadı. Beklenen dosyalar: ${AGENT_BINARY_CANDIDATES[*]}"
}

prompt_inputs() {
  echo
  read -rp "DSN sunucu adresi (default: $DSN_SERVER_URL_DEFAULT): " DSN_SERVER_URL
  DSN_SERVER_URL="${DSN_SERVER_URL:-$DSN_SERVER_URL_DEFAULT}"
  DSN_SERVER_URL="${DSN_SERVER_URL%/}"

  echo
  read -rp "Kayıtlı DSN e-posta adresiniz: " DSN_EMAIL
  [[ -n "${DSN_EMAIL}" ]] || fail "E-posta boş olamaz."

  echo
  read -rsp "DSN şifreniz: " DSN_PASSWORD
  echo
  [[ -n "${DSN_PASSWORD}" ]] || fail "Şifre boş olamaz."

  echo
  read -rp "Bu cihazda ayırmak istediğiniz kota (GB) [default: 50]: " DSN_QUOTA_GB
  DSN_QUOTA_GB="${DSN_QUOTA_GB:-50}"

  echo
  read -rp "Agent dinleme portu [default: 7777]: " DSN_LISTEN_PORT
  DSN_LISTEN_PORT="${DSN_LISTEN_PORT:-7777}"
}

prepare_dirs() {
  log "Dizinler hazırlanıyor: $APP_DIR"
  mkdir -p "$BIN_DIR" "$STORAGE_DIR" "$LOG_DIR" "$HOME/Library/LaunchAgents"
}

copy_binary() {
  log "Agent binary kopyalanıyor..."
  cp "$AGENT_BINARY_PATH" "$BIN_DIR/dsn-agent"
  chmod 700 "$BIN_DIR/dsn-agent"
}

obtain_access_token() {
  log "Backend'den access_token alınıyor..."
  ACCESS_TOKEN="$(
    python3 - <<PY
import json, sys, urllib.request
url = "${DSN_SERVER_URL}/api/v1/auth/login"
body = json.dumps({"email": "${DSN_EMAIL}", "password": "${DSN_PASSWORD}"}).encode("utf-8")
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
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
  )" || fail "Access token alınamadı. E-posta/şifre/sunucu adresini kontrol edin."
}

write_config() {
  log "config.yaml yazılıyor..."
  cat > "$CONFIG_PATH" <<EOF
server_url: "${DSN_SERVER_URL}"
auth_token: "${ACCESS_TOKEN}"
storage_path: "${STORAGE_DIR}"
quota_gb: ${DSN_QUOTA_GB}
bandwidth_limit_mbps: 0
total_bandwidth_limit_mbps: 0
listen_port: ${DSN_LISTEN_PORT}
node_id: ""
node_token: ""
EOF
  chmod 600 "$CONFIG_PATH"
}

write_plist() {
  log "launchd plist yazılıyor..."
  cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dsn.agent</string>

  <key>ProgramArguments</key>
  <array>
    <string>${BIN_DIR}/dsn-agent</string>
    <string>--config</string>
    <string>${CONFIG_PATH}</string>
    <string>--no-tray</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${APP_DIR}</string>

  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${LOG_DIR}/agent.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/agent.err.log</string>
</dict>
</plist>
EOF
}

load_launch_agent() {
  log "launchd servisi yeniden yükleniyor..."
  launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
  launchctl enable "gui/$(id -u)/com.dsn.agent" || true
  launchctl kickstart -k "gui/$(id -u)/com.dsn.agent"
}

summary() {
  cat <<EOF

[install-dsn-agent-mac] Kurulum tamamlandı.

- Binary: ${BIN_DIR}/dsn-agent
- Config: ${CONFIG_PATH}
- Storage: ${STORAGE_DIR}
- Plist : ${PLIST_PATH}

Durum:
  launchctl print gui/$(id -u)/com.dsn.agent | head -n 40

Loglar:
  tail -f ${LOG_DIR}/agent.out.log
  tail -f ${LOG_DIR}/agent.err.log

Web panel:
  https://storemyfile.com/agent

EOF
}

main() {
  detect_script_dir
  check_requirements
  check_binary
  prompt_inputs
  prepare_dirs
  copy_binary
  obtain_access_token
  write_config
  write_plist
  load_launch_agent
  summary
}

main "$@"

