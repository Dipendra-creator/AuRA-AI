import { ElectronAPI } from '@electron-toolkit/preload'
import type { DocumentAPI } from '../shared/contracts/document.contract'
import type { WindowAPI } from '../shared/contracts/window.contract'

declare global {
  interface Window {
    electron: ElectronAPI
    documentAPI: DocumentAPI
    windowAPI: WindowAPI
  }
}
