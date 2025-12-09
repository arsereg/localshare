/**
 * Electron Preload Script
 * Securely exposes IPC APIs to renderer process via contextBridge
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, ProjectFile, ServerStatus, GuestCredential } from '../shared/types'

// Type-safe API exposed to renderer
const electronAPI = {
  // File operations
  file: {
    save: (project: ProjectFile): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE, project),

    load: (projectName: string): Promise<{ success: boolean; project?: ProjectFile; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_LOAD, projectName),

    openDialog: (): Promise<{ success: boolean; project?: ProjectFile; canceled?: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN_DIALOG),

    saveAs: (project: ProjectFile): Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_AS, project),

    saveTabToFile: (data: { filename: string; content: string }): Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_TAB_TO_FILE, data),

    openInVSCode: (data: { filename: string; content: string }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN_IN_VSCODE, data)
  },

  // Server operations
  server: {
    getStatus: (): Promise<ServerStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.SERVER_STATUS),

    getConnectionUrl: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SERVER_GET_CONNECTION_URL),

    syncContent: (data: { tabId: string; content: string; filename: string }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SERVER_SYNC_CONTENT, data),

    setActiveTab: (tabId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('server:set-active-tab', tabId),

    addTab: (data: { tabId: string; filename: string; content: string }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('server:add-tab', data),

    removeTab: (tabId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('server:remove-tab', tabId),

    renameTab: (data: { tabId: string; filename: string }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('server:rename-tab', data),

    focusAllGuests: (tabId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('server:focus-all-guests', tabId),

    broadcastCursor: (data: { tabId: string; line: number; column: number }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('server:broadcast-cursor', data),

    broadcastSelection: (data: { tabId: string; anchor: { line: number; column: number }; head: { line: number; column: number } }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('server:broadcast-selection', data),

    onStatusChange: (callback: (status: ServerStatus) => void): (() => void) => {
      const handler = (_event: any, status: ServerStatus) => callback(status)
      ipcRenderer.on(IPC_CHANNELS.SERVER_STATUS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SERVER_STATUS, handler)
    },

    onContentUpdate: (callback: (data: { tabId: string; content: string }) => void): (() => void) => {
      const handler = (_event: any, data: { tabId: string; content: string }) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.SERVER_CONTENT_UPDATE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SERVER_CONTENT_UPDATE, handler)
    }
  },

  // Credential management
  credentials: {
    create: (username: string): Promise<{ success: boolean; credential?: GuestCredential; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIALS_CREATE, username),

    revoke: (username: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIALS_REVOKE, username),

    list: (): Promise<{ username: string; createdAt: number }[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIALS_LIST)
  },

  // Window controls
  window: {
    minimize: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE)
  },

  // Client events
  clients: {
    onConnected: (callback: (client: { username: string; color: string }) => void): (() => void) => {
      const handler = (_event: any, client: any) => callback(client)
      ipcRenderer.on(IPC_CHANNELS.CLIENT_CONNECTED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLIENT_CONNECTED, handler)
    },

    onDisconnected: (callback: (username: string) => void): (() => void) => {
      const handler = (_event: any, username: string) => callback(username)
      ipcRenderer.on(IPC_CHANNELS.CLIENT_DISCONNECTED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLIENT_DISCONNECTED, handler)
    },

    onCursorUpdate: (callback: (data: { username: string; color: string; tabId: string; line: number; column: number }) => void): (() => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.CLIENT_CURSOR_UPDATE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLIENT_CURSOR_UPDATE, handler)
    },

    onSelectionUpdate: (callback: (data: { username: string; color: string; tabId: string; anchor: { line: number; column: number }; head: { line: number; column: number } }) => void): (() => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('client:selection-update', handler)
      return () => ipcRenderer.removeListener('client:selection-update', handler)
    }
  }
}

// Expose API to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Type declaration for renderer
export type ElectronAPI = typeof electronAPI
