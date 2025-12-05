/**
 * CodeMirror Editor Module
 * Handles editor creation, configuration, and theming
 */

import { EditorState, Compartment, Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { getLanguageExtension } from './language-detection'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import type * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'

// Compartments for dynamic configuration
const languageCompartment = new Compartment()
const themeCompartment = new Compartment()

// Custom terminal/hacker theme
const terminalTheme = EditorView.theme({
  '&': {
    backgroundColor: '#0a0e14',
    color: '#e6edf3',
    height: '100%'
  },
  '.cm-content': {
    caretColor: '#00ff9f',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    lineHeight: '1.6',
    padding: '16px 0'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#00ff9f',
    borderLeftWidth: '2px'
  },
  '.cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(0, 255, 159, 0.2) !important'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(0, 255, 159, 0.03)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(0, 255, 159, 0.05)'
  },
  '.cm-gutters': {
    backgroundColor: '#0d1117',
    color: '#484f58',
    border: 'none',
    borderRight: '1px solid #21262d'
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 12px 0 8px',
    minWidth: '40px'
  },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 4px'
  },
  '.cm-line': {
    padding: '0 16px'
  },
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(0, 255, 159, 0.2)',
    outline: '1px solid rgba(0, 255, 159, 0.4)'
  },
  '.cm-nonmatchingBracket': {
    backgroundColor: 'rgba(255, 0, 85, 0.2)',
    outline: '1px solid rgba(255, 0, 85, 0.4)'
  },
  '.cm-searchMatch': {
    backgroundColor: 'rgba(255, 184, 0, 0.3)',
    outline: '1px solid rgba(255, 184, 0, 0.5)'
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'rgba(0, 217, 255, 0.3)'
  },
  '.cm-selectionMatch': {
    backgroundColor: 'rgba(0, 217, 255, 0.15)'
  },
  '.cm-foldPlaceholder': {
    backgroundColor: '#1c2128',
    border: '1px solid #30363d',
    color: '#8b949e'
  },
  '.cm-tooltip': {
    backgroundColor: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '4px'
  },
  '.cm-tooltip-autocomplete': {
    '& > ul > li[aria-selected]': {
      backgroundColor: 'rgba(0, 255, 159, 0.1)'
    }
  },
  '.cm-panels': {
    backgroundColor: '#161b22',
    color: '#e6edf3'
  },
  '.cm-panel.cm-search': {
    padding: '8px 12px',
    backgroundColor: '#161b22'
  },
  '.cm-textfield': {
    backgroundColor: '#0d1117',
    border: '1px solid #30363d',
    color: '#e6edf3',
    borderRadius: '4px',
    padding: '4px 8px'
  },
  '.cm-button': {
    backgroundColor: 'transparent',
    border: '1px solid #30363d',
    color: '#e6edf3',
    borderRadius: '4px',
    padding: '4px 8px'
  }
}, { dark: true })

// Syntax highlighting colors (Dracula-inspired for terminal feel)
import { tags } from '@lezer/highlight'
import { HighlightStyle } from '@codemirror/language'

const syntaxColors = HighlightStyle.define([
  { tag: tags.keyword, color: '#ff79c6' },
  { tag: tags.operator, color: '#ff79c6' },
  { tag: tags.special(tags.variableName), color: '#50fa7b' },
  { tag: tags.typeName, color: '#8be9fd' },
  { tag: tags.className, color: '#8be9fd' },
  { tag: tags.atom, color: '#bd93f9' },
  { tag: tags.bool, color: '#bd93f9' },
  { tag: tags.null, color: '#bd93f9' },
  { tag: tags.number, color: '#bd93f9' },
  { tag: tags.string, color: '#f1fa8c' },
  { tag: tags.character, color: '#f1fa8c' },
  { tag: tags.regexp, color: '#ffb86c' },
  { tag: tags.escape, color: '#ffb86c' },
  { tag: tags.comment, color: '#6272a4', fontStyle: 'italic' },
  { tag: tags.lineComment, color: '#6272a4', fontStyle: 'italic' },
  { tag: tags.blockComment, color: '#6272a4', fontStyle: 'italic' },
  { tag: tags.docComment, color: '#6272a4', fontStyle: 'italic' },
  { tag: tags.variableName, color: '#f8f8f2' },
  { tag: tags.function(tags.variableName), color: '#50fa7b' },
  { tag: tags.definition(tags.variableName), color: '#50fa7b' },
  { tag: tags.propertyName, color: '#66d9ef' },
  { tag: tags.function(tags.propertyName), color: '#50fa7b' },
  { tag: tags.definition(tags.propertyName), color: '#50fa7b' },
  { tag: tags.labelName, color: '#8be9fd' },
  { tag: tags.namespace, color: '#8be9fd' },
  { tag: tags.macroName, color: '#50fa7b' },
  { tag: tags.meta, color: '#f8f8f2' },
  { tag: tags.invalid, color: '#ff5555' },
  { tag: tags.punctuation, color: '#f8f8f2' },
  { tag: tags.bracket, color: '#f8f8f2' },
  { tag: tags.tagName, color: '#ff79c6' },
  { tag: tags.attributeName, color: '#50fa7b' },
  { tag: tags.attributeValue, color: '#f1fa8c' },
  { tag: tags.heading, color: '#bd93f9', fontWeight: 'bold' },
  { tag: tags.link, color: '#8be9fd', textDecoration: 'underline' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' }
])

export interface EditorConfig {
  initialContent?: string
  languageId?: string
  onChange?: (content: string) => void
  onCursorChange?: (line: number, column: number) => void
  // Collaboration options
  yText?: Y.Text
  awareness?: Awareness
}

export class CodeEditor {
  private view: EditorView | null = null
  private config: EditorConfig

  constructor(config: EditorConfig = {}) {
    this.config = config
  }

  /**
   * Create and mount the editor
   */
  async mount(parent: HTMLElement): Promise<void> {
    const extensions = await this.createExtensions()

    const state = EditorState.create({
      doc: this.config.initialContent || '',
      extensions
    })

    this.view = new EditorView({
      state,
      parent
    })
  }

  /**
   * Create editor extensions
   */
  private async createExtensions(): Promise<Extension[]> {
    const baseExtensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      foldGutter(),
      highlightSelectionMatches(),
      terminalTheme,
      syntaxHighlighting(syntaxColors),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true })
    ]

    // Add collaboration support if yText and awareness are provided
    if (this.config.yText && this.config.awareness) {
      baseExtensions.push(
        yCollab(this.config.yText, this.config.awareness),
        keymap.of(yUndoManagerKeymap)
      )
    } else {
      // Only add history for non-collaborative mode
      baseExtensions.push(history())
      baseExtensions.push(keymap.of(historyKeymap))
    }

    // Add common keymaps
    baseExtensions.push(
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        indentWithTab
      ])
    )

    // Add language support
    if (this.config.languageId) {
      try {
        const langExtension = await getLanguageExtension(this.config.languageId)()
        baseExtensions.push(languageCompartment.of(langExtension))
      } catch (e) {
        console.warn('Failed to load language extension:', e)
        baseExtensions.push(languageCompartment.of([]))
      }
    } else {
      baseExtensions.push(languageCompartment.of([]))
    }

    // Add change listener
    if (this.config.onChange) {
      baseExtensions.push(
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.config.onChange!(update.state.doc.toString())
          }
        })
      )
    }

    // Add cursor position listener
    if (this.config.onCursorChange) {
      baseExtensions.push(
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged) {
            const pos = update.state.selection.main.head
            const line = update.state.doc.lineAt(pos)
            this.config.onCursorChange!(line.number, pos - line.from + 1)
          }
        })
      )
    }

    return baseExtensions
  }

  /**
   * Update editor content
   */
  setContent(content: string): void {
    if (!this.view) return

    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: content
      }
    })
  }

  /**
   * Get current editor content
   */
  getContent(): string {
    if (!this.view) return ''
    return this.view.state.doc.toString()
  }

  /**
   * Update language mode
   */
  async setLanguage(languageId: string): Promise<void> {
    if (!this.view) return

    try {
      const langExtension = await getLanguageExtension(languageId)()
      this.view.dispatch({
        effects: languageCompartment.reconfigure(langExtension)
      })
    } catch (e) {
      console.warn('Failed to load language extension:', e)
    }
  }

  /**
   * Focus the editor
   */
  focus(): void {
    this.view?.focus()
  }

  /**
   * Get cursor position
   */
  getCursorPosition(): { line: number; column: number } {
    if (!this.view) return { line: 1, column: 1 }

    const pos = this.view.state.selection.main.head
    const line = this.view.state.doc.lineAt(pos)
    return {
      line: line.number,
      column: pos - line.from + 1
    }
  }

  /**
   * Destroy the editor
   */
  destroy(): void {
    this.view?.destroy()
    this.view = null
  }

  /**
   * Get the EditorView instance
   */
  getView(): EditorView | null {
    return this.view
  }
}
