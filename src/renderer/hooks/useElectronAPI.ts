/**
 * React hooks for Electron IPC communication
 */
import { useEffect, useCallback } from 'react'
import { useAppStore } from '@stores/appStore'
import type { ElectronAPI } from '../../preload/index'
import { ProjectFile, ServerStatus } from '@shared/types'

// Type declaration for window.electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

/**
 * Hook for server-related IPC operations
 */
export function useServerAPI() {
  const {
    setServerStatus,
    setConnectionUrl,
    addConnectedUser,
    removeConnectedUser,
    updateTabContent,
    getActiveTab,
    activeTabId
  } = useAppStore()

  // Subscribe to server status changes
  useEffect(() => {
    const unsubscribe = window.electronAPI.server.onStatusChange((status: ServerStatus) => {
      setServerStatus(status)
    })

    // Get initial status
    window.electronAPI.server.getStatus().then(setServerStatus)
    window.electronAPI.server.getConnectionUrl().then(setConnectionUrl)

    return unsubscribe
  }, [setServerStatus, setConnectionUrl])

  // Subscribe to content updates from guests
  useEffect(() => {
    const unsubscribe = window.electronAPI.server.onContentUpdate((data) => {
      updateTabContent(data.tabId, data.content)
    })

    return unsubscribe
  }, [updateTabContent])

  // Subscribe to client events
  useEffect(() => {
    const unsubConnect = window.electronAPI.clients.onConnected((client) => {
      addConnectedUser({ username: client.username, color: client.color })
    })

    const unsubDisconnect = window.electronAPI.clients.onDisconnected((username) => {
      removeConnectedUser(username)
    })

    return () => {
      unsubConnect()
      unsubDisconnect()
    }
  }, [addConnectedUser, removeConnectedUser])

  const syncContent = useCallback(async (tabId: string, content: string, filename: string) => {
    return window.electronAPI.server.syncContent({ tabId, content, filename })
  }, [])

  const setActiveServerTab = useCallback(async (tabId: string) => {
    return window.electronAPI.server.setActiveTab(tabId)
  }, [])

  const addServerTab = useCallback(async (tabId: string, filename: string, content: string) => {
    return window.electronAPI.server.addTab({ tabId, filename, content })
  }, [])

  const removeServerTab = useCallback(async (tabId: string) => {
    return window.electronAPI.server.removeTab(tabId)
  }, [])

  const renameServerTab = useCallback(async (tabId: string, filename: string) => {
    return window.electronAPI.server.renameTab({ tabId, filename })
  }, [])

  const focusAllGuests = useCallback(async () => {
    const activeTab = getActiveTab()
    if (activeTab) {
      return window.electronAPI.server.focusAllGuests(activeTab.id)
    }
  }, [getActiveTab])

  return {
    syncContent,
    setActiveServerTab,
    addServerTab,
    removeServerTab,
    renameServerTab,
    focusAllGuests
  }
}

/**
 * Hook for credential management
 */
export function useCredentialsAPI() {
  const { setCredentials, credentials } = useAppStore()

  const loadCredentials = useCallback(async () => {
    const creds = await window.electronAPI.credentials.list()
    setCredentials(creds)
    return creds
  }, [setCredentials])

  const createCredential = useCallback(async (username: string) => {
    const result = await window.electronAPI.credentials.create(username)
    if (result.success) {
      await loadCredentials()
    }
    return result
  }, [loadCredentials])

  const revokeCredential = useCallback(async (username: string) => {
    const result = await window.electronAPI.credentials.revoke(username)
    if (result.success) {
      await loadCredentials()
    }
    return result
  }, [loadCredentials])

  return {
    credentials,
    loadCredentials,
    createCredential,
    revokeCredential
  }
}

/**
 * Hook for file operations
 */
export function useFileAPI() {
  const { tabs, setProjectName, projectName, loadTabs, markTabSaved, setSaveStatus } = useAppStore()

  const saveProject = useCallback(async () => {
    if (tabs.length === 0) return

    setSaveStatus('saving')

    const project: ProjectFile = {
      version: '1.0',
      projectName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tabs: tabs.map(t => ({
        id: t.id,
        filename: t.filename,
        language: t.language,
        content: t.content
      }))
    }

    try {
      const result = await window.electronAPI.file.save(project)
      if (result.success) {
        tabs.forEach(t => markTabSaved(t.id))
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } else {
        setSaveStatus('error')
      }
      return result
    } catch (error) {
      console.error('Save failed:', error)
      setSaveStatus('error')
      return { success: false, error: String(error) }
    }
  }, [tabs, projectName, markTabSaved, setSaveStatus])

  const saveProjectAs = useCallback(async () => {
    if (tabs.length === 0) return

    const project: ProjectFile = {
      version: '1.0',
      projectName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tabs: tabs.map(t => ({
        id: t.id,
        filename: t.filename,
        language: t.language,
        content: t.content
      }))
    }

    const result = await window.electronAPI.file.saveAs(project)
    if (result.success && result.path) {
      const match = result.path.match(/([^/\\]+)\.json$/)
      if (match) {
        setProjectName(match[1])
      }
      tabs.forEach(t => markTabSaved(t.id))
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
    return result
  }, [tabs, projectName, setProjectName, markTabSaved, setSaveStatus])

  const openProject = useCallback(async () => {
    const result = await window.electronAPI.file.openDialog()
    if (result.success && result.project) {
      setProjectName(result.project.projectName)
      loadTabs(result.project.tabs)
    }
    return result
  }, [setProjectName, loadTabs])

  return {
    saveProject,
    saveProjectAs,
    openProject
  }
}
