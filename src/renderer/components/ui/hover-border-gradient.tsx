/**
 * Hover Border Gradient Component
 * Creates an animated gradient border on hover
 * Inspired by Aceternity UI
 */
import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { cn } from '@lib/utils'

export interface HoverBorderGradientProps {
  children: React.ReactNode
  containerClassName?: string
  className?: string
  as?: React.ElementType
  duration?: number
  clockwise?: boolean
}

export function HoverBorderGradient({
  children,
  containerClassName,
  className,
  as: Tag = 'button',
  duration = 1,
  clockwise = true,
  ...props
}: HoverBorderGradientProps & React.HTMLAttributes<HTMLElement>) {
  const [hovered, setHovered] = useState(false)
  const [direction, setDirection] = useState<'TOP' | 'LEFT' | 'BOTTOM' | 'RIGHT'>('TOP')

  const rotateDirection = (currentDirection: typeof direction) => {
    const directions: typeof direction[] = ['TOP', 'RIGHT', 'BOTTOM', 'LEFT']
    const currentIndex = directions.indexOf(currentDirection)
    const nextIndex = clockwise
      ? (currentIndex + 1) % directions.length
      : (currentIndex - 1 + directions.length) % directions.length
    return directions[nextIndex]
  }

  const movingMap: Record<typeof direction, string> = {
    TOP: 'radial-gradient(20.7% 50% at 50% 0%, #00F5FF 0%, rgba(0, 245, 255, 0) 100%)',
    LEFT: 'radial-gradient(16.6% 43.1% at 0% 50%, #00F5FF 0%, rgba(0, 245, 255, 0) 100%)',
    BOTTOM: 'radial-gradient(20.7% 50% at 50% 100%, #00F5FF 0%, rgba(0, 245, 255, 0) 100%)',
    RIGHT: 'radial-gradient(16.6% 43.1% at 100% 50%, #00F5FF 0%, rgba(0, 245, 255, 0) 100%)'
  }

  const highlight = 'radial-gradient(75% 181.16% at 50% 50%, #00F5FF 0%, rgba(0, 245, 255, 0) 100%)'

  useEffect(() => {
    if (!hovered) {
      const interval = setInterval(() => {
        setDirection((prevState) => rotateDirection(prevState))
      }, duration * 1000)
      return () => clearInterval(interval)
    }
  }, [hovered, duration, clockwise])

  return (
    <Tag
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative flex rounded-full border border-white/10 bg-cosmic-surface/80 hover:bg-cosmic-elevated/80 transition-colors content-center items-center flex-col flex-nowrap gap-2 h-min justify-center overflow-visible p-px decoration-clone w-fit',
        containerClassName
      )}
      {...props}
    >
      <div
        className={cn(
          'w-auto text-text-primary z-10 bg-cosmic-deep/90 px-4 py-2 rounded-[inherit]',
          className
        )}
      >
        {children}
      </div>
      <motion.div
        className={cn(
          'flex-none inset-0 overflow-hidden absolute z-0 rounded-[inherit]'
        )}
        style={{
          filter: 'blur(2px)',
          position: 'absolute',
          width: '100%',
          height: '100%'
        }}
        initial={{ background: movingMap[direction] }}
        animate={{
          background: hovered
            ? [movingMap[direction], highlight]
            : movingMap[direction]
        }}
        transition={{ ease: 'linear', duration: duration }}
      />
      <div className="bg-cosmic-deep absolute z-1 flex-none inset-[2px] rounded-[inherit]" />
    </Tag>
  )
}

/**
 * Shimmer button effect
 */
export function ShimmerButton({
  children,
  className,
  shimmerColor = '#00F5FF',
  shimmerSize = '0.05em',
  shimmerDuration = '3s',
  ...props
}: {
  children: React.ReactNode
  className?: string
  shimmerColor?: string
  shimmerSize?: string
  shimmerDuration?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap border border-white/10 px-6 py-3',
        'rounded-lg bg-cosmic-surface/80 hover:bg-cosmic-elevated/80',
        'transform-gpu transition-transform duration-300 ease-in-out active:translate-y-[1px]',
        className
      )}
      {...props}
    >
      {/* Shimmer effect */}
      <div
        className={cn(
          'absolute inset-0 overflow-hidden rounded-[inherit]',
          '[--shimmer-speed:' + shimmerDuration + ']'
        )}
      >
        <div
          className="absolute inset-0 -translate-x-full animate-shimmer"
          style={{
            background: `linear-gradient(90deg, transparent, ${shimmerColor}20, transparent)`,
            animationDuration: shimmerDuration
          }}
        />
      </div>

      {/* Content */}
      <span className="relative z-10 flex items-center gap-2 text-sm font-medium text-text-primary">
        {children}
      </span>

      {/* Bottom glow on hover */}
      <div
        className={cn(
          'absolute bottom-0 left-1/2 h-[2px] w-0 -translate-x-1/2 rounded-full transition-all duration-300 group-hover:w-4/5'
        )}
        style={{ backgroundColor: shimmerColor, boxShadow: `0 0 10px ${shimmerColor}` }}
      />
    </button>
  )
}
