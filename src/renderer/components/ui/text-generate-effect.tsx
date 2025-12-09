/**
 * Text Generate Effect Component
 * Animates text by revealing it character by character
 * Inspired by Aceternity UI
 */
import { useEffect, useState } from 'react'
import { motion, stagger, useAnimate } from 'motion/react'
import { cn } from '@lib/utils'

export interface TextGenerateEffectProps {
  words: string
  className?: string
  filter?: boolean
  duration?: number
}

export function TextGenerateEffect({
  words,
  className,
  filter = true,
  duration = 0.5
}: TextGenerateEffectProps) {
  const [scope, animate] = useAnimate()
  const wordsArray = words.split(' ')

  useEffect(() => {
    animate(
      'span',
      {
        opacity: 1,
        filter: filter ? 'blur(0px)' : 'none'
      },
      {
        duration: duration,
        delay: stagger(0.1)
      }
    )
  }, [scope, animate, filter, duration])

  return (
    <motion.div ref={scope} className={cn('font-bold', className)}>
      {wordsArray.map((word, idx) => (
        <motion.span
          key={word + idx}
          className="opacity-0"
          style={{
            filter: filter ? 'blur(10px)' : 'none'
          }}
        >
          {word}{' '}
        </motion.span>
      ))}
    </motion.div>
  )
}

/**
 * Character by character text reveal
 */
export function TextRevealEffect({
  text,
  className,
  delay = 0,
  speed = 0.03
}: {
  text: string
  className?: string
  delay?: number
  speed?: number
}) {
  const characters = text.split('')

  return (
    <span className={cn('inline-flex', className)}>
      {characters.map((char, idx) => (
        <motion.span
          key={idx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.2,
            delay: delay + idx * speed,
            ease: 'easeOut'
          }}
          className={char === ' ' ? 'w-[0.25em]' : ''}
        >
          {char}
        </motion.span>
      ))}
    </span>
  )
}

/**
 * Typing effect with cursor
 */
export function TypewriterEffect({
  words,
  className,
  cursorClassName
}: {
  words: { text: string; className?: string }[]
  className?: string
  cursorClassName?: string
}) {
  const [displayedText, setDisplayedText] = useState('')
  const [wordIndex, setWordIndex] = useState(0)
  const [charIndex, setCharIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const currentWord = words[wordIndex]?.text || ''

    const timeout = setTimeout(() => {
      if (!isDeleting) {
        if (charIndex < currentWord.length) {
          setDisplayedText(currentWord.substring(0, charIndex + 1))
          setCharIndex(charIndex + 1)
        } else {
          setTimeout(() => setIsDeleting(true), 1500)
        }
      } else {
        if (charIndex > 0) {
          setDisplayedText(currentWord.substring(0, charIndex - 1))
          setCharIndex(charIndex - 1)
        } else {
          setIsDeleting(false)
          setWordIndex((wordIndex + 1) % words.length)
        }
      }
    }, isDeleting ? 50 : 100)

    return () => clearTimeout(timeout)
  }, [charIndex, isDeleting, wordIndex, words])

  return (
    <div className={cn('flex items-center', className)}>
      <span className={words[wordIndex]?.className}>{displayedText}</span>
      <motion.span
        className={cn(
          'inline-block w-[2px] h-[1.2em] bg-electric-cyan ml-1',
          cursorClassName
        )}
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
      />
    </div>
  )
}
