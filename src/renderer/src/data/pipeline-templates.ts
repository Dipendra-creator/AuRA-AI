/**
 * Pipeline Templates — Static registry of 12 built-in workflow templates.
 *
 * Templates are pure frontend data. Browsing requires no backend calls.
 * "Use This Template" calls the existing POST /api/v1/pipelines endpoint.
 */

import type { PipelineNode, PipelineEdge } from '../../../shared/types/document.types'

// ─── Types ────────────────────────────────────────────────────────

export type TemplateCategory =
  | 'Finance'
  | 'Legal'
  | 'HR'
  | 'Healthcare'
  | 'Government'
  | 'E-Commerce'
  | 'General'

export type TemplateAccentColor =
  | 'cyan'
  | 'purple'
  | 'emerald'
  | 'red'
  | 'amber'
  | 'orange'
  | 'slate'

export interface QuickConfigField {
  readonly key: string
  readonly label: string
  readonly type: 'text' | 'number' | 'select' | 'toggle' | 'url'
  readonly options?: string[]
  readonly defaultValue?: string | number | boolean
  readonly required: boolean
  readonly placeholder?: string
  readonly helpText?: string
}

export interface TemplatePipeline {
  readonly name: string
  readonly description: string
  readonly nodes: PipelineNode[]
  readonly edges: PipelineEdge[]
}

export interface PipelineTemplate {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly longDescription: string
  readonly category: TemplateCategory
  readonly icon: string
  readonly accentColor: TemplateAccentColor
  readonly featured: boolean
  readonly estimatedDurationSec: number
  readonly nodeCount: number
  readonly useCaseText: string
  readonly defaultPipeline: TemplatePipeline
  readonly quickConfigFields: QuickConfigField[]
}

export interface CreatePipelinePayload {
  readonly name: string
  readonly description: string
  readonly workspace: string
  readonly nodes: PipelineNode[]
  readonly edges: PipelineEdge[]
}

// ─── Helpers ──────────────────────────────────────────────────────

function node(
  id: string,
  label: string,
  type: PipelineNode['type'],
  x: number,
  y: number,
  config: Record<string, unknown> = {}
): PipelineNode {
  return { id, label, name: label, type, icon: type, position: { x, y }, config }
}

function edge(id: string, source: string, target: string, label?: string): PipelineEdge {
  return { id, source, target, ...(label ? { label } : {}) }
}

// ─── Template Registry ────────────────────────────────────────────

export const ALL_TEMPLATES: PipelineTemplate[] = [
  // ── Finance ──────────────────────────────────────────────────────

  {
    id: 'tpl_invoice_extraction',
    name: 'Invoice Data Extraction',
    description: 'Extract vendor, date, amounts from PDF invoices and export to your accounting system.',
    longDescription:
      'Processes vendor PDF invoices to extract line items, totals, due dates, and vendor details. A human review gate validates results before exporting to CSV and posting to your accounting webhook.',
    category: 'Finance',
    icon: 'FileText',
    accentColor: 'cyan',
    featured: true,
    estimatedDurationSec: 12,
    nodeCount: 5,
    useCaseText:
      'Finance teams receiving hundreds of vendor PDF invoices monthly who need structured data in their accounting system without manual entry.',
    defaultPipeline: {
      name: 'Invoice Data Extraction',
      description: 'Extract and export invoice data from PDF invoices',
      nodes: [
        node('n1', 'Select Documents', 'doc_select', 100, 200, { includeRawText: true }),
        node('n2', 'AI Extract Fields', 'ai_extract', 350, 200, {
          prompt:
            'Extract: vendor_name, invoice_number, date, line_items, total_amount, tax, currency',
          confidenceThreshold: 0.8
        }),
        node('n3', 'Transform Data', 'transform', 600, 200, {
          transformations: [
            { sourceField: 'total_amount', targetField: 'total_amount', expression: 'Number(value)' },
            { sourceField: 'date', targetField: 'date', expression: 'new Date(value).toISOString()' }
          ]
        }),
        node('n4', 'Review Gate', 'review', 850, 200, {}),
        node('n5', 'Export Results', 'export', 1100, 200, { format: 'csv', filename: 'invoices' })
      ],
      edges: [
        edge('e1', 'n1', 'n2'),
        edge('e2', 'n2', 'n3'),
        edge('e3', 'n3', 'n4'),
        edge('e4', 'n4', 'n5')
      ]
    },
    quickConfigFields: [
      {
        key: 'exportFormat',
        label: 'Export Format',
        type: 'select',
        options: ['csv', 'xlsx'],
        defaultValue: 'csv',
        required: false
      },
      {
        key: 'webhookUrl',
        label: 'Accounting Webhook URL',
        type: 'url',
        required: false,
        placeholder: 'https://your-accounting-system.com/webhook',
        helpText: 'Optional: POST extracted data to your accounting API'
      },
      {
        key: 'workflowName',
        label: 'Workflow Name',
        type: 'text',
        defaultValue: 'Invoice Data Extraction',
        required: true
      }
    ]
  },

  {
    id: 'tpl_expense_report',
    name: 'Expense Report Processing',
    description: 'Parse receipts, flag over-limit items, and export grouped expense reports.',
    longDescription:
      'Batch-processes employee expense receipts (images/PDFs), extracts merchant, amount, date, and category. Items exceeding your policy limit are automatically routed to a manager review before exporting.',
    category: 'Finance',
    icon: 'Receipt',
    accentColor: 'cyan',
    featured: false,
    estimatedDurationSec: 18,
    nodeCount: 6,
    useCaseText:
      'HR or Finance teams processing employee expense receipts who need policy enforcement and structured export for reimbursement.',
    defaultPipeline: {
      name: 'Expense Report Processing',
      description: 'Extract, flag, review, and export expense data from receipts',
      nodes: [
        node('n1', 'Select Documents', 'doc_select', 100, 200, { includeRawText: true }),
        node('n2', 'AI Extract Fields', 'ai_extract', 350, 200, {
          prompt: 'Extract: merchant, amount, date, category, receipt_number',
          confidenceThreshold: 0.75
        }),
        node('n3', 'Transform & Flag', 'transform', 600, 200, {
          transformations: [
            { sourceField: 'amount', targetField: 'amount', expression: 'Number(value)' },
            { sourceField: 'amount', targetField: 'over_limit', expression: 'Number(value) > 500' }
          ]
        }),
        node('n4', 'Check Limit', 'condition', 850, 200, {
          field: 'over_limit',
          operator: 'equals',
          value: 'true',
          trueEdgeLabel: 'Over limit',
          falseEdgeLabel: 'Within limit'
        }),
        node('n5', 'Manager Review', 'review', 1100, 100, {}),
        node('n6', 'Export XLSX', 'export', 1350, 200, { format: 'xlsx', filename: 'expenses' })
      ],
      edges: [
        edge('e1', 'n1', 'n2'),
        edge('e2', 'n2', 'n3'),
        edge('e3', 'n3', 'n4'),
        edge('e4', 'n4', 'n5', 'Over limit'),
        edge('e5', 'n4', 'n6', 'Within limit'),
        edge('e6', 'n5', 'n6')
      ]
    },
    quickConfigFields: [
      {
        key: 'perItemLimit',
        label: 'Per-Item Limit ($)',
        type: 'number',
        defaultValue: 500,
        required: false,
        helpText: 'Items above this amount will be flagged for manager review'
      },
      {
        key: 'exportFormat',
        label: 'Export Format',
        type: 'select',
        options: ['xlsx', 'csv'],
        defaultValue: 'xlsx',
        required: false
      },
      {
        key: 'workflowName',
        label: 'Workflow Name',
        type: 'text',
        defaultValue: 'Expense Report Processing',
        required: true
      }
    ]
  },

  {
    id: 'tpl_bank_reconciliation',
    name: 'Bank Statement Reconciliation',
    description: 'Extract all transactions from bank PDFs and categorize them via your vendor API.',
    longDescription:
      'Accounts team uploads monthly bank statement PDFs. System extracts all transactions, queries your internal vendor-lookup API to categorize them, and exports a pivot-ready reconciliation spreadsheet.',
    category: 'Finance',
    icon: 'Building2',
    accentColor: 'cyan',
    featured: false,
    estimatedDurationSec: 25,
    nodeCount: 4,
    useCaseText:
      'Accounting teams that need monthly bank statements turned into categorized, reconcilable spreadsheets with minimal manual effort.',
    defaultPipeline: {
      name: 'Bank Statement Reconciliation',
      description: 'Extract, categorize, and export bank transactions',
      nodes: [
        node('n1', 'Select Documents', 'doc_select', 100, 200, { includeRawText: true }),
        node('n2', 'AI Extract Fields', 'ai_extract', 350, 200, {
          prompt: 'Extract transactions array with: date, description, debit, credit, balance',
          confidenceThreshold: 0.85
        }),
        node('n3', 'Vendor Lookup', 'custom_api', 600, 200, {
          url: 'https://your-erp.com/api/vendor-lookup',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          bodyTemplate: '{"description": "{{description}}"}'
        }),
        node('n4', 'Export XLSX', 'export', 850, 200, {
          format: 'xlsx',
          filename: 'bank_reconciliation'
        })
      ],
      edges: [
        edge('e1', 'n1', 'n2'),
        edge('e2', 'n2', 'n3'),
        edge('e3', 'n3', 'n4')
      ]
    },
    quickConfigFields: [
      {
        key: 'vendorLookupUrl',
        label: 'Vendor Lookup API URL',
        type: 'url',
        required: false,
        placeholder: 'https://your-erp.com/api/vendor-lookup'
      },
      {
        key: 'outputFilename',
        label: 'Output Filename Prefix',
        type: 'text',
        defaultValue: 'bank_reconciliation',
        required: false
      },
      {
        key: 'workflowName',
        label: 'Workflow Name',
        type: 'text',
        defaultValue: 'Bank Statement Reconciliation',
        required: true
      }
    ]
  },

  // ── Legal ─────────────────────────────────────────────────────────

  {
    id: 'tpl_contract_key_terms',
    name: 'Contract Key-Term Extractor',
    description: 'Pull critical clauses from contracts and produce a structured summary for review.',
    longDescription:
      'Extracts termination clauses, liability caps, payment terms, governing law, and party details from legal contracts (PDF/DOCX). A review gate lets lawyers verify before exporting a structured JSON/PDF summary.',
    category: 'Legal',
    icon: 'Scale',
    accentColor: 'purple',
    featured: true,
    estimatedDurationSec: 20,
    nodeCount: 4,
    useCaseText:
      'Legal teams that need to rapidly review contracts for key risk terms without reading every page manually.',
    defaultPipeline: {
      name: 'Contract Key-Term Extractor',
      description: 'Extract and summarize critical legal clauses from contracts',
      nodes: [
        node('n1', 'Select Documents', 'doc_select', 100, 200, { includeRawText: true }),
        node('n2', 'AI Extract Fields', 'ai_extract', 350, 200, {
          prompt:
            'Extract: party_a, party_b, effective_date, termination_clause, liability_cap, payment_terms, governing_law, jurisdiction',
          confidenceThreshold: 0.8
        }),
        node('n3', 'Review Gate', 'review', 600, 200, {}),
        node('n4', 'Export Results', 'export', 850, 200, { format: 'csv', filename: 'contract_terms' })
      ],
      edges: [
        edge('e1', 'n1', 'n2'),
        edge('e2', 'n2', 'n3'),
        edge('e3', 'n3', 'n4')
      ]
    },
    quickConfigFields: [
      {
        key: 'exportFormat',
        label: 'Export Format',
        type: 'select',
        options: ['csv', 'xlsx'],
        defaultValue: 'csv',
        required: false
      },
      {
        key: 'workflowName',
        label: 'Workflow Name',
        type: 'text',
        defaultValue: 'Contract Key-Term Extractor',
        required: true
      }
    ]
  },

  {
    id: 'tpl_nda_compliance',
    name: 'NDA Compliance Checker',
    description: 'Flag expired or incomplete NDAs and export a compliance register.',
    longDescription:
      'Processes signed NDAs to extract parties, dates, confidentiality period, and scope. Automatically flags NDAs that are expired or missing required clauses, routing them for legal review before adding to a CSV compliance register.',
    category: 'Legal',
    icon: 'ShieldCheck',
    accentColor: 'purple',
    featured: false,
    estimatedDurationSec: 15,
    nodeCount: 5,
    useCaseText:
      'Legal ops teams tracking large NDA portfolios who need to know which agreements are at risk or expiring.',
    defaultPipeline: {
      name: 'NDA Compliance Checker',
      description: 'Validate NDAs for completeness and expiry',
      nodes: [
        node('n1', 'Select Documents', 'doc_select', 100, 200, { includeRawText: true }),
        node('n2', 'AI Extract Fields', 'ai_extract', 350, 200, {
          prompt:
            'Extract: party_a, party_b, effective_date, expiry_date, confidentiality_period, scope, mutual',
          confidenceThreshold: 0.8
        }),
        node('n3', 'Compute Flags', 'transform', 600, 200, {
          transformations: [
            { sourceField: 'expiry_date', targetField: 'is_expired', expression: 'new Date(value) < new Date()' }
          ]
        }),
        node('n4', 'Check Compliance', 'condition', 850, 200, {
          field: 'is_expired',
          operator: 'equals',
          value: 'true',
          trueEdgeLabel: 'Non-compliant',
          falseEdgeLabel: 'Compliant'
        }),
        node('n5', 'Legal Review', 'review', 1100, 100, {}),
        node('n6', 'Export Register', 'export', 1350, 200, { format: 'csv', filename: 'nda_compliance' })
      ],
      edges: [
        edge('e1', 'n1', 'n2'),
        edge('e2', 'n2', 'n3'),
        edge('e3', 'n3', 'n4'),
        edge('e4', 'n4', 'n5', 'Non-compliant'),
        edge('e5', 'n4', 'n6', 'Compliant'),
        edge('e6', 'n5', 'n6')
      ]
    },
    quickConfigFields: [
      {
        key: 'expiryWarningDays',
        label: 'Days-Before-Expiry Warning',
        type: 'number',
        defaultValue: 30,
        required: false,
        helpText: 'Flag NDAs expiring within this many days'
      },
      {
        key: 'workflowName',
        label: 'Workflow Name',
        type: 'text',
        defaultValue: 'NDA Compliance Checker',
        required: true
      }
    ]
  },

  // ── HR ────────────────────────────────────────────────────────────

  {
    id: 'tpl_resume_parser',
    name: 'Resume / CV Parser',
    description: 'Batch-parse resumes into structured candidate profiles and push to your ATS.',
    longDescription:
      'Processes job applications (PDF/DOCX resumes) in batch. Extracts name, contact info, skills, work history, education, and certifications into a structured profile, then posts each candidate to your ATS system.',
    category: 'HR',
    icon: 'UserCheck',
    accentColor: 'emerald',
    featured: true,
    estimatedDurationSec: 10,
    nodeCount: 4,
    useCaseText:
      'HR teams receiving high volumes of job applications who need structured candidate data in their ATS without manual data entry.',
    defaultPipeline: {
      name: 'Resume / CV Parser',
      description: 'Extract candidate data from resumes and push to ATS',
      nodes: [
        node('n1', 'Select Documents', 'doc_select', 100, 200, { includeRawText: true }),
        node('n2', 'AI Extract Fields', 'ai_extract', 350, 200, {
          prompt:
            'Extract: full_name, email, phone, location, skills, work_history, education, certifications',
          confidenceThreshold: 0.75
        }),
        node('n3', 'Push to ATS', 'custom_api', 600, 200, {
          url: 'https://your-ats.com/api/candidates',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          bodyTemplate: '{"name":"{{full_name}}","email":"{{email}}","skills":"{{skills}}"}'
        }),
        node('n4', 'Export Shortlist', 'export', 850, 200, { format: 'csv', filename: 'candidates' })
      ],
      edges: [
        edge('e1', 'n1', 'n2'),
        edge('e2', 'n2', 'n3'),
        edge('e3', 'n3', 'n4')
      ]
    },
    quickConfigFields: [
      {
        key: 'atsEndpoint',
        label: 'ATS API Endpoint',
        type: 'url',
        required: false,
        placeholder: 'https://your-ats.com/api/candidates'
      },
      {
        key: 'jobTag',
        label: 'Job ID / Role Tag',
        type: 'text',
        required: false,
        placeholder: 'eng-backend-2026'
      },
      {
        key: 'workflowName',
        label: 'Workflow Name',
        type: 'text',
        defaultValue: 'Resume / CV Parser',
        required: true
      }
    ]
  },

  {
    id: 'tpl_onboarding_collector',
    name: 'Employee Onboarding Collector',
    description: 'Collect and validate onboarding documents, then populate your HRIS.',
    longDescription:
      'Multi-file intake per new hire: accepts ID proof, tax forms, bank details, and offer letters. Validates completeness, extracts key data, and populates your HRIS onboarding form. Missing documents are flagged for HR follow-up.',
    category: 'HR',
    icon: 'Users',
    accentColor: 'emerald',
    featured: false,
    estimatedDurationSec: 22,
    nodeCount: 5,
    useCaseText:
      'HR departments onboarding new employees who need to ensure all required documents are collected and data flows into the HRIS without manual entry.',
    defaultPipeline: {
      name: 'Employee Onboarding Collector',
      description: 'Validate and digitize employee onboarding documents',
      nodes: [
        node('n1', 'Select Documents', 'doc_select', 100, 200, { includeRawText: true }),
        node('n2', 'AI Extract Fields', 'ai_extract', 350, 200, {
          prompt:
            'Extract: employee_name, employee_id, document_type, id_number, tax_id, bank_account, effective_date',
          confidenceThreshold: 0.8
        }),
        node('n3', 'Validate Completeness', 'condition', 600, 200, {
          field: 'document_type',
          operator: 'not_equals',
          value: '',
          trueEdgeLabel: 'Complete',
          falseEdgeLabel: 'Missing docs'
        }),
        node('n4', 'HR Review', 'review', 850, 100, {}),
        node('n5', 'Fill HRIS Form', 'form_fill', 1100, 200, {
          fieldMapping: {
            employee_name: 'full_name',
            tax_id: 'tax_identification',
            bank_account: 'payment_account'
          }
        }),
        node('n6', 'Export Record', 'export', 1350, 200, { format: 'csv', filename: 'onboarding' })
      ],
      edges: [
        edge('e1', 'n1', 'n2'),
        edge('e2', 'n2', 'n3'),
        edge('e3', 'n3', 'n4', 'Missing docs'),
        edge('e4', 'n3', 'n5', 'Complete'),
        edge('e5', 'n4', 'n5'),
        edge('e6', 'n5', 'n6')
      ]
    },
    quickConfigFields: [
      {
        key: 'employeeIdPrefix',
        label: 'Employee ID Prefix',
        type: 'text',
        defaultValue: 'EMP-',
        required: false
      },
      {
        key: 'workflowName',
        label: 'Workflow Name',
        type: 'text',
        defaultValue: 'Employee Onboarding Collector',
        required: true
      }
    ]
  },

  // ── Healthcare ────────────────────────────────────────────────────

  {
    id: 'tpl_patient_intake',
    name: 'Patient Intake Form Digitizer',
    description: 'Digitize handwritten intake forms and push structured data to your EHR system.',
    longDescription:
      'OCRs handwritten or scanned patient intake forms to extract demographics, symptoms, medications, and allergies. A mandatory clinician review gate ensures HIPAA compliance before posting a FHIR bundle to your EHR.',
    category: 'Healthcare',
    icon: 'HeartPulse',
    accentColor: 'red',
    featured: true,
    estimatedDurationSec: 30,
    nodeCount: 5,
    useCaseText:
      'Healthcare providers digitizing paper intake forms who need structured patient data in their EHR without manual transcription errors.',
    defaultPipeline: {
      name: 'Patient Intake Form Digitizer',
      description: 'Digitize patient intake forms and submit to EHR',
      nodes: [
        node('n1', 'Select Documents', 'doc_select', 100, 200, { includeRawText: true }),
        node('n2', 'AI Extract Fields', 'ai_extract', 350, 200, {
          prompt:
            'Extract: patient_name, dob, gender, address, insurance_id, symptoms, current_medications, allergies, emergency_contact',
          confidenceThreshold: 0.9
        }),
        node('n3', 'Normalize Data', 'transform', 600, 200, {
          transformations: [
            { sourceField: 'dob', targetField: 'dob', expression: 'new Date(value).toISOString()' }
          ]
        }),
        node('n4', 'Clinician Review', 'review', 850, 200, {}),
        node('n5', 'Submit to EHR', 'custom_api', 1100, 200, {
          url: 'https://your-ehr.com/api/fhir/patient',
          method: 'POST',
          headers: { 'Content-Type': 'application/fhir+json' }
        })
      ],
      edges: [
        edge('e1', 'n1', 'n2'),
        edge('e2', 'n2', 'n3'),
        edge('e3', 'n3', 'n4'),
        edge('e4', 'n4', 'n5')
      ]
    },
    quickConfigFields: [
      {
        key: 'ehrEndpoint',
        label: 'EHR API Endpoint',
        type: 'url',
        required: false,
        placeholder: 'https://your-ehr.com/api/fhir/patient'
      },
      {
        key: 'workflowName',
        label: 'Workflow Name',
        type: 'text',
        defaultValue: 'Patient Intake Form Digitizer',
        required: true
      }
    ]
  },

  // ── Government ────────────────────────────────────────────────────

  {
    id: 'tpl_permit_processor',
    name: 'Permit Application Processor',
    description: 'Extract permit details, auto-route by value, and post to your permit tracking system.',
    longDescription:
      'Processes building, business, or event permit applications (PDF/DOCX). Extracts applicant details, permit type, dates, and estimated cost. High-value applications are routed for senior review; standard applications go directly to form fill and permit tracking.',
    category: 'Government',
    icon: 'Stamp',
    accentColor: 'amber',
    featured: false,
    estimatedDurationSec: 35,
    nodeCount: 6,
    useCaseText:
      'Government offices processing permit applications that need to route high-value permits for senior review while auto-approving standard ones.',
    defaultPipeline: {
      name: 'Permit Application Processor',
      description: 'Process and route permit applications by value',
      nodes: [
        node('n1', 'Select Documents', 'doc_select', 100, 200, { includeRawText: true }),
        node('n2', 'AI Extract Fields', 'ai_extract', 350, 200, {
          prompt:
            'Extract: applicant_name, applicant_id, permit_type, property_address, requested_start_date, requested_end_date, estimated_cost, contractor_license',
          confidenceThreshold: 0.85
        }),
        node('n3', 'Compute Flags', 'transform', 600, 200, {
          transformations: [
            { sourceField: 'estimated_cost', targetField: 'high_value', expression: 'Number(value) > 50000' }
          ]
        }),
        node('n4', 'Route by Value', 'condition', 850, 200, {
          field: 'high_value',
          operator: 'equals',
          value: 'true',
          trueEdgeLabel: 'Senior review',
          falseEdgeLabel: 'Standard'
        }),
        node('n5', 'Senior Review', 'review', 1100, 100, {}),
        node('n6', 'Fill Permit Form', 'form_fill', 1350, 200, {}),
        node('n7', 'Post to Tracker', 'custom_api', 1600, 200, {
          url: 'https://your-permit-system.com/api/permits',
          method: 'POST'
        })
      ],
      edges: [
        edge('e1', 'n1', 'n2'),
        edge('e2', 'n2', 'n3'),
        edge('e3', 'n3', 'n4'),
        edge('e4', 'n4', 'n5', 'Senior review'),
        edge('e5', 'n4', 'n6', 'Standard'),
        edge('e6', 'n5', 'n6'),
        edge('e7', 'n6', 'n7')
      ]
    },
    quickConfigFields: [
      {
        key: 'highValueThreshold',
        label: 'High-Value Threshold ($)',
        type: 'number',
        defaultValue: 50000,
        required: false,
        helpText: 'Applications above this amount require senior review'
      },
      {
        key: 'trackerApiUrl',
        label: 'Permit Tracker API URL',
        type: 'url',
        required: false,
        placeholder: 'https://your-permit-system.com/api/permits'
      },
      {
        key: 'workflowName',
        label: 'Workflow Name',
        type: 'text',
        defaultValue: 'Permit Application Processor',
        required: true
      }
    ]
  },

  {
    id: 'tpl_tax_digitizer',
    name: 'Tax Document Digitizer',
    description: 'Extract all fields from W-2/1099 scans, require reviewer sign-off, and file digitally.',
    longDescription:
      'Processes scanned W-2, 1099, or equivalent tax forms. Extracts all fields including taxpayer name, EIN, wages, and withholding. Mandatory reviewer sign-off before populating a digital filing form and exporting an encrypted record.',
    category: 'Government',
    icon: 'FileDigit',
    accentColor: 'amber',
    featured: false,
    estimatedDurationSec: 28,
    nodeCount: 4,
    useCaseText:
      'Tax authorities or accounting firms processing physical tax returns who need reliable digitization with mandatory review for compliance.',
    defaultPipeline: {
      name: 'Tax Document Digitizer',
      description: 'Digitize and file tax documents with mandatory review',
      nodes: [
        node('n1', 'Select Documents', 'doc_select', 100, 200, { includeRawText: true }),
        node('n2', 'AI Extract Fields', 'ai_extract', 350, 200, {
          prompt:
            'Extract: taxpayer_name, ssn_last4, tax_year, employer_name, ein, gross_wages, federal_withheld, state_withheld, form_type',
          confidenceThreshold: 0.92
        }),
        node('n3', 'Reviewer Sign-Off', 'review', 600, 200, {}),
        node('n4', 'Fill Tax Form', 'form_fill', 850, 200, {}),
        node('n5', 'Export Record', 'export', 1100, 200, { format: 'csv', filename: 'tax_records' })
      ],
      edges: [
        edge('e1', 'n1', 'n2'),
        edge('e2', 'n2', 'n3'),
        edge('e3', 'n3', 'n4'),
        edge('e4', 'n4', 'n5')
      ]
    },
    quickConfigFields: [
      {
        key: 'taxYear',
        label: 'Tax Year',
        type: 'number',
        defaultValue: 2025,
        required: false
      },
      {
        key: 'formType',
        label: 'Form Type',
        type: 'select',
        options: ['W-2', '1099', '1040', 'Other'],
        defaultValue: 'W-2',
        required: false
      },
      {
        key: 'workflowName',
        label: 'Workflow Name',
        type: 'text',
        defaultValue: 'Tax Document Digitizer',
        required: true
      }
    ]
  },

  // ── E-Commerce ────────────────────────────────────────────────────

  {
    id: 'tpl_po_matching',
    name: 'Purchase Order Matching',
    description: 'Match supplier invoices against open POs and flag mismatches for review.',
    longDescription:
      'Extracts invoice data from supplier PDFs/CSVs, fetches the matching purchase order from your ERP, and computes the variance. Mismatched invoices are flagged for review; matched ones are exported and posted back to your ERP.',
    category: 'E-Commerce',
    icon: 'ShoppingCart',
    accentColor: 'orange',
    featured: true,
    estimatedDurationSec: 20,
    nodeCount: 7,
    useCaseText:
      'Operations teams that receive supplier invoices and need to verify them against purchase orders before approving payment.',
    defaultPipeline: {
      name: 'Purchase Order Matching',
      description: 'Match invoices to POs and flag variances',
      nodes: [
        node('n1', 'Select Documents', 'doc_select', 100, 200, { includeRawText: true }),
        node('n2', 'AI Extract Invoice', 'ai_extract', 350, 200, {
          prompt:
            'Extract: invoice_number, vendor_id, po_number, line_items, total_amount, invoice_date',
          confidenceThreshold: 0.85
        }),
        node('n3', 'Coerce Amounts', 'transform', 600, 200, {
          transformations: [
            { sourceField: 'total_amount', targetField: 'total_amount', expression: 'Number(value)' }
          ]
        }),
        node('n4', 'Fetch PO from ERP', 'custom_api', 850, 200, {
          url: 'https://your-erp.com/api/purchase-orders/{{po_number}}',
          method: 'GET'
        }),
        node('n5', 'Compute Variance', 'transform', 1100, 200, {
          transformations: [
            { sourceField: 'total_amount', targetField: 'variance_flag', expression: 'Math.abs(value - po_total) > po_total * 0.05' }
          ]
        }),
        node('n6', 'Check Variance', 'condition', 1350, 200, {
          field: 'variance_flag',
          operator: 'equals',
          value: 'true',
          trueEdgeLabel: 'Mismatch',
          falseEdgeLabel: 'Matched'
        }),
        node('n7', 'AP Review', 'review', 1600, 100, {}),
        node('n8', 'Export Report', 'export', 1850, 200, { format: 'csv', filename: 'po_matching' })
      ],
      edges: [
        edge('e1', 'n1', 'n2'),
        edge('e2', 'n2', 'n3'),
        edge('e3', 'n3', 'n4'),
        edge('e4', 'n4', 'n5'),
        edge('e5', 'n5', 'n6'),
        edge('e6', 'n6', 'n7', 'Mismatch'),
        edge('e7', 'n6', 'n8', 'Matched'),
        edge('e8', 'n7', 'n8')
      ]
    },
    quickConfigFields: [
      {
        key: 'erpApiUrl',
        label: 'ERP API Base URL',
        type: 'url',
        required: false,
        placeholder: 'https://your-erp.com/api'
      },
      {
        key: 'varianceTolerance',
        label: 'Variance Tolerance (%)',
        type: 'number',
        defaultValue: 5,
        required: false,
        helpText: 'Flag invoices where variance exceeds this percentage of PO total'
      },
      {
        key: 'workflowName',
        label: 'Workflow Name',
        type: 'text',
        defaultValue: 'Purchase Order Matching',
        required: true
      }
    ]
  },

  // ── General ───────────────────────────────────────────────────────

  {
    id: 'tpl_doc_to_spreadsheet',
    name: 'Document → Spreadsheet',
    description: 'Batch-extract any fields from similar documents into a CSV or XLSX spreadsheet.',
    longDescription:
      'A fully configurable general-purpose extractor. Point it at any batch of similar documents (invoices, forms, certificates, reports), define the fields you want, and get a clean spreadsheet out. No coding required.',
    category: 'General',
    icon: 'TableProperties',
    accentColor: 'slate',
    featured: true,
    estimatedDurationSec: 8,
    nodeCount: 3,
    useCaseText:
      'Anyone who needs to turn a pile of similar documents into a structured spreadsheet — the quickest way to get started with automated extraction.',
    defaultPipeline: {
      name: 'Document → Spreadsheet',
      description: 'Extract custom fields from documents into a spreadsheet',
      nodes: [
        node('n1', 'Select Documents', 'doc_select', 100, 200, { includeRawText: true }),
        node('n2', 'AI Extract Fields', 'ai_extract', 350, 200, {
          prompt: 'Extract the following fields: [configure in Quick Config]',
          confidenceThreshold: 0.75
        }),
        node('n3', 'Export Results', 'export', 600, 200, { format: 'csv', filename: 'extracted_data' })
      ],
      edges: [
        edge('e1', 'n1', 'n2'),
        edge('e2', 'n2', 'n3')
      ]
    },
    quickConfigFields: [
      {
        key: 'fieldsToExtract',
        label: 'Fields to Extract',
        type: 'text',
        required: true,
        placeholder: 'name, date, amount, category, reference_number',
        helpText: 'Comma-separated list of field names to extract from each document'
      },
      {
        key: 'exportFormat',
        label: 'Output Format',
        type: 'select',
        options: ['csv', 'xlsx'],
        defaultValue: 'csv',
        required: false
      },
      {
        key: 'filenamePrefix',
        label: 'Filename Prefix',
        type: 'text',
        defaultValue: 'extracted_data',
        required: false
      },
      {
        key: 'workflowName',
        label: 'Workflow Name',
        type: 'text',
        defaultValue: 'Document → Spreadsheet',
        required: true
      }
    ]
  }
]

// ─── Category Metadata ────────────────────────────────────────────

export const CATEGORY_ACCENT: Record<TemplateCategory, TemplateAccentColor> = {
  Finance: 'cyan',
  Legal: 'purple',
  HR: 'emerald',
  Healthcare: 'red',
  Government: 'amber',
  'E-Commerce': 'orange',
  General: 'slate'
}

export const ACCENT_CLASSES: Record<TemplateAccentColor, { border: string; badge: string; text: string; glow: string }> = {
  cyan: {
    border: 'hover:border-cyan-500/40',
    badge: 'bg-cyan-500/15 text-cyan-400',
    text: 'text-cyan-400',
    glow: 'shadow-cyan-500/10'
  },
  purple: {
    border: 'hover:border-purple-500/40',
    badge: 'bg-purple-500/15 text-purple-400',
    text: 'text-purple-400',
    glow: 'shadow-purple-500/10'
  },
  emerald: {
    border: 'hover:border-emerald-500/40',
    badge: 'bg-emerald-500/15 text-emerald-400',
    text: 'text-emerald-400',
    glow: 'shadow-emerald-500/10'
  },
  red: {
    border: 'hover:border-red-500/40',
    badge: 'bg-red-500/15 text-red-400',
    text: 'text-red-400',
    glow: 'shadow-red-500/10'
  },
  amber: {
    border: 'hover:border-amber-500/40',
    badge: 'bg-amber-500/15 text-amber-400',
    text: 'text-amber-400',
    glow: 'shadow-amber-500/10'
  },
  orange: {
    border: 'hover:border-orange-500/40',
    badge: 'bg-orange-500/15 text-orange-400',
    text: 'text-orange-400',
    glow: 'shadow-orange-500/10'
  },
  slate: {
    border: 'hover:border-slate-400/40',
    badge: 'bg-slate-500/15 text-slate-400',
    text: 'text-slate-400',
    glow: 'shadow-slate-500/10'
  }
}

// ─── Template → Pipeline Builder ──────────────────────────────────

/**
 * Deep-clones a template's defaultPipeline, applies quickConfig overrides,
 * and returns a ready-to-POST CreatePipelinePayload.
 */
export function buildPipelineFromTemplate(
  template: PipelineTemplate,
  quickConfig: Record<string, unknown>
): CreatePipelinePayload {
  const name =
    typeof quickConfig['workflowName'] === 'string' && quickConfig['workflowName'].trim()
      ? quickConfig['workflowName'].trim()
      : template.name

  // Deep clone nodes so we don't mutate the template
  const nodes: PipelineNode[] = template.defaultPipeline.nodes.map((n) => {
    const clonedConfig = { ...n.config }

    // Apply quick config mappings into relevant nodes
    if (n.type === 'export') {
      if (quickConfig['exportFormat']) clonedConfig['format'] = quickConfig['exportFormat']
      if (quickConfig['filenamePrefix']) clonedConfig['filename'] = quickConfig['filenamePrefix']
      if (quickConfig['outputFilename']) clonedConfig['filename'] = quickConfig['outputFilename']
      if (quickConfig['webhookUrl']) clonedConfig['webhookUrl'] = quickConfig['webhookUrl']
    }

    if (n.type === 'ai_extract') {
      if (quickConfig['fieldsToExtract']) {
        clonedConfig['prompt'] =
          `Extract the following fields from each document: ${quickConfig['fieldsToExtract']}`
      }
    }

    if (n.type === 'custom_api') {
      if (quickConfig['webhookUrl'] && !quickConfig['erpApiUrl'] && !quickConfig['atsEndpoint'] && !quickConfig['ehrEndpoint'] && !quickConfig['trackerApiUrl'] && !quickConfig['vendorLookupUrl']) {
        clonedConfig['url'] = quickConfig['webhookUrl']
      }
      if (quickConfig['erpApiUrl']) clonedConfig['url'] = `${quickConfig['erpApiUrl']}/purchase-orders/{{po_number}}`
      if (quickConfig['atsEndpoint']) clonedConfig['url'] = quickConfig['atsEndpoint']
      if (quickConfig['ehrEndpoint']) clonedConfig['url'] = quickConfig['ehrEndpoint']
      if (quickConfig['trackerApiUrl']) clonedConfig['url'] = quickConfig['trackerApiUrl']
      if (quickConfig['vendorLookupUrl']) clonedConfig['url'] = quickConfig['vendorLookupUrl']
    }

    if (n.type === 'condition') {
      if (quickConfig['perItemLimit'] !== undefined) {
        // Re-stamp the expression in transform nodes instead (condition just compares)
      }
    }

    return { ...n, config: clonedConfig }
  })

  const edges: PipelineEdge[] = template.defaultPipeline.edges.map((e) => ({ ...e }))

  return {
    name,
    description: template.longDescription,
    workspace: 'default',
    nodes,
    edges
  }
}
