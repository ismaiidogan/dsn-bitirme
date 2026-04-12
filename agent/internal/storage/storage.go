// Package storage manages chunk files on disk with quota enforcement.
package storage

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
)

// Manager handles chunk persistence and quota tracking.
type Manager struct {
	basePath   string
	quotaBytes int64
	usedBytes  atomic.Int64
	mu         sync.RWMutex
}

// New creates a Manager and initialises usedBytes by scanning existing files.
func New(basePath string, quotaBytes int64) (*Manager, error) {
	if err := os.MkdirAll(basePath, 0755); err != nil {
		return nil, fmt.Errorf("creating storage dir: %w", err)
	}
	m := &Manager{basePath: basePath, quotaBytes: quotaBytes}
	if err := m.recomputeUsed(); err != nil {
		return nil, err
	}
	return m, nil
}

func (m *Manager) chunkPath(chunkID string) string {
	// Use first 2 chars as a subdirectory to avoid huge flat dirs
	if len(chunkID) >= 2 {
		return filepath.Join(m.basePath, chunkID[:2], chunkID)
	}
	return filepath.Join(m.basePath, chunkID)
}

// Store writes encrypted chunk data to disk.
// Returns sha256 hex of the stored bytes and any error.
func (m *Manager) Store(chunkID string, data []byte) (sha256Hex string, err error) {
	size := int64(len(data))
	if m.usedBytes.Load()+size > m.quotaBytes {
		return "", fmt.Errorf("quota exceeded: used=%d quota=%d", m.usedBytes.Load(), m.quotaBytes)
	}

	path := m.chunkPath(chunkID)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return "", err
	}

	// Write atomically via temp file
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return "", err
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return "", err
	}

	m.usedBytes.Add(size)

	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:]), nil
}

// Get reads a chunk from disk.
func (m *Manager) Get(chunkID string) ([]byte, error) {
	path := m.chunkPath(chunkID)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("chunk not found: %s", chunkID)
		}
		return nil, err
	}
	return data, nil
}

// Delete removes a chunk from disk and updates usedBytes.
func (m *Manager) Delete(chunkID string) error {
	path := m.chunkPath(chunkID)
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // already gone, idempotent
		}
		return err
	}
	size := info.Size()
	if err := os.Remove(path); err != nil {
		return err
	}
	m.usedBytes.Add(-size)
	return nil
}

// Verify computes the SHA-256 of the stored chunk and returns it.
func (m *Manager) Verify(chunkID string) (string, error) {
	data, err := m.Get(chunkID)
	if err != nil {
		return "", err
	}
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:]), nil
}

// UsedBytes returns the current disk usage in bytes.
func (m *Manager) UsedBytes() int64 { return m.usedBytes.Load() }

// QuotaBytes returns the configured quota.
func (m *Manager) QuotaBytes() int64 { return m.quotaBytes }

// SetQuotaBytes updates the configured quota at runtime.
func (m *Manager) SetQuotaBytes(q int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.quotaBytes = q
}

// ListChunks returns all chunk IDs stored on disk.
func (m *Manager) ListChunks() ([]string, error) {
	var ids []string
	err := filepath.Walk(m.basePath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		// Skip temp files
		if filepath.Ext(path) == ".tmp" {
			return nil
		}
		ids = append(ids, info.Name())
		return nil
	})
	return ids, err
}

func (m *Manager) recomputeUsed() error {
	var total int64
	err := filepath.Walk(m.basePath, func(_ string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || filepath.Ext(info.Name()) == ".tmp" {
			return err
		}
		total += info.Size()
		return nil
	})
	if err != nil {
		return err
	}
	m.usedBytes.Store(total)
	return nil
}

// DiskFreeBytes returns approximate free disk space at basePath.
func (m *Manager) DiskFreeBytes() int64 {
	return diskFreeBytes(m.basePath)
}

// DiskTotalBytes returns the total physical disk size at basePath.
func (m *Manager) DiskTotalBytes() int64 {
	return diskTotalBytes(m.basePath)
}

// ChunkCount returns the number of stored chunks (best-effort).
func (m *Manager) ChunkCount() int {
	ids, err := m.ListChunks()
	if err != nil {
		return 0
	}
	return len(ids)
}
