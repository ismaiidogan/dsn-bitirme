// In-memory access token store (never localStorage)
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface ReplicationStatus {
  active: number;
  total: number;
  health: "full" | "partial" | "critical";
}

export interface FileItem {
  id: string;
  original_name: string;
  size_bytes: number;
  mime_type: string | null;
  chunk_count: number;
   replication_factor: number;
  status: string;
  created_at: string;
  replication: ReplicationStatus | null;
}

export interface ChunkReplicaInfo {
  replica_id: string;
  node_id: string;
  node_address: string;
  node_port: number;
  node_status: string;
  replica_status: string;
}

export interface ChunkInfo {
  chunk_id: string;
  chunk_index: number;
  size_bytes: number;
  sha256_hash: string;
  replicas: ChunkReplicaInfo[];
}

export interface FileDetail extends FileItem {
  chunks: ChunkInfo[];
}

export interface ChunkManifestItem {
  chunk_index: number;
  chunk_id: string;
  size_bytes: number;
  iv: string;
  aes_key_hex: string;
  node_urls: string[];
  node_tokens: string[];
}

export interface UploadManifest {
  file_id: string;
  chunks: ChunkManifestItem[];
}

export interface NodeItem {
  id: string;
  name: string | null;
  address: string;
  port: number;
  quota_bytes: number;
  used_bytes: number;
  disk_free_bytes: number | null;
  status: string;
  last_heartbeat_at: string | null;
  registered_at: string;
}

// ─── Core fetch helper ──────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`/api/v1${path}`, { ...options, headers, credentials: "include" });

  // Auto-refresh on 401
  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiFetch<T>(path, options, false);
    }
    setAccessToken(null);
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.detail ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
    if (!res.ok) return false;
    const data: TokenResponse = await res.json();
    setAccessToken(data.access_token);
    return true;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export const auth = {
  register: (email: string, password: string) =>
    apiFetch<TokenResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    apiFetch<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    apiFetch<void>("/auth/logout", { method: "POST" }),

  refresh: () =>
    apiFetch<TokenResponse>("/auth/refresh", { method: "POST" }),

  me: () =>
    apiFetch<{ id: string; email: string }>("/auth/me"),
};

// ─── Files ──────────────────────────────────────────────────────────────────

export const files = {
  list: () => apiFetch<FileItem[]>("/files"),

  get: (id: string) => apiFetch<FileDetail>(`/files/${id}`),

  uploadInit: (
    filename: string,
    size_bytes: number,
    mime_type?: string,
    replication_factor: number = 3
  ) =>
    apiFetch<UploadManifest>("/files/upload/init", {
      method: "POST",
      body: JSON.stringify({ filename, size_bytes, mime_type, replication_factor }),
    }),

  uploadComplete: (file_id: string) =>
    apiFetch<FileItem>("/files/upload/complete", {
      method: "POST",
      body: JSON.stringify({ file_id }),
    }),

  downloadManifest: (id: string) =>
    apiFetch<{
      file_id: string;
      filename: string;
      size_bytes: number;
      aes_key_hex: string;
      chunks: { chunk_index: number; chunk_id: string; iv: string; sha256_hash: string; node_url: string; node_token: string }[];
    }>(`/files/${id}/download-manifest`),

  delete: (id: string) =>
    apiFetch<void>(`/files/${id}`, { method: "DELETE" }),
};

// ─── Nodes ──────────────────────────────────────────────────────────────────

export const nodes = {
  list: () => apiFetch<NodeItem[]>("/nodes/my"),

  register: (data: { name?: string; address: string; port: number; quota_gb: number }) =>
    apiFetch<{ node: NodeItem; node_token: string }>("/nodes/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/nodes/${id}`, { method: "DELETE" }),
};

// ─── Chunk upload helper ─────────────────────────────────────────────────────

export async function uploadChunkToNode(
  nodeUrl: string,
  chunkId: string,
  encryptedData: ArrayBuffer,
  sha256Hash: string,
  nodeToken?: string
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "X-Chunk-Hash": sha256Hash,
    "X-Chunk-Size": encryptedData.byteLength.toString(),
  };
  if (nodeToken) headers["Authorization"] = `Bearer ${nodeToken}`;

  const res = await fetch(`${nodeUrl}/chunks/${chunkId}`, {
    method: "PUT",
    headers,
    body: encryptedData,
  });
  if (!res.ok) throw new Error(`Node ${nodeUrl} rejected chunk: ${res.status}`);
}
