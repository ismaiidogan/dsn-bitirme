import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { WizardState } from "../App";

interface DiskInfo {
  total_bytes: number;
  free_bytes: number;
  max_allowed_bytes: number;
}

interface Props {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function P4_Storage({ state, update, onNext, onBack }: Props) {
  const [maxGb, setMaxGb] = useState(200);
  const [diskLabel, setDiskLabel] = useState("");

  useEffect(() => {
    invoke<DiskInfo>("get_disk_info", { path: state.storagePath || "." })
      .then((info) => {
        const bytesPerGb = 1_073_741_824;
        const freeGb = Math.floor(info.free_bytes / bytesPerGb);
        const maxGb = Math.max(1, Math.floor(info.max_allowed_bytes / bytesPerGb));

        setMaxGb(maxGb);
        setDiskLabel(
          `Bilgisayarınızda ${freeGb} GB boş alan var. En fazla ${maxGb} GB paylaşabilirsiniz.`
        );

        if (state.quotaGb > maxGb) {
          update({ quotaGb: maxGb });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.storagePath]);

  const pickFolder = async () => {
    try {
      const sel = await open({ directory: true, multiple: false, title: "Depolama Klasörü Seç" });
      if (typeof sel === "string") update({ storagePath: sel });
    } catch {}
  };

  const displayPath = state.storagePath || "~/Belgeler/DSN-Storage";

  return (
    <>
      <div className="content">
        <div className="page-icon">💾</div>
        <h1 className="page-title">Depolama Ayarları</h1>
        <p className="page-desc">
          Dosya parçalarının saklanacağı klasörü ve disk kotasını belirleyin.
        </p>

        <div className="field">
          <label>Depolama Klasörü</label>
          <div className="folder-row">
            <input
              type="text"
              value={displayPath}
              readOnly
              style={{ cursor: "default" }}
            />
            <button className="btn btn-outline" onClick={pickFolder}>Seç...</button>
          </div>
          <p className="hint">Klasör yoksa otomatik oluşturulur.</p>
        </div>

        <div className="field">
          <label>Disk Kotası</label>
          <div className="slider-row">
            <input
              type="range"
              min={1}
              max={maxGb}
              value={Math.min(state.quotaGb, maxGb)}
              onChange={(e) => {
                const val = Math.min(Number(e.target.value), maxGb);
                update({ quotaGb: val });
              }}
            />
            <span className="slider-val">{state.quotaGb} GB</span>
          </div>
          <p className="hint">{diskLabel || "Disk bilgisi alınıyor..."}</p>
        </div>

        <div className="field">
          <label>
            Bant Genişliği Limiti &nbsp;
            <span style={{ fontWeight: 400, color: "var(--muted)" }}>(isteğe bağlı)</span>
          </label>
          <div className="slider-row">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={state.bandwidthMbps}
              onChange={(e) => update({ bandwidthMbps: Number(e.target.value) })}
            />
            <span className="slider-val">
              {state.bandwidthMbps === 0 ? "∞ Sınırsız" : `${state.bandwidthMbps} MB/s`}
            </span>
          </div>
          <p className="hint">0 = sınırsız. Oyun veya video konferans sırasında sınırlayabilirsiniz.</p>
        </div>
      </div>

      <div className="footer">
        <button className="btn btn-ghost" onClick={onBack}>← Geri</button>
        <div className="footer-right">
          <button
            className="btn btn-primary"
            onClick={onNext}
            disabled={state.quotaGb < 1}
          >
            Kuruluma Başla →
          </button>
        </div>
      </div>
    </>
  );
}
