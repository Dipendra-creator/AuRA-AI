/**
 * Data Service — Central data provider for Aura AI MVP.
 *
 * Primary: fetches from Go backend API (http://localhost:8080/api/v1).
 * Fallback: on network failure, returns mock JSON data for read-only operations.
 * Mutations (create, update, delete, upload) always go through the API and fail
 * loudly if the backend is unavailable.
 */

import type {
  AuraDocument,
  DashboardStats,
  ChartDataPoint,
  ActivityEvent,
  PipelineNode,
  PipelineEdge,
  PipelineMetadata,
  PipelineRun,
  FormTemplate,
  AnalysisViewMeta,
  CreateDocumentInput,
  SchemaField
} from '../../../shared/types/document.types'

import { apiGet, apiPost, apiPatch, apiDelete, apiPostFormData, apiPostBlob } from './api-client'
import type { AnalysisEvent } from './api-client'
import { wsClient } from './ws-client'

// Re-export for consumers
export type { AnalysisEvent }
export type { SchemaField }

import dashboardMock from './dashboard.mock.json'
import documentsMock from './documents.mock.json'
import workflowsMock from './workflows.mock.json'

// ─── Bundle Types ────────────────────────────────────────────────

/** Dashboard data bundle */
export interface DashboardDataBundle {
  readonly stats: DashboardStats
  readonly chartData: readonly ChartDataPoint[]
  readonly activityTimeline: readonly ActivityEvent[]
  readonly recentDocuments: readonly AuraDocument[]
}

/** Documents data bundle */
export interface DocumentsDataBundle {
  readonly documents: readonly AuraDocument[]
  readonly analysisView: AnalysisViewMeta
}

/** Workflows data bundle */
export interface WorkflowsDataBundle {
  readonly pipeline: PipelineMetadata
  readonly nodes: readonly PipelineNode[]
  readonly edges: readonly PipelineEdge[]
}

/** Full pipeline object returned by the list endpoint */
export interface PipelineListItem {
  readonly _id: string
  readonly name: string
  readonly description: string
  readonly status: string
  readonly latency: string
  readonly workspace: string
  readonly version: string
  readonly nodes: PipelineNode[]
  readonly edges: PipelineEdge[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** A pipeline with its recent runs */
export interface PipelineWithRuns {
  readonly pipeline: PipelineListItem
  readonly runs: PipelineRun[]
}

/** Health status from backend */
export interface HealthStatus {
  readonly status: string
  readonly database: string
  readonly uptime?: string
}

// ─── Read Operations (with mock fallback) ────────────────────────

/**
 * Fetches dashboard data from the API with mock fallback.
 */
export async function getDashboardData(): Promise<DashboardDataBundle> {
  try {
    const [stats, chartData, activityTimeline, recentDocuments] = await Promise.all([
      apiGet<DashboardStats>('/dashboard/stats'),
      apiGet<ChartDataPoint[]>('/dashboard/chart'),
      apiGet<ActivityEvent[]>('/activity'),
      apiGet<AuraDocument[]>('/dashboard/recent')
    ])
    return { stats, chartData, activityTimeline, recentDocuments }
  } catch {
    console.warn('[DataService] API unavailable, using mock data for dashboard')
    return {
      stats: dashboardMock.stats as DashboardStats,
      chartData: dashboardMock.chartData as ChartDataPoint[],
      activityTimeline: dashboardMock.activityTimeline as unknown as ActivityEvent[],
      recentDocuments: dashboardMock.recentDocuments as unknown as AuraDocument[]
    }
  }
}

/**
 * Fetches document list from the API with mock fallback.
 * Supports optional filter parameters for server-side filtering.
 */
export async function getDocumentsData(params?: {
  status?: string
  type?: string
  search?: string
  page?: number
  limit?: number
}): Promise<DocumentsDataBundle> {
  try {
    const query = new URLSearchParams()
    if (params?.status && params.status !== 'all') query.set('status', params.status)
    if (params?.type) query.set('type', params.type)
    if (params?.search) query.set('search', params.search)
    if (params?.page) query.set('page', String(params.page))
    if (params?.limit) query.set('limit', String(params.limit))

    const queryStr = query.toString()
    const path = queryStr ? `/documents?${queryStr}` : '/documents'
    const documents = await apiGet<AuraDocument[]>(path)
    return {
      documents,
      analysisView: documentsMock.analysisView as AnalysisViewMeta
    }
  } catch {
    console.warn('[DataService] API unavailable, using mock data for documents')
    return {
      documents: documentsMock.documents as unknown as AuraDocument[],
      analysisView: documentsMock.analysisView as AnalysisViewMeta
    }
  }
}

/**
 * Fetches workflow/pipeline data from the API with mock fallback.
 * If the API returns no pipelines, automatically creates a default one.
 */
export async function getWorkflowsData(): Promise<WorkflowsDataBundle> {
  try {
    const pipelines = await apiGet<
      Array<{
        _id: string
        name: string
        description: string
        status: string
        latency: string
        workspace: string
        version: string
        nodes: PipelineNode[]
        edges: PipelineEdge[]
      }>
    >('/pipelines')

    let first = pipelines[0]

    // Auto-create a default pipeline if none exist
    if (!first) {
      console.info('[DataService] No pipelines found, creating default pipeline')
      const created = await apiPost<{
        _id: string
        name: string
        description: string
        status: string
        latency: string
        workspace: string
        version: string
        nodes: PipelineNode[]
        edges: PipelineEdge[]
      }>('/pipelines', {
        name: 'Data Pipeline V1',
        workspace: 'Default',
        description: 'Auto-created pipeline',
        nodes: [],
        edges: []
      })
      first = created
    }

    return {
      pipeline: {
        id: first._id,
        name: first.name,
        description: first.description ?? '',
        status: first.status ?? 'operational',
        latency: first.latency ?? '0ms',
        workspace: first.workspace ?? 'Default',
        version: first.version ?? '1.0.0'
      },
      nodes: first.nodes ?? [],
      edges: first.edges ?? []
    }
  } catch {
    console.warn('[DataService] API unavailable, using mock data for workflows')
    return {
      pipeline: workflowsMock.pipeline as PipelineMetadata,
      nodes: workflowsMock.nodes as unknown as PipelineNode[],
      edges: ((workflowsMock as Record<string, unknown>).edges as PipelineEdge[]) ?? []
    }
  }
}

// ─── Mutation Operations (NO mock fallback — fail loudly) ────────

/**
 * Creates a new document record via the API.
 */
export async function createDocument(input: CreateDocumentInput): Promise<AuraDocument> {
  return apiPost<AuraDocument>('/documents', input)
}

/**
 * Updates a document (e.g. status, confidence, extracted fields).
 */
export async function updateDocument(
  id: string,
  updates: {
    status?: string
    confidence?: number
    extractedFields?: AuraDocument['extractedFields']
  }
): Promise<AuraDocument> {
  return apiPatch<AuraDocument>(`/documents/${id}`, updates)
}

/**
 * Deletes a document by ID.
 */
export async function deleteDocument(id: string): Promise<void> {
  return apiDelete(`/documents/${id}`)
}

/**
 * Triggers AI analysis on a document.
 */
export async function analyzeDocument(id: string): Promise<AuraDocument> {
  return apiPost<AuraDocument>(`/documents/${id}/analyze`, {})
}

/**
 * Triggers AI analysis on a document with real-time WebSocket progress streaming.
 * Optionally accepts a custom extraction schema.
 * Returns a cleanup function to cancel the subscription.
 */
export function analyzeDocumentWS(
  id: string,
  onEvent: (event: AnalysisEvent) => void,
  onDone?: () => void,
  onError?: (err: Error) => void,
  schema?: readonly SchemaField[]
): () => void {
  return wsClient.analyzeDocument(id, onEvent, onDone, onError, schema)
}

/**
 * Uploads a file and creates a document record.
 */
export async function uploadDocument(file: File): Promise<AuraDocument> {
  const formData = new FormData()
  formData.append('file', file)
  return apiPostFormData<AuraDocument>('/documents/upload', formData)
}

/**
 * Creates a new pipeline.
 */
export async function createPipeline(input: {
  name: string
  workspace: string
  nodes?: PipelineNode[]
}): Promise<unknown> {
  return apiPost('/pipelines', input)
}

/**
 * Updates a pipeline (name, status, nodes, etc).
 */
export async function updatePipeline(
  id: string,
  updates: {
    name?: string
    description?: string
    status?: string
    latency?: string
    version?: string
    nodes?: PipelineNode[]
    edges?: PipelineEdge[]
  }
): Promise<unknown> {
  return apiPatch(`/pipelines/${id}`, updates)
}

// ─── Pipeline List / Detail APIs ─────────────────────────────────

/** Fetch ALL pipelines (for dashboard) */
export async function getAllPipelines(): Promise<PipelineListItem[]> {
  return apiGet<PipelineListItem[]>('/pipelines')
}

/** Fetch a single pipeline by ID with its recent runs */
export async function getPipelineWithRuns(id: string): Promise<PipelineWithRuns> {
  const [pipeline, runs] = await Promise.all([
    apiGet<PipelineListItem>(`/pipelines/${id}`),
    listPipelineRuns(id).catch(() => [] as PipelineRun[])
  ])
  return { pipeline, runs }
}

// ─── Pipeline Execution APIs ─────────────────────────────────────

/** Execute a pipeline */
export async function executePipeline(
  id: string,
  input?: Record<string, unknown>
): Promise<PipelineRun> {
  return apiPost<PipelineRun>(`/pipelines/${id}/execute`, input ?? {})
}

/** List all runs for a pipeline */
export async function listPipelineRuns(id: string): Promise<PipelineRun[]> {
  return apiGet<PipelineRun[]>(`/pipelines/${id}/runs`)
}

/** Get a specific pipeline run */
export async function getPipelineRun(pipelineId: string, runId: string): Promise<PipelineRun> {
  return apiGet<PipelineRun>(`/pipelines/${pipelineId}/runs/${runId}`)
}

/** Cancel a pipeline run */
export async function cancelPipelineRun(pipelineId: string, runId: string): Promise<void> {
  await apiPost(`/pipelines/${pipelineId}/runs/${runId}/cancel`, {})
}

/** Validate a pipeline */
export async function validatePipeline(id: string): Promise<{ message: string }> {
  return apiPost<{ message: string }>(`/pipelines/${id}/validate`, {})
}

// ─── Review APIs ─────────────────────────────────────────────────

/** Approve a review node */
export async function approveNode(runId: string, nodeId: string): Promise<void> {
  await apiPost(`/runs/${runId}/nodes/${nodeId}/approve`, {})
}

/** Reject a review node */
export async function rejectNode(runId: string, nodeId: string): Promise<void> {
  await apiPost(`/runs/${runId}/nodes/${nodeId}/reject`, {})
}

// ─── Form Template APIs ──────────────────────────────────────────

/** List all form templates */
export async function listFormTemplates(): Promise<FormTemplate[]> {
  return apiGet<FormTemplate[]>('/form-templates')
}

/** Create a form template */
export async function createFormTemplate(
  template: Omit<FormTemplate, '_id'>
): Promise<FormTemplate> {
  return apiPost<FormTemplate>('/form-templates', template)
}

/** Get a form template by ID */
export async function getFormTemplate(id: string): Promise<FormTemplate> {
  return apiGet<FormTemplate>(`/form-templates/${id}`)
}

/** Delete a form template */
export async function deleteFormTemplate(id: string): Promise<void> {
  return apiDelete(`/form-templates/${id}`)
}

/**
 * Deletes a pipeline by ID.
 */
export async function deletePipeline(id: string): Promise<void> {
  return apiDelete(`/pipelines/${id}`)
}

/**
 * Creates an activity event.
 */
export async function createActivity(input: {
  type: string
  title: string
  source: string
  icon: string
}): Promise<unknown> {
  return apiPost('/activity', input)
}

// ─── Export ──────────────────────────────────────────────────────

/**
 * Exports document extracted fields as CSV or Excel.
 * Returns a Blob that can be downloaded by the browser.
 */
export async function exportDocument(id: string, format: 'csv' | 'xlsx'): Promise<Blob> {
  return apiPostBlob(`/documents/${id}/export`, { format })
}

// ─── Health Check ────────────────────────────────────────────────

/**
 * Checks if the backend is healthy and returns status info.
 * Returns null if the backend is unreachable.
 */
export async function checkBackendHealth(): Promise<HealthStatus | null> {
  try {
    return await apiGet<HealthStatus>('/health')
  } catch {
    return null
  }
}
