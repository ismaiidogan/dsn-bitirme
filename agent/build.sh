#!/usr/bin/env bash
# Cross-platform build script for DSN Agent
set -e

OUT="dist"
mkdir -p "$OUT"

echo "Building DSN Agent..."

# Windows
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o "$OUT/dsn-agent.exe" ./cmd/agent
echo "  ✓ $OUT/dsn-agent.exe"

# macOS Intel
GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o "$OUT/dsn-agent-mac-intel" ./cmd/agent
echo "  ✓ $OUT/dsn-agent-mac-intel"

# macOS Apple Silicon
GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o "$OUT/dsn-agent-mac-arm64" ./cmd/agent
echo "  ✓ $OUT/dsn-agent-mac-arm64"

# Linux
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o "$OUT/dsn-agent-linux" ./cmd/agent
echo "  ✓ $OUT/dsn-agent-linux"

echo "Done. Binaries in $OUT/"
