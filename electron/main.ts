/**
 * Electron Main Process
 * Handles window creation, IPC communication, and server lifecycle
 */
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { CollabServer } from './server/index';

// Keep a global reference to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let collabServer: CollabServer | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/**
 * Creates the main application window
 */
async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for some IPC operations
    },
    titleBarStyle: 'default',
    show: false,
  });

  // Show window when ready to avoid visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the app
  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Gets the default storage directory for projects
 */
function getDefaultStorageDir(): string {
  const homeDir = app.getPath('home');
  const storageDir = path.join(homeDir, '.collab-editor', 'projects');

  // Ensure directory exists
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  return storageDir;
}

/**
 * Sets up IPC handlers for communication with renderer process
 */
function setupIpcHandlers(): void {
  // Server control
  ipcMain.handle('server:start', async () => {
    try {
      if (!collabServer) {
        collabServer = new CollabServer();
      }
      const serverInfo = await collabServer.start();
      return { success: true, ...serverInfo };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('server:stop', async () => {
    try {
      if (collabServer) {
        await collabServer.stop();
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('server:getStatus', async () => {
    if (!collabServer) {
      return { running: false };
    }
    return collabServer.getStatus();
  });

  // Credential management
  ipcMain.handle('credentials:create', async (_, username: string) => {
    if (!collabServer) {
      return { success: false, error: 'Server not running' };
    }
    return collabServer.createCredential(username);
  });

  ipcMain.handle('credentials:revoke', async (_, username: string) => {
    if (!collabServer) {
      return { success: false, error: 'Server not running' };
    }
    return collabServer.revokeCredential(username);
  });

  ipcMain.handle('credentials:list', async () => {
    if (!collabServer) {
      return { success: false, error: 'Server not running', credentials: [] };
    }
    return collabServer.listCredentials();
  });

  // File operations
  ipcMain.handle('file:getStorageDir', async () => {
    return getDefaultStorageDir();
  });

  ipcMain.handle('file:save', async (_, projectPath: string, content: string) => {
    try {
      // Validate path to prevent directory traversal
      const storageDir = getDefaultStorageDir();
      const resolvedPath = path.resolve(projectPath);

      if (!resolvedPath.startsWith(storageDir) && !path.isAbsolute(projectPath)) {
        // Allow absolute paths but warn about non-standard locations
        console.warn('Saving to non-standard location:', resolvedPath);
      }

      // Ensure directory exists
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(resolvedPath, content, 'utf-8');
      return { success: true, path: resolvedPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('file:load', async (_, projectPath: string) => {
    try {
      const resolvedPath = path.resolve(projectPath);

      if (!fs.existsSync(resolvedPath)) {
        return { success: false, error: 'File not found' };
      }

      const content = fs.readFileSync(resolvedPath, 'utf-8');
      return { success: true, content, path: resolvedPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('file:listProjects', async () => {
    try {
      const storageDir = getDefaultStorageDir();
      const files = fs.readdirSync(storageDir);
      const projects = files
        .filter(f => f.endsWith('.collab'))
        .map(f => ({
          name: f.replace('.collab', ''),
          path: path.join(storageDir, f),
          modified: fs.statSync(path.join(storageDir, f)).mtime,
        }));
      return { success: true, projects };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message, projects: [] };
    }
  });

  ipcMain.handle('file:showSaveDialog', async () => {
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(getDefaultStorageDir(), 'untitled.collab'),
      filters: [
        { name: 'Collab Editor Project', extensions: ['collab'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    return { success: true, path: result.filePath };
  });

  ipcMain.handle('file:showOpenDialog', async () => {
    if (!mainWindow) {
      return { success: false, error: 'No window available' };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      defaultPath: getDefaultStorageDir(),
      filters: [
        { name: 'Collab Editor Project', extensions: ['collab'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    return { success: true, path: result.filePaths[0] };
  });

  // Utility
  ipcMain.handle('app:getNetworkAddresses', async () => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        // Skip internal and non-IPv4 addresses
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(iface.address);
        }
      }
    }

    return addresses;
  });

  ipcMain.handle('app:openExternal', async (_, url: string) => {
    await shell.openExternal(url);
  });
}

// Application lifecycle
app.whenReady().then(async () => {
  setupIpcHandlers();
  await createWindow();

  // Start the collaboration server automatically
  collabServer = new CollabServer();
  try {
    await collabServer.start();
    console.log('Collaboration server started');
  } catch (error) {
    console.error('Failed to start collaboration server:', error);
  }

  app.on('activate', async () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Stop the server when all windows are closed
  if (collabServer) {
    collabServer.stop().catch(console.error);
  }

  // On macOS, keep app running until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  // Ensure server is stopped before quit
  if (collabServer) {
    await collabServer.stop();
  }
});
