/**
 * Animated Modal Component
 * Creates a cinematic modal with smooth transitions
 * Inspired by Aceternity UI
 */
import { createContext, useContext, useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@lib/utils'

interface ModalContextType {
  open: boolean
  setOpen: (open: boolean) => void
}

const ModalContext = createContext<ModalContextType | null>(null)

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <ModalContext.Provider value={{ open, setOpen }}>
      {children}
    </ModalContext.Provider>
  )
}

export function useModal() {
  const context = useContext(ModalContext)
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider')
  }
  return context
}

export function Modal({
  children,
  open,
  onOpenChange
}: {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined

  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen

  return (
    <ModalContext.Provider value={{ open: isOpen, setOpen: setIsOpen }}>
      {children}
    </ModalContext.Provider>
  )
}

export function ModalTrigger({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  const { setOpen } = useModal()

  return (
    <button className={className} onClick={() => setOpen(true)}>
      {children}
    </button>
  )
}

export function ModalBody({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  const { open, setOpen } = useModal()
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'auto'
    }

    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [open])

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }

    if (open) {
      window.addEventListener('keydown', handleEscape)
    }

    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, setOpen])

  return (
    <AnimatePresence>
      {open && (
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
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal content */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{
              type: 'spring',
              damping: 25,
              stiffness: 300
            }}
            className={cn(
              'relative z-50 w-full max-w-lg mx-4',
              'bg-cosmic-surface/95 backdrop-blur-xl rounded-2xl',
              'border border-white/10 shadow-2xl',
              'overflow-hidden',
              className
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ModalContent({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('p-6', className)}>{children}</div>
}

export function ModalHeader({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  const { setOpen } = useModal()

  return (
    <div
      className={cn(
        'flex items-center justify-between p-4 border-b border-white/5',
        className
      )}
    >
      <div className="flex-1">{children}</div>
      <button
        onClick={() => setOpen(false)}
        className="p-1 rounded-lg hover:bg-white/5 transition-colors text-text-secondary hover:text-text-primary"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 5L5 15M5 5l10 10" />
        </svg>
      </button>
    </div>
  )
}

export function ModalFooter({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-3 p-4 border-t border-white/5',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Glowing stars background for modal
 */
export function ModalGlowingStars({ className }: { className?: string }) {
  const stars = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,
    delay: Math.random() * 2
  }))

  return (
    <div
      className={cn(
        'absolute inset-0 overflow-hidden pointer-events-none opacity-50',
        className
      )}
    >
      {stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full bg-electric-cyan"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size
          }}
          animate={{
            opacity: [0.2, 0.8, 0.2],
            scale: [1, 1.3, 1]
          }}
          transition={{
            duration: 2,
            delay: star.delay,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      ))}
    </div>
  )
}
