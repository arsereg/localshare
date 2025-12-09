/**
 * Global Application State Store
 * Uses Zustand for state management
 */
import { create } from 'zustand'
import { DocumentTab, ServerStatus, GuestCredential, CursorData, SelectionData, ViewportData, VoiceParticipant } from '@shared/types'
import { v4 as uuidv4 } from 'uuid'
import { detectLanguage } from '@lib/language-detection'

interface ConnectedUser {
  username: string
  color: string
  cursor?: CursorData
  selection?: SelectionData
  viewport?: ViewportData
}

interface FollowState {
  isFollowing: boolean
  targetUsername: string | null
  followers: string[]  // usernames of people following us
}

interface VoiceChatState {
  isActive: boolean
  isMuted: boolean
  participants: VoiceParticipant[]
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

  // Collaboration
  followState: FollowState
  voiceChat: VoiceChatState

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

  // Actions - Collaboration
  updateRemoteCursor: (data: CursorData) => void
  updateRemoteSelection: (data: SelectionData) => void
  updateRemoteViewport: (data: ViewportData) => void
  clearRemotePresence: (username: string) => void

  // Actions - Follow Mode
  startFollowing: (targetUsername: string) => void
  stopFollowing: () => void
  addFollower: (username: string) => void
  removeFollower: (username: string) => void

  // Actions - Voice Chat
  joinVoiceChat: () => void
  leaveVoiceChat: () => void
  setMuted: (isMuted: boolean) => void
  addVoiceParticipant: (participant: VoiceParticipant) => void
  removeVoiceParticipant: (username: string) => void
  updateVoiceParticipant: (username: string, updates: Partial<VoiceParticipant>) => void

  // Getters
  getActiveTab: () => DocumentTab | null
  getTab: (tabId: string) => DocumentTab | undefined
  hasUnsavedTabs: () => boolean
  getRemoteCursorsForTab: (tabId: string) => CursorData[]
  getRemoteSelectionsForTab: (tabId: string) => SelectionData[]
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
  followState: {
    isFollowing: false,
    targetUsername: null,
    followers: []
  },
  voiceChat: {
    isActive: false,
    isMuted: false,
    participants: []
  },

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
  },

  // Collaboration actions
  updateRemoteCursor: (data: CursorData) => {
    set(state => {
      const userExists = state.connectedUsers.some(u => u.username === data.username)
      if (!userExists) {
        // User not in list yet, add them with cursor
        return {
          connectedUsers: [...state.connectedUsers, { username: data.username, color: data.color, cursor: data }]
        }
      }
      return {
        connectedUsers: state.connectedUsers.map(u =>
          u.username === data.username ? { ...u, cursor: data } : u
        )
      }
    })
  },

  updateRemoteSelection: (data: SelectionData) => {
    set(state => {
      const userExists = state.connectedUsers.some(u => u.username === data.username)
      if (!userExists) {
        // User not in list yet, add them with selection
        return {
          connectedUsers: [...state.connectedUsers, { username: data.username, color: data.color, selection: data }]
        }
      }
      return {
        connectedUsers: state.connectedUsers.map(u =>
          u.username === data.username ? { ...u, selection: data } : u
        )
      }
    })
  },

  updateRemoteViewport: (data: ViewportData) => {
    set(state => ({
      connectedUsers: state.connectedUsers.map(u =>
        u.username === data.username ? { ...u, viewport: data } : u
      )
    }))
  },

  clearRemotePresence: (username: string) => {
    set(state => ({
      connectedUsers: state.connectedUsers.map(u =>
        u.username === username ? { ...u, cursor: undefined, selection: undefined, viewport: undefined } : u
      )
    }))
  },

  // Follow mode actions
  startFollowing: (targetUsername: string) => {
    set({
      followState: {
        isFollowing: true,
        targetUsername,
        followers: get().followState.followers
      }
    })
  },

  stopFollowing: () => {
    set({
      followState: {
        isFollowing: false,
        targetUsername: null,
        followers: get().followState.followers
      }
    })
  },

  addFollower: (username: string) => {
    set(state => ({
      followState: {
        ...state.followState,
        followers: [...state.followState.followers.filter(f => f !== username), username]
      }
    }))
  },

  removeFollower: (username: string) => {
    set(state => ({
      followState: {
        ...state.followState,
        followers: state.followState.followers.filter(f => f !== username)
      }
    }))
  },

  // Voice chat actions
  joinVoiceChat: () => {
    set(state => ({
      voiceChat: { ...state.voiceChat, isActive: true }
    }))
  },

  leaveVoiceChat: () => {
    set(state => ({
      voiceChat: { ...state.voiceChat, isActive: false, isMuted: false }
    }))
  },

  setMuted: (isMuted: boolean) => {
    set(state => ({
      voiceChat: { ...state.voiceChat, isMuted }
    }))
  },

  addVoiceParticipant: (participant: VoiceParticipant) => {
    set(state => ({
      voiceChat: {
        ...state.voiceChat,
        participants: [...state.voiceChat.participants.filter(p => p.username !== participant.username), participant]
      }
    }))
  },

  removeVoiceParticipant: (username: string) => {
    set(state => ({
      voiceChat: {
        ...state.voiceChat,
        participants: state.voiceChat.participants.filter(p => p.username !== username)
      }
    }))
  },

  updateVoiceParticipant: (username: string, updates: Partial<VoiceParticipant>) => {
    set(state => ({
      voiceChat: {
        ...state.voiceChat,
        participants: state.voiceChat.participants.map(p =>
          p.username === username ? { ...p, ...updates } : p
        )
      }
    }))
  },

  // Collaboration getters
  getRemoteCursorsForTab: (tabId: string) => {
    const { connectedUsers } = get()
    return connectedUsers
      .filter(u => u.cursor && u.cursor.tabId === tabId)
      .map(u => u.cursor!)
  },

  getRemoteSelectionsForTab: (tabId: string) => {
    const { connectedUsers } = get()
    return connectedUsers
      .filter(u => u.selection && u.selection.tabId === tabId)
      .map(u => u.selection!)
  }
}))
