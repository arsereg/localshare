/**
 * LocalShare Renderer Entry Point
 * Main application logic for the editor UI
 */

import { CodeEditor } from './lib/editor'
import { TabManager } from './lib/tabs'
import { detectLanguage } from './lib/language-detection'
import { DocumentTab, ProjectFile, ServerStatus, SUPPORTED_LANGUAGES } from '../shared/types'
import type { ElectronAPI } from '../preload/index'

// Type declaration for window.electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

// Application state
let editor: CodeEditor | null = null
let tabManager: TabManager | null = null
let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null
let currentProjectName = 'untitled'
let isReceivingRemoteUpdate = false // Flag to prevent sync loops

// DOM Elements
const elements = {
  tabsContainer: document.getElementById('tabs-container')!,
  btnNewTab: document.getElementById('btn-new-tab')!,
  editorMount: document.getElementById('editor-mount')!,
  emptyState: document.getElementById('empty-state')!,
  languageIndicator: document.getElementById('language-indicator')!,
  cursorPosition: document.getElementById('cursor-position')!,
  saveIndicator: document.getElementById('save-indicator')!,
  serverStatus: document.getElementById('server-status')!,
  usersCount: document.getElementById('users-count')!,
  connectionUrl: document.getElementById('connection-url')!,
  btnShare: document.getElementById('btn-share')!,
  credentialModal: document.getElementById('credential-modal')!,
  modalUrl: document.getElementById('modal-url')!,
  btnCopyUrl: document.getElementById('btn-copy-url')!,
  btnCloseModal: document.getElementById('btn-close-modal')!,
  newUsername: document.getElementById('new-username') as HTMLInputElement,
  btnCreateCred: document.getElementById('btn-create-cred')!,
  credentialsList: document.getElementById('credentials-list')!,
  credCount: document.getElementById('cred-count')!,
  btnMenu: document.getElementById('btn-menu')!,
  encryptionStatus: document.getElementById('encryption-status')!,
  encryptionText: document.getElementById('encryption-text')!,
  btnFocusAll: document.getElementById('btn-focus-all')!
}

/**
 * Initialize the application
 */
async function init(): Promise<void> {
  console.log('Initializing LocalShare...')

  // Initialize tab manager
  tabManager = new TabManager({
    maxTabs: 20,
    onTabChange: handleTabChange,
    onTabsUpdate: handleTabsUpdate,
    onTabRename: handleTabRename,
    onWarning: showWarning
  })
  tabManager.mount(elements.tabsContainer)

  // Setup event listeners
  setupEventListeners()

  // Setup keyboard shortcuts
  setupKeyboardShortcuts()

  // Load server status
  await updateServerStatus()

  // Listen for server status updates
  window.electronAPI.server.onStatusChange(handleServerStatusChange)

  // Listen for content updates from guests
  window.electronAPI.server.onContentUpdate(handleRemoteContentUpdate)

  console.log('LocalShare initialized')
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  // New tab button
  elements.btnNewTab.addEventListener('click', () => {
    createNewTab()
  })

  // Share button
  elements.btnShare.addEventListener('click', openShareModal)

  // Focus All button
  elements.btnFocusAll.addEventListener('click', focusAllGuests)

  // Modal close
  elements.btnCloseModal.addEventListener('click', closeShareModal)
  elements.credentialModal.querySelector('.modal-backdrop')?.addEventListener('click', closeShareModal)

  // Copy URL
  elements.btnCopyUrl.addEventListener('click', copyConnectionUrl)

  // Create credential
  elements.btnCreateCred.addEventListener('click', createCredential)
  elements.newUsername.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createCredential()
  })
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.includes('Mac')
    const modKey = isMac ? e.metaKey : e.ctrlKey

    if (modKey) {
      switch (e.key.toLowerCase()) {
        case 't':
          e.preventDefault()
          createNewTab()
          break
        case 'w':
          e.preventDefault()
          closeCurrentTab()
          break
        case 's':
          e.preventDefault()
          if (e.shiftKey) {
            saveProjectAs()
          } else {
            saveProject()
          }
          break
        case 'o':
          e.preventDefault()
          openProject()
          break
        case 'n':
          e.preventDefault()
          newProject()
          break
      }
    }
  })
}

/**
 * Create a new tab
 */
function createNewTab(): void {
  if (!tabManager) return

  const tab = tabManager.createTab()
  showEditor()

  // Notify server of new tab
  window.electronAPI.server.addTab({
    tabId: tab.id,
    filename: tab.filename,
    content: tab.content
  })
  window.electronAPI.server.setActiveTab(tab.id)
}

/**
 * Close current tab
 */
function closeCurrentTab(): void {
  const activeTab = tabManager?.getActiveTab()
  if (activeTab) {
    // Notify server of tab removal
    window.electronAPI.server.removeTab(activeTab.id)
    tabManager?.closeTab(activeTab.id)
  }
}

/**
 * Handle tab change
 */
async function handleTabChange(tab: DocumentTab | null): Promise<void> {
  if (!tab) {
    hideEditor()
    return
  }

  showEditor()

  // Notify server of active tab change
  window.electronAPI.server.setActiveTab(tab.id)

  // Update language indicator
  const langInfo = SUPPORTED_LANGUAGES.find(l => l.id === tab.language)
  elements.languageIndicator.textContent = langInfo?.name || 'Plain Text'

  // Get fresh content from tab manager (it may have been updated)
  const freshTab = tabManager?.getTab(tab.id)
  const content = freshTab?.content ?? tab.content

  // Prevent the onChange handler from firing while we load new tab content
  isReceivingRemoteUpdate = true

  // Create or update editor
  if (editor) {
    editor.setContent(content)
    await editor.setLanguage(tab.language)
  } else {
    await createEditor({ ...tab, content })
  }

  // Re-enable change handling after a short delay
  setTimeout(() => {
    isReceivingRemoteUpdate = false
  }, 50)

  // Focus editor
  editor?.focus()
}

/**
 * Create editor for tab
 */
async function createEditor(tab: DocumentTab): Promise<void> {
  // Clear existing editor
  if (editor) {
    editor.destroy()
  }
  elements.editorMount.innerHTML = ''

  editor = new CodeEditor({
    initialContent: tab.content,
    languageId: tab.language,
    onChange: (content) => {
      // Always use the current active tab ID, not the captured one
      const activeTab = tabManager?.getActiveTab()
      if (activeTab) {
        handleEditorChange(activeTab.id, content)
      }
    },
    onCursorChange: (line, column) => {
      elements.cursorPosition.textContent = `Ln ${line}, Col ${column}`
    }
  })

  await editor.mount(elements.editorMount)
}

/**
 * Handle editor content change
 */
function handleEditorChange(tabId: string, content: string): void {
  tabManager?.updateTabContent(tabId, content)

  // Only sync to server if this is a local change (not from remote)
  if (!isReceivingRemoteUpdate) {
    const tab = tabManager?.getTab(tabId)
    if (tab) {
      window.electronAPI.server.syncContent({
        tabId,
        content,
        filename: tab.filename
      })
    }
  }

  // Show saving indicator
  showSaveIndicator('saving')

  // Debounced auto-save
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout)
  }

  autoSaveTimeout = setTimeout(async () => {
    await autoSave()
  }, 2000)
}

/**
 * Handle content update from remote guests
 */
function handleRemoteContentUpdate(data: { tabId: string; content: string }): void {
  console.log('[Renderer] Received remote content update for tab', data.tabId, ':', data.content.substring(0, 50))

  // Update tab content in tab manager
  tabManager?.updateTabContent(data.tabId, data.content)

  // Only update editor if this tab is currently active
  const activeTab = tabManager?.getActiveTab()
  if (activeTab && activeTab.id === data.tabId && editor) {
    // Set flag to prevent syncing back to server
    isReceivingRemoteUpdate = true

    // Update editor content
    editor.setContent(data.content)

    // Clear flag after a short delay
    setTimeout(() => {
      isReceivingRemoteUpdate = false
    }, 50)
  }
}

/**
 * Auto-save project
 */
async function autoSave(): Promise<void> {
  if (!tabManager) return

  const tabs = tabManager.getAllTabs()
  if (tabs.length === 0) return

  const project: ProjectFile = {
    version: '1.0',
    projectName: currentProjectName,
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
      // Mark all tabs as saved
      tabs.forEach(t => tabManager?.markTabSaved(t.id))
      showSaveIndicator('saved')
    }
  } catch (error) {
    console.error('Auto-save failed:', error)
    showSaveIndicator('error')
  }
}

/**
 * Save project
 */
async function saveProject(): Promise<void> {
  await autoSave()
}

/**
 * Save project as
 */
async function saveProjectAs(): Promise<void> {
  if (!tabManager) return

  const tabs = tabManager.getAllTabs()

  const project: ProjectFile = {
    version: '1.0',
    projectName: currentProjectName,
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
    // Extract project name from path
    const match = result.path.match(/([^/\\]+)\.json$/)
    if (match) {
      currentProjectName = match[1]
    }
    tabs.forEach(t => tabManager?.markTabSaved(t.id))
    showSaveIndicator('saved')
  }
}

/**
 * Open project
 */
async function openProject(): Promise<void> {
  const result = await window.electronAPI.file.openDialog()

  if (result.success && result.project) {
    loadProject(result.project)
  }
}

/**
 * Create new project
 */
function newProject(): void {
  if (tabManager?.hasUnsavedTabs()) {
    // TODO: Show confirmation dialog
  }

  currentProjectName = 'untitled'
  tabManager?.loadTabs([])
  createNewTab()
}

/**
 * Load project
 */
function loadProject(project: ProjectFile): void {
  currentProjectName = project.projectName
  tabManager?.loadTabs(project.tabs)
}

/**
 * Handle tabs update - sync all tabs with the collaboration server
 * This is called when loading a project or when bulk tab operations occur
 */
async function handleTabsUpdate(tabs: DocumentTab[]): Promise<void> {
  // Replace all tabs on the server atomically and broadcast to all guests
  await window.electronAPI.server.replaceAllTabs({
    tabs: tabs.map(t => ({ id: t.id, filename: t.filename, content: t.content })),
    activeTabId: tabs.length > 0 ? tabs[0].id : null
  })
}

/**
 * Handle tab rename
 */
function handleTabRename(tabId: string, newFilename: string): void {
  // Sync rename to server for guests
  window.electronAPI.server.renameTab({ tabId, filename: newFilename })

  // Update language indicator if this is the active tab
  const activeTab = tabManager?.getActiveTab()
  if (activeTab && activeTab.id === tabId) {
    const langInfo = SUPPORTED_LANGUAGES.find(l => l.id === activeTab.language)
    elements.languageIndicator.textContent = langInfo?.name || 'Plain Text'
  }
}

/**
 * Show/hide editor
 */
function showEditor(): void {
  elements.emptyState.classList.add('hidden')
  elements.editorMount.classList.remove('hidden')
}

function hideEditor(): void {
  elements.emptyState.classList.remove('hidden')
  elements.editorMount.classList.add('hidden')
  elements.languageIndicator.textContent = 'Plain Text'
  elements.cursorPosition.textContent = 'Ln 1, Col 1'

  if (editor) {
    editor.destroy()
    editor = null
  }
}

/**
 * Show save indicator
 */
function showSaveIndicator(state: 'saving' | 'saved' | 'error'): void {
  const indicator = elements.saveIndicator
  indicator.classList.remove('hidden', 'saving')

  const textEl = indicator.querySelector('.save-text')
  const iconEl = indicator.querySelector('.save-icon') as HTMLElement

  switch (state) {
    case 'saving':
      indicator.classList.add('saving')
      if (textEl) textEl.textContent = 'Saving...'
      break
    case 'saved':
      if (textEl) textEl.textContent = 'Saved'
      if (iconEl) iconEl.style.background = 'var(--phosphor)'
      // Hide after 2 seconds
      setTimeout(() => {
        indicator.classList.add('hidden')
      }, 2000)
      break
    case 'error':
      if (textEl) textEl.textContent = 'Save failed'
      if (iconEl) iconEl.style.background = 'var(--status-error)'
      break
  }
}

/**
 * Show warning message
 */
function showWarning(message: string): void {
  // TODO: Implement toast notification
  console.warn(message)
}

/**
 * Update server status
 */
async function updateServerStatus(): Promise<void> {
  const status = await window.electronAPI.server.getStatus()
  handleServerStatusChange(status)
}

/**
 * Handle server status change
 */
function handleServerStatusChange(status: ServerStatus): void {
  const statusDot = elements.serverStatus.querySelector('.status-dot')
  const statusText = elements.serverStatus.querySelector('.status-text')

  if (status.isRunning) {
    statusDot?.classList.remove('offline')
    statusDot?.classList.add('online')
    if (statusText) statusText.textContent = `${status.ip}:${status.port}`

    // Show connection URL
    elements.connectionUrl.textContent = `${status.ip}:${status.port}`
    elements.connectionUrl.classList.remove('hidden')

    // Show encryption status
    elements.encryptionStatus.classList.remove('hidden', 'secure', 'insecure')
    if (status.isEncrypted) {
      elements.encryptionStatus.classList.add('secure')
      elements.encryptionText.textContent = 'TLS'
      elements.encryptionStatus.title = 'Connection secured with TLS encryption'
    } else {
      elements.encryptionStatus.classList.add('insecure')
      elements.encryptionText.textContent = 'Unencrypted'
      elements.encryptionStatus.title = 'Connection is not encrypted'
    }

    // Update users count and Focus All button visibility
    if (status.connectedClients > 0) {
      elements.usersCount.classList.remove('hidden')
      elements.btnFocusAll.classList.remove('hidden')
      const countText = elements.usersCount.querySelector('.users-text')
      if (countText) countText.textContent = status.connectedClients.toString()
    } else {
      elements.usersCount.classList.add('hidden')
      elements.btnFocusAll.classList.add('hidden')
    }
  } else {
    statusDot?.classList.add('offline')
    statusDot?.classList.remove('online')
    if (statusText) statusText.textContent = 'Offline'
    elements.connectionUrl.classList.add('hidden')
    elements.usersCount.classList.add('hidden')
  }
}

/**
 * Focus all guests on current tab
 */
async function focusAllGuests(): Promise<void> {
  const activeTab = tabManager?.getActiveTab()
  if (activeTab) {
    await window.electronAPI.server.focusAllGuests(activeTab.id)
  }
}

/**
 * Open share modal
 */
async function openShareModal(): Promise<void> {
  elements.credentialModal.classList.remove('hidden')

  // Load connection URL
  const url = await window.electronAPI.server.getConnectionUrl()
  elements.modalUrl.textContent = url || 'Server not running'

  // Load credentials
  await loadCredentials()
}

/**
 * Close share modal
 */
function closeShareModal(): void {
  elements.credentialModal.classList.add('hidden')
}

/**
 * Copy connection URL
 */
async function copyConnectionUrl(): Promise<void> {
  const url = elements.modalUrl.textContent
  if (url && url !== 'Server not running') {
    await navigator.clipboard.writeText(url)
    // Show feedback
    const btn = elements.btnCopyUrl
    btn.innerHTML = '✓'
    setTimeout(() => {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M4 4v8h8V4H4zm0-1h8a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z"/>
        <path d="M2 2v8h1V2h7v1h1V2a1 1 0 00-1-1H2a1 1 0 00-1 1v8a1 1 0 001 1h1v-1H2z"/>
      </svg>`
    }, 1000)
  }
}

/**
 * Load credentials list
 */
async function loadCredentials(): Promise<void> {
  const credentials = await window.electronAPI.credentials.list()
  elements.credCount.textContent = credentials.length.toString()

  if (credentials.length === 0) {
    elements.credentialsList.innerHTML = '<p class="no-credentials">No credentials created yet</p>'
    return
  }

  elements.credentialsList.innerHTML = credentials.map(cred => `
    <div class="credential-item" data-username="${cred.username}">
      <div class="credential-info">
        <span class="credential-username">${cred.username}</span>
        <span class="credential-time">${formatTime(cred.createdAt)}</span>
      </div>
      <div class="credential-actions">
        <button class="revoke-btn" title="Revoke access">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="currentColor" stroke-width="1.5" fill="none"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('')

  // Add revoke handlers
  elements.credentialsList.querySelectorAll('.revoke-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const item = (e.target as HTMLElement).closest('.credential-item')
      const username = item?.getAttribute('data-username')
      if (username) {
        await window.electronAPI.credentials.revoke(username)
        await loadCredentials()
      }
    })
  })
}

/**
 * Create new credential
 */
async function createCredential(): Promise<void> {
  const username = elements.newUsername.value.trim()
  if (!username) return

  const result = await window.electronAPI.credentials.create(username)

  if (result.success && result.credential) {
    elements.newUsername.value = ''

    // Show the PIN in a special display
    const pinDisplay = document.createElement('div')
    pinDisplay.className = 'credential-item new-credential-display'
    pinDisplay.innerHTML = `
      <div class="credential-info">
        <span class="credential-username">${result.credential.username}</span>
        <span class="credential-pin">${result.credential.pin}</span>
      </div>
      <div class="credential-hint">Share this PIN with the guest</div>
    `

    // Insert at top of list
    const noCredsMsg = elements.credentialsList.querySelector('.no-credentials')
    if (noCredsMsg) {
      elements.credentialsList.innerHTML = ''
    }
    elements.credentialsList.insertBefore(pinDisplay, elements.credentialsList.firstChild)

    // Update count
    const credentials = await window.electronAPI.credentials.list()
    elements.credCount.textContent = credentials.length.toString()

    // Remove highlight after a while
    setTimeout(() => {
      loadCredentials()
    }, 10000)
  } else if (result.error) {
    showWarning(result.error)
  }
}

/**
 * Format timestamp
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Initialize application
init().catch(console.error)
