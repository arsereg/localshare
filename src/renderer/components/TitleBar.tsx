/**
 * TitleBar Component
 * Clean, minimal title bar with refined status indicators
 */
import { motion } from 'motion/react'
import { useAppStore } from '@stores/appStore'
import { cn } from '@lib/utils'
import {
  IconUsers,
  IconCircleFilled
} from '@tabler/icons-react'

export function TitleBar() {
  const { serverStatus, connectedUsers } = useAppStore()

  const isOnline = serverStatus.isRunning
  const hasUsers = connectedUsers.length > 0

  return (
    <header className="relative z-50">
      {/* Drag region for window movement */}
      <div
        className="absolute inset-0 -webkit-app-region-drag"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <div className="relative flex items-center justify-between h-12 px-4">
        {/* Left section - Traffic lights spacer + App title */}
        <div className="flex items-center gap-4">
          {/* macOS traffic light spacer */}
          <div className="w-16 h-4 -webkit-app-region-drag" />

          {/* App Title - clean typography */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex items-center"
          >
            <span className="text-sm font-semibold tracking-tight">
              <span className="text-accent-primary">Local</span>
              <span className="text-text-primary">Share</span>
            </span>
          </motion.div>
        </div>

        {/* Right section - Status indicators */}
        <div className="flex items-center gap-5 -webkit-app-region-no-drag">
          {/* Server Status */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-2"
          >
            <IconCircleFilled
              size={8}
              className={cn(
                'transition-colors',
                isOnline ? 'text-status-success' : 'text-text-disabled'
              )}
            />
            <span className="text-xs text-text-secondary font-mono">
              {isOnline ? `${serverStatus.ip}:${serverStatus.port}` : 'Offline'}
            </span>
          </motion.div>

          {/* Connected Users */}
          {hasUsers && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2"
            >
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent-primary-dim">
                <IconUsers size={12} className="text-accent-primary" />
                <span className="text-xs text-accent-primary font-medium">
                  {connectedUsers.length}
                </span>
              </div>

              {/* User avatars - stacked */}
              <div className="flex -space-x-1.5">
                {connectedUsers.slice(0, 3).map((user, idx) => (
                  <motion.div
                    key={user.username}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="w-5 h-5 rounded-full border border-bg-base flex items-center justify-center text-[9px] font-medium text-white"
                    style={{ backgroundColor: user.color }}
                    title={user.username}
                  >
                    {user.username.charAt(0).toUpperCase()}
                  </motion.div>
                ))}
                {connectedUsers.length > 3 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15 }}
                    className="w-5 h-5 rounded-full border border-bg-base bg-bg-elevated flex items-center justify-center text-[9px] font-medium text-text-secondary"
                  >
                    +{connectedUsers.length - 3}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Bottom border */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-border-subtle" />
    </header>
  )
}
