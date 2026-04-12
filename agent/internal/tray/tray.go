// Package tray provides system tray integration via fyne-io/systray.
package tray

import (
	"fmt"
	"log"
	"os/exec"

	"fyne.io/systray"
)

// StatusProvider is implemented by the agent to report its current state.
type StatusProvider interface {
	IsConnected() bool
	UsedBytes() int64
	QuotaBytes() int64
}

type Tray struct {
	status   StatusProvider
	onPause  func()
	onResume func()
	onQuit   func()
	paused   bool
}

// New creates a Tray instance.
func New(status StatusProvider, onPause, onResume, onQuit func()) *Tray {
	return &Tray{
		status:   status,
		onPause:  onPause,
		onResume: onResume,
		onQuit:   onQuit,
	}
}

// Run starts the system tray (blocks until quit).
func (t *Tray) Run() {
	systray.Run(t.onReady, t.onExit)
}

func (t *Tray) onReady() {
	systray.SetTitle("DSN Agent")
	systray.SetTooltip("DSN — Distributed Storage Node")

	// Use a simple unicode character as icon placeholder
	// In production, embed an .ico/.png via systray.SetIcon(iconBytes)

	mStatus := systray.AddMenuItem("● Bağlanıyor...", "Bağlantı durumu")
	mStatus.Disable()

	systray.AddSeparator()

	mDashboard := systray.AddMenuItem("Dashboard Aç", "Yerel dashboard'u tarayıcıda aç")

	systray.AddSeparator()

	mPause := systray.AddMenuItem("Duraklat", "Chunk transferlerini durdur")
	mResume := systray.AddMenuItem("Devam Et", "Chunk transferlerine devam et")
	mResume.Hide()

	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Çıkış", "Agent'ı kapat")

	// Background goroutine to update status
	go func() {
		for {
			if t.status.IsConnected() {
				used := float64(t.status.UsedBytes()) / (1024 * 1024 * 1024)
				quota := float64(t.status.QuotaBytes()) / (1024 * 1024 * 1024)
				mStatus.SetTitle(fmt.Sprintf("● Bağlı — %.1f/%.1f GB", used, quota))
				systray.SetTooltip(fmt.Sprintf("DSN: %.1f / %.1f GB", used, quota))
			} else {
				mStatus.SetTitle("○ Bağlantı yok")
				systray.SetTooltip("DSN: bağlantı yok")
			}
		}
	}()

	for {
		select {
		case <-mDashboard.ClickedCh:
			// Best-effort: open http://localhost:7777 on the host
			exec.Command("cmd", "/C", "start", "http://localhost:7777").Start()

		case <-mPause.ClickedCh:
			t.paused = true
			mPause.Hide()
			mResume.Show()
			if t.onPause != nil {
				t.onPause()
			}
			log.Println("[tray] paused")

		case <-mResume.ClickedCh:
			t.paused = false
			mResume.Hide()
			mPause.Show()
			if t.onResume != nil {
				t.onResume()
			}
			log.Println("[tray] resumed")

		case <-mQuit.ClickedCh:
			systray.Quit()
			if t.onQuit != nil {
				t.onQuit()
			}
			return
		}
	}
}

func (t *Tray) onExit() {
	log.Println("[tray] exiting")
}
