// Package bandwidth implements a token-bucket rate limiter for network I/O.
package bandwidth

import (
	"io"
	"sync"
	"time"
)

// Limiter is a token-bucket bandwidth limiter.
// A zero value (or nil pointer) means unlimited throughput.
type Limiter struct {
	mu        sync.Mutex
	tokens    float64
	maxTokens float64  // bucket capacity in bytes
	rate      float64  // bytes per nanosecond
	lastFill  time.Time
}

// New creates a Limiter with the given rate in Mbps.
// If mbps == 0, the limiter is a no-op.
func New(mbps float64) *Limiter {
	if mbps <= 0 {
		return nil
	}
	bytesPerSec := mbps * 1024 * 1024 / 8
	return &Limiter{
		rate:      bytesPerSec / 1e9, // bytes per nanosecond
		maxTokens: bytesPerSec,       // 1 second burst
		tokens:    bytesPerSec,
		lastFill:  time.Now(),
	}
}

// Wait blocks until n bytes can be transmitted, then consumes the tokens.
func (l *Limiter) Wait(n int) {
	if l == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	// Refill tokens based on elapsed time
	now := time.Now()
	elapsed := now.Sub(l.lastFill)
	l.lastFill = now
	l.tokens += float64(elapsed.Nanoseconds()) * l.rate
	if l.tokens > l.maxTokens {
		l.tokens = l.maxTokens
	}

	need := float64(n)
	if l.tokens >= need {
		l.tokens -= need
		return
	}

	// Calculate sleep time for remaining tokens
	deficit := need - l.tokens
	sleepNs := deficit / l.rate
	l.tokens = 0
	l.mu.Unlock()
	time.Sleep(time.Duration(sleepNs))
	l.mu.Lock()
}

// Reader wraps an io.Reader and applies the rate limit on reads.
type Reader struct {
	r       io.Reader
	limiter *Limiter
}

// NewReader returns a rate-limited reader. If limiter is nil, reads are unlimited.
func NewReader(r io.Reader, limiter *Limiter) io.Reader {
	if limiter == nil {
		return r
	}
	return &Reader{r: r, limiter: limiter}
}

func (r *Reader) Read(p []byte) (int, error) {
	n, err := r.r.Read(p)
	if n > 0 {
		r.limiter.Wait(n)
	}
	return n, err
}

// Writer wraps an io.Writer and applies the rate limit on writes.
type Writer struct {
	w       io.Writer
	limiter *Limiter
}

// NewWriter returns a rate-limited writer.
func NewWriter(w io.Writer, limiter *Limiter) io.Writer {
	if limiter == nil {
		return w
	}
	return &Writer{w: w, limiter: limiter}
}

func (w *Writer) Write(p []byte) (int, error) {
	w.limiter.Wait(len(p))
	return w.w.Write(p)
}
