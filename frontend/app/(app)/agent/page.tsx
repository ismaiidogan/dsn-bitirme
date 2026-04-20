"use client";

import { useState, useEffect } from "react";
import { Monitor, Download, Loader2, Terminal, Trash2 } from "lucide-react";
import { nodes as nodesApi, NodeItem } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { toErrorMessage } from "@/lib/errors";
import { useLanguage } from "@/contexts/language-context";

const platformDefs = [
  {
    key: "agent.windows",
    icon: "🪟",
    file: "dsn-agent-windows.zip",
    cmd: ".\\dsn-agent.exe",
    downloadUrl: process.env.NEXT_PUBLIC_AGENT_WINDOWS_URL ?? "",
  },
  {
    key: "agent.macIntel",
    icon: "🍎",
    file: "dsn-agent-mac-intel.zip",
    cmd: "./dsn-agent-mac-intel",
    downloadUrl: process.env.NEXT_PUBLIC_AGENT_MAC_INTEL_URL ?? "",
  },
  {
    key: "agent.macArm64",
    icon: "🍎",
    file: "dsn-agent-mac-arm64.zip",
    cmd: "./dsn-agent-mac-arm64",
    downloadUrl: process.env.NEXT_PUBLIC_AGENT_MAC_ARM64_URL ?? "",
  },
  {
    key: "agent.linux",
    icon: "🐧",
    file: "dsn-agent-linux.zip",
    cmd: "./dsn-agent-linux",
    downloadUrl: process.env.NEXT_PUBLIC_AGENT_LINUX_URL ?? "",
  },
];

const AGENT_SERVER_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const CONFIG_YAML = `server_url: "${AGENT_SERVER_URL}"
auth_token: "<JWT_TOKEN>"
storage_path: "/path/to/DSN-Storage"
quota_gb: 100
bandwidth_limit_mbps: 0  # 0 = sınırsız`;

export default function AgentPage() {
  const { t, language } = useLanguage();
  const [myNodes, setMyNodes] = useState<NodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);

  const loadNodes = () => {
    setLoading(true);
    setLoadError(null);
    nodesApi.list()
      .then(setMyNodes)
      .catch(() => setLoadError(t("agent.nodesLoadError")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadNodes();
  }, []);

  const handleDeleteNode = async (node: NodeItem) => {
    const nodeLabel = node.name ?? `${node.address}:${node.port}`;
    const accepted = confirm(t("agent.deleteNodeConfirm", { nodeLabel }));
    if (!accepted) return;

    setDeletingNodeId(node.id);
    try {
      await nodesApi.delete(node.id);
      setMyNodes((prev) => prev.filter((n) => n.id !== node.id));
      toast.success(t("agent.deleteNodeSuccess"));
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, t("agent.deleteNodeFailed")));
    } finally {
      setDeletingNodeId(null);
    }
  };

  const steps = [
    t("agent.setupStep1"),
    t("agent.setupStep2"),
    t("agent.setupStep3"),
    t("agent.setupStep4"),
  ];

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t("agent.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("agent.subtitle")}
        </p>
      </div>

      {/* Node status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            {t("agent.connectedNodes")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-10 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : loadError ? (
            <div className="px-6 py-6 text-sm text-destructive">
              {loadError}
            </div>
          ) : myNodes.length === 0 ? (
            <div className="px-6 py-6 text-sm text-muted-foreground">
              {t("agent.noNodes")}
            </div>
          ) : (
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
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-right">
                      <p className="font-medium">{formatBytes(node.used_bytes)}</p>
                      <p className="text-xs text-muted-foreground">/ {formatBytes(node.quota_bytes)}</p>
                    </div>
                    <Badge variant={node.status === "active" ? "success" : node.status === "inactive" ? "warning" : "danger"}>
                      {node.status === "active"
                        ? t("common.statusActive")
                        : node.status === "inactive"
                        ? t("common.statusInactive")
                        : language === "en"
                        ? node.status
                        : node.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("agent.deleteNodeTitle")}
                      aria-label={t("agent.deleteNodeTitle")}
                      onClick={() => handleDeleteNode(node)}
                      disabled={deletingNodeId === node.id}
                      className="hover:text-destructive"
                    >
                      {deletingNodeId === node.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Download */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" />
            {t("agent.download")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {platformDefs.map((p) => (
              <a
                key={p.key}
                href={p.downloadUrl || undefined}
                download={Boolean(p.downloadUrl)}
                target={p.downloadUrl ? "_blank" : undefined}
                rel={p.downloadUrl ? "noopener noreferrer" : undefined}
                className={`flex items-center gap-3 rounded-lg border border-border p-4 ${
                  p.downloadUrl
                    ? "hover:border-primary/50 hover:bg-accent/40 cursor-pointer transition-colors"
                    : "opacity-60 cursor-not-allowed"
                }`}
                title={p.downloadUrl ? t("agent.downloadTitle") : t("agent.comingSoon")}
                onClick={(e) => {
                  if (!p.downloadUrl) e.preventDefault();
                }}
              >
                <span className="text-2xl">{p.icon}</span>
                <div>
                  <p className="font-medium text-sm">{t(p.key)}</p>
                  <p className="text-xs text-muted-foreground font-mono">{p.file}</p>
                </div>
              </a>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {t("agent.envHint")}
          </p>
        </CardContent>
      </Card>

      {/* Setup steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("agent.setupSteps")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {steps.map((step, i) => (
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
              {t("agent.configTemplateTitle")}
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
