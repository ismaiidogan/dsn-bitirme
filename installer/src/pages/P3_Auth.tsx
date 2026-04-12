import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { WizardState } from "../App";
import { resolveWebBaseUrlForLogin } from "../lib/dsnUrls";

interface Props {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

type Phase = "start" | "waiting" | "done" | "error";

export default function P3_Auth({ state, update, onNext, onBack }: Props) {
  const [phase, setPhase] = useState<Phase>("start");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    // Listen for deep link callback: dsn-agent://auth?token=xxx
    const unlistenP = listen<string>("deep-link-received", (event) => {
      try {
        const url = new URL(event.payload);
        const token = url.searchParams.get("token");
        if (token) {
          update({ authToken: token });
          setPhase("done");
          setTimeout(onNext, 900);
        } else {
          setPhase("error");
          setErrMsg("Geçersiz token alındı. Tekrar deneyin.");
        }
      } catch {
        setPhase("error");
        setErrMsg("Deep link ayrıştırılamadı: " + event.payload);
      }
    });
    return () => { unlistenP.then((f) => f()); };
  }, []);

  const openBrowser = async () => {
    setPhase("waiting");
    setErrMsg("");
    try {
      const webBase = resolveWebBaseUrlForLogin(state.serverUrl);
      await invoke("open_agent_login", { webBaseUrl: webBase });
    } catch (e: any) {
      setPhase("error");
      setErrMsg(e?.toString() ?? "Tarayıcı açılamadı");
    }
  };

  return (
    <>
      <div className="content">
        <div className="page-icon">🔑</div>
        <h1 className="page-title">Hesap Girişi</h1>
        <p className="page-desc">
          DSN hesabınızla giriş yapın. Güvenli giriş için varsayılan tarayıcınız açılacak;
          işlem tamamlandığında sihirbaz otomatik devam edecek.
        </p>

        {phase === "start" && (
          <button className="btn btn-primary" onClick={openBrowser} style={{ width: 220 }}>
            🌐 &nbsp;Tarayıcıda Giriş Yap
          </button>
        )}

        {phase === "waiting" && (
          <div className="auth-waiting">
            <div className="spinner" />
            <p style={{ fontWeight: 600 }}>Tarayıcıda giriş bekleniyor...</p>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>
              Giriş tamamlandıktan sonra burası otomatik ilerleyecek.
            </p>
            <button className="btn btn-ghost" onClick={() => setPhase("start")} style={{ marginTop: 4 }}>
              İptal
            </button>
          </div>
        )}

        {phase === "done" && (
          <div className="status-box ok">
            <span className="status-icon">✓</span>
            <div>
              <p className="status-title">Giriş başarılı</p>
              <p className="status-detail">Sonraki adıma geçiliyor...</p>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="status-box err">
            <span className="status-icon">✗</span>
            <div>
              <p className="status-title">Giriş başarısız</p>
              <p className="status-detail">{errMsg}</p>
              <button className="btn btn-outline" onClick={openBrowser} style={{ marginTop: 10 }}>
                Tekrar Dene
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="footer">
        <button
          className="btn btn-ghost"
          onClick={onBack}
          disabled={phase === "waiting" || phase === "done"}
        >
          ← Geri
        </button>
        <div className="footer-right">
          {phase === "done" && (
            <button className="btn btn-primary" onClick={onNext}>İleri →</button>
          )}
        </div>
      </div>
    </>
  );
}
