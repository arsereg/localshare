/**
 * CodeMirror Editor Component
 * Provides the main text editing interface with language support
 */
import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';

// Language imports
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';

interface EditorProps {
  tabId: string;
  content: string;
  language: string;
  onChange: (content: string) => void;
}

/**
 * Gets the language extension for CodeMirror
 */
function getLanguageExtension(language: string) {
  switch (language) {
    case 'javascript':
      return javascript({ jsx: true, typescript: false });
    case 'typescript':
      return javascript({ jsx: true, typescript: true });
    case 'python':
      return python();
    case 'java':
      return java();
    case 'cpp':
      return cpp();
    case 'html':
      return html();
    case 'css':
      return css();
    case 'json':
      return json();
    case 'markdown':
    default:
      return markdown();
  }
}

// Compartment for dynamic language switching
const languageCompartment = new Compartment();

export default function Editor({ tabId, content, language, onChange }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const contentRef = useRef(content);

  // Update content ref when prop changes
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Create editor
  useEffect(() => {
    if (!containerRef.current) return;

    // Create update listener
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        if (newContent !== contentRef.current) {
          contentRef.current = newContent;
          onChange(newContent);
        }
      }
    });

    // Create editor state
    const state = EditorState.create({
      doc: content,
      extensions: [
        // Basic setup
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        bracketMatching(),
        autocompletion(),

        // Keymaps
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
        ]),

        // Syntax highlighting
        syntaxHighlighting(defaultHighlightStyle),

        // Language support (in compartment for dynamic switching)
        languageCompartment.of(getLanguageExtension(language)),

        // Theme
        oneDark,

        // Update listener
        updateListener,

        // Editor configuration
        EditorView.theme({
          '&': {
            height: '100%',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '14px',
            lineHeight: '1.5',
          },
          '.cm-content': {
            caretColor: '#fff',
          },
          '.cm-gutters': {
            backgroundColor: '#1e1e1e',
            borderRight: '1px solid #3c3c3c',
            color: '#858585',
            minWidth: '50px',
          },
          '.cm-lineNumbers .cm-gutterElement': {
            padding: '0 8px 0 16px',
            minWidth: '50px',
            textAlign: 'right',
          },
          '.cm-activeLine': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
          },
          '.cm-activeLineGutter': {
            backgroundColor: '#2a2d2e',
          },
        }),
      ],
    });

    // Create editor view
    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    // Focus editor
    view.focus();

    // Cleanup
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [tabId]); // Only recreate when tabId changes

  // Update content when it changes externally (e.g., from sync)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentContent = view.state.doc.toString();
    if (content !== currentContent && content !== contentRef.current) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content,
        },
      });
      contentRef.current = content;
    }
  }, [content]);

  // Update language when it changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // Reconfigure language using compartment
    view.dispatch({
      effects: languageCompartment.reconfigure(getLanguageExtension(language)),
    });
  }, [language]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      style={{ backgroundColor: '#1e1e1e' }}
    />
  );
}
