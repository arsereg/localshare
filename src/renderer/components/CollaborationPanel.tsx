/**
 * CollaborationPanel Component
 * Shows connected users, follow mode controls, and voice chat
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useAppStore } from '@stores/appStore'
import { cn } from '@lib/utils'
import {
  IconUsers,
  IconEye,
  IconEyeOff,
  IconMicrophone,
  IconMicrophoneOff,
  IconPhone,
  IconPhoneOff,
  IconChevronDown,
  IconPoint
} from '@tabler/icons-react'

interface CollaborationPanelProps {
  className?: string
  onFollowUser?: (username: string) => void
  onUnfollow?: () => void
}

export function CollaborationPanel({ className, onFollowUser, onUnfollow }: CollaborationPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const {
    connectedUsers,
    followState,
    voiceChat,
    startFollowing,
    stopFollowing,
    joinVoiceChat,
    leaveVoiceChat,
    setMuted
  } = useAppStore()

  const handleFollowToggle = (username: string) => {
    if (followState.isFollowing && followState.targetUsername === username) {
      stopFollowing()
      onUnfollow?.()
    } else {
      startFollowing(username)
      onFollowUser?.(username)
    }
  }

  const handleVoiceToggle = () => {
    if (voiceChat.isActive) {
      leaveVoiceChat()
    } else {
      joinVoiceChat()
    }
  }

  const handleMuteToggle = () => {
    setMuted(!voiceChat.isMuted)
  }

  if (connectedUsers.length === 0) return null

  return (
    <div className={cn('relative', className)}>
      {/* Collapsed view - just user avatars */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded-md',
          'bg-bg-elevated border border-border-default',
          'hover:border-border-emphasis',
          'transition-all duration-150',
          isExpanded && 'border-accent-primary/30'
        )}
      >
        {/* User avatars stack */}
        <div className="flex -space-x-1.5">
          {connectedUsers.slice(0, 3).map((user, i) => (
            <div
              key={user.username}
              className="w-5 h-5 rounded-full border-2 border-bg-elevated flex items-center justify-center text-[9px] font-bold"
              style={{ backgroundColor: user.color, zIndex: 3 - i }}
              title={user.username}
            >
              {user.username[0].toUpperCase()}
            </div>
          ))}
          {connectedUsers.length > 3 && (
            <div className="w-5 h-5 rounded-full bg-bg-hover border-2 border-bg-elevated flex items-center justify-center text-[9px] font-medium text-text-secondary">
              +{connectedUsers.length - 3}
            </div>
          )}
        </div>

        <span className="text-xs text-text-secondary">
          {connectedUsers.length} online
        </span>

        <IconChevronDown
          size={12}
          className={cn(
            'text-text-tertiary transition-transform duration-150',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Expanded panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'absolute top-full mt-1.5 right-0 z-50',
              'w-64 bg-bg-elevated border border-border-default rounded-lg',
              'shadow-lg overflow-hidden'
            )}
          >
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-border-subtle">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-primary flex items-center gap-2">
                  <IconUsers size={13} />
                  Collaborators
                </span>

                {/* Voice chat toggle */}
                <button
                  onClick={handleVoiceToggle}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium',
                    'transition-all duration-150',
                    voiceChat.isActive
                      ? 'bg-status-success/15 text-status-success'
                      : 'bg-bg-hover text-text-secondary hover:text-text-primary'
                  )}
                  title={voiceChat.isActive ? 'Leave voice chat' : 'Join voice chat'}
                >
                  {voiceChat.isActive ? (
                    <>
                      <IconPhoneOff size={11} />
                      Leave
                    </>
                  ) : (
                    <>
                      <IconPhone size={11} />
                      Voice
                    </>
                  )}
                </button>
              </div>

              {/* Mute button when in voice chat */}
              {voiceChat.isActive && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-2"
                >
                  <button
                    onClick={handleMuteToggle}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium',
                      'transition-all duration-150',
                      voiceChat.isMuted
                        ? 'bg-status-error/15 text-status-error'
                        : 'bg-bg-hover text-text-secondary hover:text-text-primary'
                    )}
                  >
                    {voiceChat.isMuted ? (
                      <>
                        <IconMicrophoneOff size={13} />
                        Unmute
                      </>
                    ) : (
                      <>
                        <IconMicrophone size={13} />
                        Mute
                      </>
                    )}
                  </button>
                </motion.div>
              )}
            </div>

            {/* User list */}
            <div className="max-h-48 overflow-y-auto">
              {connectedUsers.map(user => (
                <div
                  key={user.username}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-bg-hover transition-colors"
                >
                  {/* Avatar */}
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-bg-base"
                    style={{ backgroundColor: user.color }}
                  >
                    {user.username[0].toUpperCase()}
                  </div>

                  {/* Username + status */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary truncate">
                      {user.username}
                    </div>
                    {user.cursor && (
                      <div className="text-[10px] text-text-tertiary">
                        Line {user.cursor.line}
                      </div>
                    )}
                  </div>

                  {/* Follow button */}
                  <button
                    onClick={() => handleFollowToggle(user.username)}
                    className={cn(
                      'flex items-center justify-center w-7 h-7 rounded-md',
                      'transition-all duration-150',
                      followState.isFollowing && followState.targetUsername === user.username
                        ? 'bg-accent-primary/15 text-accent-primary'
                        : 'text-text-tertiary hover:text-text-primary hover:bg-bg-hover'
                    )}
                    title={
                      followState.isFollowing && followState.targetUsername === user.username
                        ? 'Stop following'
                        : `Follow ${user.username}`
                    }
                  >
                    {followState.isFollowing && followState.targetUsername === user.username ? (
                      <IconEyeOff size={14} />
                    ) : (
                      <IconEye size={14} />
                    )}
                  </button>

                  {/* Voice indicator */}
                  {voiceChat.participants.some(p => p.username === user.username) && (
                    <div className="flex items-center gap-1">
                      {voiceChat.participants.find(p => p.username === user.username)?.isSpeaking ? (
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 0.5 }}
                        >
                          <IconPoint size={10} className="text-status-success" />
                        </motion.div>
                      ) : voiceChat.participants.find(p => p.username === user.username)?.isMuted ? (
                        <IconMicrophoneOff size={12} className="text-text-disabled" />
                      ) : (
                        <IconMicrophone size={12} className="text-text-tertiary" />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Follow indicator */}
            {followState.isFollowing && (
              <div className="px-3 py-2 border-t border-border-subtle bg-accent-primary/5">
                <div className="flex items-center gap-2 text-xs text-accent-primary">
                  <IconEye size={12} />
                  <span>Following {followState.targetUsername}</span>
                  <button
                    onClick={() => {
                      stopFollowing()
                      onUnfollow?.()
                    }}
                    className="ml-auto text-[10px] underline opacity-70 hover:opacity-100"
                  >
                    Stop
                  </button>
                </div>
              </div>
            )}

            {/* Followers indicator */}
            {followState.followers.length > 0 && (
              <div className="px-3 py-2 border-t border-border-subtle bg-accent-tertiary/5">
                <div className="flex items-center gap-2 text-xs text-accent-tertiary">
                  <IconUsers size={12} />
                  <span>
                    {followState.followers.length} following you
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
