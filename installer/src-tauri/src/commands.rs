use std::net::UdpSocket;
use std::path::PathBuf;
use std::process::Command;

use serde::{Deserialize, Serialize};
use sysinfo::Disks;
use tauri::{AppHandle, Emitter, Manager};

// ── Shared structs ──────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct ProgressEvent {
    pub step:    u32,
    pub total:   u32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error:   Option<String>,
}

#[derive(Serialize)]
pub struct InstallResult {
    pub node_id:     String,
    pub install_dir: String,
}

#[derive(Deserialize)]
struct NodeApiResponse {
    node:       NodeInfo,
    node_token: String,
}

#[derive(Deserialize)]
struct NodeInfo {
    id: String,
}

// ── check_server ────────────────────────────────────────────────────────────

/// Ping the backend to verify it's reachable. Returns true if HTTP response
/// is received (any status <500 counts as "server is up").
#[tauri::command]
pub async fn check_server(url: String) -> Result<bool, String> {
    let base = url.trim_end_matches('/').to_string();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    // /api/v1/auth/me returns 401 when not logged in — that's fine, server is up
    match client.get(format!("{}/api/v1/auth/me", base)).send().await {
        Ok(r)  => Ok(r.status().as_u16() < 500),
        Err(e) => {
            if e.is_connect() || e.is_timeout() {
                Err(format!("Sunucuya ulaşılamadı: {}", e))
            } else {
                Ok(true) // got a response of some kind
            }
        }
    }
}

// ── get_disk_free_gb ────────────────────────────────────────────────────────

/// Returns available disk space in GB for the disk containing `path`.
#[tauri::command]
pub async fn get_disk_free_gb(path: String) -> Result<f64, String> {
    let target = if path.is_empty() || path.starts_with('~') {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(&path)
    };

    let disks = Disks::new_with_refreshed_list();

    // Find the disk whose mount point is the longest prefix of `target`
    let mut best: Option<u64> = None;
    let mut best_len = 0usize;

    for disk in disks.list() {
        let mount = disk.mount_point();
        if target.starts_with(mount) {
            let len = mount.to_string_lossy().len();
            if len >= best_len {
                best_len = len;
                best = Some(disk.available_space());
            }
        }
    }

    // Fallback to first disk
    let bytes = best
        .or_else(|| disks.list().first().map(|d| d.available_space()))
        .unwrap_or(107_374_182_400); // 100 GB default

    Ok(bytes as f64 / 1_073_741_824.0)
}

#[derive(Serialize)]
pub struct DiskInfo {
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub max_allowed_bytes: u64,
}

/// Returns total, free and max_allowed bytes for the disk containing `path`.
/// max_allowed_bytes = free_bytes * 0.80 (boş alanın %80'i).
#[tauri::command]
pub async fn get_disk_info(path: String) -> Result<DiskInfo, String> {
    let target = if path.is_empty() || path.starts_with('~') {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(&path)
    };

    let disks = Disks::new_with_refreshed_list();

    // Find the disk whose mount point is the longest prefix of `target`
    let mut best_idx: Option<usize> = None;
    let mut best_len = 0usize;

    for (idx, disk) in disks.list().iter().enumerate() {
        let mount = disk.mount_point();
        if target.starts_with(mount) {
            let len = mount.to_string_lossy().len();
            if len >= best_len {
                best_len = len;
                best_idx = Some(idx);
            }
        }
    }

    let info = if let Some(i) = best_idx {
        let d = &disks.list()[i];
        (d.total_space(), d.available_space())
    } else if let Some(d) = disks.list().first() {
        (d.total_space(), d.available_space())
    } else {
        // Default: 100 GB total, 100 GB free
        (107_374_182_400, 107_374_182_400)
    };

    let (total_bytes, free_bytes) = info;
    let max_allowed_bytes = ((free_bytes as f64) * 0.80) as u64;

    Ok(DiskInfo {
        total_bytes,
        free_bytes,
        max_allowed_bytes,
    })
}

// ── open_agent_login ────────────────────────────────────────────────────────

/// Open the agent-login page in the default browser (Next.js web UI, typically :3000).
#[tauri::command]
pub async fn open_agent_login(web_base_url: String) -> Result<(), String> {
    let base = web_base_url.trim_end_matches('/');
    let url = format!("{}/agent-login", base);
    open::that(&url).map_err(|e| format!("Tarayıcı açılamadı: {}", e))
}

// ── do_install ──────────────────────────────────────────────────────────────

/// Full installation sequence. Emits `install-progress` events to the window.
#[tauri::command]
pub async fn do_install(
    app:           AppHandle,
    server_url:    String,
    auth_token:    String,
    storage_path:  String,
    quota_gb:      f64,
    bandwidth_mbps: f64,
) -> Result<InstallResult, String> {
    let total = 5u32;

    macro_rules! emit {
        ($step:expr, $msg:expr) => {
            let _ = app.emit("install-progress", ProgressEvent {
                step: $step, total, message: $msg.to_string(), error: None,
            });
        };
    }

    // ── Step 1: Copy agent binary ──────────────────────────────────────────
    emit!(1, "Agent dosyası kopyalanıyor...");

    let install_dir = get_install_dir()?;
    std::fs::create_dir_all(&install_dir).map_err(|e| format!("Kurulum klasörü oluşturulamadı: {}", e))?;

    let binary_name = agent_binary_name();
    let src = find_agent_binary(&app, binary_name)?;

    let dst = install_dir.join(binary_name);
    std::fs::copy(&src, &dst)
        .map_err(|e| format!("Agent kopyalanamadı ({:?} → {:?}): {}", src, dst, e))?;

    set_executable(&dst)?;

    // ── Step 2: Register node with backend ────────────────────────────────
    emit!(2, "Sunucuya kayıt yapılıyor...");

    let local_ip = local_ip();
    let node_name = node_name();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let reg_url = format!("{}/api/v1/nodes/register", server_url.trim_end_matches('/'));
    let resp = client
        .post(&reg_url)
        .header("Authorization", format!("Bearer {}", auth_token))
        .json(&serde_json::json!({
            "name":     node_name,
            "address":  local_ip,
            "port":     7777,
            "quota_gb": quota_gb,
        }))
        .send()
        .await
        .map_err(|e| format!("Kayıt isteği başarısız: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body   = resp.text().await.unwrap_or_default();
        return Err(format!("Node kayıt hatası (HTTP {}): {}", status, body));
    }

    let reg: NodeApiResponse = resp.json().await
        .map_err(|e| format!("Kayıt yanıtı ayrıştırılamadı: {}", e))?;

    let node_id    = reg.node.id;
    let node_token = reg.node_token;

    // ── Step 3: Write config.yaml ─────────────────────────────────────────
    emit!(3, "Yapılandırma oluşturuluyor...");

    let storage = if storage_path.is_empty() {
        install_dir.join("storage").to_string_lossy().replace('\\', "/")
    } else {
        storage_path.replace('\\', "/")
    };

    std::fs::create_dir_all(&storage)
        .map_err(|e| format!("Depolama klasörü oluşturulamadı: {}", e))?;

    let config = format!(
        "server_url: \"{server_url}\"\nauth_token: \"{auth_token}\"\n\
         storage_path: \"{storage}\"\nquota_gb: {quota_gb}\n\
         bandwidth_limit_mbps: {bandwidth_mbps}\nlisten_port: 7777\n\
         node_id: \"{node_id}\"\nnode_token: \"{node_token}\"\n"
    );

    std::fs::write(install_dir.join("config.yaml"), &config)
        .map_err(|e| format!("config.yaml yazılamadı: {}", e))?;

    // ── Step 4: Register for auto-startup ─────────────────────────────────
    emit!(4, "Otomatik başlangıca ekleniyor...");

    // Non-fatal: log on failure and continue
    if let Err(e) = add_to_startup(&dst, &install_dir) {
        eprintln!("[startup] Uyarı: {}", e);
    }

    // ── Step 5: Start agent ───────────────────────────────────────────────
    emit!(5, "Agent başlatılıyor...");

    start_agent(&dst, &install_dir)
        .map_err(|e| format!("Agent başlatılamadı: {}", e))?;

    Ok(InstallResult {
        node_id,
        install_dir: install_dir.to_string_lossy().to_string(),
    })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/// Locate the agent binary to copy during installation.
/// Search order:
///   1. Tauri resource_dir  — correct when running the NSIS-installed app
///   2. Directory of this executable — correct when running raw build binary
///      (copy dsn-agent.exe next to dsn-installer.exe for dev/testing)
fn find_agent_binary(app: &AppHandle, binary_name: &str) -> Result<PathBuf, String> {
    // 1. resource_dir (NSIS-installed)
    if let Ok(res_dir) = app.path().resource_dir() {
        let candidate = res_dir.join(binary_name);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    // 2. Same directory as the installer executable (dev/testing)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidate = exe_dir.join(binary_name);
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }

    Err(format!(
        "Agent binary '{}' bulunamadi. Lutfen kurulum paketini kullanin veya {} dosyasini installer ile ayni klasore kopyalayin.",
        binary_name, binary_name
    ))
}

fn get_install_dir() -> Result<PathBuf, String> {
    dirs::data_dir()
        .or_else(|| dirs::home_dir())
        .map(|d| d.join("DSN"))
        .ok_or_else(|| "Uygulama veri dizini bulunamadı".to_string())
}

fn agent_binary_name() -> &'static str {
    if cfg!(target_os = "windows") { "dsn-agent.exe" } else { "dsn-agent" }
}

/// Make the binary executable on Unix.
#[cfg(unix)]
fn set_executable(path: &PathBuf) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path).map_err(|e| e.to_string())?.permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(path, perms).map_err(|e| e.to_string())
}
#[cfg(not(unix))]
fn set_executable(_: &PathBuf) -> Result<(), String> { Ok(()) }

fn local_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .ok()
        .and_then(|s| { s.connect("8.8.8.8:80").ok()?; s.local_addr().ok() })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

fn node_name() -> String {
    std::env::var("COMPUTERNAME")                        // Windows
        .or_else(|_| std::env::var("HOSTNAME"))          // Linux/macOS env
        .unwrap_or_else(|_| "DSN-Node".to_string())
}

// ── Platform-specific startup registration ───────────────────────────────────

#[cfg(target_os = "windows")]
fn add_to_startup(agent: &PathBuf, config_dir: &PathBuf) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let cmd = format!(
        "\"{}\" --no-tray --config \"{}\"",
        agent.display(),
        config_dir.join("config.yaml").display()
    );

    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Run", KEY_WRITE)
        .map_err(|e| format!("Registry açılamadı: {}", e))?
        .set_value("DSNAgent", &cmd)
        .map_err(|e| format!("Registry yazılamadı: {}", e))
}

#[cfg(target_os = "macos")]
fn add_to_startup(agent: &PathBuf, config_dir: &PathBuf) -> Result<(), String> {
    let agents_dir = dirs::home_dir()
        .ok_or("Home dizini bulunamadı")?
        .join("Library/LaunchAgents");
    std::fs::create_dir_all(&agents_dir).map_err(|e| e.to_string())?;

    let plist = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.dsn.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>{}</string>
    <string>--no-tray</string>
    <string>--config</string>
    <string>{}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>"#,
        agent.display(),
        config_dir.join("config.yaml").display()
    );

    let plist_path = agents_dir.join("com.dsn.agent.plist");
    std::fs::write(&plist_path, plist).map_err(|e| e.to_string())?;

    Command::new("launchctl")
        .args(["load", "-w", &plist_path.to_string_lossy()])
        .output()
        .map_err(|e| format!("launchctl hatası: {}", e))?;

    Ok(())
}

#[cfg(target_os = "linux")]
fn add_to_startup(agent: &PathBuf, config_dir: &PathBuf) -> Result<(), String> {
    let svc_dir = dirs::home_dir()
        .ok_or("Home dizini bulunamadı")?
        .join(".config/systemd/user");
    std::fs::create_dir_all(&svc_dir).map_err(|e| e.to_string())?;

    let service = format!(
        "[Unit]\nDescription=DSN Agent\nAfter=network.target\n\n\
         [Service]\nExecStart={} --no-tray --config {}\nRestart=on-failure\nRestartSec=10\n\n\
         [Install]\nWantedBy=default.target\n",
        agent.display(),
        config_dir.join("config.yaml").display()
    );

    std::fs::write(svc_dir.join("dsn-agent.service"), service)
        .map_err(|e| e.to_string())?;

    Command::new("systemctl")
        .args(["--user", "enable", "--now", "dsn-agent"])
        .output()
        .map_err(|e| format!("systemctl hatası: {}", e))?;

    Ok(())
}

// ── start_agent ──────────────────────────────────────────────────────────────

fn start_agent(agent: &PathBuf, config_dir: &PathBuf) -> Result<(), String> {
    let mut cmd = Command::new(agent);
    cmd.arg("--no-tray")
       .arg("--config")
       .arg(config_dir.join("config.yaml"))
       .current_dir(config_dir);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x00000008;
        cmd.creation_flags(DETACHED_PROCESS);
    }

    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}
