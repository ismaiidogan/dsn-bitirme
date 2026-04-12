"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { files as filesApi, FileDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatBytes, formatDate } from "@/lib/utils";
import { toast } from "sonner";

export default function FileDetailPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.id as string;

  const [file, setFile] = useState<FileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    filesApi.get(fileId)
      .then(setFile)
      .catch(() => router.replace("/dashboard"))
      .finally(() => setLoading(false));
  }, [fileId, router]);

  const handleDownload = async () => {
    if (!file) return;
    setDownloading(true);
    try {
      const manifest = await filesApi.downloadManifest(file.id);

      // Import the AES-256 key from manifest (hex → CryptoKey)
      const keyBytes = Uint8Array.from(
        manifest.aes_key_hex.match(/.{2}/g)!.map((h) => parseInt(h, 16))
      );
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );

      // Fetch and decrypt chunks in parallel, store by index
      const chunks: ArrayBuffer[] = new Array(manifest.chunks.length);

      await Promise.all(
        manifest.chunks.map(async (chunk) => {
          const res = await fetch(`${chunk.node_url}/chunks/${chunk.chunk_id}`, {
            headers: { Authorization: `Bearer ${chunk.node_token}` },
          });
          if (!res.ok) throw new Error(`Chunk ${chunk.chunk_index} indirme hatası`);
          const ciphertext = await res.arrayBuffer();

          // Parse IV from hex
          const iv = Uint8Array.from(
            chunk.iv.match(/.{2}/g)!.map((h) => parseInt(h, 16))
          );

          // Decrypt with AES-256-GCM
          chunks[chunk.chunk_index] = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            cryptoKey,
            ciphertext
          );
        })
      );

      const blob = new Blob(chunks, { type: file.mime_type || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.original_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.message ?? "İndirme başarısız");
    }
    setDownloading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!file) return null;

  const activeReplicas = file.replication?.active ?? 0;
  const totalReplicas = file.replication?.total ?? 0;
  const health = file.replication?.health ?? "critical";

  let safetyLabel = "Erişilemiyor";
  let safetyVariant: "success" | "warning" | "danger" = "danger";
  if (health === "full" && file.status === "active") {
    safetyLabel = "Güvende";
    safetyVariant = "success";
  } else if (health === "partial" && activeReplicas > 0) {
    safetyLabel = "Riskli";
    safetyVariant = "warning";
  }

  const compressedTotal = file.chunks.reduce((sum, c) => sum + c.size_bytes, 0);
  const originalTotal = file.size_bytes;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate" title={file.original_name}>
            {file.original_name}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {formatBytes(file.size_bytes)} • {file.chunk_count} chunk • {formatDate(file.created_at)}
          </p>
        </div>
        <Button onClick={handleDownload} disabled={downloading || file.status !== "active"}>
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          İndir
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs">Güvenlik Durumu</p>
            <Badge
              className="mt-1"
              variant={safetyVariant}
            >
              {safetyLabel}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs">Kopya Durumu</p>
            <p className="text-lg font-bold mt-1">
              {activeReplicas}/{totalReplicas}
              <span className="text-sm font-normal text-muted-foreground ml-1">aktif kopya</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {file.replication_factor} kopya hedeflenmiş.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs">Boyutlar</p>
            <p className="text-sm mt-1">
              Orijinal: <span className="font-semibold">{formatBytes(originalTotal)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Sıkıştırılmış (diskte): {formatBytes(compressedTotal)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Son güncelleme: {formatDate(file.created_at)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
