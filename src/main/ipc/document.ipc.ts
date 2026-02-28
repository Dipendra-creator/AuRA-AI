/**
 * IPC handlers for document operations.
 * Wires main process services to typed IPC channels.
 * UI → Typed API → Preload → IPC → Main Service
 */

import { ipcMain } from 'electron'
import { DocumentChannels } from '../../shared/contracts/document.contract'
import {
  listDocuments,
  getDocumentById,
  createDocument,
  deleteDocument,
  getDashboardStats
} from '../services/mongodb.service'
import type { CreateDocumentInput } from '../../shared/types/document.types'

/** Register all document IPC handlers */
export function registerDocumentIPC(): void {
  ipcMain.handle(DocumentChannels.LIST, async () => {
    return await listDocuments()
  })

  ipcMain.handle(DocumentChannels.GET_BY_ID, async (_event, id: string) => {
    return await getDocumentById(id)
  })

  ipcMain.handle(DocumentChannels.CREATE, async (_event, input: CreateDocumentInput) => {
    return await createDocument(input)
  })

  ipcMain.handle(DocumentChannels.DELETE, async (_event, id: string) => {
    return await deleteDocument(id)
  })

  ipcMain.handle(DocumentChannels.GET_STATS, async () => {
    return await getDashboardStats()
  })
}
