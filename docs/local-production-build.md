# Aura AI — Local Production Build (Professional)

This guide gives you two complete local deployment models for macOS:

1. **Docker Infra Mode (recommended for consistency)**
2. **Native Services Mode (no Docker)**

Both modes build:
- bundled Go backend binary
- Electron desktop installer artifacts
- local OCR runtime support (Tesseract + Poppler)

---

## 1) Docker Infra Mode (Mongo/Redis in containers)

### What this gives you
- reproducible MongoDB/Redis runtime
- fewer host-level service conflicts
- clean infra reset via Docker volumes

### One-time setup

```bash
npm run setup:mac:docker
```

### Build + package locally

```bash
npm run release:local:mac
```

This will:
1. install Node dependencies
2. build universal backend binary (`backend/bin/aura-api-darwin-universal`)
3. ensure Docker + OCR prerequisites
4. start infra (`mongodb`, `redis`) with health wait
5. produce macOS installer artifacts in `dist/`

---

## 2) Native Services Mode (No Docker)

### What this gives you
- zero Docker dependency
- direct host services managed by Homebrew

### One-time setup

```bash
npm run setup:mac:native
```

### Build + package locally

```bash
npm run release:local:mac:native
```

This installs and starts:
- MongoDB Community 7 (via Homebrew service)
- Tesseract
- Poppler

---

## Installer behavior and local-first runtime

- Electron app bundles the backend binary using `extraResources`.
- On first app start, backend runtime secrets are auto-generated and persisted in user data.
- OCR uses host `tesseract` and `pdftoppm` binaries.

### Runtime health checks

```bash
curl http://localhost:8080/api/v1/health
```

---

## Suggested production hardening for distribution

1. Enable code signing + notarization in Electron build pipeline.
2. Add CI release workflows for macOS/Windows/Linux artifact generation.
3. Add installer smoke tests (launch app, verify backend health, OCR command availability).
4. Version pin local dependencies and export SBOM for compliance.

---

## Notes from upstream docs used for this setup

- **electron-builder**: `extraResources`, NSIS customization include script, mac targets (`dmg`, `pkg`).
- **Docker Compose**: `--wait` for healthy startup and service readiness.
- **Tesseract docs**: language data and `TESSDATA_PREFIX` behavior for custom data paths.
