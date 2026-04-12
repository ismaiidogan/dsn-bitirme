// Package server exposes the HTTP chunk API that the backend (and other nodes) call.
package server

import (
	"bytes"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync/atomic"

	"github.com/dsn/agent/internal/bandwidth"
	"github.com/dsn/agent/internal/config"
	"github.com/dsn/agent/internal/storage"
)

//go:embed dashboard.html
var dashboardHTML string

type Server struct {
	store     *storage.Manager
	nodeToken string
	upLimiter *bandwidth.Limiter
	dlLimiter *bandwidth.Limiter
	serverURL string // backend URL, for confirming chunks
	cfg       *config.Config
	cfgPath   string

	uploadToday   atomic.Int64
	downloadToday atomic.Int64
}

// New creates a new chunk HTTP server with independent upload/download limiters.
// upMbps / dlMbps: 0 means unlimited.
func New(store *storage.Manager, cfg *config.Config, cfgPath string, nodeToken, serverURL string, upMbps, dlMbps float64) *Server {
	return NewWithLimiters(
		store,
		cfg,
		cfgPath,
		nodeToken,
		serverURL,
		bandwidth.New(upMbps),
		bandwidth.New(dlMbps),
	)
}

// NewWithLimiters creates a server using the provided limiters.
// If up == down (same pointer), upload + download share a single token bucket.
func NewWithLimiters(
	store *storage.Manager,
	cfg *config.Config,
	cfgPath, nodeToken, serverURL string,
	up, down *bandwidth.Limiter,
) *Server {
	return &Server{
		store:     store,
		nodeToken: nodeToken,
		serverURL: serverURL,
		upLimiter: up,
		dlLimiter: down,
		cfg:       cfg,
		cfgPath:   cfgPath,
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleDashboard)
	mux.HandleFunc("/api/stats", s.handleStats)
	mux.HandleFunc("/api/settings", s.handleSettings)
	mux.HandleFunc("/health", s.withCORS(s.handleHealth))
	mux.HandleFunc("/chunks/", s.withCORS(s.routeChunk))
	return mux
}

// withCORS wraps handlers that are called from the browser (localhost:3000)
// so that cross-origin requests to the agent (localhost:7777) succeed.
func (s *Server) withCORS(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Chunk-Hash, X-Chunk-Size")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		h(w, r)
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status":     "ok",
		"used_bytes": s.store.UsedBytes(),
		"free_bytes": s.store.DiskFreeBytes(),
	})
}

func (s *Server) routeChunk(w http.ResponseWriter, r *http.Request) {
	if !s.authenticate(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Path: /chunks/{chunk_id}  or  /chunks/{chunk_id}/verify
	path := strings.TrimPrefix(r.URL.Path, "/chunks/")
	parts := strings.SplitN(path, "/", 2)
	chunkID := parts[0]
	if chunkID == "" {
		http.Error(w, "missing chunk id", http.StatusBadRequest)
		return
	}

	action := ""
	if len(parts) == 2 {
		action = parts[1]
	}

	switch {
	case action == "verify" && r.Method == http.MethodGet:
		s.handleVerify(w, r, chunkID)
	case r.Method == http.MethodPut && action == "":
		s.handlePut(w, r, chunkID)
	case r.Method == http.MethodGet && action == "":
		s.handleGet(w, r, chunkID)
	case r.Method == http.MethodDelete && action == "":
		s.handleDelete(w, r, chunkID)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// Max chunk body size (backend CHUNK_SIZE_BYTES + margin for padding/overhead)
const maxChunkBodyBytes = 20 * 1024 * 1024 // 20 MB

func (s *Server) handlePut(w http.ResponseWriter, r *http.Request, chunkID string) {
	expectedHash := r.Header.Get("X-Chunk-Hash")

	// Enforce max body size to avoid OOM
	limitedBody := io.LimitReader(r.Body, maxChunkBodyBytes)
	// Apply upload bandwidth limit
	limitedReader := bandwidth.NewReader(limitedBody, s.upLimiter)
	data, err := io.ReadAll(limitedReader)
	if err != nil {
		http.Error(w, "read error", http.StatusInternalServerError)
		return
	}
	if int64(len(data)) >= maxChunkBodyBytes {
		http.Error(w, "chunk body too large", http.StatusRequestEntityTooLarge)
		return
	}

	// Verify SHA-256 if provided
	if expectedHash != "" {
		h := sha256.Sum256(data)
		actual := hex.EncodeToString(h[:])
		if actual != strings.ToLower(expectedHash) {
			http.Error(w, fmt.Sprintf("hash mismatch: expected %s got %s", expectedHash, actual), http.StatusBadRequest)
			return
		}
	}

	storedHash, err := s.store.Store(chunkID, data)
	if err != nil {
		if strings.Contains(err.Error(), "quota") {
			http.Error(w, err.Error(), http.StatusInsufficientStorage)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	s.uploadToday.Add(int64(len(data)))

	// Confirm to backend
	go s.confirmChunk(chunkID, storedHash, len(data))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status":   "stored",
		"chunk_id": chunkID,
		"verified": true,
	})
}

func (s *Server) handleGet(w http.ResponseWriter, r *http.Request, chunkID string) {
	data, err := s.store.Get(chunkID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	s.downloadToday.Add(int64(len(data)))

	w.Header().Set("Content-Type", "application/octet-stream")
	limitedWriter := bandwidth.NewWriter(w, s.dlLimiter)
	limitedWriter.Write(data)
}

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request, chunkID string) {
	if err := s.store.Delete(chunkID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleVerify(w http.ResponseWriter, r *http.Request, chunkID string) {
	hash, err := s.store.Verify(chunkID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"chunk_id": chunkID,
		"sha256":   hash,
	})
}

func (s *Server) authenticate(r *http.Request) bool {
	if s.nodeToken == "" {
		return true // dev mode: no auth
	}
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return false
	}
	// For now, accept any Bearer token when nodeToken is set.
	// The backend already validates node tokens on its side.
	return strings.HasPrefix(auth, "Bearer ")
}

func (s *Server) confirmChunk(chunkID, sha256Hash string, sizeBytes int) {
	body, _ := json.Marshal(map[string]any{
		"sha256_hash": sha256Hash,
		"size_bytes":  sizeBytes,
	})
	req, err := http.NewRequest(http.MethodPost,
		fmt.Sprintf("%s/api/v1/chunks/%s/confirm", s.serverURL, chunkID),
		bytes.NewReader(body))
	if err != nil {
		log.Printf("[server] confirm chunk %s: %v", chunkID, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.nodeToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[server] confirm chunk %s: %v", chunkID, err)
		return
	}
	defer resp.Body.Close()
	log.Printf("[server] confirmed chunk %s → %d", chunkID, resp.StatusCode)
}

func (s *Server) handleDashboard(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, dashboardHTML)
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	stats := map[string]any{
		"used_bytes":      s.store.UsedBytes(),
		"quota_bytes":     s.store.QuotaBytes(),
		"bandwidth_limit_mbps": s.cfg.BandwidthLimitMbps,
		"disk_free_bytes": s.store.DiskFreeBytes(),
		"disk_total":      s.store.DiskTotalBytes(),
		"chunk_count":     s.store.ChunkCount(),
		"upload_today":    s.uploadToday.Load(),
		"download_today":  s.downloadToday.Load(),
	}
	json.NewEncoder(w).Encode(stats)
}

type settingsPayload struct {
	QuotaGB            float64 `json:"quota_gb"`
	BandwidthLimitMbps float64 `json:"bandwidth_limit_mbps"`
}

// POST /api/settings updates quota and bandwidth limit at runtime.
func (s *Server) handleSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body settingsPayload
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	if body.QuotaGB <= 0 {
		http.Error(w, "quota_gb must be > 0", http.StatusBadRequest)
		return
	}
	if body.BandwidthLimitMbps < 0 {
		http.Error(w, "bandwidth_limit_mbps must be >= 0", http.StatusBadRequest)
		return
	}

	newQuotaBytes := int64(body.QuotaGB * 1024 * 1024 * 1024)

	// En fazla boş alanın %80'i kadar kota verilebilir; mevcut kullanımın altına düşemez.
	freeBytes := s.store.DiskFreeBytes()
	maxAllowed := int64(float64(freeBytes) * 0.80)
	usedBytes := s.store.UsedBytes()
	if maxAllowed < usedBytes {
		maxAllowed = usedBytes
	}
	if newQuotaBytes > maxAllowed {
		gb := maxAllowed / (1024 * 1024 * 1024)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintf(w, `{"error":"En fazla %d GB ayırabilirsiniz"}`, gb)
		return
	}

	s.store.SetQuotaBytes(newQuotaBytes)

	// Update limiters: use shared bucket for both directions.
	if body.BandwidthLimitMbps == 0 {
		s.upLimiter = nil
		s.dlLimiter = nil
		s.cfg.BandwidthLimitMbps = 0
		s.cfg.TotalBandwidthMbps = 0
	} else {
		shared := bandwidth.New(body.BandwidthLimitMbps)
		s.upLimiter = shared
		s.dlLimiter = shared
		s.cfg.BandwidthLimitMbps = body.BandwidthLimitMbps
		s.cfg.TotalBandwidthMbps = body.BandwidthLimitMbps
	}
	s.cfg.QuotaGB = body.QuotaGB

	if err := config.Save(s.cfgPath, s.cfg); err != nil {
		log.Printf("[settings] failed to save config: %v", err)
		http.Error(w, "config save failed", http.StatusInternalServerError)
		return
	}

	// Notify backend about new quota / bandwidth.
	if s.cfg.NodeID != "" && s.serverURL != "" {
		patchBody, _ := json.Marshal(map[string]any{
			"quota_bytes":           newQuotaBytes,
			"bandwidth_limit_mbps":  body.BandwidthLimitMbps,
		})
		req, err := http.NewRequest(http.MethodPatch,
			fmt.Sprintf("%s/api/v1/nodes/%s", s.serverURL, s.cfg.NodeID),
			bytes.NewReader(patchBody))
		if err != nil {
			log.Printf("[settings] build PATCH request: %v", err)
		} else {
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+s.nodeToken)
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				log.Printf("[settings] PATCH node: %v", err)
			} else {
				resp.Body.Close()
				if resp.StatusCode >= 300 {
					log.Printf("[settings] PATCH node HTTP %d", resp.StatusCode)
				}
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status":                "ok",
		"quota_gb":              body.QuotaGB,
		"bandwidth_limit_mbps":  body.BandwidthLimitMbps,
	})
}
