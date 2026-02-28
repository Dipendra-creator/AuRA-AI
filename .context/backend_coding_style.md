# Aura AI — Backend Coding Style (Go)

> Production-Grade Go + MongoDB REST API

---

## Formatting

| Rule | Value |
|------|-------|
| Formatter | `gofmt` (standard Go formatting) |
| Indent | Tabs |
| Line Width | 100 chars (soft limit) |
| Imports | Grouped: stdlib → external → internal |

---

## Project Structure

```
backend/
├── cmd/server/main.go       # Entry point
├── internal/
│   ├── config/              # Env-based configuration
│   ├── database/            # MongoDB client lifecycle
│   ├── domain/              # Business entities & shared types
│   ├── repository/          # MongoDB data access
│   ├── service/             # Business logic
│   ├── handler/             # HTTP request handlers
│   ├── middleware/          # HTTP middleware chain
│   ├── server/              # Router & server setup
│   └── logger/              # Structured slog logger
├── seed/                    # Database seeder
├── go.mod / go.sum
├── Makefile
└── .env / .env.example
```

---

## Architecture Rules

### Clean Architecture Layers

```
domain → repository → service → handler
```

- **domain/**: Pure Go types. No imports from other internal packages
- **repository/**: MongoDB queries only. Returns domain types
- **service/**: Business logic. Validates input, orchestrates repos
- **handler/**: HTTP concerns only. Parses requests, calls services, writes JSON

### Dependency Direction

Dependencies flow **inward only**: `handler → service → repository → domain`. Never the reverse.

---

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Files | `snake_case.go` | `document_repo.go` |
| Packages | `lowercase` | `repository`, `handler` |
| Types | `PascalCase` | `Document`, `PipelineNode` |
| Functions | `PascalCase` (exported), `camelCase` (private) | `GetByID`, `parseObjectID` |
| Constants | `PascalCase` | `StatusProcessed`, `TypeInvoice` |
| JSON tags | `camelCase` | `json:"fieldName"` |
| BSON tags | `snake_case` | `bson:"field_name"` |

---

## API Response Envelope

All endpoints use a consistent JSON wrapper:

```go
type APIResponse struct {
    Success bool        `json:"success"`
    Data    interface{} `json:"data,omitempty"`
    Error   string      `json:"error,omitempty"`
    Meta    *Meta       `json:"meta,omitempty"`
}
```

---

## Error Handling

- Never panic in handlers — use the Recovery middleware
- Return `*domain.AppError` with HTTP status codes from services
- Use `handleError(w, err)` helper in all handlers
- Log errors with `slog.Error()` — never `fmt.Println`

---

## MongoDB Conventions

- Collection names: `snake_case` plural (`documents`, `pipelines`, `activity_events`)
- Always use BSON tags for field mapping
- Soft-delete with `deleted_at` field on documents
- Filter soft-deleted records with `"deleted_at": bson.M{"$eq": nil}`
- Return empty slices `[]T{}` instead of `nil` for list operations

---

## Development Commands

```bash
make run     # Start dev server
make build   # Build binary
make seed    # Seed database
make vet     # Run go vet
make tidy    # Run go mod tidy
```
