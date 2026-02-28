/**
 * Data Service — Central data provider for Aura AI.
 *
 * Primary: fetches from Go backend API (http://localhost:8080/api/v1).
 * Fallback: on network failure, returns mock JSON data for offline resilience.
 * Components use the same async interface regardless of data source.
 */

import type {
  AuraDocument,
  DashboardStats,
  ChartDataPoint,
  ActivityEvent,
  PipelineNode,
  PipelineMetadata,
  AnalysisViewMeta
} from '../../../shared/types/document.types'

import { apiGet } from './api-client'

import dashboardMock from './dashboard.mock.json'
import documentsMock from './documents.mock.json'
import workflowsMock from './workflows.mock.json'

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
}

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
 * Fetches document data from the API with mock fallback.
 */
export async function getDocumentsData(): Promise<DocumentsDataBundle> {
  try {
    const documents = await apiGet<AuraDocument[]>('/documents')
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
 */
export async function getWorkflowsData(): Promise<WorkflowsDataBundle> {
  try {
    const pipelines = await apiGet<Array<{
      name: string
      status: string
      latency: string
      workspace: string
      version: string
      nodes: PipelineNode[]
    }>>('/pipelines')
    const first = pipelines[0]
    if (!first) throw new Error('No pipelines found')
    return {
      pipeline: {
        name: first.name,
        status: first.status,
        latency: first.latency,
        workspace: first.workspace,
        version: first.version
      },
      nodes: first.nodes ?? []
    }
  } catch {
    console.warn('[DataService] API unavailable, using mock data for workflows')
    return {
      pipeline: workflowsMock.pipeline as PipelineMetadata,
      nodes: workflowsMock.nodes as unknown as PipelineNode[]
    }
  }
}
