/**
 * CodeMirror Extensions for Collaboration
 * Renders remote cursors and selections in the editor
 */
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from '@codemirror/view'
import { StateField, StateEffect, Extension } from '@codemirror/state'
import { CursorData, SelectionData } from '@shared/types'

// Effects to update remote cursors and selections
export const setRemoteCursors = StateEffect.define<CursorData[]>()
export const setRemoteSelections = StateEffect.define<SelectionData[]>()

// Cursor widget that displays username label
class CursorWidget extends WidgetType {
  constructor(
    private username: string,
    private color: string
  ) {
    super()
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-remote-cursor'
    wrapper.style.cssText = `
      position: relative;
      border-left: 2px solid ${this.color};
      margin-left: -1px;
      pointer-events: none;
    `

    // Cursor line
    const cursor = document.createElement('span')
    cursor.className = 'cm-remote-cursor-line'
    cursor.style.cssText = `
      position: absolute;
      left: -1px;
      top: -2px;
      width: 2px;
      height: calc(100% + 4px);
      background: ${this.color};
      border-radius: 1px;
    `
    wrapper.appendChild(cursor)

    // Username label
    const label = document.createElement('span')
    label.className = 'cm-remote-cursor-label'
    label.textContent = this.username
    label.style.cssText = `
      position: absolute;
      left: -1px;
      top: -18px;
      background: ${this.color};
      color: #0c0c0e;
      font-size: 10px;
      font-family: 'Instrument Sans', sans-serif;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px 4px 4px 0;
      white-space: nowrap;
      pointer-events: none;
      z-index: 100;
      animation: cursor-label-fade-in 0.15s ease;
    `
    wrapper.appendChild(label)

    return wrapper
  }

  eq(other: CursorWidget): boolean {
    return other.username === this.username && other.color === this.color
  }
}

// State field to track remote cursors
const remoteCursorsField = StateField.define<CursorData[]>({
  create() {
    return []
  },
  update(cursors, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setRemoteCursors)) {
        return effect.value
      }
    }
    return cursors
  }
})

// State field to track remote selections
const remoteSelectionsField = StateField.define<SelectionData[]>({
  create() {
    return []
  },
  update(selections, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setRemoteSelections)) {
        return effect.value
      }
    }
    return selections
  }
})

// Helper to convert line/column to document position
function positionToOffset(view: EditorView, line: number, column: number): number {
  const doc = view.state.doc
  if (line < 1 || line > doc.lines) return 0
  const lineInfo = doc.line(line)
  return Math.min(lineInfo.from + column - 1, lineInfo.to)
}

// Plugin to render cursor decorations
const cursorDecorationsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.transactions.some(tr => tr.effects.some(e => e.is(setRemoteCursors)))) {
        this.decorations = this.buildDecorations(update.view)
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const cursors = view.state.field(remoteCursorsField)
      const decorations: { from: number; to: number; decoration: Decoration }[] = []

      for (const cursor of cursors) {
        try {
          const pos = positionToOffset(view, cursor.line, cursor.column)
          decorations.push({
            from: pos,
            to: pos,
            decoration: Decoration.widget({
              widget: new CursorWidget(cursor.username, cursor.color),
              side: 1
            })
          })
        } catch (e) {
          // Ignore invalid positions
        }
      }

      return Decoration.set(
        decorations
          .sort((a, b) => a.from - b.from)
          .map(d => d.decoration.range(d.from, d.to))
      )
    }
  },
  {
    decorations: v => v.decorations
  }
)

// Plugin to render selection decorations
const selectionDecorationsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.transactions.some(tr => tr.effects.some(e => e.is(setRemoteSelections)))) {
        this.decorations = this.buildDecorations(update.view)
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const selections = view.state.field(remoteSelectionsField)
      const decorations: { from: number; to: number; decoration: Decoration }[] = []

      for (const selection of selections) {
        try {
          const anchorPos = positionToOffset(view, selection.anchor.line, selection.anchor.column)
          const headPos = positionToOffset(view, selection.head.line, selection.head.column)
          const from = Math.min(anchorPos, headPos)
          const to = Math.max(anchorPos, headPos)

          if (from !== to) {
            decorations.push({
              from,
              to,
              decoration: Decoration.mark({
                class: 'cm-remote-selection',
                attributes: {
                  style: `background-color: ${selection.color}25; border-bottom: 2px solid ${selection.color}40;`
                }
              })
            })
          }
        } catch (e) {
          // Ignore invalid positions
        }
      }

      return Decoration.set(
        decorations
          .sort((a, b) => a.from - b.from)
          .map(d => d.decoration.range(d.from, d.to))
      )
    }
  },
  {
    decorations: v => v.decorations
  }
)

// CSS styles for collaboration features
const collaborationStyles = EditorView.baseTheme({
  '.cm-remote-cursor': {
    position: 'relative'
  },
  '.cm-remote-selection': {
    borderRadius: '2px'
  },
  '@keyframes cursor-label-fade-in': {
    from: { opacity: '0', transform: 'translateY(4px)' },
    to: { opacity: '1', transform: 'translateY(0)' }
  }
})

// Main extension that combines all collaboration features
export function collaborationExtensions(): Extension {
  return [
    remoteCursorsField,
    remoteSelectionsField,
    cursorDecorationsPlugin,
    selectionDecorationsPlugin,
    collaborationStyles
  ]
}

// Helper function to dispatch cursor updates to the editor
export function updateRemoteCursors(view: EditorView, cursors: CursorData[]): void {
  view.dispatch({
    effects: setRemoteCursors.of(cursors)
  })
}

// Helper function to dispatch selection updates to the editor
export function updateRemoteSelections(view: EditorView, selections: SelectionData[]): void {
  view.dispatch({
    effects: setRemoteSelections.of(selections)
  })
}
