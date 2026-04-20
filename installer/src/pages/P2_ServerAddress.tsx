import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WizardState } from "../App";
import { getDefaultApiUrl } from "../lib/dsnUrls";

interface Props {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function P2_ServerAddress({ state, update, onNext, onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const tryConnect = async (url: string): Promise<boolean> => {
    setLoading(true);
    setChecked(false);
    setErrMsg("");
    try {
      const ok = await invoke<boolean>("check_server", { url: url.trim() });
      if (ok) { setChecked(true); return true; }
      setErrMsg("Sunucuya bağlanılamadı. Adresi ve portu kontrol edin.");
      return false;
    } catch (e: any) {
      setErrMsg(e?.toString() ?? "Bağlantı hatası");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    const url = state.serverUrl.trim();
    if (!url) return;
    if (checked) { onNext(); return; }
    const ok = await tryConnect(url);
    if (ok) onNext();
  };

  const onChange = (v: string) => {
    update({ serverUrl: v });
    setChecked(false);
    setErrMsg("");
  };

  return (
    <>
      <div className="content">
        <div className="page-icon">🖥️</div>
        <h1 className="page-title">Sunucu Adresi</h1>
        <p className="page-desc">
          DSN backend adresini girin (genelde <strong>:8000</strong> portu). Kurulum paketi
          önceden yapılandırıldıysa alan dolu gelir; değiştirmeden &quot;Bağlantıyı Test Et&quot;
          diyebilirsiniz.
        </p>
        {getDefaultApiUrl() && (
          <p className="hint" style={{ marginTop: -8, marginBottom: 8 }}>
            Bu sürümde varsayılan API adresi üretimde gömülüdür.
          </p>
        )}

        <div className="field">
          <label>Sunucu Adresi</label>
          <input
            type="url"
            placeholder="https://api.storemyfile.com"
            value={state.serverUrl}
            onChange={(e) => onChange(e.target.value)}
            className={errMsg ? "err" : ""}
            onKeyDown={(e) => e.key === "Enter" && tryConnect(state.serverUrl)}
          />
          {errMsg && <p className="err-msg">✗ {errMsg}</p>}
          {checked && <p className="hint" style={{ color: "var(--success)" }}>✓ Sunucuya bağlantı başarılı</p>}
          <p className="hint" style={{ marginTop: checked || errMsg ? 4 : undefined }}>
            Örnek: https://api.storemyfile.com &nbsp;·&nbsp; https://dsn.sirketim.com
          </p>
        </div>

        {state.serverUrl && !checked && !loading && (
          <button className="btn btn-outline" onClick={() => tryConnect(state.serverUrl)}>
            Bağlantıyı Test Et
          </button>
        )}
      </div>

      <div className="footer">
        <button className="btn btn-ghost" onClick={onBack}>← Geri</button>
        <div className="footer-right">
          <button
            className="btn btn-primary"
            onClick={handleNext}
            disabled={!state.serverUrl.trim() || loading}
          >
            {loading ? "Kontrol ediliyor..." : "İleri →"}
          </button>
        </div>
      </div>
    </>
  );
}
