# Aura AI — Professional Local Build & Packaging Guide

> **Goal**: Produce a single desktop installer (macOS DMG/PKG, Windows NSIS, Linux AppImage/Deb) that bundles the Go backend, auto-installs OCR dependencies (Tesseract + Poppler), and either manages a local MongoDB or connects to an existing one — all without requiring Docker on the end-user machine.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Aura AI Desktop App                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Electron (React 19 + TypeScript)                 │   │
│  │   - Main process: lifecycle, IPC, services       │   │
│  │   - Renderer: UI, React Flow, chat               │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Embedded Go Backend (Resources/bin/aura-api)     │   │
│  │   - REST API + WebSocket                         │   │
│  │   - OCR via Tesseract CLI (host binary)          │   │
│  │   - MongoDB driver                               │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ MongoDB Manager (main process)                   │   │
│  │   - Detects existing MongoDB ──► uses it         │   │
│  │   - Falls back to bundled/system mongod          │   │
│  │   - Stores data in app userData dir              │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │ MongoDB │         │Tesseract│         │ Poppler │
    │  local  │         │  OCR    │         │pdftoppm │
    └─────────┘         └─────────┘         └─────────┘
```

---

## Option A: Fully Native (No Docker Required) ✅ RECOMMENDED

This is the simplest path. Everything runs natively on the host machine.

### macOS

```bash
# 1. One-time setup: Install OCR, MongoDB via Homebrew
npm run setup:mac:native

# 2. Install Node & Go dependencies
npm install
cd backend && go mod tidy && cd ..

# 3. Build the release (DMG + PKG + ZIP)
npm run release:local:mac:native

# Artifacts appear in dist/
#   - Aura AI-1.0.0.dmg        ← drag-to-Applications
#   - Aura AI-1.0.0.pkg        ← full installer (auto-installs Tesseract+MongoDB)
#   - Aura AI-1.0.0-mac.zip    ← for auto-update
```

**What the PKG installer does automatically:**
1. Copies `Aura AI.app` to `/Applications`
2. Runs `build/pkg-scripts/postinstall`:
   - Installs Tesseract OCR via Homebrew
   - Installs Poppler via Homebrew
   - Installs MongoDB Community 7.0 via Homebrew
   - Starts MongoDB as a `brew services` daemon

### Windows

```bash
# 1. Install prerequisites manually:
#    - Go 1.25+: https://go.dev/dl/
#    - Node.js 20+: https://nodejs.org/
#    - Tesseract OCR: https://github.com/UB-Mannheim/tesseract/wiki
#    - MongoDB Community: https://www.mongodb.com/try/download/community

# 2. (Optional) Place installers in build/ for auto-bundling:
#    - build/tesseract-ocr-w64-setup.exe
#    - build/mongodb-windows-x86_64.msi

# 3. Build
npm install
npm run build:win

# Artifacts:
#   - dist/anti-docu-read-1.0.0-setup.exe  (NSIS installer)
```

**What the NSIS installer does automatically (if bundled):**
1. Installs the app
2. Checks for Tesseract — installs if missing
3. Checks for MongoDB — installs as Windows Service if missing
4. Adds binary dirs to PATH

### Linux

```bash
# 1. Install prerequisites
sudo apt install tesseract-ocr poppler-utils

# 2. Install MongoDB: https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/

# 3. Build
npm install
npm run build:linux

# Artifacts:
#   - dist/anti-docu-read-1.0.0.AppImage
#   - dist/anti-docu-read-1.0.0.snap
#   - dist/anti-docu-read-1.0.0.deb
```

---

## Option B: Docker for MongoDB Only (Hybrid)

Use Docker only for MongoDB (reliable, isolated data), with everything else running natively.

```bash
# 1. Install OCR natively
npm run setup:mac:docker   # validates Docker + installs Tesseract/Poppler

# 2. Start MongoDB in Docker
npm run infra:up

# 3. Build and run
npm run release:local:mac

# 4. When done developing
npm run infra:down
```

This is the minimal Docker footprint. Only MongoDB runs in a container.
A `docker-compose.native.yml` file is provided for this purpose:

```bash
docker compose -f docker-compose.native.yml up -d
```

---

## Option C: Full Docker Stack (Development)

The existing `docker-compose.yml` brings up MongoDB + Redis + the backend.
This is for development workflow, not for end-user distribution.

```bash
docker compose up -d mongodb redis
cd backend && make run     # terminal 1
npm run dev                # terminal 2
```

---

## How the Packaged App Works at Runtime

### Startup Sequence

```
1. Electron main process starts
2. MongoManager checks port 27017:
   ├── Found running MongoDB → uses it (status: "external")
   ├── Found bundled/system mongod → spawns it (status: "managed")
   └── Nothing found → warns user (status: "unavailable")
3. BackendService:
   ├── Loads or generates JWT_SECRET + ENCRYPTION_KEY
   │   (persisted in ~/Library/Application Support/Aura AI/runtime/)
   ├── Resolves Go binary at Resources/bin/aura-api
   ├── Spawns backend with safe environment
   └── Polls /health until ready (max 15s)
4. MongoDB.service connects Electron directly for IPC queries
5. Window is created and rendered
```

### Shutdown Sequence

```
1. app.on('before-quit')
2. stopBackend() → SIGTERM → wait 3s → SIGKILL
3. stopManagedMongo() → SIGTERM → wait 5s → SIGKILL
4. disconnectFromDatabase()
```

---

## Security Notes

| Concern | Solution |
|---------|----------|
| JWT_SECRET not set | Auto-generated on first launch, persisted in `userData/runtime/backend-secrets.json` |
| ENCRYPTION_KEY not set | Same — auto-generated 32-byte random key, persisted |
| MongoDB auth | Local MongoDB runs without auth (localhost only). Production should use auth. |
| Backend port exposure | Backend binds to `127.0.0.1:8080` only — not accessible from network |
| Electron security | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` |

---

## Build Artifacts Summary

| Platform | Command | Artifacts |
|----------|---------|-----------|
| macOS Universal | `npm run build:mac` | `.dmg` + `.pkg` + `.zip` |
| macOS ARM64 | `npm run build:mac:arm64` | `.dmg` + `.pkg` + `.zip` |
| macOS Intel | `npm run build:mac:x64` | `.dmg` + `.pkg` + `.zip` |
| Windows x64 | `npm run build:win` | NSIS `.exe` installer |
| Linux x64 | `npm run build:linux` | `.AppImage` + `.snap` + `.deb` |

---

## NPM Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run setup:mac:native` | Install Tesseract + Poppler + MongoDB via Homebrew |
| `npm run setup:mac:docker` | Validate Docker + install OCR deps |
| `npm run infra:up` | Start MongoDB + Redis via Docker Compose |
| `npm run infra:down` | Stop Docker Compose services |
| `npm run build:backend:mac` | Build universal Go binary for macOS |
| `npm run build:backend:win` | Build Go binary for Windows x64 |
| `npm run build:backend:linux` | Build Go binary for Linux x64 |
| `npm run build:backend:all` | Build all platform binaries |
| `npm run build:mac` | Full macOS release build |
| `npm run build:win` | Full Windows release build |
| `npm run build:linux` | Full Linux release build |
| `npm run release:local:mac` | macOS build with Docker infrastructure |
| `npm run release:local:mac:native` | macOS build with native infrastructure |

---

## Troubleshooting

### "Backend did not become healthy within 15s"
- Check that MongoDB is running: `mongosh --eval "db.runCommand({ping:1})"`
- Check port 8080 is free: `lsof -ti :8080`
- Look at backend logs in Electron's console (Cmd+Alt+I → Console)

### "tesseract OCR disabled"
- macOS: `brew install tesseract poppler`
- Linux: `sudo apt install tesseract-ocr poppler-utils`
- Windows: Install from https://github.com/UB-Mannheim/tesseract/wiki

### PKG installer logs
- macOS postinstall logs: `/tmp/aura-ai-postinstall.log`

### Electron build fails
1. `npm run typecheck` — fix TypeScript errors
2. Verify backend binary exists: `cd backend && make build-mac-universal`
3. Clear caches: `rm -rf out/ dist/`
