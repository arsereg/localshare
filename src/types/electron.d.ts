/**
 * Type declarations for Electron IPC API exposed via preload
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
  useTls?: boolean;
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

export interface ElectronAPI {
  server: {
    start: () => Promise<ServerInfo>;
    stop: () => Promise<{ success: boolean; error?: string }>;
    getStatus: () => Promise<ServerStatus>;
  };
  credentials: {
    create: (username: string) => Promise<CredentialResult>;
    revoke: (username: string) => Promise<{ success: boolean; error?: string }>;
    list: () => Promise<CredentialListResult>;
  };
  file: {
    getStorageDir: () => Promise<string>;
    save: (projectPath: string, content: string) => Promise<FileResult>;
    load: (projectPath: string) => Promise<FileResult>;
    listProjects: () => Promise<ProjectListResult>;
    showSaveDialog: () => Promise<FileResult>;
    showOpenDialog: () => Promise<FileResult>;
  };
  app: {
    getNetworkAddresses: () => Promise<string[]>;
    openExternal: (url: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
