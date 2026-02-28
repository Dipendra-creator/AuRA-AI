# 🛸 Antigravity Rules — Aura AI (Document Analyzer & Filler)

## Project Identity

**Aura AI** is a desktop application for **bulk document analysis and intelligent form-filling**, powered by AI. It ingests documents (PDFs, images, DOCX), extracts structured data via AI models, and auto-fills downstream templates and workflows.

- **Stack**: Electron + React 19 + TypeScript, built with `electron-vite`
- **Data**: MongoDB (via native driver), Zod for runtime validation
- **Platform**: macOS-first, cross-platform builds via electron-builder
- **Alias**: `@renderer` → `src/renderer/src`, `@shared` → `src/shared`

---

## 🏗️ Architecture Rules

### Process Boundary Separation

This is an Electron app with strict process isolation. **Never violate these boundaries:**

| Layer | Path | Responsibilities |
|-------|------|------------------|
| **Main** | `src/main/` | Window management, MongoDB, IPC handlers, file system, native menus |
| **Preload** | `src/preload/` | contextBridge API exposure — **minimal code only** |
| **Renderer** | `src/renderer/src/` | React UI — **zero Node.js access**, all data via IPC |
| **Shared** | `src/shared/` | Types, contracts, constants — **no runtime logic** |

### IPC Contract System

All communication between Main ↔ Renderer **must** use the typed contract pattern:

1. Define channel names in `src/shared/contracts/<domain>.contract.ts`
2. Define the typed API interface in the same contract file
3. Implement the handler in `src/main/ipc/<domain>.ipc.ts`
4. Expose via preload `contextBridge` matching the contract interface
5. **Never use magic string channels** — always import from `*Channels` constants

### Shared Layer is Sacred

`src/shared/` contains **only**:
- `types/` — Domain type definitions (interfaces, branded types, unions)
- `contracts/` — IPC channel maps and typed API interfaces
- `constants/` — App-wide immutable values

> ⛔ No imports from `electron`, `react`, or any process-specific module allowed in `src/shared/`.

---

## 📐 Type Safety Requirements

1. **Branded Types** — Use branded types for domain identifiers (e.g., `DocumentId`) to prevent accidental misuse
2. **`readonly` Properties** — All interface fields must be `readonly` by default
3. **Union Types over Enums** — Use string literal unions (`type Status = 'pending' | 'processing'`) instead of TypeScript enums
4. **`Result<T>` Pattern** — All IPC operations must return `Result<T>` (success/error discriminated union), never throw across process boundaries
5. **Zod for Runtime** — Use Zod schemas for any external data validation (file imports, MongoDB responses, API payloads)
6. **No `any`** — Use `unknown` + type narrowing instead. `any` triggers a lint error

---

## 📁 File & Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Files | `kebab-case` | `document.types.ts`, `file-drop-zone.tsx` |
| React Components | `PascalCase` exports | `export function Dashboard()` |
| Types/Interfaces | `PascalCase` | `AuraDocument`, `ExtractedField` |
| IPC Channels | `namespace:action` | `documents:list`, `documents:create` |
| Contracts | `<domain>.contract.ts` | `document.contract.ts` |
| IPC Handlers | `<domain>.ipc.ts` | `document.ipc.ts` |
| Services | `<domain>.service.ts` | `mongodb.service.ts` |
| Pages (Renderer) | `PascalCase.tsx` | `Dashboard.tsx`, `Documents.tsx` |
| Components | `PascalCase.tsx` | `StatCard.tsx`, `DataTable.tsx` |

---

## 🎨 UI & Design Rules

### ⚠️ MANDATORY: Design Compliance

> **The `designs/` folder is the single source of truth for all UI.**
> You MUST follow the provided Stitch designs exactly. Do NOT invent, improvise, or freestyle any screen layout, color scheme, spacing, or component design. Every screen you build must visually match the corresponding design in `designs/`.

1. **Designs are Law** — Before building or modifying ANY UI screen, read the corresponding design from `designs/`. If a design exists for that screen, replicate it faithfully. Do not deviate
2. **No Unsanctioned Screens** — Do not create new pages or views that don't have a corresponding design in `designs/` without explicit user approval
3. **Design Subfolders** — Each feature has its own folder under `designs/` (e.g., `ai_document_analysis/`, `aura_ai_dashboard/`, `workflow_builder/`). Always check the relevant subfolder first
4. **macOS-Native Feel** — Use hidden title bar with inset traffic lights, vibrancy, and system fonts
5. **Glassmorphism** — Use `.glass-panel` styling (backdrop-blur, translucent backgrounds, soft borders)
6. **Dark-First** — Design for dark mode as default (`#0F172A` base), light mode is secondary
7. **No External CSS Frameworks** — Vanilla CSS only, use CSS custom properties for theming
8. **Page Layout Pattern** — Every page has: `<header className="page-header">` → content body
9. **Responsive** — Minimum 1024×680, optimized for 1440×900

---

## 🤖 AI & Document Processing Rules

1. **Confidence Scores** — Every extracted field must include a `confidence: number` (0–1 scale)
2. **Human-in-the-Loop** — Fields below confidence threshold must be flagged for manual `reviewing` status
3. **Statuses** — Documents follow: `pending` → `processing` → `processed` | `reviewing` | `error`
4. **Idempotent Processing** — Re-running AI extraction on the same document must produce a new version, not mutate
5. **File Access** — All file system operations (read, import, export) happen **only** in the Main process via IPC

---

## 🗄️ MongoDB Rules

1. **Service Layer** — All MongoDB operations go through `src/main/services/mongodb.service.ts`
2. **Graceful Offline** — App must function in offline mode if MongoDB connection fails at startup
3. **Connection Lifecycle** — Connect in `app.whenReady()`, disconnect in `before-quit`
4. **Schema Validation** — Validate data with Zod before writing to MongoDB, validate reads with type assertions

---

## 🔒 Security & Safety

1. **Sandbox Enabled** — Renderer runs in sandbox with `contextIsolation: true`, `nodeIntegration: false`
2. **No `rm -rf`** — Never run destructive file system commands
3. **No External Auth** — Don't submit forms or login to external services without explicit user confirmation
4. **IPC Validation** — Validate all IPC arguments in Main process handlers before acting on them

---

## 🧪 Quality Standards

1. **JSDoc Comments** — All exported functions, interfaces, and type definitions must have JSDoc docstrings
2. **Format Before Commit** — Run `npm run format` (Prettier: single quotes, no semis, 100 char width)
3. **Type Check** — Run `npm run typecheck` before builds
4. **Lint** — Run `npm run lint` (ESLint) to catch issues
5. **No Dead Code** — Remove unused imports, variables, and components

---

## 🧭 Development Workflow

1. **Design First** — Check `designs/` for existing Stitch mockups before building UI
2. **Contracts First** — Define shared types and IPC contracts before implementing handlers or UI
3. **Run Dev** — Use `npm run dev` (electron-vite HMR) for development
4. **Build** — Use `npm run build:mac` for macOS production build