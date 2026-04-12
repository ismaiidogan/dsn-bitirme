package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	ServerURL          string  `yaml:"server_url"`
	AuthToken          string  `yaml:"auth_token"`
	StoragePath        string  `yaml:"storage_path"`
	QuotaGB            float64 `yaml:"quota_gb"`
	BandwidthLimitMbps float64 `yaml:"bandwidth_limit_mbps"`        // 0 = unlimited (legacy per-direction)
	TotalBandwidthMbps float64 `yaml:"total_bandwidth_limit_mbps"` // 0 = unlimited; when >0 shared bucket is used
	ListenPort         int     `yaml:"listen_port"`           // default 7777
	NodeID             string  `yaml:"node_id"`               // filled after registration
	NodeToken          string  `yaml:"node_token"`            // filled after registration
}

func (c *Config) QuotaBytes() int64 {
	return int64(c.QuotaGB * 1024 * 1024 * 1024)
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading config: %w", err)
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing config: %w", err)
	}
	if cfg.ListenPort == 0 {
		cfg.ListenPort = 7777
	}
	return &cfg, nil
}

func Save(path string, cfg *Config) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}
