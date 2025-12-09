/**
 * 3D Card Effect Component
 * Creates a perspective tilt effect on hover
 * Inspired by Aceternity UI
 */
import { createContext, useContext, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { cn } from '@lib/utils'

const MouseEnterContext = createContext<{
  isMouseEntered: boolean
  setIsMouseEntered: (value: boolean) => void
} | null>(null)

export function CardContainer({
  children,
  className,
  containerClassName
}: {
  children: React.ReactNode
  className?: string
  containerClassName?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isMouseEntered, setIsMouseEntered] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return

    const { left, top, width, height } = containerRef.current.getBoundingClientRect()
    const x = (e.clientX - left - width / 2) / 25
    const y = (e.clientY - top - height / 2) / 25

    containerRef.current.style.transform = `rotateY(${x}deg) rotateX(${-y}deg)`
  }

  const handleMouseEnter = () => {
    setIsMouseEntered(true)
  }

  const handleMouseLeave = () => {
    setIsMouseEntered(false)
    if (containerRef.current) {
      containerRef.current.style.transform = `rotateY(0deg) rotateX(0deg)`
    }
  }

  return (
    <MouseEnterContext.Provider value={{ isMouseEntered, setIsMouseEntered }}>
      <div
        className={cn('flex items-center justify-center', containerClassName)}
        style={{ perspective: '1000px' }}
      >
        <div
          ref={containerRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
          className={cn(
            'flex items-center justify-center relative transition-transform duration-200 ease-linear',
            className
          )}
          style={{
            transformStyle: 'preserve-3d'
          }}
        >
          {children}
        </div>
      </div>
    </MouseEnterContext.Provider>
  )
}

export function CardBody({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        '[transform-style:preserve-3d] [&>*]:[transform-style:preserve-3d]',
        className
      )}
    >
      {children}
    </div>
  )
}

export function CardItem({
  as: Tag = 'div',
  children,
  className,
  translateX = 0,
  translateY = 0,
  translateZ = 0,
  rotateX = 0,
  rotateY = 0,
  rotateZ = 0,
  ...rest
}: {
  as?: React.ElementType
  children: React.ReactNode
  className?: string
  translateX?: number | string
  translateY?: number | string
  translateZ?: number | string
  rotateX?: number | string
  rotateY?: number | string
  rotateZ?: number | string
  [key: string]: unknown
}) {
  const context = useContext(MouseEnterContext)

  if (!context) {
    throw new Error('CardItem must be used within a CardContainer')
  }

  const { isMouseEntered } = context

  return (
    <Tag
      className={cn('w-fit transition-transform duration-200 ease-linear', className)}
      style={{
        transform: isMouseEntered
          ? `translateX(${translateX}px) translateY(${translateY}px) translateZ(${translateZ}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`
          : 'translateX(0px) translateY(0px) translateZ(0px) rotateX(0deg) rotateY(0deg) rotateZ(0deg)'
      }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/**
 * Simple 3D tilt card for tabs
 */
export function TiltCard({
  children,
  className,
  tiltAmount = 10
}: {
  children: React.ReactNode
  className?: string
  tiltAmount?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const xSpring = useSpring(x, { stiffness: 300, damping: 30 })
  const ySpring = useSpring(y, { stiffness: 300, damping: 30 })

  const rotateX = useTransform(ySpring, [-0.5, 0.5], [tiltAmount, -tiltAmount])
  const rotateY = useTransform(xSpring, [-0.5, 0.5], [-tiltAmount, tiltAmount])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return

    const rect = ref.current.getBoundingClientRect()
    const width = rect.width
    const height = rect.height

    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const xPct = mouseX / width - 0.5
    const yPct = mouseY / height - 0.5

    x.set(xPct)
    y.set(yPct)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d'
      }}
      className={cn('relative', className)}
    >
      {children}
    </motion.div>
  )
}
