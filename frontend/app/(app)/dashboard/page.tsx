"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload, Trash2, Eye, RefreshCw, Loader2 } from "lucide-react";
import { files as filesApi, FileItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { toErrorMessage } from "@/lib/errors";

function ReplicationBadge({ replication }: { replication: FileItem["replication"] }) {
  if (!replication) return <Badge variant="outline">—</Badge>;
  const { active, total, health } = replication;

  if (health === "full") {
    return (
      <Badge variant="success">
        Tüm {total} kopya aktif
      </Badge>
    );
  }

  if (health === "partial") {
    const offline = Math.max(total - active, 0);
    return (
      <Badge variant="warning">
        {active} cihazda aktif, {offline} cihaz çevrimdışı
      </Badge>
    );
  }

  return (
    <Badge variant="danger">
      Hiçbir kopya aktif değil
    </Badge>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setFileList(await filesApi.list());
    } catch {
      setLoadError("Dosyalar yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Bu dosyayı silmek istediğinizden emin misiniz?")) return;
    setDeleting(id);
    try {
      await filesApi.delete(id);
      setFileList((prev) => prev.filter((f) => f.id !== id));
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, "Silme başarısız"));
    }
    setDeleting(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dosyalarım</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {fileList.length} dosya • Tüm replikasyonlar
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={load} title="Yenile">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => router.push("/upload")}>
            <Upload className="h-4 w-4" />
            Dosya Yükle
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <p className="text-sm text-red-400">{loadError}</p>
          <Button variant="outline" onClick={load}>
            Tekrar Dene
          </Button>
        </div>
      ) : fileList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <Upload className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Henüz dosya yüklemediniz.</p>
          <Button onClick={() => router.push("/upload")}>İlk Dosyanı Yükle</Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Dosya Adı</th>
                <th className="px-4 py-3 font-medium">Boyut</th>
                <th className="px-4 py-3 font-medium">Chunk</th>
                <th className="px-4 py-3 font-medium">Kopya Sayısı</th>
                <th className="px-4 py-3 font-medium">Replikasyon Durumu</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 font-medium">Yükleme Tarihi</th>
                <th className="px-4 py-3 font-medium w-24">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fileList.map((file) => (
                <tr key={file.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium max-w-xs truncate" title={file.original_name}>
                    {file.original_name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatBytes(file.size_bytes)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{file.chunk_count}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {file.replication_factor} Kopya
                  </td>
                  <td className="px-4 py-3">
                    <ReplicationBadge replication={file.replication} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={file.status === "active" ? "success" : "secondary"}>
                      {file.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(file.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" asChild title="Detay">
                        <Link href={`/files/${file.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Sil"
                        disabled={deleting === file.id}
                        onClick={() => handleDelete(file.id)}
                        className="hover:text-destructive"
                      >
                        {deleting === file.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
