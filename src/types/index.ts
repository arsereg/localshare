/**
 * Type definitions for the Collaborative Code Editor
 */

/**
 * Document tab information
 */
export interface Tab {
  id: string;
  filename: string;
  language: string;
  content: string;
  isDirty: boolean;
}

/**
 * Project file format (persisted to disk)
 */
export interface ProjectFile {
  version: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  tabs: Array<{
    id: string;
    filename: string;
    language: string;
    content: string;
  }>;
}

/**
 * Server status information
 */
export interface ServerStatus {
  running: boolean;
  port?: number;
  addresses?: string[];
  connectedClients?: number;
  useTls?: boolean;
}

/**
 * Credential information (displayed to users)
 */
export interface CredentialInfo {
  username: string;
  createdAt: Date;
}

/**
 * Language mapping for file extensions
 */
export interface LanguageMapping {
  extension: string;
  language: string;
  displayName: string;
}

/**
 * Editor state
 */
export interface EditorState {
  tabs: Tab[];
  activeTabId: string | null;
  projectPath: string | null;
  projectName: string;
  isSaving: boolean;
  lastSaved: Date | null;
}

/**
 * Application state
 */
export interface AppState {
  editor: EditorState;
  server: ServerStatus;
  credentials: CredentialInfo[];
}

/**
 * User preference settings
 */
export interface UserPreferences {
  theme: 'dark' | 'light';
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  showMinimap: boolean;
  autoSave: boolean;
  autoSaveDelay: number;
}

/**
 * Toast notification
 */
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}
