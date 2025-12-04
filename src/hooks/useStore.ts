/**
 * Global state management using React context
 * Manages tabs, editor state, server status, and credentials
 */
/// <reference path="../types/electron.d.ts" />
import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import type { Tab, ServerStatus, CredentialInfo, ProjectFile, Toast } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { detectLanguage } from '../utils/languageDetection';

// State interface
interface AppState {
  tabs: Tab[];
  activeTabId: string | null;
  projectPath: string | null;
  projectName: string;
  isSaving: boolean;
  lastSaved: Date | null;
  serverStatus: ServerStatus;
  credentials: CredentialInfo[];
  toasts: Toast[];
}

// Action types
type Action =
  | { type: 'ADD_TAB'; payload: Partial<Tab> }
  | { type: 'REMOVE_TAB'; payload: string }
  | { type: 'SET_ACTIVE_TAB'; payload: string }
  | { type: 'UPDATE_TAB_CONTENT'; payload: { id: string; content: string } }
  | { type: 'RENAME_TAB'; payload: { id: string; filename: string } }
  | { type: 'REORDER_TABS'; payload: Tab[] }
  | { type: 'MARK_TAB_CLEAN'; payload: string }
  | { type: 'SET_PROJECT'; payload: { path: string; name: string; tabs: Tab[] } }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_LAST_SAVED'; payload: Date }
  | { type: 'SET_SERVER_STATUS'; payload: ServerStatus }
  | { type: 'SET_CREDENTIALS'; payload: CredentialInfo[] }
  | { type: 'ADD_CREDENTIAL'; payload: CredentialInfo }
  | { type: 'REMOVE_CREDENTIAL'; payload: string }
  | { type: 'ADD_TOAST'; payload: Toast }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'CLEAR_PROJECT' };

// Initial state
const initialState: AppState = {
  tabs: [],
  activeTabId: null,
  projectPath: null,
  projectName: 'Untitled Project',
  isSaving: false,
  lastSaved: null,
  serverStatus: { running: false },
  credentials: [],
  toasts: [],
};

// Reducer
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_TAB': {
      const newTab: Tab = {
        id: action.payload.id || uuidv4(),
        filename: action.payload.filename || 'untitled.txt',
        language: action.payload.language || detectLanguage(action.payload.filename || 'untitled.txt', action.payload.content || ''),
        content: action.payload.content || '',
        isDirty: action.payload.isDirty ?? false,
      };

      // Check max tabs limit
      if (state.tabs.length >= 20) {
        console.warn('Maximum tab limit reached');
        return state;
      }

      return {
        ...state,
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      };
    }

    case 'REMOVE_TAB': {
      const tabIndex = state.tabs.findIndex(t => t.id === action.payload);
      if (tabIndex === -1) return state;

      const newTabs = state.tabs.filter(t => t.id !== action.payload);
      let newActiveId = state.activeTabId;

      // If removing active tab, select adjacent tab
      if (state.activeTabId === action.payload) {
        if (newTabs.length === 0) {
          newActiveId = null;
        } else if (tabIndex >= newTabs.length) {
          newActiveId = newTabs[newTabs.length - 1].id;
        } else {
          newActiveId = newTabs[tabIndex].id;
        }
      }

      return {
        ...state,
        tabs: newTabs,
        activeTabId: newActiveId,
      };
    }

    case 'SET_ACTIVE_TAB':
      return { ...state, activeTabId: action.payload };

    case 'UPDATE_TAB_CONTENT': {
      const tabs = state.tabs.map(tab =>
        tab.id === action.payload.id
          ? {
              ...tab,
              content: action.payload.content,
              isDirty: true,
              language: detectLanguage(tab.filename, action.payload.content),
            }
          : tab
      );
      return { ...state, tabs };
    }

    case 'RENAME_TAB': {
      const tabs = state.tabs.map(tab =>
        tab.id === action.payload.id
          ? {
              ...tab,
              filename: action.payload.filename,
              language: detectLanguage(action.payload.filename, tab.content),
              isDirty: true,
            }
          : tab
      );
      return { ...state, tabs };
    }

    case 'REORDER_TABS':
      return { ...state, tabs: action.payload };

    case 'MARK_TAB_CLEAN': {
      const tabs = state.tabs.map(tab =>
        tab.id === action.payload ? { ...tab, isDirty: false } : tab
      );
      return { ...state, tabs };
    }

    case 'SET_PROJECT':
      return {
        ...state,
        projectPath: action.payload.path,
        projectName: action.payload.name,
        tabs: action.payload.tabs,
        activeTabId: action.payload.tabs.length > 0 ? action.payload.tabs[0].id : null,
      };

    case 'SET_SAVING':
      return { ...state, isSaving: action.payload };

    case 'SET_LAST_SAVED':
      return { ...state, lastSaved: action.payload };

    case 'SET_SERVER_STATUS':
      return { ...state, serverStatus: action.payload };

    case 'SET_CREDENTIALS':
      return { ...state, credentials: action.payload };

    case 'ADD_CREDENTIAL':
      return { ...state, credentials: [...state.credentials, action.payload] };

    case 'REMOVE_CREDENTIAL':
      return {
        ...state,
        credentials: state.credentials.filter(c => c.username !== action.payload),
      };

    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.payload] };

    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };

    case 'CLEAR_PROJECT':
      return {
        ...state,
        tabs: [],
        activeTabId: null,
        projectPath: null,
        projectName: 'Untitled Project',
        lastSaved: null,
      };

    default:
      return state;
  }
}

// Context
interface StoreContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  actions: {
    addTab: (tab?: Partial<Tab>) => void;
    removeTab: (id: string) => void;
    setActiveTab: (id: string) => void;
    updateTabContent: (id: string, content: string) => void;
    renameTab: (id: string, filename: string) => void;
    saveProject: () => Promise<void>;
    loadProject: (path?: string) => Promise<void>;
    newProject: () => void;
    showToast: (type: Toast['type'], message: string, duration?: number) => void;
    refreshServerStatus: () => Promise<void>;
    refreshCredentials: () => Promise<void>;
    createCredential: (username: string) => Promise<{ success: boolean; pin?: string; error?: string }>;
    revokeCredential: (username: string) => Promise<boolean>;
  };
}

export const StoreContext = createContext<StoreContextValue | null>(null);

// Hook to use store
export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
}

// Store Provider Component
export function useStoreProvider() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Toast helper
  const showToast = useCallback((type: Toast['type'], message: string, duration = 3000) => {
    const id = uuidv4();
    dispatch({ type: 'ADD_TOAST', payload: { id, type, message, duration } });

    setTimeout(() => {
      dispatch({ type: 'REMOVE_TOAST', payload: id });
    }, duration);
  }, []);

  // Tab actions
  const addTab = useCallback((tab?: Partial<Tab>) => {
    if (state.tabs.length >= 20) {
      showToast('warning', 'Maximum of 20 tabs reached');
      return;
    }
    dispatch({ type: 'ADD_TAB', payload: tab || {} });
  }, [state.tabs.length, showToast]);

  const removeTab = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_TAB', payload: id });
  }, []);

  const setActiveTab = useCallback((id: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: id });
  }, []);

  const updateTabContent = useCallback((id: string, content: string) => {
    dispatch({ type: 'UPDATE_TAB_CONTENT', payload: { id, content } });
  }, []);

  const renameTab = useCallback((id: string, filename: string) => {
    dispatch({ type: 'RENAME_TAB', payload: { id, filename } });
  }, []);

  // Project actions
  const saveProject = useCallback(async () => {
    if (!window.electronAPI) {
      showToast('error', 'Not running in Electron');
      return;
    }

    dispatch({ type: 'SET_SAVING', payload: true });

    try {
      let savePath = state.projectPath;

      // If no path, show save dialog
      if (!savePath) {
        const result = await window.electronAPI.file.showSaveDialog();
        if (!result.success || !result.path) {
          dispatch({ type: 'SET_SAVING', payload: false });
          return;
        }
        savePath = result.path;
      }

      // Create project file
      const projectFile: ProjectFile = {
        version: '1.0',
        projectName: state.projectName,
        createdAt: state.lastSaved?.toISOString() || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tabs: state.tabs.map(tab => ({
          id: tab.id,
          filename: tab.filename,
          language: tab.language,
          content: tab.content,
        })),
      };

      const result = await window.electronAPI.file.save(savePath, JSON.stringify(projectFile, null, 2));

      if (result.success) {
        // Mark all tabs as clean
        state.tabs.forEach(tab => {
          dispatch({ type: 'MARK_TAB_CLEAN', payload: tab.id });
        });

        dispatch({ type: 'SET_LAST_SAVED', payload: new Date() });

        // Update project path if it was a new save
        if (!state.projectPath && result.path) {
          const pathParts = result.path.split('/');
          const name = (pathParts.pop() || 'Untitled').replace('.collab', '');
          dispatch({
            type: 'SET_PROJECT',
            payload: { path: result.path, name, tabs: state.tabs },
          });
        }

        showToast('success', 'Project saved');
      } else {
        showToast('error', result.error || 'Failed to save project');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      showToast('error', `Save failed: ${message}`);
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  }, [state.projectPath, state.projectName, state.tabs, state.lastSaved, showToast]);

  const loadProject = useCallback(async (path?: string) => {
    if (!window.electronAPI) {
      showToast('error', 'Not running in Electron');
      return;
    }

    try {
      let loadPath = path;

      // If no path, show open dialog
      if (!loadPath) {
        const result = await window.electronAPI.file.showOpenDialog();
        if (!result.success || !result.path) {
          return;
        }
        loadPath = result.path;
      }

      const result = await window.electronAPI.file.load(loadPath);

      if (result.success && result.content) {
        const projectFile: ProjectFile = JSON.parse(result.content);

        const tabs: Tab[] = projectFile.tabs.map(tab => ({
          ...tab,
          isDirty: false,
        }));

        dispatch({
          type: 'SET_PROJECT',
          payload: {
            path: loadPath,
            name: projectFile.projectName,
            tabs,
          },
        });

        showToast('success', 'Project loaded');
      } else {
        showToast('error', result.error || 'Failed to load project');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      showToast('error', `Load failed: ${message}`);
    }
  }, [showToast]);

  const newProject = useCallback(() => {
    dispatch({ type: 'CLEAR_PROJECT' });
    dispatch({
      type: 'ADD_TAB',
      payload: { filename: 'untitled.js', content: '// Start coding here\n' },
    });
  }, []);

  // Server actions
  const refreshServerStatus = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      const status = await window.electronAPI.server.getStatus();
      dispatch({ type: 'SET_SERVER_STATUS', payload: status });
    } catch (error) {
      console.error('Failed to get server status:', error);
    }
  }, []);

  const refreshCredentials = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.credentials.list();
      if (result.success) {
        dispatch({ type: 'SET_CREDENTIALS', payload: result.credentials });
      }
    } catch (error) {
      console.error('Failed to get credentials:', error);
    }
  }, []);

  const createCredential = useCallback(async (username: string) => {
    if (!window.electronAPI) {
      return { success: false, error: 'Not running in Electron' };
    }

    const result = await window.electronAPI.credentials.create(username);
    if (result.success) {
      await refreshCredentials();
      showToast('success', `Credential created for ${username}`);
    } else {
      showToast('error', result.error || 'Failed to create credential');
    }
    return result;
  }, [refreshCredentials, showToast]);

  const revokeCredential = useCallback(async (username: string) => {
    if (!window.electronAPI) {
      showToast('error', 'Not running in Electron');
      return false;
    }

    const result = await window.electronAPI.credentials.revoke(username);
    if (result.success) {
      dispatch({ type: 'REMOVE_CREDENTIAL', payload: username });
      showToast('success', `Credential revoked for ${username}`);
    } else {
      showToast('error', result.error || 'Failed to revoke credential');
    }
    return result.success;
  }, [showToast]);

  // Auto-save effect
  useEffect(() => {
    const hasDirtyTabs = state.tabs.some(t => t.isDirty);

    if (hasDirtyTabs && state.projectPath) {
      // Clear existing timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      // Set new timer for 2 seconds
      autoSaveTimerRef.current = setTimeout(() => {
        saveProject();
      }, 2000);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [state.tabs, state.projectPath, saveProject]);

  // Initial setup
  useEffect(() => {
    refreshServerStatus();
    refreshCredentials();

    // Poll server status every 5 seconds
    const interval = setInterval(refreshServerStatus, 5000);
    return () => clearInterval(interval);
  }, [refreshServerStatus, refreshCredentials]);

  return {
    state,
    dispatch,
    actions: {
      addTab,
      removeTab,
      setActiveTab,
      updateTabContent,
      renameTab,
      saveProject,
      loadProject,
      newProject,
      showToast,
      refreshServerStatus,
      refreshCredentials,
      createCredential,
      revokeCredential,
    },
  };
}
