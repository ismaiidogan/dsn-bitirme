// Package heartbeat manages the WebSocket connection to the backend control plane.
package heartbeat

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/dsn/agent/internal/storage"
)

const (
	heartbeatInterval = 30 * time.Second
	maxBackoff        = 5 * time.Minute
	writeTimeout      = 10 * time.Second
)

// CommandHandler is called when the backend sends a control message to the agent.
type CommandHandler func(msg map[string]any)

// Service manages the WebSocket lifecycle.
type Service struct {
	serverURL  string
	nodeID     string
	nodeToken  string
	store      *storage.Manager
	onCommand  CommandHandler
	statusMu   sync.RWMutex
	connected  bool
}

// New creates a new heartbeat service.
func New(serverURL, nodeID, nodeToken string, store *storage.Manager, onCommand CommandHandler) *Service {
	return &Service{
		serverURL: serverURL,
		nodeID:    nodeID,
		nodeToken: nodeToken,
		store:     store,
		onCommand: onCommand,
	}
}

// Run starts the heartbeat loop and blocks until ctx is cancelled.
func (s *Service) Run(ctx context.Context) {
	attempt := 0
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if err := s.connect(ctx); err != nil {
			log.Printf("[heartbeat] connection error: %v", err)
		}

		s.setConnected(false)
		backoff := backoffDuration(attempt)
		attempt++
		log.Printf("[heartbeat] reconnecting in %v (attempt %d)", backoff, attempt)

		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
	}
}

func (s *Service) connect(ctx context.Context) error {
	wsURL := buildWSURL(s.serverURL, s.nodeID, s.nodeToken)
	log.Printf("[heartbeat] connecting to %s", wsURL)

	conn, _, err := websocket.DefaultDialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	s.setConnected(true)
	log.Printf("[heartbeat] connected")

	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	// Read incoming server→agent commands in a separate goroutine.
	// errCh is buffered so the goroutine never blocks on write.
	errCh := make(chan error, 1)
	go s.handleIncoming(conn, errCh)

	// Send first heartbeat immediately
	if err := s.sendHeartbeat(conn); err != nil {
		return err
	}

	for {
		select {
		case <-ctx.Done():
			conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			return nil

		case err := <-errCh:
			return fmt.Errorf("read: %w", err)

		case <-ticker.C:
			if err := s.sendHeartbeat(conn); err != nil {
				return fmt.Errorf("heartbeat: %w", err)
			}
		}
	}
}

func (s *Service) sendHeartbeat(conn *websocket.Conn) error {
	chunkIDs, _ := s.store.ListChunks()
	msg := map[string]any{
		"type":             "heartbeat",
		"node_id":          s.nodeID,
		"timestamp":        time.Now().UTC().Format(time.RFC3339),
		"disk_free_bytes":  s.store.DiskFreeBytes(),
		"disk_total_bytes": s.store.DiskTotalBytes(),
		"used_quota_bytes": s.store.UsedBytes(),
		"chunk_count":      len(chunkIDs),
		"status":           "active",
	}
	conn.SetWriteDeadline(time.Now().Add(writeTimeout))
	return conn.WriteJSON(msg)
}

// handleIncoming reads server→agent messages in a goroutine.
func (s *Service) handleIncoming(conn *websocket.Conn, errCh chan<- error) {
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			errCh <- err
			return
		}
		var msg map[string]any
		if err := json.Unmarshal(raw, &msg); err != nil {
			log.Printf("[heartbeat] bad message: %v", err)
			continue
		}
		log.Printf("[heartbeat] received command: %v", msg["type"])
		if s.onCommand != nil {
			go s.onCommand(msg)
		}
	}
}

func (s *Service) IsConnected() bool {
	s.statusMu.RLock()
	defer s.statusMu.RUnlock()
	return s.connected
}

func (s *Service) setConnected(v bool) {
	s.statusMu.Lock()
	s.connected = v
	s.statusMu.Unlock()
}

func buildWSURL(serverURL, nodeID, nodeToken string) string {
	u, _ := url.Parse(serverURL)
	switch u.Scheme {
	case "https":
		u.Scheme = "wss"
	default:
		u.Scheme = "ws"
	}
	u.Path = fmt.Sprintf("/api/v1/nodes/%s/ws", nodeID)
	q := u.Query()
	q.Set("token", nodeToken)
	u.RawQuery = q.Encode()
	return u.String()
}

func backoffDuration(attempt int) time.Duration {
	seconds := math.Pow(2, float64(attempt)) // 1, 2, 4, 8, 16, 32, 64 …
	d := time.Duration(seconds) * time.Second
	if d > maxBackoff {
		d = maxBackoff
	}
	return d
}
