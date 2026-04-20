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
import { webCryptoAvailable, WEB_CRYPTO_BLOCKED_MSG } from "@/lib/webCrypto";
import { toErrorMessage } from "@/lib/errors";
import { useLanguage } from "@/contexts/language-context";

async function tryDecompressChunk(data: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === "undefined") {
    return data;
  }
  try {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"));
    const decompressedBlob = await new Response(stream).blob();
    return await decompressedBlob.arrayBuffer();
  } catch {
    // Older files may be stored without compression; keep raw decrypted bytes.
    return data;
  }
}

export default function FileDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useLanguage();
  const fileId = params.id as string;

  const [file, setFile] = useState<FileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    filesApi.get(fileId)
      .then(setFile)
      .catch(() => setLoadError(t("fileDetail.loadFailed")))
      .finally(() => setLoading(false));
  }, [fileId, t]);

  const handleDownload = async () => {
    if (!file) return;
    if (!webCryptoAvailable()) {
      toast.error(WEB_CRYPTO_BLOCKED_MSG);
      return;
    }
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

      // Fetch and decrypt chunks with bounded concurrency to avoid memory spikes.
      const chunks: ArrayBuffer[] = new Array(manifest.chunks.length);
      const queue = [...manifest.chunks];
      const concurrency = 3;

      const worker = async () => {
        while (queue.length > 0) {
          const chunk = queue.shift();
          if (!chunk) return;
          const relay = await filesApi.downloadChunk(chunk.chunk_id);
          const expectedHash = chunk.sha256_hash.toLowerCase();
          const returnedHash = relay.sha256.toLowerCase();
          if (returnedHash && returnedHash !== expectedHash) {
            throw new Error(t("fileDetail.downloadChunkError", { index: chunk.chunk_index }));
          }
          const ciphertext = relay.data;

          // Parse IV from hex
          const iv = Uint8Array.from(
            chunk.iv.match(/.{2}/g)!.map((h) => parseInt(h, 16))
          );

          // Decrypt with AES-256-GCM
          const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            cryptoKey,
            ciphertext
          );
          chunks[chunk.chunk_index] = await tryDecompressChunk(decrypted);
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      const blob = new Blob(chunks, { type: file.mime_type || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.original_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, t("fileDetail.downloadFailed")));
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

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            {t("fileDetail.backDashboard")}
          </Button>
          <Button onClick={() => router.refresh()}>{t("fileDetail.refreshPage")}</Button>
        </div>
      </div>
    );
  }

  if (!file) return null;

  const activeReplicas = file.replication?.active ?? 0;
  const totalReplicas = file.replication?.total ?? 0;
  const health = file.replication?.health ?? "critical";

  let safetyLabel = t("fileDetail.inaccessible");
  let safetyVariant: "success" | "warning" | "danger" = "danger";
  if (health === "full" && file.status === "active") {
    safetyLabel = t("fileDetail.safe");
    safetyVariant = "success";
  } else if (health === "partial" && activeReplicas > 0) {
    safetyLabel = t("fileDetail.risky");
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
          {t("fileDetail.download")}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs">{t("fileDetail.securityStatus")}</p>
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
            <p className="text-muted-foreground text-xs">{t("fileDetail.replicaStatus")}</p>
            <p className="text-lg font-bold mt-1">
              {activeReplicas}/{totalReplicas}
              <span className="text-sm font-normal text-muted-foreground ml-1">{t("fileDetail.activeReplica")}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("fileDetail.replicaTarget", { count: file.replication_factor })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs">{t("fileDetail.sizes")}</p>
            <p className="text-sm mt-1">
              {t("fileDetail.original")}: <span className="font-semibold">{formatBytes(originalTotal)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {t("fileDetail.compressedDisk")}: {formatBytes(compressedTotal)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("fileDetail.lastUpdate")}: {formatDate(file.created_at)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
