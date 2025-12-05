/**
 * Language Detection Module
 * Detects programming language from file extension or content heuristics
 */

import { SUPPORTED_LANGUAGES, LanguageInfo } from '../../shared/types'

// Shebang patterns for heuristic detection
const SHEBANG_PATTERNS: Record<string, string> = {
  python: 'python',
  node: 'javascript',
  bash: 'plaintext',
  sh: 'plaintext',
  ruby: 'plaintext',
  perl: 'plaintext',
  php: 'plaintext'
}

// Keyword patterns for heuristic detection (first 50 lines)
const KEYWORD_PATTERNS: { language: string; patterns: RegExp[] }[] = [
  {
    language: 'javascript',
    patterns: [
      /\bconst\s+\w+\s*=/,
      /\blet\s+\w+\s*=/,
      /\bfunction\s+\w+\s*\(/,
      /\bexport\s+(default\s+)?/,
      /\bimport\s+.*\s+from\s+['"]/,
      /=>\s*{/,
      /\bconsole\.(log|error|warn)\(/
    ]
  },
  {
    language: 'typescript',
    patterns: [
      /:\s*(string|number|boolean|any|void|never)\b/,
      /\binterface\s+\w+/,
      /\btype\s+\w+\s*=/,
      /<\w+(\s*,\s*\w+)*>/,
      /\bas\s+(const|string|number)/
    ]
  },
  {
    language: 'python',
    patterns: [
      /^def\s+\w+\s*\(/m,
      /^class\s+\w+(\s*\(.*\))?\s*:/m,
      /^import\s+\w+/m,
      /^from\s+\w+\s+import/m,
      /\bself\./,
      /^\s*if\s+__name__\s*==\s*['"]__main__['"]/m
    ]
  },
  {
    language: 'java',
    patterns: [
      /^public\s+(class|interface|enum)\s+\w+/m,
      /^private\s+(static\s+)?(final\s+)?\w+/m,
      /\bSystem\.out\.print/,
      /\bpublic\s+static\s+void\s+main\s*\(/
    ]
  },
  {
    language: 'cpp',
    patterns: [
      /^#include\s*<\w+>/m,
      /^#include\s*"[\w.]+"/m,
      /\bstd::/,
      /\bcout\s*<</,
      /\bnamespace\s+\w+/,
      /\btemplate\s*</
    ]
  },
  {
    language: 'html',
    patterns: [
      /^<!DOCTYPE\s+html>/i,
      /<html[\s>]/,
      /<head[\s>]/,
      /<body[\s>]/,
      /<div[\s>]/
    ]
  },
  {
    language: 'css',
    patterns: [
      /^[.#]?\w+\s*{/m,
      /:\s*(flex|grid|block|inline|none)\s*;/,
      /@media\s*\(/,
      /@import\s+['"]/
    ]
  },
  {
    language: 'json',
    patterns: [
      /^\s*{[\s\n]*"/m,
      /^\s*\[[\s\n]*{/m
    ]
  },
  {
    language: 'markdown',
    patterns: [
      /^#{1,6}\s+.+$/m,
      /^\*\*?.+\*\*?$/m,
      /^\[.+\]\(.+\)$/m,
      /^```\w*$/m
    ]
  }
]

/**
 * Detect language from file extension
 */
export function detectLanguageFromExtension(filename: string): LanguageInfo | null {
  const ext = '.' + filename.split('.').pop()?.toLowerCase()
  if (!ext || ext === '.') return null

  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang.extensions.includes(ext)) {
      return lang
    }
  }

  return null
}

/**
 * Detect language from content using heuristics
 * Analyzes first 50 lines for patterns
 */
export function detectLanguageFromContent(content: string): LanguageInfo | null {
  const lines = content.split('\n').slice(0, 50)
  const sample = lines.join('\n')

  // Check for shebang
  const firstLine = lines[0]?.trim() || ''
  if (firstLine.startsWith('#!')) {
    for (const [key, langId] of Object.entries(SHEBANG_PATTERNS)) {
      if (firstLine.includes(key)) {
        return SUPPORTED_LANGUAGES.find(l => l.id === langId) || null
      }
    }
  }

  // Check keyword patterns
  const scores: Record<string, number> = {}

  for (const { language, patterns } of KEYWORD_PATTERNS) {
    scores[language] = 0
    for (const pattern of patterns) {
      if (pattern.test(sample)) {
        scores[language]++
      }
    }
  }

  // Find language with highest score (minimum 2 matches)
  let bestMatch: string | null = null
  let highestScore = 1 // Require at least 2 matches

  for (const [lang, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestScore = score
      bestMatch = lang
    }
  }

  if (bestMatch) {
    return SUPPORTED_LANGUAGES.find(l => l.id === bestMatch) || null
  }

  return null
}

/**
 * Detect language - tries extension first, then content heuristics
 */
export function detectLanguage(filename: string, content: string): LanguageInfo {
  // Try extension first
  const fromExtension = detectLanguageFromExtension(filename)
  if (fromExtension) {
    return fromExtension
  }

  // Fall back to content heuristics
  const fromContent = detectLanguageFromContent(content)
  if (fromContent) {
    return fromContent
  }

  // Default to plain text
  return SUPPORTED_LANGUAGES.find(l => l.id === 'plaintext')!
}

/**
 * Get CodeMirror language extension for a language ID
 */
export function getLanguageExtension(languageId: string): () => Promise<any> {
  const loaders: Record<string, () => Promise<any>> = {
    javascript: async () => {
      const { javascript } = await import('@codemirror/lang-javascript')
      return javascript()
    },
    typescript: async () => {
      const { javascript } = await import('@codemirror/lang-javascript')
      return javascript({ typescript: true })
    },
    jsx: async () => {
      const { javascript } = await import('@codemirror/lang-javascript')
      return javascript({ jsx: true })
    },
    tsx: async () => {
      const { javascript } = await import('@codemirror/lang-javascript')
      return javascript({ jsx: true, typescript: true })
    },
    python: async () => {
      const { python } = await import('@codemirror/lang-python')
      return python()
    },
    java: async () => {
      const { java } = await import('@codemirror/lang-java')
      return java()
    },
    cpp: async () => {
      const { cpp } = await import('@codemirror/lang-cpp')
      return cpp()
    },
    c: async () => {
      const { cpp } = await import('@codemirror/lang-cpp')
      return cpp()
    },
    html: async () => {
      const { html } = await import('@codemirror/lang-html')
      return html()
    },
    css: async () => {
      const { css } = await import('@codemirror/lang-css')
      return css()
    },
    json: async () => {
      const { json } = await import('@codemirror/lang-json')
      return json()
    },
    markdown: async () => {
      const { markdown } = await import('@codemirror/lang-markdown')
      return markdown()
    }
  }

  return loaders[languageId] || (async () => [])
}
