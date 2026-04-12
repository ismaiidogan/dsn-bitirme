package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/dsn/agent/internal/bandwidth"
	"github.com/dsn/agent/internal/config"
	"github.com/dsn/agent/internal/heartbeat"
	"github.com/dsn/agent/internal/server"
	"github.com/dsn/agent/internal/storage"
	"github.com/dsn/agent/internal/tray"
)

const version = "1.0.0"

func main() {
	cfgPath := flag.String("config", "config.yaml", "Path to config.yaml")
	noTray := flag.Bool("no-tray", false, "Run without system tray (headless mode)")
	flag.Parse()

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Register node if not already registered
	if cfg.NodeID == "" || cfg.NodeToken == "" {
		log.Println("Node not registered — registering with backend...")
		if err := registerNode(cfg, *cfgPath); err != nil {
			log.Fatalf("Registration failed: %v", err)
		}
	}

	// Initialise storage
	store, err := storage.New(cfg.StoragePath, cfg.QuotaBytes())
	if err != nil {
		log.Fatalf("Storage init failed: %v", err)
	}
	log.Printf("Storage: %s | used %.2f GB / %.2f GB quota",
		cfg.StoragePath,
		float64(store.UsedBytes())/(1<<30),
		float64(store.QuotaBytes())/(1<<30))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// HTTP chunk server
	var chunkServer *server.Server
	if cfg.TotalBandwidthMbps > 0 {
		// Shared token bucket: upload + download share total bandwidth
		shared := bandwidth.New(cfg.TotalBandwidthMbps)
		chunkServer = server.NewWithLimiters(store, cfg, *cfgPath, cfg.NodeToken, cfg.ServerURL, shared, shared)
	} else {
		// Legacy behaviour: per-direction limit (same value used for both)
		chunkServer = server.New(store, cfg, *cfgPath, cfg.NodeToken, cfg.ServerURL, cfg.BandwidthLimitMbps, cfg.BandwidthLimitMbps)
	}
	listenAddr := fmt.Sprintf(":%d", cfg.ListenPort)
	httpServer := &http.Server{Addr: listenAddr, Handler: chunkServer.Handler()}

	go func() {
		log.Printf("Chunk HTTP server listening on %s", listenAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("[http] server error: %v", err)
		}
	}()

	// Command handler for WebSocket messages from backend
	cmdHandler := func(msg map[string]any) {
		switch msg["type"] {
		case "delete_chunk":
			id, _ := msg["chunk_id"].(string)
			if err := store.Delete(id); err != nil {
				log.Printf("[cmd] delete chunk %s: %v", id, err)
			} else {
				log.Printf("[cmd] deleted chunk %s", id)
			}

		case "replicate_chunk":
			// Backend asks us (source) to push chunk to target node
			id, _ := msg["chunk_id"].(string)
			targetURL, _ := msg["target_node_url"].(string)
			targetToken, _ := msg["target_node_token"].(string)
			go replicateChunk(store, id, targetURL, targetToken)

		case "update_config":
			if mbps, ok := msg["bandwidth_limit_mbps"].(float64); ok {
				cfg.BandwidthLimitMbps = mbps
				config.Save(*cfgPath, cfg)
				log.Printf("[cmd] updated bandwidth limit to %.1f Mbps", mbps)
			}
		}
	}

	// WebSocket heartbeat service
	hb := heartbeat.New(cfg.ServerURL, cfg.NodeID, cfg.NodeToken, store, cmdHandler)
	go hb.Run(ctx)

	// Verify worker (daily SHA-256 check)
	storage.StartVerifyWorker(store, cfg.ServerURL, cfg.NodeToken)

	// Graceful shutdown on SIGINT/SIGTERM
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	// System tray (runs on main goroutine on macOS)
	if !*noTray {
		tr := tray.New(
			&agentStatus{hb: hb, store: store},
			func() { log.Println("paused") },
			func() { log.Println("resumed") },
			func() { cancel(); httpServer.Shutdown(ctx) },
		)
		go func() {
			<-sigCh
			cancel()
			httpServer.Shutdown(ctx)
		}()
		tr.Run() // blocks until tray quit
	} else {
		log.Printf("DSN Agent v%s running (headless). Press Ctrl+C to stop.", version)
		<-sigCh
		log.Println("Shutting down...")
		cancel()
		httpServer.Shutdown(ctx)
	}
}

// agentStatus bridges heartbeat.Service and storage.Manager for the tray.
type agentStatus struct {
	hb    *heartbeat.Service
	store *storage.Manager
}

func (a *agentStatus) IsConnected() bool { return a.hb.IsConnected() }
func (a *agentStatus) UsedBytes() int64  { return a.store.UsedBytes() }
func (a *agentStatus) QuotaBytes() int64 { return a.store.QuotaBytes() }

// registerNode calls POST /api/v1/nodes/register using the user JWT in config.
func registerNode(cfg *config.Config, cfgPath string) error {
	// Determine our external address (best effort)
	addr, err := externalAddr()
	if err != nil {
		addr = "127.0.0.1"
	}

	body, _ := json.Marshal(map[string]any{
		"address":  addr,
		"port":     cfg.ListenPort,
		"quota_gb": cfg.QuotaGB,
		"name":     hostname(),
	})

	req, err := http.NewRequest(http.MethodPost,
		cfg.ServerURL+"/api/v1/nodes/register",
		bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.AuthToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("registration HTTP %d", resp.StatusCode)
	}

	var result struct {
		Node      struct{ ID string `json:"id"` } `json:"node"`
		NodeToken string                           `json:"node_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}

	cfg.NodeID = result.Node.ID
	cfg.NodeToken = result.NodeToken
	if err := config.Save(cfgPath, cfg); err != nil {
		log.Printf("Warning: could not save config: %v", err)
	}
	log.Printf("Registered as node %s", cfg.NodeID)
	return nil
}

func replicateChunk(store *storage.Manager, chunkID, targetURL, targetToken string) {
	data, err := store.Get(chunkID)
	if err != nil {
		log.Printf("[replicate] get chunk %s: %v", chunkID, err)
		return
	}

	req, err := http.NewRequest(http.MethodPut,
		fmt.Sprintf("%s/chunks/%s", targetURL, chunkID),
		bytes.NewReader(data))
	if err != nil {
		log.Printf("[replicate] build request: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("Authorization", "Bearer "+targetToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[replicate] send chunk %s: %v", chunkID, err)
		return
	}
	defer resp.Body.Close()
	log.Printf("[replicate] chunk %s → %s: HTTP %d", chunkID, targetURL, resp.StatusCode)
}

func externalAddr() (string, error) {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "", err
	}
	defer conn.Close()
	return conn.LocalAddr().(*net.UDPAddr).IP.String(), nil
}

func hostname() string {
	h, _ := os.Hostname()
	return h
}
