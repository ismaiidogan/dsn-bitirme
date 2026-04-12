use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

mod commands;

// ── Deep-link temp-file path ─────────────────────────────────────────────────
// When the OS launches a second process for a dsn-agent:// URL, that process
// writes the URL here and exits immediately.  The running instance polls this
// file and picks it up.

fn deeplink_tmp_path() -> std::path::PathBuf {
    std::env::temp_dir().join("dsn-installer-deeplink.tmp")
}

/// Extract dsn-agent:// URL from args. On Windows the URL can be one arg or split (e.g. "dsn-agent://auth" "token=xxx").
fn extract_deeplink_url(args: &[String]) -> Option<String> {
    // Single arg
    if let Some(url) = args.iter().skip(1).find(|a| a.starts_with("dsn-agent://")) {
        return Some(url.clone());
    }
    // Joined: sometimes URL is split; join and find dsn-agent://... up to next space or end
    let joined = args.iter().skip(1).cloned().collect::<Vec<_>>().join(" ");
    let start = joined.find("dsn-agent://")?;
    let rest = &joined[start..];
    // URL ends at space or end of string
    let end = rest.find(' ').unwrap_or(rest.len());
    let url = rest[..end].trim();
    if url.is_empty() {
        None
    } else {
        Some(url.to_string())
    }
}

// ── Emit helper ──────────────────────────────────────────────────────────────

fn emit_deep_link(app: &tauri::AppHandle, url: &str) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.emit("deep-link-received", url.to_string());
    }
}

// ── Entry point ──────────────────────────────────────────────────────────────

pub fn run() {
    let args: Vec<String> = std::env::args().collect();

    // ── Relay guard ──────────────────────────────────────────────────────────
    // When opened via dsn-agent:// URL we write the URL to a temp file so the
    // already-running instance can pick it up. We wait briefly; if the file is
    // still there, no other instance is running (e.g. user clicked link without
    // having the wizard open) so we start Tauri and emit the URL on setup.
    if let Some(url) = extract_deeplink_url(&args) {
        let path = deeplink_tmp_path();
        let _ = std::fs::write(&path, url.as_bytes());
        std::thread::sleep(std::time::Duration::from_millis(1600));
        if path.exists() {
            let _ = std::fs::remove_file(&path);
            std::env::set_var("DSN_INSTALLER_PENDING_DEEPLINK", &url);
            // fall through: we are the only instance, start Tauri and emit in setup
        } else {
            return; // another instance read the file; we exit without showing a window
        }
    }

    // ── Normal startup ───────────────────────────────────────────────────────
    tauri::Builder::default()
        // Single-instance: when user opens link while app is running, we get
        // argv here and must emit to frontend; the second process is then closed.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(url) = extract_deeplink_url(&argv) {
                emit_deep_link(app, &url);
                return;
            }
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::check_server,
            commands::get_disk_free_gb,
            commands::get_disk_info,
            commands::open_agent_login,
            commands::do_install,
        ])
        .setup(|app| {
            // Register dsn-agent:// URL scheme (Windows / Linux need this call)
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            app.deep_link().register_all()?;

            // Handle deep links delivered directly to the running instance
            // (macOS AppleEvent / rare Windows DDE path)
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                if let Some(url) = event.urls().first() {
                    emit_deep_link(&handle, &url.to_string());
                }
            });

            // ── Pending deep link (this process was started with URL, no other instance) ─
            // Emit after a short delay so the frontend has time to mount and subscribe.
            if let Ok(url) = std::env::var("DSN_INSTALLER_PENDING_DEEPLINK") {
                let url = url.trim().to_string();
                std::env::remove_var("DSN_INSTALLER_PENDING_DEEPLINK");
                if url.starts_with("dsn-agent://") {
                    let handle = app.handle().clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(800));
                        emit_deep_link(&handle, &url);
                    });
                }
            }

            // ── Temp-file watcher ────────────────────────────────────────────
            // Poll the temp file that second instances write to.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let path = deeplink_tmp_path();
                // Remove any stale file from a previous run
                let _ = std::fs::remove_file(&path);
                loop {
                    if path.exists() {
                        if let Ok(url) = std::fs::read_to_string(&path) {
                            let _ = std::fs::remove_file(&path);
                            let url = url.trim().to_string();
                            if url.starts_with("dsn-agent://") {
                                emit_deep_link(&handle, &url);
                            }
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(300));
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri uygulaması başlatılamadı");
}
