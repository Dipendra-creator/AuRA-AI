# Aura AI — Coding Style & Conventions

> Bulk Document Analyzer & Filler • Electron + React + TypeScript

---

## Formatting (Enforced by Tooling)

| Rule | Value | Enforcer |
|------|-------|----------|
| Quotes | Single (`'`) | Prettier |
| Semicolons | None | Prettier |
| Print Width | 100 chars | Prettier |
| Trailing Commas | None | Prettier |
| Indent | 2 spaces | EditorConfig |
| Line Endings | LF | EditorConfig |
| Final Newline | Yes | EditorConfig |

> Run `npm run format` to auto-format. No manual formatting debates.

---

## TypeScript Conventions

### Types Over Interfaces (when possible)

```typescript
// ✅ Prefer type aliases for unions and simple shapes
type DocumentStatus = 'pending' | 'processing' | 'processed' | 'reviewing' | 'error'
type DocumentId = string & { readonly __brand: unique symbol }

// ✅ Use interfaces for object shapes that may be extended
interface AuraDocument {
  readonly _id: DocumentId
  readonly name: string
  readonly status: DocumentStatus
}
```

### Readonly by Default

All interface properties must be `readonly`. Mutation happens through controlled functions, never direct property assignment.

```typescript
// ✅ Correct
interface ExtractedField {
  readonly fieldName: string
  readonly value: string
  readonly confidence: number
}

// ❌ Wrong — mutable properties
interface ExtractedField {
  fieldName: string
  value: string
}
```

### Result Pattern for Error Handling

Never throw errors across IPC boundaries. Use discriminated unions:

```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

### Zod for Runtime Validation

Use Zod schemas for validating external inputs (file reads, MongoDB data, user input). TypeScript types are for compile-time only.

```typescript
import { z } from 'zod'

const CreateDocumentSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['invoice', 'contract', 'receipt', 'expense', 'other']),
  filePath: z.string()
})
```

### Explicit Return Types

All exported functions must have explicit return type annotations:

```typescript
// ✅ Correct
export function createDocument(input: CreateDocumentInput): Promise<Result<AuraDocument>> { ... }

// ❌ Avoid — inferred return types on public API
export function createDocument(input: CreateDocumentInput) { ... }
```

---

## React Conventions

### Function Components Only

No class components. Use named function declarations with `ReactElement` return type:

```typescript
export function Dashboard(): ReactElement {
  // ...
}
```

### State Management

- Use `useState` for local component state
- Use page-level state lifting via props for cross-component communication
- No global state library unless complexity demands it

### Component Structure

Follow this order inside every component file:

1. JSDoc comment describing the component
2. Imports
3. Type definitions (props, local types)
4. Helper functions
5. Component function
6. Default export (if needed)

### CSS

- **Vanilla CSS only** — no Tailwind, CSS-in-JS, or CSS modules
- Use CSS custom properties (`--var-name`) for theming tokens
- Use BEM-inspired class naming: `.page-header`, `.stat-card`, `.glass-panel`
- One `app.css` for global styles; component styles can be scoped by class prefix
- Glassmorphism pattern:
  ```css
  .glass-panel {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
  }
  ```

---

## IPC Architecture Pattern

### Contract-Driven Development

Every new domain feature follows this exact flow:

```
shared/types/    →  Define domain types
shared/contracts/ →  Define channel names + API interface
main/ipc/        →  Implement IPC handlers
preload/         →  Expose via contextBridge
renderer/        →  Consume via window.api
```

### Channel Naming

```typescript
export const DocumentChannels = {
  LIST: 'documents:list',
  GET_BY_ID: 'documents:getById',
  CREATE: 'documents:create',
  DELETE: 'documents:delete'
} as const
```

Pattern: `<domain>:<action>` — all lowercase, colon-separated.

---

## File Organization

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App entry, lifecycle, menu
│   ├── ipc/                 # IPC handler registrations
│   │   └── <domain>.ipc.ts
│   └── services/            # Business logic & external I/O
│       └── <name>.service.ts
├── preload/                 # contextBridge exposure (thin layer)
│   └── index.ts
├── renderer/                # React frontend
│   ├── index.html
│   └── src/
│       ├── App.tsx          # Root component + page routing
│       ├── app.css          # Global styles
│       ├── components/      # Reusable UI components
│       │   └── <Name>.tsx
│       ├── pages/           # Full page views
│       │   └── <Name>.tsx
│       └── assets/          # Static assets (icons, images)
└── shared/                  # Cross-process shared code
    ├── types/               # Domain type definitions
    │   └── <domain>.types.ts
    ├── contracts/           # IPC contracts
    │   └── <domain>.contract.ts
    └── constants/           # App-wide constants
```

---

## Documentation Style

Use JSDoc with contextual descriptions. Focus on **why**, not **what**:

```typescript
/**
 * Typed IPC contract for document operations.
 * Renderer and Main must import from here — never duplicate type definitions.
 */

/** Branded type to prevent accidental ID misuse */
export type DocumentId = string & { readonly __brand: unique symbol }

/** Build native macOS menu bar following Apple HIG */
function createMenu(): void { ... }
```

---

## Import Order

1. Node.js built-ins (`path`, `fs`)
2. Electron modules (`electron`, `@electron-toolkit/*`)
3. Third-party packages (`react`, `zod`, `mongodb`)
4. Shared aliases (`@shared/*`)
5. Local imports (`./components/*`, `./pages/*`)

Separate each group with a blank line.

---

## Git Practices

- Commit messages: `<type>(<scope>): <description>`
  - Types: `feat`, `fix`, `refactor`, `style`, `docs`, `chore`, `test`
  - Scope: `main`, `renderer`, `shared`, `preload`, `build`
  - Example: `feat(renderer): add document upload drag-and-drop`
- Keep commits atomic — one logical change per commit
- Run `npm run lint && npm run typecheck` before pushing