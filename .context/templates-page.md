# Templates Page — Architecture & UI Design

> **Project**: Aura AI (`anti-docu-read`)
> **Author**: Aura Engineering
> **Date**: 2026-03-15
> **Status**: Design — Pending Implementation
> **Page ID**: `ai-models` (sidebar nav, label: "Templates")

---

## 1. Purpose

The Templates page is a **curated library of pre-built pipeline workflows**. Users browse ready-made templates that cover common document-processing use cases, preview the pipeline DAG, optionally configure a few key parameters, then generate a fully-wired workflow that lands directly in the Workflows (Pipelines) page — ready to run.

This removes the blank-canvas friction from the Workflows page and makes the system approachable for non-technical users.

---

## 2. Page Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  SIDEBAR  │                  TEMPLATES                               │
│           │  ┌─────────────────────────────────────────────────────┐ │
│  Dashboard│  │  Header: "Pipeline Templates"  + [search bar]       │ │
│  Documents│  │  Subtitle: "Start from a proven workflow..."        │ │
│  Pipelines│  └─────────────────────────────────────────────────────┘ │
│  Downloads│                                                           │
│ ►Templates│  ┌── Filter Tabs ──────────────────────────────────────┐ │
│  API      │  │  [All]  [Finance]  [Legal]  [HR]  [Healthcare]      │ │
│           │  │  [Government]  [E-Commerce]  [Custom]               │ │
│           │  └─────────────────────────────────────────────────────┘ │
│           │                                                           │
│           │  ┌── Template Grid (3 columns) ───────────────────────┐  │
│           │  │  ┌────────────┐  ┌────────────┐  ┌────────────┐   │  │
│           │  │  │ Template   │  │ Template   │  │ Template   │   │  │
│           │  │  │ Card       │  │ Card       │  │ Card       │   │  │
│           │  │  └────────────┘  └────────────┘  └────────────┘   │  │
│           │  │  ┌────────────┐  ┌────────────┐  ┌────────────┐   │  │
│           │  │  │ Template   │  │ Template   │  │ Template   │   │  │
│           │  │  │ Card       │  │ Card       │  │ Card       │   │  │
│           │  │  └────────────┘  └────────────┘  └────────────┘   │  │
│           │  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Interaction: Template Card Click → Preview Drawer

Clicking a card opens a **right-side drawer** (slides in) showing:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Template Grid (dimmed)   │  ┌──────── TEMPLATE PREVIEW ──────────┐  │
│                           │  │  Invoice Data Extraction            │  │
│                           │  │  Finance · 6 nodes · ~12s avg      │  │
│                           │  │                                     │  │
│                           │  │  ┌── Pipeline Preview (mini DAG) ┐  │  │
│                           │  │  │  [Ingest]→[AI Extract]→       │  │  │
│                           │  │  │  [Transform]→[Review]→        │  │  │
│                           │  │  │  [Form Fill]→[Export]         │  │  │
│                           │  │  └────────────────────────────── ┘  │  │
│                           │  │                                     │  │
│                           │  │  What this does:                    │  │
│                           │  │  • Extracts vendor, date, amount    │  │
│                           │  │  • Validates against PO numbers     │  │
│                           │  │  • Exports to CSV + webhook         │  │
│                           │  │                                     │  │
│                           │  │  ┌── Quick Config ──────────────┐  │  │
│                           │  │  │  Workflow Name: [__________] │  │  │
│                           │  │  │  Export Format: [CSV ▾]      │  │  │
│                           │  │  │  Review Gate:  [ON / OFF]    │  │  │
│                           │  │  └──────────────────────────────┘  │  │
│                           │  │                                     │  │
│                           │  │  [Cancel]     [Use This Template →] │  │
│                           │  └─────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Template Card Design

Each card in the grid follows the Aura AI dark-glass design language:

```
┌──────────────────────────────────┐
│  [Category Badge: Finance]  [★]  │  ← amber star = featured
│                                  │
│  🧾  Invoice Data Extraction     │  ← icon + title
│                                  │
│  Extracts vendor, date, amount   │  ← one-line description
│  and amount from PDF invoices    │
│                                  │
│  ──────────── NODE STRIP ─────── │
│  [IN]──[AI]──[TR]──[RV]──[EX]   │  ← mini node pipeline
│                                  │
│  6 nodes  ·  ~12s  ·  Finance   │  ← stats row
│                                  │
│  [Preview]          [Use →]      │  ← action buttons
└──────────────────────────────────┘
```

**Color accents per category:**
- Finance → cyan (`#00D4FF`)
- Legal → purple (`#A855F7`)
- HR → emerald (`#10B981`)
- Healthcare → red (`#EF4444`)
- Government → amber (`#F59E0B`)
- E-Commerce → orange (`#F97316`)
- Custom → slate (`#94A3B8`)

---

## 4. Default Templates (12 Built-In)

### 4.1 Finance

#### Template 1 — Invoice Data Extraction
> **Use case**: A finance team receives hundreds of vendor PDF invoices monthly. They need to extract line items, total amounts, due dates, and vendor details automatically, then export to their accounting system.

**Pipeline DAG**:
```
[Ingest PDF]
    ↓
[AI Extract]  — fields: vendor_name, invoice_number, date, line_items[], total_amount, tax, currency
    ↓
[Transform]   — coerce total_amount to number, format date to ISO, compute total_with_tax = amount * (1 + tax_rate)
    ↓
[Review Gate] — show: vendor_name, total_amount, invoice_number (auto-approve if confidence ≥ 0.92)
    ↓
[Export]      — format: CSV + webhook to accounting API
```

**Quick Config params**: Export format, Accounting webhook URL, Auto-approve threshold

---

#### Template 2 — Expense Report Processing
> **Use case**: HR or Finance receives employee expense receipts (images/PDFs). System extracts merchant, amount, date, and category, then creates a structured expense report and flags items exceeding policy limits.

**Pipeline DAG**:
```
[Ingest]      — batch mode ON, accept jpg/png/pdf
    ↓
[AI Extract]  — fields: merchant, amount, date, category, receipt_number
    ↓
[Transform]   — default currency USD, flag if amount > 500 via compute: over_limit = amount > 500
    ↓
[Condition]   — if over_limit = true → [Review Gate]; else → [Export]
    ↓
[Review Gate] — show flagged receipts to manager
    ↓
[Export]      — format: XLSX grouped by category
```

**Quick Config params**: Per-item limit ($), Manager email, Export format

---

#### Template 3 — Bank Statement Reconciliation
> **Use case**: Accounts team uploads monthly bank statement PDFs. System extracts all transactions, matches them against known vendors, categorizes them, and outputs a reconciliation spreadsheet.

**Pipeline DAG**:
```
[Ingest]      — accept PDF/CSV
    ↓
[AI Extract]  — fields: transactions[]{date, description, debit, credit, balance}
    ↓
[Transform]   — rename description→vendor, coerce amounts to number, compute net = credit - debit
    ↓
[Custom API]  — POST to internal vendor-lookup API to categorize each vendor
    ↓
[Export]      — format: XLSX with pivot-ready structure
```

**Quick Config params**: Vendor lookup API URL, Output filename prefix

---

### 4.2 Legal

#### Template 4 — Contract Key-Term Extractor
> **Use case**: Legal team receives contracts for review. System extracts critical clauses (termination, liability, payment terms, governing law, parties) and produces a structured summary for quick lawyer review.

**Pipeline DAG**:
```
[Ingest]      — accept PDF/DOCX, OCR enabled
    ↓
[AI Extract]  — fields: party_a, party_b, effective_date, termination_clause, liability_cap, payment_terms, governing_law, jurisdiction
    ↓
[Transform]   — format dates, default liability_cap to "Not specified" if missing
    ↓
[Review Gate] — always show full extracted summary (allowEdits: true)
    ↓
[Export]      — format: JSON + PDF summary report
```

**Quick Config params**: Required fields, Review timeout (hours), Export format

---

#### Template 5 — NDA Compliance Checker
> **Use case**: Legal ops team processes signed NDAs. System extracts parties, effective date, confidentiality period, and disclosure scope. Flags NDAs missing required clauses or with expired terms.

**Pipeline DAG**:
```
[Ingest]      — accept PDF/DOCX
    ↓
[AI Extract]  — fields: party_a, party_b, effective_date, expiry_date, confidentiality_period, scope, mutual
    ↓
[Transform]   — compute is_expired = expiry_date < today, compute days_remaining = expiry_date - today
    ↓
[Condition]   — if is_expired = true OR scope = null → [Review]; else → [Export]
    ↓
[Review Gate] — flag incomplete/expired NDAs for legal review
    ↓
[Export]      — format: CSV compliance register
```

**Quick Config params**: Required clause list, Days-before-expiry warning threshold

---

### 4.3 Human Resources

#### Template 6 — Resume / CV Parser
> **Use case**: HR team receives job applications as PDF/DOCX resumes. System extracts candidate name, contact info, skills, work history, education, and certifications into a structured candidate profile.

**Pipeline DAG**:
```
[Ingest]      — batch mode ON, accept PDF/DOCX
    ↓
[AI Extract]  — fields: full_name, email, phone, location, skills[], work_history[]{company, title, dates}, education[]{degree, institution, year}, certifications[]
    ↓
[Transform]   — concat first_name + last_name if split, normalize phone format, lowercase email
    ↓
[Custom API]  — POST to ATS system (e.g. Greenhouse, Lever) to create candidate record
    ↓
[Export]      — format: JSON + CSV shortlist
```

**Quick Config params**: ATS API endpoint, Job ID/Role tag, Required skills filter

---

#### Template 7 — Employee Onboarding Document Collector
> **Use case**: HR needs to collect and validate multiple onboarding documents (ID proof, tax form, bank details, offer acceptance) submitted by new hires. System verifies completeness and extracts key data.

**Pipeline DAG**:
```
[Ingest]      — multi-file per employee, accept PDF/JPG/PNG
    ↓
[AI Extract]  — fields: employee_name, employee_id, document_type, id_number, tax_id, bank_account, effective_date
    ↓
[Transform]   — validate all required doc types present, flag missing
    ↓
[Condition]   — if all_docs_present = false → [Review]; else → [Form Fill]
    ↓
[Form Fill]   — populate HRIS onboarding form with extracted data
    ↓
[Export]      — format: JSON employee record
```

**Quick Config params**: Required document types list, HRIS form template, Employee ID prefix

---

### 4.4 Healthcare

#### Template 8 — Patient Intake Form Digitizer
> **Use case**: Healthcare provider receives handwritten or scanned patient intake forms. System digitizes the form, extracts patient demographics, symptoms, medications, and allergies, then populates the EHR system.

**Pipeline DAG**:
```
[Ingest]      — accept PDF/JPG/PNG, OCR enabled (high quality)
    ↓
[AI Extract]  — fields: patient_name, dob, gender, address, insurance_id, symptoms[], current_medications[], allergies[], emergency_contact
    ↓
[Transform]   — format dob to ISO, normalize allergy names, uppercase medication names
    ↓
[Review Gate] — always require clinician review before EHR submission (HIPAA compliance)
    ↓
[Custom API]  — POST to EHR API (HL7 FHIR format)
    ↓
[Export]      — format: JSON FHIR bundle
```

**Quick Config params**: EHR API endpoint, FHIR version, Review required (locked ON for compliance)

---

### 4.5 Government / Public Sector

#### Template 9 — Permit Application Processor
> **Use case**: Government office receives permit applications (building, business, event) as PDFs. System extracts applicant details, permit type, requested dates, location, and auto-routes for department approval.

**Pipeline DAG**:
```
[Ingest]      — accept PDF/DOCX
    ↓
[AI Extract]  — fields: applicant_name, applicant_id, permit_type, property_address, requested_start_date, requested_end_date, estimated_cost, contractor_license
    ↓
[Transform]   — validate date range, compute duration_days = end_date - start_date, default status = "pending"
    ↓
[Condition]   — if estimated_cost > 50000 → [Review (senior)]; else → [Form Fill]
    ↓
[Form Fill]   — populate permit issuance template
    ↓
[Custom API]  — POST to permit tracking system
    ↓
[Export]      — format: PDF permit document + CSV log
```

**Quick Config params**: High-value threshold ($), Permit tracking API, Department routing rules

---

#### Template 10 — Tax Document Digitizer
> **Use case**: Tax authority or accounting firm processes physical tax return forms. System extracts all fields from scanned W-2, 1099, or equivalent forms, validates completeness, and creates a digital filing record.

**Pipeline DAG**:
```
[Ingest]      — accept PDF/JPG, OCR enabled
    ↓
[AI Extract]  — fields: taxpayer_name, ssn_last4, tax_year, employer_name, ein, gross_wages, federal_withheld, state_withheld, form_type
    ↓
[Transform]   — coerce all monetary fields to number, validate tax_year is current or prior, mask SSN to last 4
    ↓
[Review Gate] — always require reviewer sign-off (autoApproveThreshold: 0 — never skip)
    ↓
[Form Fill]   — populate digital tax filing form
    ↓
[Export]      — format: JSON + encrypted PDF
```

**Quick Config params**: Tax year, Form type (W2/1099/etc), Reviewer role

---

### 4.6 E-Commerce

#### Template 11 — Purchase Order Matching
> **Use case**: Operations team receives supplier invoices and needs to match them against open purchase orders. System extracts invoice data, queries PO database, and flags mismatches for review.

**Pipeline DAG**:
```
[Ingest]      — accept PDF/CSV
    ↓
[AI Extract]  — fields: invoice_number, vendor_id, po_number, line_items[]{sku, qty, unit_price}, total_amount, invoice_date
    ↓
[Transform]   — coerce amounts, compute line_total per item, verify sum matches total
    ↓
[Custom API]  — GET /purchase-orders/{po_number} from ERP to fetch PO data
    ↓
[Transform]   — compute variance = invoice_total - po_total, flag if abs(variance) > tolerance
    ↓
[Condition]   — if variance_flag = true → [Review]; else → [Export]
    ↓
[Review Gate] — show invoice vs PO side-by-side
    ↓
[Export]      — format: CSV matched/unmatched report + webhook to ERP
```

**Quick Config params**: Variance tolerance (%), ERP API endpoint, PO lookup field

---

### 4.7 General Purpose

#### Template 12 — Document → Spreadsheet (Quick Extract)
> **Use case**: Anyone who needs to batch-extract structured data from a set of similar documents (invoices, forms, certificates, reports) into a spreadsheet. Fully configurable fields.

**Pipeline DAG**:
```
[Ingest]      — batch mode ON, accept any format
    ↓
[AI Extract]  — fields: [user-defined at config time]
    ↓
[Transform]   — user-defined rename/format operations
    ↓
[Export]      — format: CSV / XLSX (user choice)
```

**Quick Config params**: Fields to extract (comma-separated), Output format, Filename prefix

---

## 5. Data Model

### 5.1 Template Definition (Static / Seeded)

Templates are **baked into the frontend** as a static JSON registry (no backend required for browsing). When the user clicks "Use This Template", the frontend generates a full `Pipeline` payload and `POST /api/v1/pipelines` to create it.

```typescript
// src/renderer/src/data/pipeline-templates.ts

export interface PipelineTemplate {
  readonly id: string                        // e.g. "tpl_invoice_extraction"
  readonly name: string                      // "Invoice Data Extraction"
  readonly description: string               // short (1-2 sentence) description
  readonly longDescription: string           // full "what this does" text
  readonly category: TemplateCategory
  readonly icon: string                      // lucide icon name
  readonly accentColor: TemplateAccentColor
  readonly featured: boolean                 // show amber star
  readonly estimatedDurationSec: number      // avg run time
  readonly nodeCount: number
  readonly useCaseText: string               // practical use-case blurb
  readonly defaultPipeline: PipelineTemplate_Pipeline  // the full pipeline DAG
  readonly quickConfigFields: QuickConfigField[]       // user-facing config inputs
}

export type TemplateCategory =
  | 'Finance'
  | 'Legal'
  | 'HR'
  | 'Healthcare'
  | 'Government'
  | 'E-Commerce'
  | 'General'

export type TemplateAccentColor = 'cyan' | 'purple' | 'emerald' | 'red' | 'amber' | 'orange' | 'slate'

export interface QuickConfigField {
  readonly key: string         // maps into the pipeline node config
  readonly label: string       // displayed in the drawer form
  readonly type: 'text' | 'number' | 'select' | 'toggle' | 'url'
  readonly options?: string[]  // for select type
  readonly defaultValue?: string | number | boolean
  readonly required: boolean
  readonly placeholder?: string
  readonly helpText?: string
}

export interface PipelineTemplate_Pipeline {
  readonly name: string
  readonly description: string
  readonly nodes: PipelineNode[]
  readonly edges: PipelineEdge[]
}
```

---

## 6. Frontend Component Architecture

```
src/renderer/src/
├── pages/
│   └── Templates.tsx                     ← NEW: main page (replaces placeholder for 'ai-models')
├── data/
│   └── pipeline-templates.ts             ← NEW: static template registry (12 templates)
└── components/
    └── templates/                        ← NEW directory
        ├── TemplateGrid.tsx              ← responsive 3-col card grid + filter tabs
        ├── TemplateCard.tsx              ← individual template card with mini DAG strip
        ├── TemplatePreviewDrawer.tsx     ← right slide-in drawer with full preview + quick config
        ├── MiniPipelinePreview.tsx       ← compact read-only DAG visualization (no React Flow dep)
        └── QuickConfigForm.tsx           ← dynamic form rendered from QuickConfigField[]
```

### 6.1 Templates.tsx (Page)

```tsx
// State
const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'All'>('All')
const [searchQuery, setSearchQuery] = useState('')
const [selectedTemplate, setSelectedTemplate] = useState<PipelineTemplate | null>(null)
const [isDrawerOpen, setIsDrawerOpen] = useState(false)
const [isCreating, setIsCreating] = useState(false)

// Derived
const filteredTemplates = useMemo(() => {
  return ALL_TEMPLATES
    .filter(t => activeCategory === 'All' || t.category === activeCategory)
    .filter(t =>
      !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
}, [activeCategory, searchQuery])

// Handler: "Use This Template" clicked
async function handleUseTemplate(template: PipelineTemplate, config: Record<string, unknown>) {
  setIsCreating(true)
  const pipeline = buildPipelineFromTemplate(template, config)  // inject quick-config values
  await dataService.createPipeline(pipeline)
  onNavigate('workflows')  // redirect to Workflows page
}
```

### 6.2 TemplateCard.tsx

```
Visual hierarchy:
  1. Category badge (top-left, colored) + featured star (top-right)
  2. Icon (32px) + Template name (bold)
  3. Description text (2 lines, truncated)
  4. Mini node strip (5–7 inline squares with arrows)
  5. Stats row: node count · avg duration · category
  6. Actions: [Preview] (ghost) and [Use →] (primary)
```

Hover state: card lifts slightly (`transform: translateY(-2px)`), border glows in category accent color.

### 6.3 MiniPipelinePreview.tsx

A lightweight SVG or flexbox-based preview — **no React Flow dependency**. Renders a horizontal strip of colored squares representing each node type, connected by arrows.

```
[IN] ──► [AI] ──► [TR] ──► [RV] ──► [EX]
 cyan     cyan    purple   amber    emerald
```

Node colors follow the existing node-type palette from the Workflows page. In the drawer preview, the strip expands to show full node labels and a brief description of what each node does.

### 6.4 TemplatePreviewDrawer.tsx

```
Layout:
  - Fixed right panel, 480px wide, slides in with CSS transition
  - Backdrop (semi-transparent) over the grid, click to close
  - Sections:
    1. Header: name, category badge, close button [×]
    2. Stats row: node count, avg duration, category
    3. Mini DAG (larger, with labels)
    4. "What this does" — bullet list from longDescription
    5. QuickConfigForm (dynamic fields)
    6. Footer: [Cancel] + [Use This Template →] (primary CTA, shows spinner while creating)
```

### 6.5 buildPipelineFromTemplate() (utility)

```typescript
// src/renderer/src/data/pipeline-templates.ts

export function buildPipelineFromTemplate(
  template: PipelineTemplate,
  quickConfig: Record<string, unknown>
): CreatePipelinePayload {
  // Deep clone the template's defaultPipeline
  // Apply quickConfig overrides into the relevant node configs
  // Set workflow name from quickConfig.workflowName or template.name
  // Return a valid CreatePipelinePayload ready for POST /api/v1/pipelines
}
```

The quick config values are mapped into specific node configs. For example, for the Invoice template:
- `exportFormat` → injected into the Export node's `config.format`
- `webhookUrl` → injected into the Export node's `config.webhookUrl`
- `reviewGate` → if false, the Review node is removed from nodes/edges

---

## 7. User Flow (End-to-End)

```
1. User opens Templates page
        │
        ▼
2. Browses grid (filter by category or search)
        │
        ▼
3. Clicks a template card
        │
        ▼
4. Preview drawer opens (slides in from right)
   - Sees mini DAG
   - Reads what it does
   - Fills in Quick Config (workflow name, export format, etc.)
        │
        ▼
5. Clicks "Use This Template →"
        │
        ▼
6. Frontend calls buildPipelineFromTemplate(template, config)
   → produces a full Pipeline payload (nodes + edges + positions)
        │
        ▼
7. Frontend calls POST /api/v1/pipelines
   (same endpoint already used by Workflows page)
        │
        ▼
8. Backend creates pipeline in MongoDB
        │
        ▼
9. Frontend navigates to Workflows page
   - New pipeline appears at the top of the list
   - Toast notification: "Invoice Data Extraction created — ready to run"
```

---

## 8. Empty State & Edge Cases

| Scenario | Behavior |
|----------|----------|
| No templates match search | Empty state illustration + "No templates found for '{query}'" + [Clear Search] |
| API create fails | Error toast + drawer stays open with retry button |
| Template already exists (same name) | Auto-suffix name: "Invoice Data Extraction (2)" |
| User is offline | Disable "Use This Template" button + tooltip "Requires connection" |

---

## 9. Future Extensions (Out of Scope for v1)

- **Community templates**: User-submitted templates with ratings
- **Custom template creation**: "Save current workflow as template" button on Workflows page
- **Template versioning**: Track template updates, notify users when a newer version is available
- **AI-suggested template**: Based on document type detected at upload, suggest matching template
- **Template variables**: More advanced parameterization beyond Quick Config
- **Team templates**: Org-scoped private templates shared across the team

---

## 10. File Checklist

### New Files

| File | Description |
|------|-------------|
| `src/renderer/src/pages/Templates.tsx` | Main page component |
| `src/renderer/src/data/pipeline-templates.ts` | Static template registry + `buildPipelineFromTemplate()` |
| `src/renderer/src/components/templates/TemplateGrid.tsx` | Filter tabs + responsive grid |
| `src/renderer/src/components/templates/TemplateCard.tsx` | Individual card UI |
| `src/renderer/src/components/templates/TemplatePreviewDrawer.tsx` | Slide-in detail + config drawer |
| `src/renderer/src/components/templates/MiniPipelinePreview.tsx` | Lightweight inline DAG view |
| `src/renderer/src/components/templates/QuickConfigForm.tsx` | Dynamic config form renderer |

### Modified Files

| File | Change |
|------|--------|
| `src/renderer/src/App.tsx` | Route `ai-models` → `<Templates />` page |

### No Backend Changes Required

All 12 default templates are static frontend data. The only backend call is the existing `POST /api/v1/pipelines` endpoint — no new endpoints needed.

---

## 11. Styling Notes (Aura AI Design Language)

- **Background**: `#0A0B0F` base, glass cards `rgba(255,255,255,0.03)` with `backdrop-filter: blur(12px)`
- **Card border**: `1px solid rgba(255,255,255,0.06)`, on hover: `rgba(ACCENT_COLOR, 0.3)`
- **Category badges**: pill shape, category accent color at 15% opacity background, full-opacity text
- **Mini DAG nodes**: 28×28px rounded squares, same border/icon colors as Workflows page node types
- **CTA button**: `bg-cyan-500/20 border border-cyan-500/40 text-cyan-400`, hover: `bg-cyan-500/30`
- **Drawer**: `position: fixed, right: 0`, width 480px, same glass panel treatment as sidebar
- **Transitions**: `transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1)` for drawer + card hover
