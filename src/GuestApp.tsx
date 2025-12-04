/**
 * Guest Application Component
 * Browser-based interface for guest users connecting to the collaboration server
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import * as Y from 'yjs';

type ConnectionStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'error';

interface Message {
  type: string;
  payload?: Record<string, unknown>;
}

export default function GuestApp() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [retriesRemaining, setRetriesRemaining] = useState(3);
  const [lockoutUntil, setLockoutUntil] = useState<Date | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);

  // Connect to WebSocket server
  const connect = useCallback(() => {
    // Get server URL from current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    setStatus('connecting');
    setErrorMessage('');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setStatus('authenticating');
    };

    ws.onmessage = (event) => {
      try {
        const message: Message = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStatus('error');
      setErrorMessage('Connection error. Please check the server is running.');
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      if (status !== 'error') {
        setStatus('disconnected');
      }
      wsRef.current = null;
    };
  }, [status]);

  // Handle incoming messages
  const handleMessage = useCallback((message: Message) => {
    switch (message.type) {
      case 'auth-required':
        setStatus('authenticating');
        break;

      case 'auth-success':
        setStatus('connected');
        // Request document
        sendMessage({ type: 'doc-request', payload: { docId: 'main' } });
        break;

      case 'auth-failure': {
        const payload = message.payload as {
          message?: string;
          retriesRemaining?: number;
          lockoutUntil?: string;
        };
        setErrorMessage(payload.message || 'Authentication failed');
        if (payload.retriesRemaining !== undefined) {
          setRetriesRemaining(payload.retriesRemaining);
        }
        if (payload.lockoutUntil) {
          setLockoutUntil(new Date(payload.lockoutUntil));
        }
        break;
      }

      case 'doc-state': {
        const payload = message.payload as { docId: string; state: number[] };
        // Initialize Yjs document
        if (!ydocRef.current) {
          ydocRef.current = new Y.Doc();
        }
        const state = new Uint8Array(payload.state);
        Y.applyUpdate(ydocRef.current, state);
        initializeEditor();
        break;
      }

      case 'sync': {
        const payload = message.payload as { docId: string; update: number[] };
        if (ydocRef.current) {
          const update = new Uint8Array(payload.update);
          Y.applyUpdate(ydocRef.current, update);
          // Update editor content
          const text = ydocRef.current.getText('content').toString();
          if (viewRef.current) {
            const currentContent = viewRef.current.state.doc.toString();
            if (text !== currentContent) {
              viewRef.current.dispatch({
                changes: { from: 0, to: currentContent.length, insert: text },
              });
            }
          }
        }
        break;
      }

      case 'error': {
        const payload = message.payload as { message?: string };
        setErrorMessage(payload.message || 'An error occurred');
        break;
      }
    }
  }, []);

  // Send message to server
  const sendMessage = useCallback((message: Message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Handle authentication
  const handleAuth = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !pin.trim()) {
      setErrorMessage('Please enter both username and PIN');
      return;
    }

    // Check lockout
    if (lockoutUntil && new Date() < lockoutUntil) {
      const seconds = Math.ceil((lockoutUntil.getTime() - Date.now()) / 1000);
      setErrorMessage(`Account locked. Try again in ${seconds} seconds.`);
      return;
    }

    setErrorMessage('');
    sendMessage({
      type: 'auth',
      payload: { username: username.trim(), pin: pin.trim() },
    });
  }, [username, pin, lockoutUntil, sendMessage]);

  // Initialize CodeMirror editor
  const initializeEditor = useCallback(() => {
    if (!editorRef.current || viewRef.current) return;

    const doc = ydocRef.current;
    const text = doc?.getText('content').toString() || '';

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && doc) {
        const newContent = update.state.doc.toString();
        const ytext = doc.getText('content');

        doc.transact(() => {
          ytext.delete(0, ytext.length);
          ytext.insert(0, newContent);
        });

        // Send update to server
        const updateData = Y.encodeStateAsUpdate(doc);
        sendMessage({
          type: 'sync',
          payload: {
            docId: 'main',
            update: Array.from(updateData),
          },
        });
      }
    });

    const state = EditorState.create({
      doc: text,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        syntaxHighlighting(defaultHighlightStyle),
        javascript({ jsx: true, typescript: true }),
        oneDark,
        updateListener,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '14px',
          },
          '.cm-gutters': {
            backgroundColor: '#1e1e1e',
            borderRight: '1px solid #3c3c3c',
            color: '#858585',
          },
        }),
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });
  }, [sendMessage]);

  // Auto-connect on mount
  useEffect(() => {
    connect();

    return () => {
      wsRef.current?.close();
      viewRef.current?.destroy();
    };
  }, []);

  // Lockout timer
  useEffect(() => {
    if (lockoutUntil) {
      const interval = setInterval(() => {
        if (new Date() >= lockoutUntil) {
          setLockoutUntil(null);
          setRetriesRemaining(3);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [lockoutUntil]);

  // Render based on status
  if (status === 'connecting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-editor-bg">
        <div className="text-center">
          <div className="spinner mx-auto mb-4" style={{ width: 40, height: 40 }} />
          <div className="text-editor-text">Connecting to server...</div>
        </div>
      </div>
    );
  }

  if (status === 'error' || status === 'disconnected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-editor-bg">
        <div className="modal" style={{ minWidth: '350px' }}>
          <div className="modal-title mb-4">Connection Error</div>
          <div className="text-red-400 mb-4">
            {errorMessage || 'Unable to connect to the server.'}
          </div>
          <button className="btn btn-primary w-full" onClick={connect}>
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (status === 'authenticating') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-editor-bg">
        <div className="modal" style={{ minWidth: '350px' }}>
          <div className="modal-title mb-4">Guest Login</div>

          {errorMessage && (
            <div className="bg-red-900/30 border border-red-700 rounded p-3 mb-4 text-red-200 text-sm">
              {errorMessage}
              {retriesRemaining > 0 && retriesRemaining < 3 && (
                <div className="mt-1">Attempts remaining: {retriesRemaining}</div>
              )}
            </div>
          )}

          <form onSubmit={handleAuth}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">PIN</label>
              <input
                type="password"
                className="form-input"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="6-digit PIN"
                maxLength={6}
                pattern="[0-9]*"
                inputMode="numeric"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={lockoutUntil !== null && new Date() < lockoutUntil}
            >
              {lockoutUntil && new Date() < lockoutUntil
                ? `Locked (${Math.ceil((lockoutUntil.getTime() - Date.now()) / 1000)}s)`
                : 'Login'}
            </button>
          </form>

          <div className="text-xs text-gray-500 mt-4 text-center">
            Ask the host for your username and PIN
          </div>
        </div>
      </div>
    );
  }

  // Connected - show editor
  return (
    <div className="h-screen flex flex-col bg-editor-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-editor-sidebar border-b border-editor-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-sm text-editor-text">Connected as {username}</span>
        </div>
        <button
          className="btn btn-sm btn-secondary"
          onClick={() => {
            wsRef.current?.close();
            setStatus('disconnected');
          }}
        >
          Disconnect
        </button>
      </div>

      {/* Editor */}
      <div ref={editorRef} className="flex-1 overflow-hidden" />

      {/* Footer */}
      <div className="px-4 py-1 bg-editor-accent text-white text-xs">
        Collaborative Code Editor - Guest Mode
      </div>
    </div>
  );
}
