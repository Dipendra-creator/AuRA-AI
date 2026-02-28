/**
 * Mock Data Service — Central data provider for Aura AI.
 *
 * Imports JSON mock data and provides typed accessors.
 * When the backend is ready, swap these functions to use IPC calls.
 * Zero component changes needed.
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

import dashboardData from './dashboard.mock.json'
import documentsData from './documents.mock.json'
import workflowsData from './workflows.mock.json'

/** Dashboard data bundle returned by getDashboardData() */
export interface DashboardDataBundle {
  readonly stats: DashboardStats
  readonly chartData: readonly ChartDataPoint[]
  readonly activityTimeline: readonly ActivityEvent[]
  readonly recentDocuments: readonly AuraDocument[]
}

/** Documents data bundle returned by getDocumentsData() */
export interface DocumentsDataBundle {
  readonly documents: readonly AuraDocument[]
  readonly analysisView: AnalysisViewMeta
}

/** Workflows data bundle returned by getWorkflowsData() */
export interface WorkflowsDataBundle {
  readonly pipeline: PipelineMetadata
  readonly nodes: readonly PipelineNode[]
}

/**
 * Returns all dashboard data: stats, chart points, timeline events, and recent docs.
 * Replace with IPC call when backend is ready.
 */
export function getDashboardData(): DashboardDataBundle {
  return {
    stats: dashboardData.stats as DashboardStats,
    chartData: dashboardData.chartData as ChartDataPoint[],
    activityTimeline: dashboardData.activityTimeline as unknown as ActivityEvent[],
    recentDocuments: dashboardData.recentDocuments as unknown as AuraDocument[]
  }
}

/**
 * Returns all document data: full document list and analysis view metadata.
 * Replace with IPC call when backend is ready.
 */
export function getDocumentsData(): DocumentsDataBundle {
  return {
    documents: documentsData.documents as unknown as AuraDocument[],
    analysisView: documentsData.analysisView as AnalysisViewMeta
  }
}

/**
 * Returns workflow pipeline data: pipeline metadata and node definitions.
 * Replace with IPC call when backend is ready.
 */
export function getWorkflowsData(): WorkflowsDataBundle {
  return {
    pipeline: workflowsData.pipeline as PipelineMetadata,
    nodes: workflowsData.nodes as unknown as PipelineNode[]
  }
}
