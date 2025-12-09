/**
 * TabBar Component
 * Clean, minimal tab bar with subtle interactions
 */
import { useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useAppStore } from '@stores/appStore'
import { useServerAPI } from '@hooks/useElectronAPI'
import { cn } from '@lib/utils'
import { IconPlus, IconX, IconFile } from '@tabler/icons-react'

const LANGUAGE_COLORS: Record<string, string> = {
  javascript: '#f7df1e',
  typescript: '#3178c6',
  jsx: '#61dafb',
  tsx: '#3178c6',
  python: '#3776ab',
  java: '#ed8b00',
  cpp: '#00599c',
  c: '#a8b9cc',
  html: '#e34c26',
  css: '#1572b6',
  json: '#292929',
  markdown: '#083fa1',
  plaintext: '#71717a'
}

export function TabBar() {
  const { tabs, activeTabId, createTab, closeTab, setActiveTab, renameTab } = useAppStore()
  const { addServerTab, removeServerTab, setActiveServerTab, renameServerTab } = useServerAPI()

  const handleNewTab = async () => {
    const tab = createTab()
    await addServerTab(tab.id, tab.filename, tab.content)
    await setActiveServerTab(tab.id)
  }

  const handleCloseTab = async (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await removeServerTab(tabId)
    closeTab(tabId)
  }

  const handleSelectTab = async (tabId: string) => {
    setActiveTab(tabId)
    await setActiveServerTab(tabId)
  }

  const handleRenameTab = async (tabId: string, newFilename: string) => {
    renameTab(tabId, newFilename)
    await renameServerTab(tabId, newFilename)
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border-subtle bg-bg-surface/50">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onClick={() => handleSelectTab(tab.id)}
              onClose={(e) => handleCloseTab(tab.id, e)}
              onRename={handleRenameTab}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* New Tab Button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleNewTab}
        className={cn(
          'flex items-center justify-center w-7 h-7 rounded-md ml-1',
          'bg-transparent hover:bg-bg-hover',
          'border border-transparent hover:border-border-default',
          'text-text-tertiary hover:text-text-primary',
          'transition-all duration-150'
        )}
        title="New Tab (Cmd+T)"
      >
        <IconPlus size={14} />
      </motion.button>
    </div>
  )
}

interface TabItemProps {
  tab: {
    id: string
    filename: string
    language: string
    isDirty: boolean
  }
  isActive: boolean
  onClick: () => void
  onClose: (e: React.MouseEvent) => void
  onRename: (tabId: string, newName: string) => void
}

function TabItem({ tab, isActive, onClick, onClose, onRename }: TabItemProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [editValue, setEditValue] = useState(tab.filename)

  const languageColor = LANGUAGE_COLORS[tab.language] || LANGUAGE_COLORS.plaintext

  // Focus input when entering rename mode
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(tab.filename)
    setIsRenaming(true)
  }

  const handleRenameComplete = () => {
    const trimmedValue = editValue.trim()
    if (trimmedValue && trimmedValue !== tab.filename) {
      onRename(tab.id, trimmedValue)
    }
    setIsRenaming(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameComplete()
    } else if (e.key === 'Escape') {
      setEditValue(tab.filename)
      setIsRenaming(false)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer',
        'transition-all duration-150',
        isActive
          ? 'bg-bg-elevated border border-border-default'
          : 'bg-transparent border border-transparent hover:bg-bg-hover hover:border-border-subtle'
      )}
    >
      {/* Language indicator dot */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: languageColor }}
      />

      {/* Filename */}
      {isRenaming ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleRenameComplete}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'text-xs font-medium w-24 bg-bg-base border border-accent-primary/50 rounded px-1.5 py-0.5',
            'text-text-primary outline-none'
          )}
        />
      ) : (
        <span
          className={cn(
            'text-xs font-medium max-w-28 truncate cursor-text',
            isActive ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary'
          )}
          title={tab.filename}
          onDoubleClick={handleDoubleClick}
        >
          {tab.filename}
        </span>
      )}

      {/* Dirty indicator */}
      {tab.isDirty && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-1.5 h-1.5 rounded-full bg-accent-secondary flex-shrink-0"
        />
      )}

      {/* Close button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: isActive ? 0.7 : 0 }}
        whileHover={{ opacity: 1, scale: 1.1 }}
        onClick={onClose}
        className={cn(
          'flex items-center justify-center w-4 h-4 rounded-sm flex-shrink-0',
          'text-text-tertiary hover:text-status-error hover:bg-status-error/10',
          'transition-colors',
          !isActive && 'group-hover:opacity-70'
        )}
      >
        <IconX size={10} />
      </motion.button>

      {/* Active indicator line */}
      {isActive && (
        <motion.div
          layoutId="activeTabIndicator"
          className="absolute -bottom-[9px] left-3 right-3 h-0.5 rounded-full bg-accent-primary"
        />
      )}
    </motion.div>
  )
}
