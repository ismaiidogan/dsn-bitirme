"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileIcon, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { files as filesApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/utils";
import { webCryptoAvailable, WEB_CRYPTO_BLOCKED_MSG } from "@/lib/webCrypto";
import { toErrorMessage } from "@/lib/errors";
import { useLanguage } from "@/contexts/language-context";

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB
const CHUNK_SIZE = 16 * 1024 * 1024; // 16 MB

type UploadState = "idle" | "uploading" | "done" | "error";

interface ChunkProgress {
  index: number;
  status: "pending" | "uploading" | "done" | "error";
}

async function compressChunk(plaintext: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof CompressionStream === "undefined") {
    return plaintext;
  }

  const stream = new Blob([plaintext]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressedBlob = await new Response(stream).blob();
  const compressed = await compressedBlob.arrayBuffer();
  // If compression is ineffective, keep original payload.
  return compressed.byteLength < plaintext.byteLength ? compressed : plaintext;
}

export default function UploadPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [replication, setReplication] = useState<1 | 2 | 3>(2);
  const inputRef = useRef<HTMLInputElement>(null);
  const [cryptoReady, setCryptoReady] = useState<boolean | null>(null);

  useEffect(() => {
    setCryptoReady(webCryptoAvailable());
  }, []);

  const selectFile = (f: File) => {
    if (f.size > MAX_FILE_SIZE) {
      setErrorMsg(t("upload.fileTooLarge"));
      return;
    }
    setFile(f);
    setErrorMsg("");
    setState("idle");
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) selectFile(f);
  }, []);

  const chunkCount = file ? Math.ceil(file.size / CHUNK_SIZE) : 0;
  const estimatedCompressedSize = file ? Math.round(file.size * 0.7) : 0;

  const handleUpload = async () => {
    if (!file) return;
    if (!webCryptoAvailable()) {
      setErrorMsg(WEB_CRYPTO_BLOCKED_MSG);
      setState("error");
      return;
    }
    setState("uploading");
    setErrorMsg("");

    const chunks: ChunkProgress[] = Array.from({ length: chunkCount }, (_, i) => ({
      index: i,
      status: "pending",
    }));
    setChunkProgress(chunks);

    try {
      // 1. Init upload
      const manifest = await filesApi.uploadInit(
        file.name,
        file.size,
        file.type || undefined,
        replication
      );

      // 2. Upload each chunk to nodes
      for (const item of manifest.chunks) {
        setChunkProgress((prev) =>
          prev.map((c) => (c.index === item.chunk_index ? { ...c, status: "uploading" } : c))
        );

        // Read chunk from file
        const start = item.chunk_index * CHUNK_SIZE;
        const end = Math.min(start + item.size_bytes, file.size);
        const blob = file.slice(start, end);
        const plaintext = await blob.arrayBuffer();

        // Parse IV and AES key from manifest
        const iv = Uint8Array.from(
          item.iv.match(/.{2}/g)!.map((h) => parseInt(h, 16))
        );
        const keyBytes = Uint8Array.from(
          item.aes_key_hex.match(/.{2}/g)!.map((h) => parseInt(h, 16))
        );

        // Import AES-256-GCM key
        const cryptoKey = await crypto.subtle.importKey(
          "raw",
          keyBytes,
          { name: "AES-GCM" },
          false,
          ["encrypt"]
        );

        // Compress (if beneficial) and encrypt chunk with AES-256-GCM
        const uploadPayload = await compressChunk(plaintext);
        const encryptedData = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          cryptoKey,
          uploadPayload
        );

        // Compute SHA-256 of the ciphertext (node stores & verifies this)
        const hashBuf = await crypto.subtle.digest("SHA-256", encryptedData);
        const sha256 = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        // Relay encrypted chunk via backend API (prevents HTTPS->HTTP mixed-content issues)
        await filesApi.uploadChunk(item.chunk_id, encryptedData, sha256);

        setChunkProgress((prev) =>
          prev.map((c) => (c.index === item.chunk_index ? { ...c, status: "done" } : c))
        );
        setProgress(Math.round(((item.chunk_index + 1) / manifest.chunks.length) * 100));
      }

      // 3. Complete upload
      await filesApi.uploadComplete(manifest.file_id);
      setState("done");
    } catch (err: unknown) {
      setErrorMsg(toErrorMessage(err, t("upload.uploadFailed")));
      setState("error");
      setChunkProgress((prev) =>
        prev.map((c) => (c.status === "uploading" ? { ...c, status: "error" } : c))
      );
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("upload.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("upload.maxSize")}</p>
      </div>

      {cryptoReady === false && (
        <div className="rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
          <strong className="mb-1 block text-amber-900 dark:text-amber-50">{t("upload.httpsRequiredTitle")}</strong>
          {WEB_CRYPTO_BLOCKED_MSG}
        </div>
      )}

      {/* Replication factor selection */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { value: 1 as 1, title: t("upload.planBasic"), desc: t("upload.planBasicDesc") },
          { value: 2 as 2, title: t("upload.planBalanced"), desc: t("upload.planBalancedDesc") },
          { value: 3 as 3, title: t("upload.planSafe"), desc: t("upload.planSafeDesc") },
        ].map((opt) => {
          const active = replication === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setReplication(opt.value)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                active
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/60 hover:bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold">{opt.title}</span>
                {active && <span className="text-xs text-primary font-medium">{t("upload.selected")}</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {opt.desc.replace(/^(\d)/, `${opt.value}`)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Drop zone */}
      {state === "idle" && (
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => inputRef.current?.click()}
          className={`
            relative cursor-pointer rounded-xl border-2 border-dashed p-12
            flex flex-col items-center gap-4 transition-colors
            ${dragOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-muted/20"}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) selectFile(f); }}
          />
          <Upload className="h-10 w-10 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">{t("upload.dropTitle")}</p>
            <p className="text-muted-foreground text-sm">{t("upload.dropSubtitle")}</p>
          </div>
        </div>
      )}

      {/* Selected file info */}
      {file && state !== "done" && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <FileIcon className="h-8 w-8 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-muted-foreground text-sm">
                  {formatBytes(file.size)} • {chunkCount} chunk
                </p>
                {file && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("upload.estimated", {
                      raw: formatBytes(file.size),
                      compressed: formatBytes(estimatedCompressedSize),
                    })}
                  </p>
                )}
              </div>
              {state === "idle" && (
                <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {state === "uploading" && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("upload.uploading")}</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} />
                <div className="flex flex-wrap gap-1 mt-2">
                  {chunkProgress.map((c) => (
                    <div
                      key={c.index}
                      className={`h-2 w-2 rounded-full ${
                        c.status === "done"
                          ? "bg-emerald-500"
                          : c.status === "uploading"
                          ? "bg-blue-500 animate-pulse"
                          : c.status === "error"
                          ? "bg-red-500"
                          : "bg-muted"
                      }`}
                      title={`Chunk ${c.index}: ${c.status}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMsg}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Success */}
      {state === "done" && (
        <Card className="border-emerald-200 bg-emerald-50/70 dark:border-emerald-600/30 dark:bg-emerald-950/20">
          <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <div>
              <p className="font-semibold text-lg">{t("upload.uploadDone")}</p>
              <p className="text-muted-foreground text-sm">{file?.name}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setFile(null); setState("idle"); setProgress(0); }}>
                {t("upload.newUpload")}
              </Button>
              <Button onClick={() => router.push("/dashboard")}>{t("upload.backDashboard")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload button */}
      {file && state === "idle" && (
        <Button
          className="w-full"
          onClick={handleUpload}
          disabled={cryptoReady === false}
        >
          <Upload className="h-4 w-4" />
          {t("upload.uploadStart")}
        </Button>
      )}

      {state === "uploading" && (
        <Button disabled className="w-full">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("upload.uploading")} {progress}%
        </Button>
      )}

      {state === "error" && (
        <Button variant="outline" className="w-full" onClick={handleUpload}>
          {t("upload.uploadRetry")}
        </Button>
      )}
    </div>
  );
}
