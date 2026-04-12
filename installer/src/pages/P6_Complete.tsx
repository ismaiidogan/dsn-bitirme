import { getCurrentWindow } from "@tauri-apps/api/window";
import type { WizardState } from "../App";

interface Props { state: WizardState }

export default function P6_Complete({ state }: Props) {
  return (
    <>
      <div className="content">
        <div className="complete-hero">
          <div className="big-check">✓</div>
          <h1 className="page-title">Node'unuz Aktif!</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", maxWidth: 360, lineHeight: 1.6 }}>
            Bilgisayarınız DSN ağına başarıyla katıldı.
            Sistem tepsisinde DSN simgesini görebilirsiniz.
          </p>
        </div>

        <div className="stat-grid" style={{ margin: "0 auto" }}>
          <div className="stat-card">
            <p className="stat-lbl">Durum</p>
            <p className="stat-val" style={{ color: "var(--success)" }}>● Aktif</p>
          </div>
          <div className="stat-card">
            <p className="stat-lbl">Disk Kotası</p>
            <p className="stat-val">{state.quotaGb} GB</p>
          </div>
          <div className="stat-card">
            <p className="stat-lbl">Node ID</p>
            <p className="stat-val" style={{ fontSize: 11, fontFamily: "monospace", wordBreak: "break-all" }}>
              {state.nodeId ? state.nodeId.slice(0, 8) + "…" : "—"}
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-lbl">Bant Genişliği</p>
            <p className="stat-val">{state.bandwidthMbps === 0 ? "Sınırsız" : `${state.bandwidthMbps} MB/s`}</p>
          </div>
        </div>

        <div className="tip-box" style={{ marginTop: 16 }}>
          💡 Agent bilgisayar açılışında otomatik başlar. Duraklatmak veya kapatmak için
          sistem tepsisindeki DSN simgesine sağ tıklayın.
        </div>
      </div>

      <div className="footer">
        <span />
        <div className="footer-right">
          <button className="btn btn-primary" onClick={() => getCurrentWindow().close()}>
            Kapat
          </button>
        </div>
      </div>
    </>
  );
}
