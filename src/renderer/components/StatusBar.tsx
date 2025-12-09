/**
 * StatusBar Component
 * Clean, minimal status bar with essential information
 */
import { motion, AnimatePresence } from 'motion/react'
import { useAppStore } from '@stores/appStore'
import { useServerAPI } from '@hooks/useElectronAPI'
import { SUPPORTED_LANGUAGES } from '@shared/types'
import { cn } from '@lib/utils'
import { ActionsMenu } from './ActionsMenu'
import {
  IconShare,
  IconFocus2,
  IconLock,
  IconLockOpen,
  IconCheck,
  IconLoader2,
  IconAlertTriangle,
  IconCircleFilled
} from '@tabler/icons-react'

export function StatusBar() {
  const {
    serverStatus,
    cursorPosition,
    saveStatus,
    getActiveTab,
    connectedUsers,
    openShareModal
  } = useAppStore()
  const { focusAllGuests } = useServerAPI()

  const activeTab = getActiveTab()
  const langInfo = SUPPORTED_LANGUAGES.find((l) => l.id === activeTab?.language)
  const hasGuests = connectedUsers.length > 0
  const isEncrypted = serverStatus.isEncrypted

  return (
    <footer className="relative z-40 h-8 px-3 flex items-center justify-between bg-bg-surface border-t border-border-subtle">
      {/* Left section - Language & Cursor */}
      <div className="flex items-center gap-3">
        {/* Language badge */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-bg-elevated">
          <span className="text-[11px] font-medium text-text-secondary">
            {langInfo?.name || 'Plain Text'}
          </span>
        </div>

        {/* Separator */}
        <span className="w-px h-3 bg-border-default" />

        {/* Cursor position */}
        <span className="text-[11px] text-text-tertiary font-mono">
          Ln {cursorPosition.line}, Col {cursorPosition.column}
        </span>

        {/* Save status */}
        <AnimatePresence mode="wait">
          {saveStatus !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-1.5"
            >
              <span className="w-px h-3 bg-border-default" />
              {saveStatus === 'saving' && (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <IconLoader2 size={11} className="text-text-tertiary" />
                  </motion.div>
                  <span className="text-[11px] text-text-tertiary">Saving</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <IconCheck size={11} className="text-status-success" />
                  <span className="text-[11px] text-status-success">Saved</span>
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <IconAlertTriangle size={11} className="text-status-error" />
                  <span className="text-[11px] text-status-error">Error</span>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right section - Actions */}
      <div className="flex items-center gap-2">
        {/* Encryption status */}
        {serverStatus.isRunning && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded">
            {isEncrypted ? (
              <>
                <IconLock size={11} className="text-status-success" />
                <span className="text-[11px] text-status-success">TLS</span>
              </>
            ) : (
              <>
                <IconLockOpen size={11} className="text-status-warning" />
                <span className="text-[11px] text-status-warning">Insecure</span>
              </>
            )}
          </div>
        )}

        {/* Focus All button */}
        {hasGuests && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={focusAllGuests}
            className={cn(
              'flex items-center gap-1.5 px-2 py-0.5 rounded',
              'bg-accent-primary-dim text-accent-primary',
              'hover:bg-accent-primary/20 transition-colors',
              'text-[11px] font-medium'
            )}
            title="Focus all guests on current tab"
          >
            <IconFocus2 size={11} />
            <span>Focus All</span>
          </motion.button>
        )}

        {/* Actions Menu */}
        {activeTab && <ActionsMenu variant="button" />}

        {/* Share button */}
        <button
          onClick={openShareModal}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-md',
            'bg-accent-primary text-bg-base',
            'hover:bg-accent-primary/90 transition-colors',
            'text-[11px] font-semibold'
          )}
        >
          <IconShare size={12} />
          <span>Share</span>
        </button>

        {/* Connection status */}
        {serverStatus.isRunning && (
          <div className="flex items-center gap-1.5 ml-1">
            <IconCircleFilled size={6} className="text-status-success" />
            <span className="text-[11px] text-text-tertiary font-mono">
              {serverStatus.ip}:{serverStatus.port}
            </span>
          </div>
        )}
      </div>
    </footer>
  )
}
