/**
 * Glowing Effect Component
 * Creates a border glow effect that follows cursor
 * Inspired by Aceternity UI / Cursor
 */
import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { cn } from '@lib/utils'

export interface GlowingEffectProps {
  children: React.ReactNode
  className?: string
  containerClassName?: string
  blur?: number
  spread?: number
  glow?: boolean
  disabled?: boolean
  proximity?: number
  inactiveZone?: number
  variant?: 'default' | 'white' | 'cyan' | 'magenta' | 'green'
  borderWidth?: number
  movementDuration?: number
}

export function GlowingEffect({
  children,
  className,
  containerClassName,
  blur = 10,
  spread = 20,
  glow = true,
  disabled = false,
  proximity = 50,
  inactiveZone = 0.3,
  variant = 'cyan',
  borderWidth = 1,
  movementDuration = 2
}: GlowingEffectProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [opacity, setOpacity] = useState(0)

  const colors = {
    default: 'rgba(255, 255, 255, 0.5)',
    white: 'rgba(255, 255, 255, 0.8)',
    cyan: 'rgba(0, 245, 255, 0.8)',
    magenta: 'rgba(255, 0, 110, 0.8)',
    green: 'rgba(57, 255, 20, 0.8)'
  }

  useEffect(() => {
    if (disabled) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      const distance = Math.sqrt(
        Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2)
      )

      const maxDistance = Math.max(rect.width, rect.height) * proximity / 100

      if (distance < maxDistance) {
        const relativeX = e.clientX - rect.left
        const relativeY = e.clientY - rect.top

        setPosition({ x: relativeX, y: relativeY })

        // Calculate opacity based on proximity
        const normalizedDistance = distance / maxDistance
        if (normalizedDistance < inactiveZone) {
          setOpacity(0)
        } else {
          setOpacity(1 - normalizedDistance)
        }
      } else {
        setOpacity(0)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [disabled, proximity, inactiveZone])

  return (
    <div ref={containerRef} className={cn('relative', containerClassName)}>
      {/* Glow effect layer */}
      {glow && (
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-inherit overflow-hidden"
          style={{
            opacity
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(${spread * 2}px circle at ${position.x}px ${position.y}px, ${colors[variant]}, transparent)`,
              filter: `blur(${blur}px)`
            }}
          />
        </motion.div>
      )}

      {/* Border glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none rounded-inherit"
        style={{
          opacity,
          boxShadow: `0 0 ${spread}px ${colors[variant]}`
        }}
      />

      {/* Content */}
      <div className={className}>{children}</div>
    </div>
  )
}

/**
 * Simple pulsing glow effect
 */
export function PulsingGlow({
  children,
  className,
  color = 'rgba(0, 245, 255, 0.5)',
  intensity = 1,
  duration = 2
}: {
  children: React.ReactNode
  className?: string
  color?: string
  intensity?: number
  duration?: number
}) {
  return (
    <motion.div
      className={cn('relative', className)}
      animate={{
        boxShadow: [
          `0 0 ${10 * intensity}px ${color}`,
          `0 0 ${20 * intensity}px ${color}`,
          `0 0 ${10 * intensity}px ${color}`
        ]
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: 'easeInOut'
      }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Status indicator with glow
 */
export function GlowingStatusDot({
  status,
  className,
  size = 'sm'
}: {
  status: 'online' | 'offline' | 'connecting' | 'syncing'
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const colors = {
    online: { bg: 'bg-electric-green', glow: 'rgba(57, 255, 20, 0.6)' },
    offline: { bg: 'bg-text-muted', glow: 'transparent' },
    connecting: { bg: 'bg-electric-cyan', glow: 'rgba(0, 245, 255, 0.6)' },
    syncing: { bg: 'bg-electric-magenta', glow: 'rgba(255, 0, 110, 0.6)' }
  }

  const sizes = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  }

  const { bg, glow } = colors[status]

  return (
    <motion.span
      className={cn('rounded-full', bg, sizes[size], className)}
      animate={
        status !== 'offline'
          ? {
              boxShadow: [`0 0 4px ${glow}`, `0 0 10px ${glow}`, `0 0 4px ${glow}`]
            }
          : {}
      }
      transition={{
        duration: status === 'syncing' ? 0.5 : 2,
        repeat: Infinity,
        ease: 'easeInOut'
      }}
    />
  )
}
