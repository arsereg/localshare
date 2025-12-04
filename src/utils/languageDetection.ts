/**
 * Language Detection Utility
 * Detects programming language from file extension or content heuristics
 */

import type { LanguageMapping } from '../types';

/**
 * File extension to language mappings
 */
const EXTENSION_MAP: Record<string, LanguageMapping> = {
  // JavaScript/TypeScript
  '.js': { extension: '.js', language: 'javascript', displayName: 'JavaScript' },
  '.jsx': { extension: '.jsx', language: 'javascript', displayName: 'JavaScript (JSX)' },
  '.ts': { extension: '.ts', language: 'typescript', displayName: 'TypeScript' },
  '.tsx': { extension: '.tsx', language: 'typescript', displayName: 'TypeScript (TSX)' },
  '.mjs': { extension: '.mjs', language: 'javascript', displayName: 'JavaScript (ESM)' },
  '.cjs': { extension: '.cjs', language: 'javascript', displayName: 'JavaScript (CJS)' },

  // Python
  '.py': { extension: '.py', language: 'python', displayName: 'Python' },
  '.pyw': { extension: '.pyw', language: 'python', displayName: 'Python' },
  '.pyi': { extension: '.pyi', language: 'python', displayName: 'Python (Stub)' },

  // Java
  '.java': { extension: '.java', language: 'java', displayName: 'Java' },

  // C/C++
  '.c': { extension: '.c', language: 'cpp', displayName: 'C' },
  '.h': { extension: '.h', language: 'cpp', displayName: 'C Header' },
  '.cpp': { extension: '.cpp', language: 'cpp', displayName: 'C++' },
  '.hpp': { extension: '.hpp', language: 'cpp', displayName: 'C++ Header' },
  '.cc': { extension: '.cc', language: 'cpp', displayName: 'C++' },
  '.cxx': { extension: '.cxx', language: 'cpp', displayName: 'C++' },

  // Web
  '.html': { extension: '.html', language: 'html', displayName: 'HTML' },
  '.htm': { extension: '.htm', language: 'html', displayName: 'HTML' },
  '.css': { extension: '.css', language: 'css', displayName: 'CSS' },
  '.scss': { extension: '.scss', language: 'css', displayName: 'SCSS' },
  '.less': { extension: '.less', language: 'css', displayName: 'LESS' },

  // Data formats
  '.json': { extension: '.json', language: 'json', displayName: 'JSON' },
  '.jsonc': { extension: '.jsonc', language: 'json', displayName: 'JSON with Comments' },

  // Markdown
  '.md': { extension: '.md', language: 'markdown', displayName: 'Markdown' },
  '.mdx': { extension: '.mdx', language: 'markdown', displayName: 'MDX' },
  '.markdown': { extension: '.markdown', language: 'markdown', displayName: 'Markdown' },

  // Other common languages
  '.xml': { extension: '.xml', language: 'html', displayName: 'XML' },
  '.yaml': { extension: '.yaml', language: 'markdown', displayName: 'YAML' },
  '.yml': { extension: '.yml', language: 'markdown', displayName: 'YAML' },
  '.sh': { extension: '.sh', language: 'markdown', displayName: 'Shell' },
  '.bash': { extension: '.bash', language: 'markdown', displayName: 'Bash' },
  '.sql': { extension: '.sql', language: 'markdown', displayName: 'SQL' },
};

/**
 * Shebang patterns for language detection
 */
const SHEBANG_PATTERNS: Array<{ pattern: RegExp; language: string }> = [
  { pattern: /^#!.*\bpython\d?/, language: 'python' },
  { pattern: /^#!.*\bnode\b/, language: 'javascript' },
  { pattern: /^#!.*\bbun\b/, language: 'javascript' },
  { pattern: /^#!.*\bdeno\b/, language: 'typescript' },
  { pattern: /^#!.*\b(ba)?sh\b/, language: 'markdown' },
  { pattern: /^#!.*\bperl\b/, language: 'markdown' },
  { pattern: /^#!.*\bruby\b/, language: 'markdown' },
];

/**
 * Content-based heuristic patterns
 */
const CONTENT_HEURISTICS: Array<{ patterns: RegExp[]; language: string; weight: number }> = [
  // JavaScript/TypeScript
  {
    patterns: [
      /\bconst\s+\w+\s*=\s*(require|import)\(/,
      /\bimport\s+.*\s+from\s+['"].*['"]/,
      /\bexport\s+(default\s+)?(function|class|const|let|var)\b/,
      /\bconsole\.(log|error|warn)\(/,
      /=>\s*{/,
    ],
    language: 'javascript',
    weight: 2,
  },
  // TypeScript specific
  {
    patterns: [
      /:\s*(string|number|boolean|any|void|never)\b/,
      /\binterface\s+\w+\s*{/,
      /\btype\s+\w+\s*=/,
      /<\w+>/, // Generic syntax
    ],
    language: 'typescript',
    weight: 3,
  },
  // Python
  {
    patterns: [
      /\bdef\s+\w+\s*\(/,
      /\bclass\s+\w+\s*(\(|:)/,
      /\bimport\s+\w+\b/,
      /\bfrom\s+\w+\s+import\b/,
      /\bif\s+__name__\s*==\s*['"]__main__['"]/,
      /:\s*$/, // Python's colon at end of control structures
    ],
    language: 'python',
    weight: 2,
  },
  // Java
  {
    patterns: [
      /\bpublic\s+(static\s+)?(void|class|interface)\b/,
      /\bprivate\s+(static\s+)?(void|class)\b/,
      /\bSystem\.out\.print(ln)?\(/,
      /\bpackage\s+[\w.]+;/,
    ],
    language: 'java',
    weight: 3,
  },
  // C/C++
  {
    patterns: [
      /#include\s*<\w+\.h>/,
      /#include\s*"\w+\.h"/,
      /\bint\s+main\s*\(/,
      /\bprintf\s*\(/,
      /\bstd::/,
      /\busing\s+namespace\s+std;/,
    ],
    language: 'cpp',
    weight: 3,
  },
  // HTML
  {
    patterns: [
      /<!DOCTYPE\s+html>/i,
      /<html\b/i,
      /<head\b.*>.*<\/head>/is,
      /<body\b/i,
      /<div\b.*>/i,
    ],
    language: 'html',
    weight: 3,
  },
  // CSS
  {
    patterns: [
      /\{[^{}]*:[^{}]*;[^{}]*\}/,
      /\.[a-zA-Z_][\w-]*\s*\{/,
      /#[a-zA-Z_][\w-]*\s*\{/,
      /@media\s*\(/,
      /@import\s+/,
    ],
    language: 'css',
    weight: 2,
  },
  // JSON
  {
    patterns: [
      /^\s*\{[\s\S]*"[\w]+"\s*:/,
      /^\s*\[[\s\S]*\{/,
    ],
    language: 'json',
    weight: 2,
  },
  // Markdown
  {
    patterns: [
      /^#{1,6}\s+.+$/m,
      /^\s*[-*+]\s+.+$/m,
      /\[.+\]\(.+\)/,
      /^```\w*$/m,
    ],
    language: 'markdown',
    weight: 1,
  },
];

/**
 * Detects language from file extension
 */
export function detectByExtension(filename: string): LanguageMapping | null {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return EXTENSION_MAP[ext] || null;
}

/**
 * Detects language from content heuristics
 */
export function detectByContent(content: string): string {
  // Only check first 50 lines
  const lines = content.split('\n').slice(0, 50);
  const sample = lines.join('\n');

  // Check shebang first
  if (lines[0]?.startsWith('#!')) {
    for (const { pattern, language } of SHEBANG_PATTERNS) {
      if (pattern.test(lines[0])) {
        return language;
      }
    }
  }

  // Score-based detection
  const scores: Record<string, number> = {};

  for (const { patterns, language, weight } of CONTENT_HEURISTICS) {
    for (const pattern of patterns) {
      if (pattern.test(sample)) {
        scores[language] = (scores[language] || 0) + weight;
      }
    }
  }

  // Return language with highest score
  let maxScore = 0;
  let detectedLanguage = 'markdown'; // Default

  for (const [language, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedLanguage = language;
    }
  }

  return detectedLanguage;
}

/**
 * Detects language from filename and content
 * Priority: Extension > Content heuristics > Default
 */
export function detectLanguage(filename: string, content: string = ''): string {
  // Try extension first
  const byExtension = detectByExtension(filename);
  if (byExtension) {
    return byExtension.language;
  }

  // Fall back to content heuristics
  if (content.length > 0) {
    return detectByContent(content);
  }

  // Default
  return 'markdown';
}

/**
 * Gets the display name for a language
 */
export function getLanguageDisplayName(language: string): string {
  const displayNames: Record<string, string> = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    java: 'Java',
    cpp: 'C/C++',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    markdown: 'Markdown',
  };

  return displayNames[language] || language.charAt(0).toUpperCase() + language.slice(1);
}

/**
 * Gets all supported languages
 */
export function getSupportedLanguages(): Array<{ id: string; name: string }> {
  return [
    { id: 'javascript', name: 'JavaScript' },
    { id: 'typescript', name: 'TypeScript' },
    { id: 'python', name: 'Python' },
    { id: 'java', name: 'Java' },
    { id: 'cpp', name: 'C/C++' },
    { id: 'html', name: 'HTML' },
    { id: 'css', name: 'CSS' },
    { id: 'json', name: 'JSON' },
    { id: 'markdown', name: 'Markdown' },
  ];
}
