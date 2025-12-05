/**
 * Tab Management Module
 * Handles multi-tab document management with animations
 */

import { v4 as uuidv4 } from 'uuid'
import { DocumentTab } from '../../shared/types'
import { detectLanguage } from './language-detection'

export interface TabManagerConfig {
  maxTabs?: number
  onTabChange?: (tab: DocumentTab | null) => void
  onTabsUpdate?: (tabs: DocumentTab[]) => void
  onTabRename?: (tabId: string, newFilename: string) => void
  onWarning?: (message: string) => void
}

export class TabManager {
  private tabs: DocumentTab[] = []
  private activeTabId: string | null = null
  private config: TabManagerConfig
  private container: HTMLElement | null = null

  constructor(config: TabManagerConfig = {}) {
    this.config = {
      maxTabs: config.maxTabs || 20,
      onTabChange: config.onTabChange,
      onTabsUpdate: config.onTabsUpdate,
      onTabRename: config.onTabRename,
      onWarning: config.onWarning
    }
  }

  /**
   * Mount tab bar to container
   */
  mount(container: HTMLElement): void {
    this.container = container
    this.render()
  }

  /**
   * Create a new tab
   */
  createTab(filename: string = 'untitled.txt', content: string = ''): DocumentTab {
    if (this.tabs.length >= this.config.maxTabs!) {
      this.config.onWarning?.(`Maximum ${this.config.maxTabs} tabs reached`)
      return this.tabs[this.tabs.length - 1]
    }

    if (this.tabs.length === this.config.maxTabs! - 3) {
      this.config.onWarning?.(`Approaching tab limit (${this.config.maxTabs})`)
    }

    const language = detectLanguage(filename, content)

    const tab: DocumentTab = {
      id: uuidv4(),
      filename,
      language: language.id,
      content,
      isDirty: false
    }

    this.tabs.push(tab)
    this.setActiveTab(tab.id)
    this.render()
    this.config.onTabsUpdate?.(this.tabs)

    return tab
  }

  /**
   * Close a tab
   */
  closeTab(tabId: string): void {
    const index = this.tabs.findIndex(t => t.id === tabId)
    if (index === -1) return

    const wasActive = this.activeTabId === tabId

    this.tabs.splice(index, 1)

    if (wasActive && this.tabs.length > 0) {
      // Activate adjacent tab
      const newIndex = Math.min(index, this.tabs.length - 1)
      this.setActiveTab(this.tabs[newIndex].id)
    } else if (this.tabs.length === 0) {
      this.activeTabId = null
      this.config.onTabChange?.(null)
    }

    this.render()
    this.config.onTabsUpdate?.(this.tabs)
  }

  /**
   * Set active tab
   */
  setActiveTab(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId)
    if (!tab) return

    // Skip if already active (prevents re-render on double-click)
    if (this.activeTabId === tabId) return

    this.activeTabId = tabId
    this.render()
    this.config.onTabChange?.(tab)
  }

  /**
   * Update tab content and dirty state
   */
  updateTabContent(tabId: string, content: string): void {
    const tab = this.tabs.find(t => t.id === tabId)
    if (!tab) return

    const wasDirty = tab.isDirty
    tab.content = content
    tab.isDirty = true

    if (!wasDirty) {
      this.render()
    }
  }

  /**
   * Mark tab as saved
   */
  markTabSaved(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId)
    if (!tab) return

    tab.isDirty = false
    this.render()
  }

  /**
   * Rename a tab
   */
  renameTab(tabId: string, newFilename: string): void {
    const tab = this.tabs.find(t => t.id === tabId)
    if (!tab) return

    tab.filename = newFilename
    const language = detectLanguage(newFilename, tab.content)
    tab.language = language.id

    this.render()
    this.config.onTabRename?.(tabId, newFilename)
    this.config.onTabsUpdate?.(this.tabs)
  }

  /**
   * Start inline rename for a tab
   */
  private startRename(tabId: string, nameEl: HTMLElement): void {
    const tab = this.tabs.find(t => t.id === tabId)
    if (!tab) return

    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'tab-rename-input'
    input.value = tab.filename
    input.style.width = `${Math.max(nameEl.offsetWidth, 60)}px`

    const finishRename = () => {
      const newName = input.value.trim()
      if (newName && newName !== tab.filename) {
        this.renameTab(tabId, newName)
      } else {
        this.render() // Just re-render to restore original name
      }
    }

    input.onblur = finishRename

    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        input.blur()
      } else if (e.key === 'Escape') {
        input.value = tab.filename // Reset to original
        input.blur()
      }
    }

    nameEl.textContent = ''
    nameEl.appendChild(input)
    input.focus()
    input.select()
  }

  /**
   * Get active tab
   */
  getActiveTab(): DocumentTab | null {
    if (!this.activeTabId) return null
    return this.tabs.find(t => t.id === this.activeTabId) || null
  }

  /**
   * Get all tabs
   */
  getAllTabs(): DocumentTab[] {
    return [...this.tabs]
  }

  /**
   * Get tab by ID
   */
  getTab(tabId: string): DocumentTab | undefined {
    return this.tabs.find(t => t.id === tabId)
  }

  /**
   * Load tabs from project
   */
  loadTabs(tabs: Omit<DocumentTab, 'isDirty'>[]): void {
    this.tabs = tabs.map(t => ({ ...t, isDirty: false }))

    if (this.tabs.length > 0) {
      this.setActiveTab(this.tabs[0].id)
    } else {
      this.activeTabId = null
      this.config.onTabChange?.(null)
    }

    this.render()
    this.config.onTabsUpdate?.(this.tabs)
  }

  /**
   * Check if there are unsaved tabs
   */
  hasUnsavedTabs(): boolean {
    return this.tabs.some(t => t.isDirty)
  }

  /**
   * Render tabs to container
   */
  private render(): void {
    if (!this.container) return

    this.container.innerHTML = ''

    this.tabs.forEach((tab, index) => {
      const tabEl = this.createTabElement(tab)

      // Add animation for new tabs
      tabEl.style.animation = 'fade-in 0.2s ease-out'

      this.container!.appendChild(tabEl)
    })
  }

  /**
   * Create tab DOM element
   */
  private createTabElement(tab: DocumentTab): HTMLElement {
    const isActive = tab.id === this.activeTabId

    const tabEl = document.createElement('div')
    tabEl.className = `tab ${isActive ? 'active' : ''}`
    tabEl.dataset.tabId = tab.id
    tabEl.setAttribute('draggable', 'true')

    // Tab name
    const nameEl = document.createElement('span')
    nameEl.className = 'tab-name'
    nameEl.textContent = tab.filename
    nameEl.title = tab.filename

    // Double-click to rename
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      e.preventDefault()
      this.startRename(tab.id, nameEl)
    })

    // Prevent single click from bubbling to parent (which would re-render)
    nameEl.addEventListener('click', (e) => {
      // Only stop propagation, let the tab activation happen on first click
      // but don't let it interfere with double-click detection
    })

    tabEl.appendChild(nameEl)

    // Dirty indicator
    if (tab.isDirty) {
      const dirtyEl = document.createElement('span')
      dirtyEl.className = 'tab-dirty'
      dirtyEl.textContent = '●'
      dirtyEl.title = 'Unsaved changes'
      tabEl.appendChild(dirtyEl)
    }

    // Close button
    const closeEl = document.createElement('button')
    closeEl.className = 'tab-close'
    closeEl.innerHTML = '×'
    closeEl.title = 'Close tab'
    closeEl.onclick = (e) => {
      e.stopPropagation()
      this.closeTab(tab.id)
    }
    tabEl.appendChild(closeEl)

    // Click to activate
    tabEl.onclick = () => {
      this.setActiveTab(tab.id)
    }

    // Drag and drop for reordering
    tabEl.ondragstart = (e) => {
      e.dataTransfer?.setData('text/plain', tab.id)
      tabEl.classList.add('dragging')
    }

    tabEl.ondragend = () => {
      tabEl.classList.remove('dragging')
    }

    tabEl.ondragover = (e) => {
      e.preventDefault()
      tabEl.classList.add('drag-over')
    }

    tabEl.ondragleave = () => {
      tabEl.classList.remove('drag-over')
    }

    tabEl.ondrop = (e) => {
      e.preventDefault()
      tabEl.classList.remove('drag-over')

      const draggedId = e.dataTransfer?.getData('text/plain')
      if (!draggedId || draggedId === tab.id) return

      this.reorderTabs(draggedId, tab.id)
    }

    return tabEl
  }

  /**
   * Reorder tabs via drag and drop
   */
  private reorderTabs(draggedId: string, targetId: string): void {
    const draggedIndex = this.tabs.findIndex(t => t.id === draggedId)
    const targetIndex = this.tabs.findIndex(t => t.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const [draggedTab] = this.tabs.splice(draggedIndex, 1)
    this.tabs.splice(targetIndex, 0, draggedTab)

    this.render()
    this.config.onTabsUpdate?.(this.tabs)
  }
}
