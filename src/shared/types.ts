/**
 * Shared Type Definitions
 * Common types used across main, preload, and renderer processes
 */

/** Document tab representing an open file */
export interface DocumentTab {
  id: string
  filename: string
  language: string
  content: string
  isDirty: boolean
}

/** Project file format for persistence */
export interface ProjectFile {
  version: '1.0'
  projectName: string
  createdAt: string
  updatedAt: string
  tabs: Omit<DocumentTab, 'isDirty'>[]
}

/** Guest credential for authentication */
export interface GuestCredential {
  username: string
  pin: string
  createdAt: number
  expiresAt?: number
}

/** Server status information */
export interface ServerStatus {
  isRunning: boolean
  port: number | null
  ip: string | null
  connectedClients: number
  isEncrypted: boolean
}

/** Connected client information */
export interface ConnectedClient {
  id: string
  username: string
  color: string
  cursorPosition?: {
    line: number
    column: number
  }
  isAuthenticated: boolean
}

/** Language detection result */
export interface LanguageInfo {
  id: string
  name: string
  extensions: string[]
}

/** Supported programming languages */
export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { id: 'javascript', name: 'JavaScript', extensions: ['.js', '.mjs', '.cjs'] },
  { id: 'typescript', name: 'TypeScript', extensions: ['.ts', '.mts', '.cts'] },
  { id: 'jsx', name: 'JSX', extensions: ['.jsx'] },
  { id: 'tsx', name: 'TSX', extensions: ['.tsx'] },
  { id: 'python', name: 'Python', extensions: ['.py', '.pyw'] },
  { id: 'java', name: 'Java', extensions: ['.java'] },
  { id: 'cpp', name: 'C++', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.h'] },
  { id: 'c', name: 'C', extensions: ['.c'] },
  { id: 'html', name: 'HTML', extensions: ['.html', '.htm'] },
  { id: 'css', name: 'CSS', extensions: ['.css'] },
  { id: 'json', name: 'JSON', extensions: ['.json'] },
  { id: 'markdown', name: 'Markdown', extensions: ['.md', '.markdown'] },
  { id: 'plaintext', name: 'Plain Text', extensions: ['.txt'] }
]

/** IPC Channel names for type-safe communication */
export const IPC_CHANNELS = {
  // File operations
  FILE_SAVE: 'file:save',
  FILE_LOAD: 'file:load',
  FILE_NEW: 'file:new',
  FILE_SAVE_AS: 'file:save-as',
  FILE_OPEN_DIALOG: 'file:open-dialog',

  // Server operations
  SERVER_STATUS: 'server:status',
  SERVER_START: 'server:start',
  SERVER_STOP: 'server:stop',
  SERVER_GET_CONNECTION_URL: 'server:get-connection-url',
  SERVER_SYNC_CONTENT: 'server:sync-content',
  SERVER_CONTENT_UPDATE: 'server:content-update',

  // Credential management
  CREDENTIALS_CREATE: 'credentials:create',
  CREDENTIALS_REVOKE: 'credentials:revoke',
  CREDENTIALS_LIST: 'credentials:list',

  // Client events
  CLIENT_CONNECTED: 'client:connected',
  CLIENT_DISCONNECTED: 'client:disconnected',
  CLIENT_CURSOR_UPDATE: 'client:cursor-update',

  // Window operations
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close'
} as const

/** WebSocket message types */
export const WS_MESSAGE_TYPES = {
  AUTH_REQUEST: 'auth:request',
  AUTH_RESPONSE: 'auth:response',
  AUTH_FAILED: 'auth:failed',
  SYNC_INIT: 'sync:init',
  SYNC_UPDATE: 'sync:update',
  CURSOR_UPDATE: 'cursor:update',
  USER_JOIN: 'user:join',
  USER_LEAVE: 'user:leave'
} as const
