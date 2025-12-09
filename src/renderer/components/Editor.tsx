/**
 * Editor Component
 * CodeMirror editor with refined empty state and collaboration features
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { motion } from 'motion/react'
import { useAppStore } from '@stores/appStore'
import { useServerAPI } from '@hooks/useElectronAPI'
import { CodeEditor } from '@lib/editor'
import { SUPPORTED_LANGUAGES, WS_MESSAGE_TYPES } from '@shared/types'
import { cn } from '@lib/utils'
import {
  IconCode,
  IconFolderOpen,
  IconPlus,
  IconTerminal2,
  IconBraces,
  IconArrowRight
} from '@tabler/icons-react'

export function Editor() {
  const {
    tabs,
    activeTabId,
    getActiveTab,
    updateTabContent,
    setCursorPosition,
    createTab,
    getRemoteCursorsForTab,
    getRemoteSelectionsForTab,
    connectedUsers,
    followState
  } = useAppStore()
  const { syncContent, addServerTab, setActiveServerTab } = useServerAPI()

  const editorRef = useRef<CodeEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isReceivingRemoteUpdate = useRef(false)
  const lastKnownContent = useRef<string>('')
  const lastBroadcastedCursor = useRef<{ line: number; column: number } | null>(null)
  const lastBroadcastedSelection = useRef<string | null>(null)

  const activeTab = getActiveTab()

  // Handle editor content changes
  const handleEditorChange = useCallback(
    async (content: string) => {
      if (isReceivingRemoteUpdate.current) return

      const currentTab = getActiveTab()
      if (!currentTab) return

      lastKnownContent.current = content
      updateTabContent(currentTab.id, content)
      await syncContent(currentTab.id, content, currentTab.filename)
    },
    [getActiveTab, updateTabContent, syncContent]
  )

  // Handle cursor position changes
  const handleCursorChange = useCallback(
    (line: number, column: number) => {
      setCursorPosition(line, column)

      // Debounce cursor broadcasts
      const currentTab = getActiveTab()
      if (!currentTab) return

      const cursorKey = `${line}:${column}`
      if (lastBroadcastedCursor.current?.line === line && lastBroadcastedCursor.current?.column === column) {
        return
      }
      lastBroadcastedCursor.current = { line, column }

      // Broadcast cursor position to guests
      window.electronAPI.server.broadcastCursor({
        tabId: currentTab.id,
        line,
        column
      })
    },
    [setCursorPosition, getActiveTab]
  )

  // Handle selection changes
  const handleSelectionChange = useCallback(
    (anchor: { line: number; column: number }, head: { line: number; column: number }) => {
      const currentTab = getActiveTab()
      if (!currentTab) return

      const selectionKey = `${anchor.line}:${anchor.column}-${head.line}:${head.column}`
      if (lastBroadcastedSelection.current === selectionKey) {
        return
      }
      lastBroadcastedSelection.current = selectionKey

      // Broadcast selection to guests
      window.electronAPI.server.broadcastSelection({
        tabId: currentTab.id,
        anchor,
        head
      })
    },
    [getActiveTab]
  )

  // Create/update editor when active tab changes
  useEffect(() => {
    if (!activeTab || !containerRef.current) {
      if (editorRef.current) {
        editorRef.current.destroy()
        editorRef.current = null
      }
      return
    }

    const mountEditor = async () => {
      if (editorRef.current) {
        editorRef.current.destroy()
        editorRef.current = null
      }

      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }

      lastKnownContent.current = activeTab.content

      editorRef.current = new CodeEditor({
        initialContent: activeTab.content,
        languageId: activeTab.language,
        onChange: handleEditorChange,
        onCursorChange: handleCursorChange,
        onSelectionChange: handleSelectionChange,
        enableCollaboration: true
      })

      await editorRef.current.mount(containerRef.current!)
      editorRef.current.focus()
    }

    mountEditor()

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy()
        editorRef.current = null
      }
    }
  }, [activeTabId, activeTab?.language])

  // Listen for external content updates
  useEffect(() => {
    if (!activeTab || !editorRef.current) return

    if (activeTab.content !== lastKnownContent.current) {
      isReceivingRemoteUpdate.current = true
      editorRef.current.setContent(activeTab.content)
      lastKnownContent.current = activeTab.content
      isReceivingRemoteUpdate.current = false
    }
  }, [activeTab?.content])

  // Update remote cursors in editor
  useEffect(() => {
    if (!editorRef.current || !activeTabId) return

    const cursors = getRemoteCursorsForTab(activeTabId)
    editorRef.current.setRemoteCursors(cursors)
  }, [activeTabId, connectedUsers])

  // Update remote selections in editor
  useEffect(() => {
    if (!editorRef.current || !activeTabId) return

    const selections = getRemoteSelectionsForTab(activeTabId)
    editorRef.current.setRemoteSelections(selections)
  }, [activeTabId, connectedUsers])

  // Handle follow mode - scroll to followed user's position
  useEffect(() => {
    if (!editorRef.current || !followState.isFollowing || !followState.targetUsername) return

    const targetUser = connectedUsers.find(u => u.username === followState.targetUsername)
    if (!targetUser?.cursor || targetUser.cursor.tabId !== activeTabId) return

    // Scroll to the followed user's cursor position
    editorRef.current.scrollToLine(targetUser.cursor.line)
  }, [followState.isFollowing, followState.targetUsername, connectedUsers, activeTabId])

  // Handle new tab creation
  const handleNewTab = async () => {
    const tab = createTab()
    await addServerTab(tab.id, tab.filename, tab.content)
    await setActiveServerTab(tab.id)
  }

  return (
    <main className="flex-1 relative overflow-hidden bg-bg-base">
      {activeTab ? (
        <div className="h-full relative">
          <div
            ref={containerRef}
            className="h-full w-full editor-container"
          />
        </div>
      ) : (
        <EmptyState onNewTab={handleNewTab} />
      )}
    </main>
  )
}

/**
 * Refined empty state
 */
function EmptyState({ onNewTab }: { onNewTab: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex items-center justify-center"
    >
      <div className="max-w-md w-full px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-10"
        >
          {/* Icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-bg-elevated border border-border-default mb-6">
            <IconTerminal2 size={28} className="text-accent-primary" />
          </div>

          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Start collaborating
          </h2>
          <p className="text-sm text-text-secondary">
            Create a new file or open an existing project to begin real-time editing with your team.
          </p>
        </motion.div>

        {/* Action cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          {/* New File */}
          <button
            onClick={onNewTab}
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-xl',
              'bg-bg-surface border border-border-default',
              'hover:bg-bg-elevated hover:border-border-emphasis',
              'transition-all duration-150 group text-left'
            )}
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent-primary-dim">
              <IconPlus size={18} className="text-accent-primary" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-text-primary group-hover:text-accent-primary transition-colors">
                New file
              </div>
              <div className="text-xs text-text-tertiary">
                Create a blank document
              </div>
            </div>
            <div className="flex items-center gap-2 text-text-disabled">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-bg-elevated border border-border-subtle">
                Cmd
              </kbd>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-bg-elevated border border-border-subtle">
                T
              </kbd>
            </div>
          </button>

          {/* Open Project */}
          <button
            onClick={() => window.electronAPI.file.openDialog()}
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-xl',
              'bg-bg-surface border border-border-default',
              'hover:bg-bg-elevated hover:border-border-emphasis',
              'transition-all duration-150 group text-left'
            )}
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent-tertiary-dim">
              <IconFolderOpen size={18} className="text-accent-tertiary" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-text-primary group-hover:text-accent-tertiary transition-colors">
                Open project
              </div>
              <div className="text-xs text-text-tertiary">
                Load an existing .localshare file
              </div>
            </div>
            <div className="flex items-center gap-2 text-text-disabled">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-bg-elevated border border-border-subtle">
                Cmd
              </kbd>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-bg-elevated border border-border-subtle">
                O
              </kbd>
            </div>
          </button>
        </motion.div>

        {/* Footer hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 text-center"
        >
          <p className="text-xs text-text-disabled">
            Share the connection URL with teammates to collaborate in real-time
          </p>
        </motion.div>
      </div>
    </motion.div>
  )
}
