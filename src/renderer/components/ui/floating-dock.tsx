/**
 * Floating Dock Component
 * Creates a macOS-style magnifying dock effect
 * Inspired by Aceternity UI
 */
import { useRef } from 'react'
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  AnimatePresence
} from 'motion/react'
import { cn } from '@lib/utils'

interface DockItem {
  id: string
  title: string
  icon: React.ReactNode
  onClick?: () => void
  isActive?: boolean
  isDirty?: boolean
  onClose?: () => void
}

export interface FloatingDockProps {
  items: DockItem[]
  className?: string
  magnification?: number
  distance?: number
}

export function FloatingDock({
  items,
  className,
  magnification = 1.4,
  distance = 100
}: FloatingDockProps) {
  const mouseX = useMotionValue(Infinity)

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        'mx-auto flex h-14 items-end gap-2 rounded-2xl bg-cosmic-surface/50 backdrop-blur-xl px-3 pb-2 border border-white/5',
        className
      )}
    >
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <DockIcon
            key={item.id}
            item={item}
            mouseX={mouseX}
            magnification={magnification}
            distance={distance}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  )
}

function DockIcon({
  item,
  mouseX,
  magnification,
  distance
}: {
  item: DockItem
  mouseX: ReturnType<typeof useMotionValue>
  magnification: number
  distance: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  const distanceFromMouse = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 }
    return val - bounds.x - bounds.width / 2
  })

  const widthTransform = useTransform(
    distanceFromMouse,
    [-distance, 0, distance],
    [40, 40 * magnification, 40]
  )

  const heightTransform = useTransform(
    distanceFromMouse,
    [-distance, 0, distance],
    [40, 40 * magnification, 40]
  )

  const width = useSpring(widthTransform, {
    stiffness: 300,
    damping: 30
  })

  const height = useSpring(heightTransform, {
    stiffness: 300,
    damping: 30
  })

  return (
    <motion.div
      ref={ref}
      style={{ width, height }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      onClick={item.onClick}
      className={cn(
        'relative flex aspect-square cursor-pointer items-center justify-center rounded-xl',
        'transition-colors duration-200',
        item.isActive
          ? 'bg-electric-cyan/20 shadow-[0_0_20px_rgba(0,245,255,0.3)]'
          : 'bg-cosmic-elevated/80 hover:bg-cosmic-elevated',
        'border',
        item.isActive ? 'border-electric-cyan/50' : 'border-white/5'
      )}
    >
      {/* Icon */}
      <div className="text-text-primary flex items-center justify-center">
        {item.icon}
      </div>

      {/* Dirty indicator */}
      {item.isDirty && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-electric-magenta rounded-full"
        />
      )}

      {/* Active indicator dot */}
      {item.isActive && (
        <motion.div
          layoutId="active-dock-indicator"
          className="absolute -bottom-1 w-1 h-1 bg-electric-cyan rounded-full"
        />
      )}

      {/* Close button on hover */}
      {item.onClose && (
        <motion.button
          initial={{ opacity: 0, scale: 0.5 }}
          whileHover={{ opacity: 1, scale: 1 }}
          onClick={(e) => {
            e.stopPropagation()
            item.onClose?.()
          }}
          className="absolute -top-1 -right-1 w-4 h-4 bg-status-error rounded-full flex items-center justify-center text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity"
        >
          ×
        </motion.button>
      )}

      {/* Tooltip */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileHover={{ opacity: 1, y: 0 }}
        className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-cosmic-elevated rounded-md text-xs text-text-primary whitespace-nowrap border border-white/10 pointer-events-none"
      >
        {item.title}
      </motion.div>
    </motion.div>
  )
}

/**
 * Simple magnifying tab bar (without dock styling)
 */
export function MagnifyingTabBar({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  const mouseX = useMotionValue(Infinity)

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn('flex items-end gap-1', className)}
    >
      {children}
    </motion.div>
  )
}
