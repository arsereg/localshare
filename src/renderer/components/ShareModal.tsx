/**
 * ShareModal Component
 * Clean, professional modal for sharing session and managing credentials
 */
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useAppStore } from '@stores/appStore'
import { useCredentialsAPI } from '@hooks/useElectronAPI'
import { cn } from '@lib/utils'
import {
  IconCopy,
  IconCheck,
  IconUser,
  IconKey,
  IconTrash,
  IconUserPlus,
  IconShieldLock,
  IconLink,
  IconX
} from '@tabler/icons-react'

export function ShareModal() {
  const { isShareModalOpen, closeShareModal, connectionUrl, serverStatus } = useAppStore()
  const { credentials, loadCredentials, createCredential, revokeCredential } = useCredentialsAPI()

  const [newUsername, setNewUsername] = useState('')
  const [newPin, setNewPin] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Load credentials when modal opens
  useEffect(() => {
    if (isShareModalOpen) {
      loadCredentials()
    }
  }, [isShareModalOpen, loadCredentials])

  const handleCopyUrl = async () => {
    if (connectionUrl) {
      await navigator.clipboard.writeText(connectionUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCreateCredential = async () => {
    if (!newUsername.trim()) return

    setIsCreating(true)
    const result = await createCredential(newUsername.trim())

    if (result.success && result.credential) {
      setNewPin(result.credential.pin)
      setNewUsername('')
    }

    setIsCreating(false)
  }

  const handleRevokeCredential = async (username: string) => {
    await revokeCredential(username)
  }

  if (!isShareModalOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeShareModal}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            'relative z-50 w-full max-w-md mx-4',
            'bg-bg-surface rounded-2xl',
            'border border-border-default shadow-xl',
            'overflow-hidden'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border-subtle">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent-primary-dim">
                <IconLink size={18} className="text-accent-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-text-primary">Share Session</h2>
                <p className="text-xs text-text-tertiary">Invite collaborators</p>
              </div>
            </div>
            <button
              onClick={closeShareModal}
              className="p-1.5 rounded-md hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors"
            >
              <IconX size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-5">
            {/* Connection URL */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                <IconLink size={12} />
                Connection URL
              </label>
              <div className="flex items-center gap-2">
                <div className={cn(
                  'flex-1 px-3 py-2.5 rounded-lg',
                  'bg-bg-base border border-border-default',
                  'font-mono text-xs text-text-primary'
                )}>
                  {serverStatus.isRunning ? (
                    connectionUrl || 'Loading...'
                  ) : (
                    <span className="text-text-disabled">Server not running</span>
                  )}
                </div>
                <button
                  onClick={handleCopyUrl}
                  disabled={!serverStatus.isRunning}
                  className={cn(
                    'p-2.5 rounded-lg',
                    'bg-bg-elevated border border-border-default',
                    'text-text-secondary hover:text-accent-primary',
                    'hover:border-accent-primary/30',
                    'transition-all duration-150',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {copied ? (
                    <IconCheck size={16} className="text-status-success" />
                  ) : (
                    <IconCopy size={16} />
                  )}
                </button>
              </div>
            </div>

            {/* Credentials */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                  <IconShieldLock size={12} />
                  Guest Credentials
                </label>
                <span className="text-xs text-text-disabled">
                  {credentials.length}/10
                </span>
              </div>

              {/* Create new credential */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCredential()}
                  placeholder="Enter username"
                  maxLength={20}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-lg',
                    'bg-bg-base border border-border-default',
                    'text-sm text-text-primary placeholder:text-text-disabled',
                    'focus:outline-none focus:border-accent-primary/50',
                    'transition-colors'
                  )}
                />
                <button
                  onClick={handleCreateCredential}
                  disabled={!newUsername.trim() || isCreating || credentials.length >= 10}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg',
                    'bg-accent-primary text-bg-base',
                    'text-sm font-medium',
                    'hover:bg-accent-primary/90 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <IconUserPlus size={14} />
                  <span>Generate</span>
                </button>
              </div>

              {/* New PIN display */}
              <AnimatePresence>
                {newPin && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 rounded-lg bg-status-success/10 border border-status-success/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-md bg-status-success/20 flex items-center justify-center">
                            <IconKey size={14} className="text-status-success" />
                          </div>
                          <div>
                            <p className="text-[10px] text-text-secondary uppercase tracking-wider">Share this PIN</p>
                            <p className="text-xl font-mono font-bold text-status-success tracking-widest">
                              {newPin}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setNewPin(null)}
                          className="p-1 text-text-tertiary hover:text-text-primary"
                        >
                          <IconCheck size={16} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Credentials list */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                <AnimatePresence mode="popLayout">
                  {credentials.length === 0 ? (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center text-xs text-text-disabled py-6"
                    >
                      No credentials created yet
                    </motion.p>
                  ) : (
                    credentials.map((cred, idx) => (
                      <motion.div
                        key={cred.username}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ delay: idx * 0.03 }}
                        className={cn(
                          'p-3 rounded-lg',
                          'bg-bg-elevated border border-border-subtle',
                          'hover:border-border-default transition-colors'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-accent-primary-dim flex items-center justify-center">
                              <IconUser size={14} className="text-accent-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-text-primary">
                                {cred.username}
                              </p>
                              <p className="text-[10px] text-text-disabled">
                                Created {formatTime(cred.createdAt)}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRevokeCredential(cred.username)}
                            className="p-1.5 rounded-md hover:bg-status-error/10 text-text-disabled hover:text-status-error transition-colors"
                            title="Revoke access"
                          >
                            <IconTrash size={14} />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border-subtle bg-bg-base/50">
            <button
              onClick={closeShareModal}
              className={cn(
                'px-4 py-2 rounded-lg',
                'text-sm font-medium text-text-secondary',
                'hover:text-text-primary hover:bg-bg-hover',
                'transition-colors'
              )}
            >
              Done
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
