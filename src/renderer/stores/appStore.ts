/**
 * Global Application State Store
 * Uses Zustand for state management
 */
import { create } from 'zustand'
import { DocumentTab, ServerStatus, GuestCredential } from '@shared/types'
import { v4 as uuidv4 } from 'uuid'
import { detectLanguage } from '@lib/language-detection'

interface ConnectedUser {
  username: string
  color: string
}

interface AppState {
  // Tabs
  tabs: DocumentTab[]
  activeTabId: string | null

  // Server
  serverStatus: ServerStatus
  connectionUrl: string | null
  connectedUsers: ConnectedUser[]

  // UI
  isShareModalOpen: boolean
  credentials: { username: string; createdAt: number }[]

  // Editor
  cursorPosition: { line: number; column: number }
  isSaving: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'

  // Project
  projectName: string

  // Actions - Tabs
  createTab: (filename?: string, content?: string) => DocumentTab
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTabContent: (tabId: string, content: string) => void
  markTabSaved: (tabId: string) => void
  renameTab: (tabId: string, newFilename: string) => void
  loadTabs: (tabs: Omit<DocumentTab, 'isDirty'>[]) => void
  reorderTabs: (draggedId: string, targetId: string) => void

  // Actions - Server
  setServerStatus: (status: ServerStatus) => void
  setConnectionUrl: (url: string | null) => void
  addConnectedUser: (user: ConnectedUser) => void
  removeConnectedUser: (username: string) => void

  // Actions - UI
  openShareModal: () => void
  closeShareModal: () => void
  setCredentials: (credentials: { username: string; createdAt: number }[]) => void

  // Actions - Editor
  setCursorPosition: (line: number, column: number) => void
  setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void

  // Actions - Project
  setProjectName: (name: string) => void

  // Getters
  getActiveTab: () => DocumentTab | null
  getTab: (tabId: string) => DocumentTab | undefined
  hasUnsavedTabs: () => boolean
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  tabs: [],
  activeTabId: null,
  serverStatus: {
    isRunning: false,
    port: null,
    ip: null,
    connectedClients: 0,
    isEncrypted: false
  },
  connectionUrl: null,
  connectedUsers: [],
  isShareModalOpen: false,
  credentials: [],
  cursorPosition: { line: 1, column: 1 },
  isSaving: false,
  saveStatus: 'idle',
  projectName: 'untitled',

  // Tab actions
  createTab: (filename = 'untitled.txt', content = '') => {
    const { tabs } = get()

    if (tabs.length >= 20) {
      console.warn('Maximum 20 tabs reached')
      return tabs[tabs.length - 1]
    }

    const language = detectLanguage(filename, content)
    const tab: DocumentTab = {
      id: uuidv4(),
      filename,
      language: language.id,
      content,
      isDirty: false
    }

    set(state => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id
    }))

    return tab
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get()
    const index = tabs.findIndex(t => t.id === tabId)
    if (index === -1) return

    const newTabs = tabs.filter(t => t.id !== tabId)
    let newActiveId = activeTabId

    if (activeTabId === tabId && newTabs.length > 0) {
      const newIndex = Math.min(index, newTabs.length - 1)
      newActiveId = newTabs[newIndex].id
    } else if (newTabs.length === 0) {
      newActiveId = null
    }

    set({ tabs: newTabs, activeTabId: newActiveId })
  },

  setActiveTab: (tabId: string) => {
    const { tabs, activeTabId } = get()
    if (activeTabId === tabId) return
    if (!tabs.find(t => t.id === tabId)) return

    set({ activeTabId: tabId })
  },

  updateTabContent: (tabId: string, content: string) => {
    set(state => ({
      tabs: state.tabs.map(t =>
        t.id === tabId ? { ...t, content, isDirty: true } : t
      )
    }))
  },

  markTabSaved: (tabId: string) => {
    set(state => ({
      tabs: state.tabs.map(t =>
        t.id === tabId ? { ...t, isDirty: false } : t
      )
    }))
  },

  renameTab: (tabId: string, newFilename: string) => {
    set(state => ({
      tabs: state.tabs.map(t => {
        if (t.id !== tabId) return t
        const language = detectLanguage(newFilename, t.content)
        return { ...t, filename: newFilename, language: language.id }
      })
    }))
  },

  loadTabs: (tabs: Omit<DocumentTab, 'isDirty'>[]) => {
    const fullTabs = tabs.map(t => ({ ...t, isDirty: false }))
    set({
      tabs: fullTabs,
      activeTabId: fullTabs.length > 0 ? fullTabs[0].id : null
    })
  },

  reorderTabs: (draggedId: string, targetId: string) => {
    const { tabs } = get()
    const draggedIndex = tabs.findIndex(t => t.id === draggedId)
    const targetIndex = tabs.findIndex(t => t.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const newTabs = [...tabs]
    const [draggedTab] = newTabs.splice(draggedIndex, 1)
    newTabs.splice(targetIndex, 0, draggedTab)

    set({ tabs: newTabs })
  },

  // Server actions
  setServerStatus: (status: ServerStatus) => set({ serverStatus: status }),
  setConnectionUrl: (url: string | null) => set({ connectionUrl: url }),

  addConnectedUser: (user: ConnectedUser) => {
    set(state => ({
      connectedUsers: [...state.connectedUsers.filter(u => u.username !== user.username), user]
    }))
  },

  removeConnectedUser: (username: string) => {
    set(state => ({
      connectedUsers: state.connectedUsers.filter(u => u.username !== username)
    }))
  },

  // UI actions
  openShareModal: () => set({ isShareModalOpen: true }),
  closeShareModal: () => set({ isShareModalOpen: false }),
  setCredentials: (credentials) => set({ credentials }),

  // Editor actions
  setCursorPosition: (line: number, column: number) => set({ cursorPosition: { line, column } }),
  setSaveStatus: (status) => set({ saveStatus: status }),

  // Project actions
  setProjectName: (name: string) => set({ projectName: name }),

  // Getters
  getActiveTab: () => {
    const { tabs, activeTabId } = get()
    if (!activeTabId) return null
    return tabs.find(t => t.id === activeTabId) || null
  },

  getTab: (tabId: string) => {
    const { tabs } = get()
    return tabs.find(t => t.id === tabId)
  },

  hasUnsavedTabs: () => {
    const { tabs } = get()
    return tabs.some(t => t.isDirty)
  }
}))
