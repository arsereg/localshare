/**
 * Electron Preload Script
 * Exposes safe IPC channels to the renderer process via contextBridge
 */
import { contextBridge, ipcRenderer } from 'electron';

/**
 * Type definitions for the exposed API
 */
export interface ServerInfo {
  success: boolean;
  port?: number;
  addresses?: string[];
  error?: string;
}

export interface ServerStatus {
  running: boolean;
  port?: number;
  addresses?: string[];
  connectedClients?: number;
}

export interface CredentialResult {
  success: boolean;
  pin?: string;
  error?: string;
}

export interface CredentialListResult {
  success: boolean;
  credentials: Array<{ username: string; createdAt: Date }>;
  error?: string;
}

export interface FileResult {
  success: boolean;
  path?: string;
  content?: string;
  error?: string;
  canceled?: boolean;
}

export interface ProjectInfo {
  name: string;
  path: string;
  modified: Date;
}

export interface ProjectListResult {
  success: boolean;
  projects: ProjectInfo[];
  error?: string;
}

/**
 * The API exposed to the renderer process
 */
const electronAPI = {
  // Server control
  server: {
    start: (): Promise<ServerInfo> => ipcRenderer.invoke('server:start'),
    stop: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('server:stop'),
    getStatus: (): Promise<ServerStatus> => ipcRenderer.invoke('server:getStatus'),
  },

  // Credential management
  credentials: {
    create: (username: string): Promise<CredentialResult> =>
      ipcRenderer.invoke('credentials:create', username),
    revoke: (username: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('credentials:revoke', username),
    list: (): Promise<CredentialListResult> =>
      ipcRenderer.invoke('credentials:list'),
  },

  // File operations
  file: {
    getStorageDir: (): Promise<string> => ipcRenderer.invoke('file:getStorageDir'),
    save: (projectPath: string, content: string): Promise<FileResult> =>
      ipcRenderer.invoke('file:save', projectPath, content),
    load: (projectPath: string): Promise<FileResult> =>
      ipcRenderer.invoke('file:load', projectPath),
    listProjects: (): Promise<ProjectListResult> =>
      ipcRenderer.invoke('file:listProjects'),
    showSaveDialog: (): Promise<FileResult> =>
      ipcRenderer.invoke('file:showSaveDialog'),
    showOpenDialog: (): Promise<FileResult> =>
      ipcRenderer.invoke('file:showOpenDialog'),
  },

  // Utility
  app: {
    getNetworkAddresses: (): Promise<string[]> =>
      ipcRenderer.invoke('app:getNetworkAddresses'),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke('app:openExternal', url),
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for TypeScript
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
