/**
 * Preload bridge for Aura AI.
 *
 * Exposes typed APIs to the renderer via contextBridge.
 * UI → Typed API → Preload → IPC → Main Service
 *
 * Never expose raw ipcRenderer — whitelist explicitly.
 */

import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { DocumentChannels } from '../shared/contracts/document.contract'
import { WindowChannels } from '../shared/contracts/window.contract'
import type { DocumentAPI } from '../shared/contracts/document.contract'
import type { WindowAPI } from '../shared/contracts/window.contract'
import type { CreateDocumentInput, DocumentId } from '../shared/types/document.types'

/** Typed Document API exposed to renderer */
const documentAPI: DocumentAPI = {
  list: () => ipcRenderer.invoke(DocumentChannels.LIST),
  getById: (id: DocumentId) => ipcRenderer.invoke(DocumentChannels.GET_BY_ID, id),
  create: (input: CreateDocumentInput) => ipcRenderer.invoke(DocumentChannels.CREATE, input),
  delete: (id: DocumentId) => ipcRenderer.invoke(DocumentChannels.DELETE, id),
  getStats: () => ipcRenderer.invoke(DocumentChannels.GET_STATS)
}

/** Typed Window API exposed to renderer */
const windowAPI: WindowAPI = {
  minimize: () => ipcRenderer.invoke(WindowChannels.MINIMIZE),
  maximize: () => ipcRenderer.invoke(WindowChannels.MAXIMIZE),
  close: () => ipcRenderer.invoke(WindowChannels.CLOSE)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('documentAPI', documentAPI)
    contextBridge.exposeInMainWorld('windowAPI', windowAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  globalThis.electron = electronAPI
  // @ts-ignore (define in dts)
  globalThis.documentAPI = documentAPI
  // @ts-ignore (define in dts)
  globalThis.windowAPI = windowAPI
}
