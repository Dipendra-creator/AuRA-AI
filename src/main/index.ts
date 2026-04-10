/**
 * Main process entry point for Aura AI.
 *
 * Responsibilities:
 * - Window creation with macOS-native settings
 * - Go backend lifecycle (start on launch, stop on quit)
 * - MongoDB connection lifecycle
 * - IPC handler registration
 * - Native menu bar
 * 
 */

import { app, shell, BrowserWindow, Menu } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { startBackend, stopBackend } from './services/backend.service'
import { connectToDatabase, disconnectFromDatabase } from './services/mongodb.service'
import { registerDocumentIPC } from './ipc/document.ipc'
import { registerWindowIPC } from './ipc/window.ipc'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 18 },
    vibrancy: 'sidebar',
    backgroundColor: '#0F172A',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer based on electron-vite cli
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Build native macOS menu bar following Apple HIG */
function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'Import Documents...', accelerator: 'CmdOrCtrl+O', click: (): void => {} },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: (): void => {
            shell.openExternal('https://aura-ai.dev/docs')
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// ── Deep-link protocol (aura-ai://) for OAuth callback redirect ──────────────
// Must be registered before app.whenReady() so macOS associates the scheme.
if (is.dev) {
  // In dev, Electron runs via the electron binary; pass the app path so the
  // running dev instance receives the URL.
  app.setAsDefaultProtocolClient('aura-ai', process.execPath, [
    app.getAppPath()
  ])
} else {
  app.setAsDefaultProtocolClient('aura-ai')
}

// On macOS, open-url fires on the *running* instance when a aura-ai:// link is opened.
app.on('open-url', (event, _url) => {
  event.preventDefault()
  // Bring the main window to front so the user sees the now-logged-in app.
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    // macOS: also activate the app (important when switching from browser)
    app.focus({ steal: true })
  }
})

// App lifecycle
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.aura-ai.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Create native menu
  createMenu()

  // Register IPC handlers
  registerDocumentIPC()
  registerWindowIPC()

  // ── Start the embedded Go backend ──────────────────────────────────────────
  // In dev this targets backend/bin/aura-api-darwin-{arch}.
  // In production the universal binary is at process.resourcesPath/bin/aura-api.
  try {
    await startBackend()
  } catch (err) {
    console.error('[Aura AI] Backend failed to start:', err)
    console.warn('[Aura AI] App will run in degraded mode — API features unavailable')
  }

  // ── Connect to MongoDB (Electron-side direct connection for IPC handlers) ──
  const dbResult = await connectToDatabase()
  if (!dbResult.success) {
    console.warn('[Aura AI] MongoDB connection failed:', dbResult.error)
    console.warn('[Aura AI] App will run in offline mode')
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  stopBackend()
  await disconnectFromDatabase()
})
