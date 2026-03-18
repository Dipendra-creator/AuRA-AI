# API Configuration Page — Implementation Plan

**Date:** 2026-03-18
**Feature:** Multi-Provider AI Configuration Hub
**Priority:** High

---

## Overview

Replace the current static AI Configuration section in `Settings.tsx` with a dedicated, fully interactive **API Configuration Page** (`/api-config`). This page allows users to connect Aura AI to any of their preferred AI providers — from cloud APIs (OpenAI, Anthropic, Google Gemini) to local/CLI tools (GitHub Copilot, Claude Code CLI, Gemini CLI) to routing layers (OpenRouter, Kilo Code).

---

## Current State

- `Settings.tsx` has a dead "AI Configuration" block showing hardcoded labels: "AI Core v3.4", "Stable Model 4.2", "OCR Active"
- The backend (`kilo.go`) is hardwired to Kilo AI / OpenRouter with a single env var `KILO_API_KEY`
- No UI exists for users to add, test, or switch AI providers
- The `ai-models` PageId currently renders the `Templates` page (pipeline templates library) — a naming collision to resolve

---

## Goals

1. Let users configure **any supported AI provider** with API keys, base URLs, and model selections
2. Allow **multiple providers active simultaneously** — each pipeline node can choose which provider to use
3. Support **CLI-based providers** (GitHub Copilot, Claude Code, Gemini CLI) that authenticate via local token files or `oauth` flows rather than API keys
4. Keep the backend `kilo.go` as a reference implementation and extend it into a **provider registry** pattern
5. Persist provider configs securely — keys encrypted at rest in MongoDB, never sent in full back to frontend

---

## Supported Providers (Initial Set)

### Cloud API Providers
| Provider | Auth Method | Models |
|---|---|---|
| **OpenAI** | API Key | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o3-mini, … |
| **Anthropic** | API Key | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 |
| **Google Gemini** | API Key | gemini-2.5-pro, gemini-2.0-flash, gemini-1.5-flash |
| **Mistral AI** | API Key | mistral-large, mistral-small, codestral |
| **Cohere** | API Key | command-r-plus, command-r |
| **Groq** | API Key | llama-3.3-70b, mixtral-8x7b (ultra fast inference) |
| **Together AI** | API Key | Various open-source models |
| **xAI (Grok)** | API Key | grok-3, grok-3-mini |

### Router / Aggregator Providers
| Provider | Auth Method | Notes |
|---|---|---|
| **OpenRouter** | API Key | Routes to 200+ models, current Kilo wrapper |
| **Kilo Code** | API Key | Current default — wraps OpenRouter via `api.kilo.ai` |
| **LiteLLM Proxy** | Base URL + optional key | Self-hosted OpenAI-compatible proxy |
| **Custom OpenAI-Compatible** | Base URL + API Key | Any provider with OpenAI API compatibility (Ollama, vLLM, etc.) |

### CLI / Local Providers
| Provider | Auth Method | Notes |
|---|---|---|
| **GitHub Copilot** | OAuth / GitHub token | Uses Copilot API via `api.githubcopilot.com`, requires `GITHUB_TOKEN` or OAuth |
| **Claude Code CLI** | OAuth / Anthropic token | Uses `~/.claude/` credentials, local process invocation |
| **Gemini CLI** | Google OAuth | Uses `~/.gemini/` credentials, local process invocation |
| **Ollama** | Local base URL | `http://localhost:11434`, no auth needed |

---

## Architecture

### Backend Changes

#### 1. New Domain Model: `AIProvider`

```go
// backend/internal/domain/ai_provider.go
type AIProviderType string

const (
    ProviderOpenAI        AIProviderType = "openai"
    ProviderAnthropic     AIProviderType = "anthropic"
    ProviderGemini        AIProviderType = "google_gemini"
    ProviderMistral       AIProviderType = "mistral"
    ProviderCohere        AIProviderType = "cohere"
    ProviderGroq          AIProviderType = "groq"
    ProviderTogetherAI    AIProviderType = "together_ai"
    ProviderXAI           AIProviderType = "xai"
    ProviderOpenRouter    AIProviderType = "openrouter"
    ProviderKiloCode      AIProviderType = "kilo_code"
    ProviderLiteLLM       AIProviderType = "litellm"
    ProviderCustomOAI     AIProviderType = "custom_openai_compatible"
    ProviderGitHubCopilot AIProviderType = "github_copilot"
    ProviderClaudeCode    AIProviderType = "claude_code"
    ProviderGeminiCLI     AIProviderType = "gemini_cli"
    ProviderOllama        AIProviderType = "ollama"
)

type AIProvider struct {
    ID            primitive.ObjectID `bson:"_id,omitempty"     json:"id"`
    UserID        primitive.ObjectID `bson:"user_id"           json:"userId"`
    Name          string             `bson:"name"              json:"name"`          // user-defined label
    Type          AIProviderType     `bson:"type"              json:"type"`
    IsActive      bool               `bson:"is_active"         json:"isActive"`
    IsDefault     bool               `bson:"is_default"        json:"isDefault"`
    // API-based auth
    APIKeyHash    string             `bson:"api_key_hash,omitempty"   json:"-"`      // bcrypt hash, never returned
    APIKeyPreview string             `bson:"api_key_preview,omitempty" json:"apiKeyPreview"` // last 4 chars: "...sk3f"
    BaseURL       string             `bson:"base_url,omitempty"       json:"baseUrl,omitempty"`
    // CLI-based auth
    CLIAuthStatus string             `bson:"cli_auth_status,omitempty" json:"cliAuthStatus,omitempty"` // "authenticated"|"unauthenticated"|"unknown"
    CLIPath       string             `bson:"cli_path,omitempty"        json:"cliPath,omitempty"`      // custom binary path
    // Model selection
    DefaultModel  string             `bson:"default_model"     json:"defaultModel"`
    AvailableModels []string         `bson:"available_models"  json:"availableModels"`
    // Capabilities
    Capabilities  []string           `bson:"capabilities"      json:"capabilities"` // ["chat","extract","embed","code"]
    // Metadata
    TestResult    *ProviderTestResult `bson:"test_result,omitempty" json:"testResult,omitempty"`
    CreatedAt     time.Time          `bson:"created_at"        json:"createdAt"`
    UpdatedAt     time.Time          `bson:"updated_at"        json:"updatedAt"`
}

type ProviderTestResult struct {
    Success      bool      `bson:"success"      json:"success"`
    Latency      int64     `bson:"latency_ms"   json:"latencyMs"`
    Message      string    `bson:"message"      json:"message"`
    TestedAt     time.Time `bson:"tested_at"    json:"testedAt"`
}
```

#### 2. New MongoDB Collection: `ai_providers`

- One document per provider per user
- Indexes: `user_id`, `type`, `is_default`
- API keys stored as bcrypt hash (NOT reversible) — only used for "key exists" verification
- The actual key is stored encrypted using AES-256-GCM with a server-side `ENCRYPTION_KEY` env var

#### 3. Provider Repository
**File:** `backend/internal/repository/ai_provider.repository.go`

```
CreateProvider(ctx, provider) → AIProvider
GetProvidersByUser(ctx, userID) → []AIProvider
GetDefaultProvider(ctx, userID) → AIProvider
UpdateProvider(ctx, id, updates) → AIProvider
DeleteProvider(ctx, id) → error
SetDefault(ctx, userID, providerID) → error
```

#### 4. Provider Service
**File:** `backend/internal/service/ai_provider.service.go`

- `AddProvider(userID, input)` — validate, encrypt key, save
- `TestProvider(providerID)` — send a minimal test request, record latency + result
- `ListProviders(userID)` — return all, mask API keys
- `SetDefault(userID, providerID)` — unset previous default, set new
- `DeleteProvider(userID, providerID)` — soft delete
- `RefreshCLIStatus(providerID)` — for CLI providers, check local auth files

#### 5. Provider Handler + Routes
**File:** `backend/internal/handler/ai_provider.handler.go`

New routes to add to `router.go` (all under `/api/v1/ai-providers`, JWT-protected):

```
GET    /api/v1/ai-providers              → list all for current user
POST   /api/v1/ai-providers              → add new provider
GET    /api/v1/ai-providers/:id          → get single provider
PUT    /api/v1/ai-providers/:id          → update provider config
DELETE /api/v1/ai-providers/:id          → remove provider
POST   /api/v1/ai-providers/:id/test     → test connectivity + latency
POST   /api/v1/ai-providers/:id/default  → set as default
GET    /api/v1/ai-providers/catalog      → get static provider catalog (types, models, logos)
POST   /api/v1/ai-providers/cli-status   → check CLI auth status for a given CLI provider type
```

#### 6. Extend `kilo.go` → Universal AI Client

Refactor `backend/internal/aiservice/` into a **provider-aware client**:

```
aiservice/
├── client.go          — AIClient interface definition
├── factory.go         — NewClient(provider AIProvider) → AIClient
├── kilo.go            — KiloClient (existing, implements AIClient)
├── openai.go          — OpenAIClient (also handles Groq, Together, xAI — all OAI-compatible)
├── anthropic.go       — AnthropicClient
├── gemini.go          — GeminiClient
├── github_copilot.go  — CopilotClient (uses github.com/user token)
├── claude_code.go     — ClaudeCodeClient (subprocess invocation)
├── gemini_cli.go      — GeminiCLIClient (subprocess invocation)
└── ollama.go          — OllamaClient (local HTTP)
```

**`AIClient` interface:**
```go
type AIClient interface {
    ExtractFields(ctx, text, docType) ([]domain.ExtractedField, error)
    ExtractFieldsFromPage(ctx, text, docType, pageNum, totalPages) ([]domain.ExtractedField, error)
    ExtractFieldsFromPageWithSchema(ctx, text, schema, pageNum, totalPages) ([]domain.ExtractedField, error)
    Chat(ctx, prompt) (string, error)
    TestConnection(ctx) (*ProviderTestResult, error)
}
```

The engine and document service will use `factory.go` to get the right client based on the pipeline's configured provider (or fall back to the user's default provider).

#### 7. Encryption Utility
**File:** `backend/internal/crypto/encryption.go`

- AES-256-GCM encrypt/decrypt for API keys at rest
- New env var: `ENCRYPTION_KEY` (32-byte hex string)
- Keys stored as `encrypted:<base64-ciphertext>`

---

### Frontend Changes

#### 1. New Page: `APIConfigPage`
**File:** `src/renderer/src/pages/APIConfig.tsx`

Add new `PageId` in `App.tsx`:
```typescript
type PageId = 'dashboard' | 'documents' | 'workflows' | 'downloads' |
              'pipeline-templates' | 'api-config' | 'analytics' | 'settings'
```

> Note: rename `ai-models` → `pipeline-templates` to fix the naming collision.

#### 2. Sidebar Update
**File:** `src/renderer/src/components/Sidebar.tsx`

Replace the `ai-models` nav item with two distinct items:
```
Pipeline Templates   (icon: LayoutTemplate)
API Configuration    (icon: Plug / KeyRound)
```

#### 3. New Types
**File:** `src/renderer/src/shared/types/ai-provider.types.ts`

```typescript
export type AIProviderType =
  | 'openai' | 'anthropic' | 'google_gemini' | 'mistral'
  | 'cohere' | 'groq' | 'together_ai' | 'xai'
  | 'openrouter' | 'kilo_code' | 'litellm' | 'custom_openai_compatible'
  | 'github_copilot' | 'claude_code' | 'gemini_cli' | 'ollama'

export interface AIProvider {
  id: string
  name: string
  type: AIProviderType
  isActive: boolean
  isDefault: boolean
  apiKeyPreview?: string      // "...sk3f"
  baseUrl?: string
  cliAuthStatus?: 'authenticated' | 'unauthenticated' | 'unknown'
  cliPath?: string
  defaultModel: string
  availableModels: string[]
  capabilities: string[]
  testResult?: ProviderTestResult
  createdAt: string
  updatedAt: string
}

export interface ProviderTestResult {
  success: boolean
  latencyMs: number
  message: string
  testedAt: string
}

export interface ProviderCatalogEntry {
  type: AIProviderType
  displayName: string
  description: string
  logoUrl: string           // bundled SVG asset
  category: 'cloud' | 'router' | 'cli' | 'local'
  authMethod: 'api_key' | 'oauth' | 'local' | 'url_only'
  requiresBaseUrl: boolean
  defaultBaseUrl?: string
  models: ModelOption[]
  docsUrl: string
  capabilities: string[]
}

export interface ModelOption {
  id: string
  name: string
  contextWindow: number
  costPer1kTokens?: { input: number; output: number }
  isRecommended?: boolean
}
```

#### 4. API Client Extension
**File:** `src/renderer/src/data/api-client.ts` — add methods:

```typescript
// AI Provider endpoints
getAIProviders(): Promise<AIProvider[]>
addAIProvider(input: AddProviderInput): Promise<AIProvider>
updateAIProvider(id: string, updates: Partial<AddProviderInput>): Promise<AIProvider>
deleteAIProvider(id: string): Promise<void>
testAIProvider(id: string): Promise<ProviderTestResult>
setDefaultProvider(id: string): Promise<void>
getProviderCatalog(): Promise<ProviderCatalogEntry[]>
checkCLIStatus(type: AIProviderType): Promise<{ status: string; message: string }>
```

---

### UI Component Architecture

```
pages/
└── APIConfig.tsx                  — main page, orchestrates all sub-components

components/api-config/
├── ProviderCatalogDrawer.tsx      — slide-in drawer listing all addable provider types
├── ProviderCard.tsx               — card showing a configured provider's status
├── ProviderGrid.tsx               — responsive grid of ProviderCards + Add button
├── AddProviderForm.tsx            — form to configure a new provider (type-aware)
├── EditProviderModal.tsx          — update key / model / label for existing provider
├── ProviderTestBadge.tsx          — latency pill + success/fail icon
├── ModelSelector.tsx              — searchable dropdown for model selection
├── CLIStatusChecker.tsx           — checks & displays CLI auth status with instructions
├── ProviderCategoryTabs.tsx       — tabs: All | Cloud | Router | CLI | Local
└── ProviderLogo.tsx               — renders provider icon/logo from bundled assets
```

---

### Page Layout & UX

```
┌─────────────────────────────────────────────────────┐
│  API Configuration                          [+ Add Provider]  │
│  Connect and manage your AI provider keys            │
├─────────────────────────────────────────────────────┤
│  [All]  [Cloud]  [Router]  [CLI / Local]             │  ← category tabs
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ ★ Kilo Code  │  │  OpenAI      │  │  Anthropic   │  │
│  │  DEFAULT     │  │  Connected   │  │  Not set     │  │
│  │  ...api3f    │  │  ...sk9x     │  │  [Configure] │  │
│  │  ✓ 142ms     │  │  ✓ 89ms      │  │              │  │
│  │  [Test][···] │  │  [Test][···] │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ GitHub       │  │ Claude Code  │                 │
│  │ Copilot      │  │ CLI          │                 │
│  │ CLI • OAuth  │  │ CLI • OAuth  │                 │
│  │ ✓ Auth'd     │  │ ✗ Not auth'd │                 │
│  │ [Status][···]│  │ [Setup Guide]│                 │
│  └──────────────┘  └──────────────┘                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Add Provider Flow:**
1. Click `[+ Add Provider]` → `ProviderCatalogDrawer` slides in from right
2. Browse or search provider catalog (grouped by category)
3. Select a provider → form fields morph based on auth method:
   - **API Key providers:** Name label, API Key input (masked), optional Base URL override, model selector
   - **CLI providers:** Name label, CLI binary path (auto-detected), [Check Status] button, setup guide link
   - **Local providers:** Name label, Base URL input (default pre-filled), [Test Connection] button
4. Click `[Test & Save]` → test fires, result shown inline, saved if successful

**Provider Card Actions (kebab menu `···`):**
- Edit (update key / model)
- Set as Default
- Test Connection
- View Setup Docs
- Remove

---

## Implementation Phases

### Phase 1 — Backend Foundation
- [ ] Add `AIProvider` domain model (`backend/internal/domain/ai_provider.go`)
- [ ] Add `AIProvider` repository (`backend/internal/repository/ai_provider.repository.go`)
- [ ] Add encryption utility (`backend/internal/crypto/encryption.go`)
- [ ] Add `AIProvider` service (`backend/internal/service/ai_provider.service.go`)
- [ ] Add `AIProvider` handler (`backend/internal/handler/ai_provider.handler.go`)
- [ ] Register new routes in `router.go`
- [ ] Add `ENCRYPTION_KEY` to `config.go` and `docker-compose.yml`

### Phase 2 — AI Client Refactor
- [ ] Define `AIClient` interface (`backend/internal/aiservice/client.go`)
- [ ] Create `factory.go` — builds the right client from `AIProvider` domain model
- [ ] Extract `openai.go` — handles OpenAI + all OAI-compatible providers (Groq, Together, xAI, LiteLLM, Ollama, Custom)
- [ ] Create `anthropic.go` — direct Anthropic SDK calls
- [ ] Create `gemini.go` — Google Gemini API
- [ ] Create `github_copilot.go` — Copilot API with GitHub token auth
- [ ] Create `claude_code.go` — subprocess wrapper for `claude` CLI
- [ ] Create `gemini_cli.go` — subprocess wrapper for `gemini` CLI
- [ ] Update document service and pipeline engine to use `factory.go`
- [ ] Keep `kilo.go` as a concrete `AIClient` implementation

### Phase 3 — Frontend Types & API Client
- [ ] Add `ai-provider.types.ts` to shared types
- [ ] Add API client methods for all `/ai-providers` endpoints
- [ ] Add mock data for provider list (for degraded mode fallback)

### Phase 4 — UI Components
- [ ] `ProviderCategoryTabs.tsx`
- [ ] `ProviderLogo.tsx` (bundle SVG logos for each provider)
- [ ] `ProviderTestBadge.tsx`
- [ ] `ModelSelector.tsx`
- [ ] `CLIStatusChecker.tsx`
- [ ] `ProviderCard.tsx`
- [ ] `ProviderGrid.tsx`
- [ ] `AddProviderForm.tsx` (type-aware dynamic form)
- [ ] `ProviderCatalogDrawer.tsx`
- [ ] `EditProviderModal.tsx`

### Phase 5 — Main Page + Routing
- [ ] Create `pages/APIConfig.tsx`
- [ ] Add `api-config` to `PageId` type in `App.tsx`
- [ ] Rename `ai-models` → `pipeline-templates` everywhere (App.tsx, Sidebar.tsx, Templates.tsx)
- [ ] Update `Sidebar.tsx` — add "API Configuration" nav item with `KeyRound` icon
- [ ] Remove dead AI config block from `Settings.tsx`

### Phase 6 — CLI Provider Integration Details

#### GitHub Copilot
- Auth: Uses existing GitHub OAuth token from `AuthContext` (if logged in via GitHub)
- Fallback: Accept manual `GITHUB_TOKEN` env var or user-entered token
- API: `https://api.githubcopilot.com/chat/completions` (OpenAI-compatible format)
- Backend checks `Authorization: Bearer <github_token>` header validity

#### Claude Code CLI
- Auth: Check `~/.claude/` directory for auth files (Electron main process IPC call)
- Display: "Authenticated as user@email.com" or "Not authenticated — run `claude login`"
- Invocation: Spawn `claude` subprocess with `-p <prompt>` flag for non-interactive mode
- IPC handler: Add `check-claude-auth` and `invoke-claude-cli` IPC channels in main process

#### Gemini CLI
- Auth: Check `~/.gemini/` or `~/.config/gemini-cli/` for credentials
- Display: Status badge + "Run `gemini auth login` to authenticate"
- Invocation: Spawn `gemini` subprocess
- IPC handler: Add `check-gemini-auth` and `invoke-gemini-cli` IPC channels

#### Ollama (Local)
- Auth: None — just base URL
- Auto-detect: On add, ping `http://localhost:11434/api/tags` to list installed models
- Display: "X models installed" or "Ollama not running"

---

## Static Provider Catalog (served from backend)

The `GET /api/v1/ai-providers/catalog` endpoint returns a static list of all supported provider types. This does NOT require auth. Frontend uses this to render the `ProviderCatalogDrawer`.

```json
[
  {
    "type": "openai",
    "displayName": "OpenAI",
    "description": "GPT-4o, o1, and more from OpenAI",
    "category": "cloud",
    "authMethod": "api_key",
    "requiresBaseUrl": false,
    "models": [
      { "id": "gpt-4o", "name": "GPT-4o", "contextWindow": 128000, "isRecommended": true },
      { "id": "gpt-4o-mini", "name": "GPT-4o mini", "contextWindow": 128000 },
      { "id": "o3-mini", "name": "o3-mini", "contextWindow": 200000 }
    ],
    "capabilities": ["chat", "extract", "code"],
    "docsUrl": "https://platform.openai.com/docs"
  },
  {
    "type": "anthropic",
    "displayName": "Anthropic",
    "description": "Claude Opus 4.6, Sonnet 4.6, Haiku 4.5",
    "category": "cloud",
    "authMethod": "api_key",
    "requiresBaseUrl": false,
    "models": [
      { "id": "claude-opus-4-6", "name": "Claude Opus 4.6", "contextWindow": 200000, "isRecommended": true },
      { "id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "contextWindow": 200000 },
      { "id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5", "contextWindow": 200000 }
    ],
    "capabilities": ["chat", "extract", "code"],
    "docsUrl": "https://docs.anthropic.com"
  },
  {
    "type": "google_gemini",
    "displayName": "Google Gemini",
    "description": "Gemini 2.5 Pro, Flash, and more",
    "category": "cloud",
    "authMethod": "api_key",
    "models": [
      { "id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "contextWindow": 1000000, "isRecommended": true },
      { "id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "contextWindow": 1000000 },
      { "id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash", "contextWindow": 1000000 }
    ],
    "capabilities": ["chat", "extract"],
    "docsUrl": "https://ai.google.dev/docs"
  },
  {
    "type": "groq",
    "displayName": "Groq",
    "description": "Ultra-fast inference for open-source models",
    "category": "cloud",
    "authMethod": "api_key",
    "models": [
      { "id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B", "contextWindow": 128000, "isRecommended": true },
      { "id": "mixtral-8x7b-32768", "name": "Mixtral 8x7B", "contextWindow": 32768 }
    ],
    "capabilities": ["chat", "extract"],
    "docsUrl": "https://console.groq.com/docs"
  },
  {
    "type": "xai",
    "displayName": "xAI (Grok)",
    "description": "Grok models from xAI",
    "category": "cloud",
    "authMethod": "api_key",
    "models": [
      { "id": "grok-3", "name": "Grok 3", "contextWindow": 131072, "isRecommended": true },
      { "id": "grok-3-mini", "name": "Grok 3 mini", "contextWindow": 131072 }
    ],
    "capabilities": ["chat", "code"],
    "docsUrl": "https://docs.x.ai"
  },
  {
    "type": "openrouter",
    "displayName": "OpenRouter",
    "description": "Route to 200+ models from one API key",
    "category": "router",
    "authMethod": "api_key",
    "defaultBaseUrl": "https://openrouter.ai/api/v1",
    "models": [
      { "id": "google/gemini-2.5-pro", "name": "Gemini 2.5 Pro" },
      { "id": "anthropic/claude-sonnet-4-6", "name": "Claude Sonnet 4.6" },
      { "id": "openai/gpt-4o", "name": "GPT-4o" },
      { "id": "meta-llama/llama-3.3-70b-instruct:free", "name": "Llama 3.3 70B (free)" }
    ],
    "capabilities": ["chat", "extract", "code"],
    "docsUrl": "https://openrouter.ai/docs"
  },
  {
    "type": "kilo_code",
    "displayName": "Kilo Code",
    "description": "Current default — OpenRouter via Kilo AI",
    "category": "router",
    "authMethod": "api_key",
    "defaultBaseUrl": "https://api.kilo.ai/api/openrouter",
    "models": [
      { "id": "minimax/minimax-m2.5:free", "name": "MiniMax M2.5 (free)", "isRecommended": true }
    ],
    "capabilities": ["chat", "extract"],
    "docsUrl": "https://kilo.ai/docs"
  },
  {
    "type": "litellm",
    "displayName": "LiteLLM Proxy",
    "description": "Self-hosted OpenAI-compatible proxy",
    "category": "router",
    "authMethod": "api_key",
    "requiresBaseUrl": true,
    "defaultBaseUrl": "http://localhost:4000",
    "capabilities": ["chat", "extract", "code"],
    "docsUrl": "https://docs.litellm.ai"
  },
  {
    "type": "custom_openai_compatible",
    "displayName": "Custom (OpenAI-Compatible)",
    "description": "Any API with OpenAI-compatible endpoints",
    "category": "router",
    "authMethod": "api_key",
    "requiresBaseUrl": true,
    "capabilities": ["chat", "extract"],
    "docsUrl": ""
  },
  {
    "type": "github_copilot",
    "displayName": "GitHub Copilot",
    "description": "Use your Copilot subscription for AI extraction",
    "category": "cli",
    "authMethod": "oauth",
    "capabilities": ["chat", "code"],
    "docsUrl": "https://docs.github.com/copilot"
  },
  {
    "type": "claude_code",
    "displayName": "Claude Code CLI",
    "description": "Use the Claude Code CLI for AI extraction",
    "category": "cli",
    "authMethod": "local",
    "capabilities": ["chat", "extract", "code"],
    "docsUrl": "https://docs.anthropic.com/claude-code"
  },
  {
    "type": "gemini_cli",
    "displayName": "Gemini CLI",
    "description": "Use Gemini CLI for AI extraction",
    "category": "cli",
    "authMethod": "local",
    "capabilities": ["chat", "extract"],
    "docsUrl": "https://github.com/google-gemini/gemini-cli"
  },
  {
    "type": "ollama",
    "displayName": "Ollama",
    "description": "Run open-source models locally",
    "category": "local",
    "authMethod": "url_only",
    "requiresBaseUrl": true,
    "defaultBaseUrl": "http://localhost:11434",
    "capabilities": ["chat", "extract", "code"],
    "docsUrl": "https://ollama.com/docs"
  }
]
```

---

## Security Considerations

1. **API Keys never travel in plaintext after initial submission** — stored AES-256-GCM encrypted, only preview (`...sk3f`) returned to frontend
2. **Keys never logged** — ensure zerolog middleware excludes request bodies for `/ai-providers` routes
3. **Per-user isolation** — all repository queries filter by `user_id` from JWT claims
4. **CLI subprocess sandboxing** — use `exec.CommandContext` with timeout, capture stdout/stderr, never pass user input as shell arguments
5. **Rate limiting** — apply rate limit middleware to the `/test` endpoint (max 5 tests/min per user)
6. **ENCRYPTION_KEY rotation plan** — document a key rotation procedure (re-encrypt all provider keys)

---

## New Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ENCRYPTION_KEY` | Yes | — | 32-byte hex string for AES-256-GCM key encryption |
| `KILO_API_KEY` | No | — | Kept for backward-compat bootstrap, migrates to `ai_providers` collection |

---

## Files to Create / Modify

### New Files (Backend)
- `backend/internal/domain/ai_provider.go`
- `backend/internal/crypto/encryption.go`
- `backend/internal/repository/ai_provider.repository.go`
- `backend/internal/service/ai_provider.service.go`
- `backend/internal/handler/ai_provider.handler.go`
- `backend/internal/aiservice/client.go`
- `backend/internal/aiservice/factory.go`
- `backend/internal/aiservice/openai.go`
- `backend/internal/aiservice/anthropic.go`
- `backend/internal/aiservice/gemini.go`
- `backend/internal/aiservice/github_copilot.go`
- `backend/internal/aiservice/claude_code.go`
- `backend/internal/aiservice/gemini_cli.go`
- `backend/internal/aiservice/ollama.go`

### Modified Files (Backend)
- `backend/internal/server/router.go` — register new routes
- `backend/internal/config/config.go` — add `ENCRYPTION_KEY`
- `backend/internal/aiservice/kilo.go` — implement `AIClient` interface
- `backend/internal/service/document.service.go` — use factory for AI client
- `backend/cmd/main.go` — wire up new repositories and services
- `docker-compose.yml` — add `ENCRYPTION_KEY` env var

### New Files (Frontend)
- `src/renderer/src/pages/APIConfig.tsx`
- `src/renderer/src/components/api-config/ProviderCategoryTabs.tsx`
- `src/renderer/src/components/api-config/ProviderLogo.tsx`
- `src/renderer/src/components/api-config/ProviderTestBadge.tsx`
- `src/renderer/src/components/api-config/ModelSelector.tsx`
- `src/renderer/src/components/api-config/CLIStatusChecker.tsx`
- `src/renderer/src/components/api-config/ProviderCard.tsx`
- `src/renderer/src/components/api-config/ProviderGrid.tsx`
- `src/renderer/src/components/api-config/AddProviderForm.tsx`
- `src/renderer/src/components/api-config/ProviderCatalogDrawer.tsx`
- `src/renderer/src/components/api-config/EditProviderModal.tsx`
- `src/shared/types/ai-provider.types.ts`

### Modified Files (Frontend)
- `src/renderer/src/App.tsx` — add `api-config` PageId, rename `ai-models`
- `src/renderer/src/components/Sidebar.tsx` — add API Config nav item
- `src/renderer/src/pages/Settings.tsx` — remove dead AI config section
- `src/renderer/src/data/api-client.ts` — add AI provider API methods

---

## Out of Scope (Future)

- Per-pipeline-node provider selection (use default provider for all nodes in Phase 1)
- Usage/cost tracking per provider
- Provider-specific fine-tuning or function calling configuration
- Streaming response support for CLI providers
- Multi-key load balancing across same provider type
