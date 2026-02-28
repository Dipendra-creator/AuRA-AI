/**
 * IPC handlers for window control operations.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { WindowChannels } from '../../shared/contracts/window.contract'

export function registerWindowIPC(): void {
  ipcMain.handle(WindowChannels.MINIMIZE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })

  ipcMain.handle(WindowChannels.MAXIMIZE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.handle(WindowChannels.CLOSE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })
}
