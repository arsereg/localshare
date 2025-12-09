/**
 * ActionsMenu Component
 * Dropdown menu with file actions: Save to disk, Copy, Open in VS Code
 */
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useAppStore } from '@stores/appStore'
import { cn } from '@lib/utils'
import {
  IconDotsVertical,
  IconDeviceFloppy,
  IconCopy,
  IconBrandVscode,
  IconCheck,
  IconChevronDown
} from '@tabler/icons-react'

interface ActionsMenuProps {
  variant?: 'button' | 'icon'
  className?: string
}

export function ActionsMenu({ variant = 'icon', className }: ActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copiedFeedback, setCopiedFeedback] = useState(false)
  const [savedFeedback, setSavedFeedback] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { getActiveTab } = useAppStore()

  const activeTab = getActiveTab()

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close menu on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }

    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const handleSaveToFile = async () => {
    if (!activeTab) return

    try {
      const result = await window.electronAPI.file.saveTabToFile({
        filename: activeTab.filename,
        content: activeTab.content
      })

      if (result.success) {
        setSavedFeedback(true)
        setTimeout(() => setSavedFeedback(false), 2000)
      }
    } catch (error) {
      console.error('Failed to save file:', error)
    }

    setIsOpen(false)
  }

  const handleCopyToClipboard = async () => {
    if (!activeTab) return

    try {
      await navigator.clipboard.writeText(activeTab.content)
      setCopiedFeedback(true)
      setTimeout(() => setCopiedFeedback(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }

    setIsOpen(false)
  }

  const handleOpenInVSCode = async () => {
    if (!activeTab) return

    try {
      await window.electronAPI.file.openInVSCode({
        filename: activeTab.filename,
        content: activeTab.content
      })
    } catch (error) {
      console.error('Failed to open in VS Code:', error)
    }

    setIsOpen(false)
  }

  if (!activeTab) return null

  return (
    <div ref={menuRef} className={cn('relative', className)}>
      {/* Trigger Button */}
      {variant === 'button' ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md',
            'bg-bg-elevated border border-border-default',
            'text-text-secondary hover:text-text-primary',
            'hover:border-border-emphasis',
            'transition-all duration-150',
            'text-xs font-medium',
            isOpen && 'border-accent-primary/30 text-text-primary'
          )}
        >
          <span>Actions</span>
          <IconChevronDown
            size={12}
            className={cn(
              'transition-transform duration-150',
              isOpen && 'rotate-180'
            )}
          />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-md',
            'text-text-tertiary hover:text-text-primary',
            'hover:bg-bg-hover',
            'transition-all duration-150',
            isOpen && 'bg-bg-hover text-text-primary'
          )}
          title="Actions"
        >
          <IconDotsVertical size={14} />
        </button>
      )}

      {/* Feedback indicators - positioned above */}
      <AnimatePresence>
        {copiedFeedback && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-status-success text-bg-base text-[10px] font-medium whitespace-nowrap z-50"
          >
            Copied!
          </motion.div>
        )}
        {savedFeedback && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-status-success text-bg-base text-[10px] font-medium whitespace-nowrap z-50"
          >
            Saved!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dropdown Menu - opens upward since we're in the status bar */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'absolute right-0 bottom-full mb-1.5 z-50',
              'w-48 py-1.5',
              'bg-bg-elevated border border-border-default rounded-lg',
              'shadow-lg'
            )}
          >
            {/* Save to File */}
            <button
              onClick={handleSaveToFile}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2',
                'text-left text-sm text-text-secondary',
                'hover:bg-bg-hover hover:text-text-primary',
                'transition-colors'
              )}
            >
              <IconDeviceFloppy size={15} className="text-text-tertiary" />
              <span>Save to file</span>
              <span className="ml-auto text-[10px] text-text-disabled font-mono">
                {navigator.platform.includes('Mac') ? '⌘⇧S' : 'Ctrl+Shift+S'}
              </span>
            </button>

            {/* Copy to Clipboard */}
            <button
              onClick={handleCopyToClipboard}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2',
                'text-left text-sm text-text-secondary',
                'hover:bg-bg-hover hover:text-text-primary',
                'transition-colors'
              )}
            >
              <IconCopy size={15} className="text-text-tertiary" />
              <span>Copy content</span>
              <span className="ml-auto text-[10px] text-text-disabled font-mono">
                {navigator.platform.includes('Mac') ? '⌘⇧C' : 'Ctrl+Shift+C'}
              </span>
            </button>

            {/* Divider */}
            <div className="my-1.5 mx-3 h-px bg-border-subtle" />

            {/* Open in VS Code */}
            <button
              onClick={handleOpenInVSCode}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2',
                'text-left text-sm text-text-secondary',
                'hover:bg-bg-hover hover:text-text-primary',
                'transition-colors'
              )}
            >
              <IconBrandVscode size={15} className="text-[#007ACC]" />
              <span>Open in VS Code</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
