.PHONY: run build vet lint seed clean tidy check-tesseract \
        build-mac-arm64 build-mac-amd64 build-mac-universal

# ---------------------------------------------------------------------------
# Toolchain — prefer the homebrew/system Go; fall back to PATH
# ---------------------------------------------------------------------------
GO := $(shell command -v go 2>/dev/null || echo /usr/local/go/bin/go)

# Common linker flags: strip debug info + DWARF for smaller binaries
LDFLAGS := -ldflags="-s -w"

# ---------------------------------------------------------------------------
# Development
# ---------------------------------------------------------------------------
check-tesseract:
	@command -v tesseract >/dev/null 2>&1 || \
	  echo "WARNING: tesseract not found — image OCR will be disabled. Install: brew install tesseract"

run: check-tesseract
	$(GO) run cmd/server/main.go

build:
	$(GO) build $(LDFLAGS) -o bin/aura-api ./cmd/server

vet:
	$(GO) vet ./...

lint:
	$(GO) vet ./... && $(GO) build ./...

seed:
	$(GO) run seed/seed.go

clean:
	rm -rf bin/

tidy:
	$(GO) mod tidy

# ---------------------------------------------------------------------------
# macOS production builds  (CGO_ENABLED=0 → pure-Go, no Tesseract in bundle)
# ---------------------------------------------------------------------------

# Native ARM64 (Apple Silicon M1 → M5)
build-mac-arm64:
	@mkdir -p bin
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 \
	  $(GO) build $(LDFLAGS) -o bin/aura-api-darwin-arm64 ./cmd/server
	@echo "✅  darwin/arm64 binary → bin/aura-api-darwin-arm64"

# Intel x86-64 (Rosetta-compatible on Apple Silicon, native on Intel Macs)
build-mac-amd64:
	@mkdir -p bin
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 \
	  $(GO) build $(LDFLAGS) -o bin/aura-api-darwin-amd64 ./cmd/server
	@echo "✅  darwin/amd64 binary → bin/aura-api-darwin-amd64"

# Universal fat binary — used by the packaged Electron .app
build-mac-universal: build-mac-arm64 build-mac-amd64
	lipo -create -output bin/aura-api-darwin-universal \
	  bin/aura-api-darwin-arm64 \
	  bin/aura-api-darwin-amd64
	@echo "✅  Universal binary → bin/aura-api-darwin-universal"
	@lipo -info bin/aura-api-darwin-universal

# ---------------------------------------------------------------------------
# Windows production builds  
# ---------------------------------------------------------------------------

# Windows x64
build-windows-amd64:
	@mkdir -p bin
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 \
	  $(GO) build $(LDFLAGS) -o bin/aura-api-windows-amd64.exe ./cmd/server
	@echo "✅  windows/amd64 binary → bin/aura-api-windows-amd64.exe"
