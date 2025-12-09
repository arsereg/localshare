/**
 * Moving Border Component
 * Creates an animated gradient border effect
 * Inspired by Aceternity UI
 */
import React from 'react'
import { motion } from 'motion/react'
import { cn } from '@lib/utils'

export interface MovingBorderProps {
  children: React.ReactNode
  duration?: number
  rx?: string
  ry?: string
  className?: string
  containerClassName?: string
  borderClassName?: string
  as?: React.ElementType
}

export function MovingBorder({
  children,
  duration = 2000,
  rx = '16px',
  ry = '16px',
  className,
  containerClassName,
  borderClassName,
  as: Component = 'div',
  ...props
}: MovingBorderProps & React.HTMLAttributes<HTMLElement>) {
  return (
    <Component
      className={cn(
        'relative p-[1px] overflow-hidden rounded-lg bg-transparent',
        containerClassName
      )}
      {...props}
    >
      <div
        className="absolute inset-0 rounded-lg"
        style={{
          borderRadius: `calc(${rx} * 0.96) calc(${ry} * 0.96)`
        }}
      >
        <MovingBorderGradient duration={duration} rx={rx} ry={ry} />
      </div>
      <div
        className={cn(
          'relative rounded-lg bg-cosmic-deep/90 backdrop-blur-xl',
          className
        )}
        style={{
          borderRadius: `calc(${rx} - 1px) calc(${ry} - 1px)`
        }}
      >
        {children}
      </div>
    </Component>
  )
}

function MovingBorderGradient({
  duration = 2000,
  rx = '16px',
  ry = '16px'
}: {
  duration?: number
  rx?: string
  ry?: string
}) {
  const pathRef = React.useRef<SVGRectElement>(null)
  const progressRef = React.useRef<number>(0)

  React.useEffect(() => {
    let animationId: number

    const animate = () => {
      progressRef.current = (progressRef.current + 1) % 360
      if (pathRef.current) {
        pathRef.current.style.transform = `rotate(${progressRef.current}deg)`
      }
      animationId = requestAnimationFrame(animate)
    }

    animate()
    return () => cancelAnimationFrame(animationId)
  }, [])

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{
        filter: 'blur(2px)'
      }}
    >
      <defs>
        <linearGradient id="moving-border-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00F5FF" />
          <stop offset="50%" stopColor="#FF006E" />
          <stop offset="100%" stopColor="#39FF14" />
        </linearGradient>
      </defs>
      <rect
        ref={pathRef}
        width="100%"
        height="100%"
        rx={rx}
        ry={ry}
        fill="none"
        stroke="url(#moving-border-gradient)"
        strokeWidth="2"
        style={{
          transformOrigin: 'center center'
        }}
      />
    </svg>
  )
}

/**
 * Button variant with moving border
 */
export function MovingBorderButton({
  children,
  className,
  containerClassName,
  borderClassName,
  duration = 2000,
  ...props
}: MovingBorderProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'relative p-[1px] overflow-hidden rounded-lg group',
        containerClassName
      )}
      {...props}
    >
      <motion.div
        className={cn(
          'absolute inset-0 rounded-lg opacity-75 group-hover:opacity-100 transition-opacity',
          borderClassName
        )}
        style={{
          background:
            'linear-gradient(90deg, #00F5FF, #FF006E, #39FF14, #00F5FF)',
          backgroundSize: '300% 100%'
        }}
        animate={{
          backgroundPosition: ['0% 50%', '100% 50%', '0% 50%']
        }}
        transition={{
          duration: duration / 1000,
          repeat: Infinity,
          ease: 'linear'
        }}
      />
      <div
        className={cn(
          'relative rounded-lg bg-cosmic-deep/95 px-4 py-2 text-sm font-medium transition-all',
          'hover:bg-cosmic-surface/95',
          className
        )}
      >
        {children}
      </div>
    </button>
  )
}
