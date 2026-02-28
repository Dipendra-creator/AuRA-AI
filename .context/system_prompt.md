# Aura AI — System Context

You are working on **Aura AI** (`anti-docu-read`), a desktop application for bulk document analysis and intelligent form-filling.

## What This App Does

1. **Ingest** — Users upload documents (PDF, DOCX, images) individually or in bulk
2. **Analyze** — AI models extract structured fields (names, dates, amounts, line items) with confidence scores
3. **Review** — Low-confidence extractions are flagged for human review
4. **Fill** — Validated data auto-fills downstream templates, forms, and workflows
5. **Manage** — Dashboard provides analytics on processing accuracy, volume, and time saved

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron 39 (`electron-vite`) |
| Frontend | React 19, TypeScript 5, Vanilla CSS |
| Backend (Main) | Node.js, MongoDB 7 driver |
| Validation | Zod 4 |
| Routing | react-router-dom 7 (state-based in Electron) |
| Build | electron-builder, cross-platform |

## Key Architectural Decisions

- **Process Isolation**: Strict main/preload/renderer separation with typed IPC contracts
- **Contract-First**: All IPC is defined in `src/shared/contracts/` — types are never duplicated
- **Result Pattern**: No thrown errors across IPC; all ops return `Result<T>`
- **macOS-First Design**: Native title bar, vibrancy, Apple HIG compliance
- **Offline Capable**: App works without MongoDB connection (graceful degradation)

## Reference Files

- Rules: `.antigravity/rules.md`
- Coding Style: `.context/coding_style.md`
- Designs: `designs/` (Stitch exports)
