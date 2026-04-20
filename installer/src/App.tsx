import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import P1_Welcome from "./pages/P1_Welcome";
import P2_ServerAddress from "./pages/P2_ServerAddress";
import P3_Auth from "./pages/P3_Auth";
import P4_Storage from "./pages/P4_Storage";
import P5_Installing from "./pages/P5_Installing";
import P6_Complete from "./pages/P6_Complete";
import { getDefaultApiUrl } from "./lib/dsnUrls";

export interface WizardState {
  serverUrl: string;
  authToken: string;
  storagePath: string;
  quotaGb: number;
  bandwidthMbps: number;
  nodeId?: string;
  installDir?: string;
}

const STEPS = ["Karşılama", "Sunucu", "Giriş", "Depolama", "Kurulum", "Tamamlandı"];
const WIZARD_STORAGE_KEY = "dsn-installer-wizard";

function isLocalDevUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.includes("localhost") || v.includes("127.0.0.1");
}

function loadPersistedServerUrl(): string {
  try {
    const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { serverUrl?: string };
      return data.serverUrl ?? "";
    }
  } catch {
    // ignore
  }
  return "";
}

export default function App() {
  const defaultApiUrl = getDefaultApiUrl();
  const persistedServerUrl = loadPersistedServerUrl();
  const initialServerUrl =
    persistedServerUrl &&
    !(isLocalDevUrl(persistedServerUrl) && defaultApiUrl && !isLocalDevUrl(defaultApiUrl))
      ? persistedServerUrl
      : defaultApiUrl;

  const [page, setPage] = useState(1);
  const [state, setState] = useState<WizardState>(() => ({
    serverUrl: initialServerUrl,
    authToken: "",
    storagePath: "",
    quotaGb: 50,
    bandwidthMbps: 0,
  }));

  const next = () => setPage((p) => p + 1);
  const back = () => setPage((p) => p - 1);
  const update = (patch: Partial<WizardState>) => {
    setState((s) => {
      const nextState = { ...s, ...patch };
      if (patch.serverUrl !== undefined) {
        try {
          localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ serverUrl: nextState.serverUrl }));
        } catch {
          // ignore
        }
      }
      return nextState;
    });
  };

  // Global deep-link handler: token can arrive while on P3 (same process) or after restart (P1).
  useEffect(() => {
    const unlistenP = listen<string>("deep-link-received", (event) => {
      try {
        const url = new URL(event.payload);
        const token = url.searchParams.get("token");
        if (!token) return;
        update({ authToken: token });
        if (page < 3) {
          setPage(4);
        }
        // When page === 3, P3_Auth's listener handles UI and onNext
      } catch {
        // ignore malformed URL
      }
    });
    return () => {
      unlistenP.then((f) => f());
    };
  }, [page]);

  const pages: Record<number, React.ReactElement> = {
    1: <P1_Welcome onNext={next} />,
    2: <P2_ServerAddress state={state} update={update} onNext={next} onBack={back} />,
    3: <P3_Auth state={state} update={update} onNext={next} onBack={back} />,
    4: <P4_Storage state={state} update={update} onNext={next} onBack={back} />,
    5: <P5_Installing state={state} update={update} onNext={next} />,
    6: <P6_Complete state={state} />,
  };

  return (
    <div className="layout">
      {/* Top bar */}
      <div className="topbar">
        <div className="logo">D</div>
        <span className="topbar-title">DSN Kurulum Sihirbazı</span>
        <span className="topbar-version">v1.0.0</span>
      </div>

      {/* Step indicators */}
      <div className="steps">
        {STEPS.map((label, i) => {
          const step = i + 1;
          const isDone = page > step;
          const isActive = page === step;
          return (
            <div key={step} className={`step ${isDone ? "done" : ""} ${isActive ? "active" : ""}`}>
              {i > 0 && <div className="step-connector" />}
              <div className="step-bubble">{isDone ? "✓" : step}</div>
              <span className="step-label">{label}</span>
            </div>
          );
        })}
      </div>

      {/* Page content */}
      <div className="page-wrap">{pages[page]}</div>
    </div>
  );
}
