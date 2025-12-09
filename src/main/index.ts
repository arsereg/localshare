/**
 * Electron Main Process
 * Handles application lifecycle, window management, and IPC communication
 */
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { CollaborationServer } from './server'
import { IPC_CHANNELS, ProjectFile, GuestCredential } from '../shared/types'

// Globals
let mainWindow: BrowserWindow | null = null
let collaborationServer: CollaborationServer | null = null
const credentials: Map<string, GuestCredential> = new Map()

// Default project directory
const PROJECT_DIR = join(app.getPath('home'), '.collab-editor', 'projects')

function ensureProjectDir(): void {
  if (!existsSync(PROJECT_DIR)) {
    mkdirSync(PROJECT_DIR, { recursive: true })
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0a0e14',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Load renderer
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function startCollaborationServer(): Promise<void> {
  collaborationServer = new CollaborationServer(credentials)

  // Set up callback to forward guest content updates to renderer
  collaborationServer.setOnContentUpdate((tabId: string, content: string) => {
    console.log('[Main] Received content update from server for tab', tabId, ', forwarding to renderer')
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.SERVER_CONTENT_UPDATE, { tabId, content })
    } else {
      console.log('[Main] WARNING: mainWindow is null!')
    }
  })

  // Set up callback for client count changes
  collaborationServer.setOnClientCountChange((count: number) => {
    console.log('[Main] Client count changed:', count)
    if (mainWindow) {
      const status = collaborationServer!.getStatus()
      mainWindow.webContents.send(IPC_CHANNELS.SERVER_STATUS, status)
    }
  })

  try {
    const serverInfo = await collaborationServer.start()
    console.log(`Collaboration server started on ${serverInfo.ip}:${serverInfo.port}`)

    // Notify renderer of server status
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.SERVER_STATUS, {
        isRunning: true,
        port: serverInfo.port,
        ip: serverInfo.ip,
        connectedClients: 0,
        isEncrypted: serverInfo.isEncrypted
      })
    }
  } catch (error) {
    console.error('Failed to start collaboration server:', error)
  }
}

// IPC Handlers

// File operations
ipcMain.handle(IPC_CHANNELS.FILE_SAVE, async (_event, project: ProjectFile) => {
  ensureProjectDir()
  const filePath = join(PROJECT_DIR, `${project.projectName}.json`)

  try {
    writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf-8')
    return { success: true, path: filePath }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle(IPC_CHANNELS.FILE_LOAD, async (_event, projectName: string) => {
  ensureProjectDir()
  const filePath = join(PROJECT_DIR, `${projectName}.json`)

  try {
    if (!existsSync(filePath)) {
      return { success: false, error: 'File not found' }
    }
    const content = readFileSync(filePath, 'utf-8')
    return { success: true, project: JSON.parse(content) as ProjectFile }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle(IPC_CHANNELS.FILE_OPEN_DIALOG, async () => {
  if (!mainWindow) return { success: false, error: 'No window' }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'LocalShare Projects', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    defaultPath: PROJECT_DIR
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true }
  }

  try {
    const content = readFileSync(result.filePaths[0], 'utf-8')
    return { success: true, project: JSON.parse(content) as ProjectFile }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle(IPC_CHANNELS.FILE_SAVE_AS, async (_event, project: ProjectFile) => {
  if (!mainWindow) return { success: false, error: 'No window' }

  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'LocalShare Projects', extensions: ['json'] }],
    defaultPath: join(PROJECT_DIR, `${project.projectName}.json`)
  })

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true }
  }

  try {
    writeFileSync(result.filePath, JSON.stringify(project, null, 2), 'utf-8')
    return { success: true, path: result.filePath }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Save single tab content to file (user picks location)
ipcMain.handle(IPC_CHANNELS.FILE_SAVE_TAB_TO_FILE, async (_event, data: { filename: string; content: string }) => {
  if (!mainWindow) return { success: false, error: 'No window' }

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: join(app.getPath('documents'), data.filename),
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true }
  }

  try {
    writeFileSync(result.filePath, data.content, 'utf-8')
    return { success: true, path: result.filePath }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Open content in VS Code (creates temp file and opens it with 'code' CLI)
ipcMain.handle(IPC_CHANNELS.FILE_OPEN_IN_VSCODE, async (_event, data: { filename: string; content: string }) => {
  const tempDir = join(app.getPath('temp'), 'localshare')

  try {
    // Ensure temp directory exists
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true })
    }

    // Write temp file
    const tempFilePath = join(tempDir, data.filename)
    writeFileSync(tempFilePath, data.content, 'utf-8')

    // Open in VS Code using the 'code' CLI command
    const { spawn } = require('child_process')
    const child = spawn('code', [tempFilePath], {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Server operations
ipcMain.handle(IPC_CHANNELS.SERVER_STATUS, () => {
  if (!collaborationServer) {
    return {
      isRunning: false,
      port: null,
      ip: null,
      connectedClients: 0,
      isEncrypted: false
    }
  }
  return collaborationServer.getStatus()
})

ipcMain.handle(IPC_CHANNELS.SERVER_GET_CONNECTION_URL, () => {
  if (!collaborationServer) return null
  return collaborationServer.getConnectionUrl()
})

ipcMain.handle(IPC_CHANNELS.SERVER_SYNC_CONTENT, (_event, data: { tabId: string; content: string; filename: string }) => {
  if (!collaborationServer) return { success: false, error: 'Server not running' }
  collaborationServer.updateTabContent(data.tabId, data.content, data.filename)
  return { success: true }
})

ipcMain.handle('server:set-active-tab', (_event, tabId: string) => {
  if (!collaborationServer) return { success: false, error: 'Server not running' }
  collaborationServer.setActiveTab(tabId)
  return { success: true }
})

ipcMain.handle('server:add-tab', (_event, data: { tabId: string; filename: string; content: string }) => {
  if (!collaborationServer) return { success: false, error: 'Server not running' }
  collaborationServer.addTab(data.tabId, data.filename, data.content)
  return { success: true }
})

ipcMain.handle('server:remove-tab', (_event, tabId: string) => {
  if (!collaborationServer) return { success: false, error: 'Server not running' }
  collaborationServer.removeTab(tabId)
  return { success: true }
})

ipcMain.handle('server:rename-tab', (_event, data: { tabId: string; filename: string }) => {
  if (!collaborationServer) return { success: false, error: 'Server not running' }
  collaborationServer.renameTab(data.tabId, data.filename)
  return { success: true }
})

ipcMain.handle('server:focus-all-guests', (_event, tabId: string) => {
  if (!collaborationServer) return { success: false, error: 'Server not running' }
  collaborationServer.focusAllGuests(tabId)
  return { success: true }
})

// Credential management
ipcMain.handle(IPC_CHANNELS.CREDENTIALS_CREATE, (_event, username: string) => {
  if (credentials.size >= 10) {
    return { success: false, error: 'Maximum 10 credentials allowed' }
  }

  // Generate 6-digit PIN
  const pin = Math.floor(100000 + Math.random() * 900000).toString()

  const credential: GuestCredential = {
    username,
    pin,
    createdAt: Date.now()
  }

  credentials.set(username, credential)
  return { success: true, credential }
})

ipcMain.handle(IPC_CHANNELS.CREDENTIALS_REVOKE, (_event, username: string) => {
  const deleted = credentials.delete(username)
  return { success: deleted }
})

ipcMain.handle(IPC_CHANNELS.CREDENTIALS_LIST, () => {
  return Array.from(credentials.values()).map(c => ({
    username: c.username,
    createdAt: c.createdAt
  }))
})

// Window operations
ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
  mainWindow?.minimize()
})

ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
  mainWindow?.close()
})

// App lifecycle
app.whenReady().then(async () => {
  ensureProjectDir()
  createWindow()
  await startCollaborationServer()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  collaborationServer?.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  collaborationServer?.stop()
})
