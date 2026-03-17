# Aura AI

Production-style monorepo for **AI-assisted document processing** with:

- **Electron Desktop App** (React + TypeScript)
- **Go Backend API** (REST + WebSocket + MongoDB)
- **Waitlist Web App** (Node/Express + MongoDB Atlas)
- **Utility tooling** (Python PDF extraction helpers)

---

## 1) What this project does

Aura AI provides an end-to-end workflow to:

1. Upload documents (PDF/image/text)
2. Extract fields using OCR + AI
3. Review and verify extracted data
4. Build and run workflow pipelines
5. Export results (CSV / Excel)
6. Monitor run events in real time (WebSocket)

---

## 2) Repository layout

```text
.
├── src/                     # Electron app (main + preload + renderer)
├── backend/                 # Go API, domain, services, OCR, pipeline engine
├── waitlist/                # Landing page + waitlist API/server
├── tools/                   # Python helper scripts for PDF/AI extraction
├── designs/                 # HTML design prototypes
├── shared/                  # Shared TS constants/contracts/types
├── docker-compose.yml       # MongoDB/Redis/backend local stack
└── README.md
```

---

## 3) Tech stack

### Desktop App
- Electron
- React 19 + TypeScript
- Vite (`electron-vite`)
- IPC bridge via preload (`contextIsolation: true`)

### Backend
- Go 1.25
- MongoDB (official Go driver v2)
- Native `net/http` with `ServeMux`
- WebSocket (`gorilla/websocket`)
- OCR: Tesseract + Poppler (`pdftoppm`) fallback for scanned PDFs
- AI extraction via Kilo API (OpenRouter-compatible endpoint)

### Waitlist App
- Node.js + Express
- MongoDB Atlas
- Optional Vercel serverless API

---

## 4) Key features

- Document CRUD + upload endpoint
- AI extraction with confidence scoring
- Schema-based extraction templates
- Pipeline builder and execution engine
- Run lifecycle events over WebSocket
- Review gate (approve/reject nodes)
- Dashboard stats / chart / activity feed
- Export management and file serving
- Seed script for demo data

---

## 5) Prerequisites

Install the following first:

- Node.js 20+
- npm 10+
- Go 1.25+
- MongoDB (local or containerized)
- Docker + Docker Compose (recommended for infra)

Optional but recommended for OCR:

- `tesseract`
- `pdftoppm` (via Poppler)

macOS install example:

```bash
brew install tesseract poppler
```

---

## 6) Environment variables

### 6.1 Backend (`backend/.env`)

Create `backend/.env` with:

```env
PORT=8080
MONGO_URI=mongodb://localhost:27017
MONGO_DB=Aura AI
LOG_LEVEL=info
CORS_ORIGINS=http://localhost:5173
REQUEST_TIMEOUT=30s
KILO_API_KEY=
TESSERACT_PATH=tesseract
```

Notes:
- If `KILO_API_KEY` is empty, AI extraction routes may return AI-related errors.
- If Tesseract is missing, image/scanned PDF OCR is disabled.

### 6.2 Waitlist (`waitlist/.env`)

```env
PORT=3000
MONGODB_USERNAME=...
MONGODB_PASSWORD=...
MONGODB_URL=mongodb+srv://<cluster-url>
MONGODB_DB_NAME=...
```

---

## 7) Local development

### 7.1 Start backend dependencies with Docker (recommended)

From repo root:

```bash
docker compose up -d mongodb redis
```

### 7.2 Run Go backend

```bash
cd backend
make run
```

Backend default: `http://localhost:8080`

Health check:

```bash
curl http://localhost:8080/api/v1/health
```

### 7.3 Run Electron app

From repo root (new terminal):

```bash
npm install
npm run dev
```

Renderer communicates with backend at `http://localhost:8080/api/v1` and WebSocket at `ws://localhost:8080/api/v1/ws`.

### 7.4 Seed demo data (optional)

```bash
cd backend
make seed
```

---

## 8) Build and packaging

From repo root:

```bash
npm run build
npm run build:mac
npm run build:win
npm run build:linux
```

Electron Builder config is in `electron-builder.yml`.

---

## 9) Backend API summary

Base URL: `http://localhost:8080/api/v1`

### Health
- `GET /health`

### WebSocket
- `GET /ws`

### Documents
- `GET /documents`
- `GET /documents/{id}`
- `POST /documents`
- `POST /documents/upload`
- `PATCH /documents/{id}`
- `DELETE /documents/{id}`
- `POST /documents/{id}/analyze`
- `POST /documents/{id}/export`

### Dashboard / Activity
- `GET /dashboard/stats`
- `GET /dashboard/chart`
- `GET /dashboard/recent`
- `GET /activity`
- `POST /activity`

### Pipelines
- `GET /pipelines`
- `GET /pipelines/{id}`
- `POST /pipelines`
- `PATCH /pipelines/{id}`
- `DELETE /pipelines/{id}`
- `POST /pipelines/{id}/execute`
- `GET /pipelines/{id}/runs`
- `GET /pipelines/{id}/runs/{runId}`
- `POST /pipelines/{id}/runs/{runId}/cancel`
- `POST /pipelines/{id}/validate`

### Review gate
- `POST /runs/{runId}/nodes/{nodeId}/approve`
- `POST /runs/{runId}/nodes/{nodeId}/reject`

### Schemas / Templates
- `GET /schemas`
- `POST /schemas`
- `GET /schemas/{id}`
- `PATCH /schemas/{id}`
- `DELETE /schemas/{id}`
- `GET /form-templates`
- `POST /form-templates`
- `GET /form-templates/{id}`
- `DELETE /form-templates/{id}`

### Exports / files
- `GET /exports`
- `DELETE /exports/{filename}`
- `GET /files/*` (uploaded/exported file serving)

---

## 10) Quality and checks

### Frontend / Electron

```bash
npm run lint
npm run typecheck
```

### Backend

```bash
cd backend
go test ./...
make vet
```

---

## 11) Waitlist app

Run locally:

```bash
cd waitlist
npm install
npm run dev
```

Endpoints:
- `POST /api/waitlist`
- `GET /api/waitlist/count`

Also includes a Vercel-compatible serverless function under `waitlist/api/waitlist.js`.

---

## 12) Tools folder

`tools/` contains standalone Python scripts for PDF-to-CSV extraction using Kilo API.

```bash
cd tools
pip install -r requirements.txt
python pdf_extractor.py /path/to/pdfs -o output.csv
```

---

## 13) Troubleshooting

- Backend not reachable from UI:
	- Ensure backend is running on `:8080`.
- OCR not working for scanned files:
	- Install `tesseract` and `poppler`, verify both in PATH.
- Mongo connection issues:
	- Confirm `MONGO_URI`/`MONGO_DB` values and container state.
- AI extraction failing:
	- Set a valid `KILO_API_KEY` in `backend/.env`.

---

## 14) License

No license file is currently defined in this repository.
