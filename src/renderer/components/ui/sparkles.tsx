/**
 * Sparkles Component
 * Creates floating particle effect for atmospheric depth
 * Inspired by Aceternity UI
 */
import { useEffect, useId, useState } from 'react'
import { motion, useAnimation } from 'motion/react'
import { cn } from '@lib/utils'

interface SparkleType {
  id: string
  x: string
  y: string
  size: number
  delay: number
  duration: number
  opacity: number
}

export interface SparklesProps {
  id?: string
  className?: string
  background?: string
  minSize?: number
  maxSize?: number
  particleDensity?: number
  particleColor?: string
  speed?: number
}

export function Sparkles({
  id,
  className,
  background = 'transparent',
  minSize = 0.4,
  maxSize = 1.5,
  particleDensity = 100,
  particleColor = '#00F5FF',
  speed = 1
}: SparklesProps) {
  const [sparkles, setSparkles] = useState<SparkleType[]>([])
  const generatedId = useId()
  const sparkleId = id || generatedId

  useEffect(() => {
    const newSparkles: SparkleType[] = []
    for (let i = 0; i < particleDensity; i++) {
      newSparkles.push({
        id: `${sparkleId}-${i}`,
        x: `${Math.random() * 100}%`,
        y: `${Math.random() * 100}%`,
        size: Math.random() * (maxSize - minSize) + minSize,
        delay: Math.random() * 2,
        duration: (Math.random() * 2 + 2) / speed,
        opacity: Math.random() * 0.5 + 0.3
      })
    }
    setSparkles(newSparkles)
  }, [sparkleId, particleDensity, minSize, maxSize, speed])

  return (
    <div
      className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)}
      style={{ background }}
    >
      {sparkles.map((sparkle) => (
        <motion.span
          key={sparkle.id}
          className="absolute rounded-full"
          style={{
            left: sparkle.x,
            top: sparkle.y,
            width: sparkle.size,
            height: sparkle.size,
            backgroundColor: particleColor,
            boxShadow: `0 0 ${sparkle.size * 2}px ${particleColor}`
          }}
          animate={{
            opacity: [sparkle.opacity, sparkle.opacity * 0.3, sparkle.opacity],
            scale: [1, 1.2, 1],
            y: [0, -10, 0]
          }}
          transition={{
            duration: sparkle.duration,
            delay: sparkle.delay,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      ))}
    </div>
  )
}

/**
 * SparklesCore - Alternative sparkles with canvas rendering for better performance
 */
export function SparklesCore({
  id,
  className,
  background = 'transparent',
  minSize = 0.6,
  maxSize = 1.4,
  particleDensity = 100,
  particleColor = '#00F5FF',
  speed = 1
}: SparklesProps) {
  const canvasRef = useId()

  useEffect(() => {
    const canvas = document.getElementById(canvasRef) as HTMLCanvasElement
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const particles: Array<{
      x: number
      y: number
      size: number
      speedX: number
      speedY: number
      opacity: number
      opacityDirection: number
    }> = []

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }

    resize()
    window.addEventListener('resize', resize)

    // Initialize particles
    for (let i = 0; i < particleDensity; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * (maxSize - minSize) + minSize,
        speedX: (Math.random() - 0.5) * 0.3 * speed,
        speedY: (Math.random() - 0.5) * 0.3 * speed,
        opacity: Math.random() * 0.5 + 0.3,
        opacityDirection: Math.random() > 0.5 ? 1 : -1
      })
    }

    let animationId: number

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach((particle) => {
        // Update position
        particle.x += particle.speedX
        particle.y += particle.speedY

        // Wrap around edges
        if (particle.x < 0) particle.x = canvas.width
        if (particle.x > canvas.width) particle.x = 0
        if (particle.y < 0) particle.y = canvas.height
        if (particle.y > canvas.height) particle.y = 0

        // Update opacity (twinkle effect)
        particle.opacity += particle.opacityDirection * 0.005
        if (particle.opacity >= 0.8 || particle.opacity <= 0.2) {
          particle.opacityDirection *= -1
        }

        // Draw particle
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fillStyle = particleColor
        ctx.globalAlpha = particle.opacity
        ctx.fill()

        // Add glow
        ctx.shadowBlur = particle.size * 3
        ctx.shadowColor = particleColor
      })

      ctx.globalAlpha = 1
      ctx.shadowBlur = 0

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationId)
    }
  }, [canvasRef, particleDensity, minSize, maxSize, particleColor, speed])

  return (
    <canvas
      id={canvasRef}
      className={cn('absolute inset-0 pointer-events-none', className)}
      style={{ background }}
    />
  )
}
