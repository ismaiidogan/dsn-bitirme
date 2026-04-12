import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { WizardState } from "../App";

interface ProgressEvent { step: number; total: number; message: string; error?: string; }
interface InstallResult { node_id: string; install_dir: string; }

const STEPS = [
  "Agent dosyası kopyalanıyor",
  "Sunucuya kayıt yapılıyor",
  "Yapılandırma oluşturuluyor",
  "Otomatik başlangıca ekleniyor",
  "Agent başlatılıyor",
];

interface Props {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  onNext: () => void;
}

export default function P5_Installing({ state, update, onNext }: Props) {
  const [activeStep, setActiveStep] = useState(1);
  const [errMsg, setErrMsg] = useState("");
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const unlistenP = listen<ProgressEvent>("install-progress", (e) => {
      setActiveStep(e.payload.step);
      if (e.payload.error) setErrMsg(e.payload.error);
    });

    invoke<InstallResult>("do_install", {
      serverUrl: state.serverUrl,
      authToken: state.authToken,
      storagePath: state.storagePath,
      quotaGb: state.quotaGb,
      bandwidthMbps: state.bandwidthMbps,
    })
      .then((result) => {
        update({ nodeId: result.node_id, installDir: result.install_dir });
        setActiveStep(STEPS.length + 1);
        setDone(true);
        setTimeout(onNext, 1200);
      })
      .catch((e: any) => {
        setErrMsg(e?.toString() ?? "Kurulum başarısız oldu.");
      });

    return () => { unlistenP.then((f) => f()); };
  }, []);

  return (
    <>
      <div className="content">
        <div className="page-icon">⚙️</div>
        <h1 className="page-title">Kurulum Yapılıyor</h1>
        <p className="page-desc">Lütfen bekleyin, her şey otomatik olarak ayarlanıyor.</p>

        <ul className="progress-list">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const status = done || activeStep > n ? "done" : activeStep === n && !errMsg ? "active" : "pending";
            return (
              <li key={i} className={`progress-item ${status}`}>
                <div className="p-icon">{status === "done" ? "✓" : status === "active" ? "●" : n}</div>
                <span>{label}</span>
              </li>
            );
          })}
        </ul>

        {errMsg && (
          <div className="status-box err" style={{ marginTop: 20 }}>
            <span className="status-icon">✗</span>
            <div>
              <p className="status-title">Kurulum başarısız</p>
              <p className="status-detail">{errMsg}</p>
            </div>
          </div>
        )}
      </div>

      <div className="footer">
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {done ? "✓ Tamamlandı" : errMsg ? "Hata oluştu" : "Lütfen bekleyin..."}
        </span>
        <div className="footer-right">
          {done && <button className="btn btn-primary" onClick={onNext}>İleri →</button>}
        </div>
      </div>
    </>
  );
}
