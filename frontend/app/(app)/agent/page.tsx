"use client";

import { useState, useEffect } from "react";
import { Monitor, Download, CheckCircle2, Circle, Terminal } from "lucide-react";
import { nodes as nodesApi, NodeItem } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatDate } from "@/lib/utils";

const PLATFORMS = [
  {
    name: "Windows",
    icon: "🪟",
    file: "dsn-agent.exe",
    cmd: ".\\dsn-agent.exe",
  },
  {
    name: "macOS (Intel)",
    icon: "🍎",
    file: "dsn-agent-mac-intel",
    cmd: "./dsn-agent-mac-intel",
  },
  {
    name: "macOS (Apple Silicon)",
    icon: "🍎",
    file: "dsn-agent-mac-arm64",
    cmd: "./dsn-agent-mac-arm64",
  },
  {
    name: "Linux",
    icon: "🐧",
    file: "dsn-agent-linux",
    cmd: "./dsn-agent-linux",
  },
];

const STEPS = [
  "Agent dosyasını indirin",
  "config.yaml dosyasını oluşturun (aşağıdaki şablonu kullanın)",
  "Agent'ı çalıştırın",
  "Bu sayfada bağlantı durumunu kontrol edin",
];

const CONFIG_YAML = `server_url: "http://localhost:8000"
auth_token: "<JWT_TOKEN>"
storage_path: "/path/to/DSN-Storage"
quota_gb: 100
bandwidth_limit_mbps: 0  # 0 = sınırsız`;

export default function AgentPage() {
  const [myNodes, setMyNodes] = useState<NodeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    nodesApi.list()
      .then(setMyNodes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Storage Agent</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Agent'ı bilgisayarınıza kurarak depolama alanı sağlayabilirsiniz
        </p>
      </div>

      {/* Node status */}
      {myNodes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Bağlı Node'larım
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {myNodes.map((node) => (
                <div key={node.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        node.status === "active" ? "bg-emerald-500" :
                        node.status === "inactive" ? "bg-amber-500" : "bg-red-500"
                      }`}
                    />
                    <div>
                      <p className="font-medium text-sm">{node.name ?? node.address}</p>
                      <p className="text-xs text-muted-foreground">
                        {node.address}:{node.port}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div className="text-sm">
                      <p className="font-medium">{formatBytes(node.used_bytes)}</p>
                      <p className="text-xs text-muted-foreground">/ {formatBytes(node.quota_bytes)}</p>
                    </div>
                    <Badge variant={node.status === "active" ? "success" : node.status === "inactive" ? "warning" : "danger"}>
                      {node.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Download */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" />
            Agent İndir
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {PLATFORMS.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-3 rounded-lg border border-border p-4 opacity-60 cursor-not-allowed"
                title="Yakında"
              >
                <span className="text-2xl">{p.icon}</span>
                <div>
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{p.file}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            * Agent binary'leri build aşamasında olup yakında yayınlanacaktır.
          </p>
        </CardContent>
      </Card>

      {/* Setup steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kurulum Adımları</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {STEPS.map((step, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium">
                {i + 1}
              </div>
              <p className="text-sm pt-0.5">{step}</p>
            </div>
          ))}

          <div className="mt-4">
            <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5" />
              config.yaml şablonu:
            </p>
            <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-auto text-muted-foreground">
              {CONFIG_YAML}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
