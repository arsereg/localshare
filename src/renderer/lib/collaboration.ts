/**
 * Collaboration Module
 * Handles real-time synchronization using Yjs CRDT
 */

import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import { EditorView, keymap } from '@codemirror/view'
import { Extension } from '@codemirror/state'

export interface CollaborationUser {
  name: string
  color: string
  colorLight: string
}

export interface CollaborationConfig {
  serverUrl: string
  roomName: string
  user: CollaborationUser
  onSync?: (synced: boolean) => void
  onUsersChange?: (users: CollaborationUser[]) => void
  onConnectionChange?: (connected: boolean) => void
}

export class CollaborationManager {
  private doc: Y.Doc
  private provider: WebsocketProvider | null = null
  private config: CollaborationConfig
  private yText: Y.Text

  constructor(config: CollaborationConfig) {
    this.config = config
    this.doc = new Y.Doc()
    this.yText = this.doc.getText('content')
  }

  /**
   * Connect to the collaboration server
   */
  connect(): void {
    // Convert http(s) to ws(s)
    const wsUrl = this.config.serverUrl
      .replace('http://', 'ws://')
      .replace('https://', 'wss://')

    this.provider = new WebsocketProvider(
      wsUrl,
      this.config.roomName,
      this.doc,
      { connect: true }
    )

    // Set user awareness
    this.provider.awareness.setLocalStateField('user', this.config.user)

    // Listen for connection status
    this.provider.on('status', (event: { status: string }) => {
      this.config.onConnectionChange?.(event.status === 'connected')
    })

    // Listen for sync status
    this.provider.on('sync', (synced: boolean) => {
      this.config.onSync?.(synced)
    })

    // Listen for awareness changes (other users)
    this.provider.awareness.on('change', () => {
      const users: CollaborationUser[] = []
      this.provider?.awareness.getStates().forEach((state) => {
        if (state.user) {
          users.push(state.user as CollaborationUser)
        }
      })
      this.config.onUsersChange?.(users)
    })
  }

  /**
   * Disconnect from the collaboration server
   */
  disconnect(): void {
    this.provider?.destroy()
    this.provider = null
  }

  /**
   * Get the Y.Text instance for the document
   */
  getYText(): Y.Text {
    return this.yText
  }

  /**
   * Get CodeMirror extensions for collaboration
   */
  getEditorExtensions(): Extension[] {
    if (!this.provider) {
      console.warn('Provider not connected')
      return []
    }

    return [
      yCollab(this.yText, this.provider.awareness),
      keymap.of(yUndoManagerKeymap)
    ]
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.provider?.wsconnected ?? false
  }

  /**
   * Get the Y.Doc instance
   */
  getDoc(): Y.Doc {
    return this.doc
  }

  /**
   * Update user info
   */
  updateUser(user: Partial<CollaborationUser>): void {
    if (this.provider) {
      const current = this.provider.awareness.getLocalState()?.user || {}
      this.provider.awareness.setLocalStateField('user', {
        ...current,
        ...user
      })
    }
  }

  /**
   * Get current users
   */
  getUsers(): CollaborationUser[] {
    const users: CollaborationUser[] = []
    this.provider?.awareness.getStates().forEach((state) => {
      if (state.user) {
        users.push(state.user as CollaborationUser)
      }
    })
    return users
  }
}

/**
 * Generate a light version of a color for selection highlighting
 */
export function generateLightColor(color: string): string {
  // Convert hex to RGB, add transparency
  const hex = color.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, 0.2)`
}

/**
 * Generate random user color
 */
export function generateUserColor(): { color: string; colorLight: string } {
  const colors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4',
    '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe',
    '#00b894', '#e17055', '#0984e3', '#6c5ce7'
  ]
  const color = colors[Math.floor(Math.random() * colors.length)]
  return {
    color,
    colorLight: generateLightColor(color)
  }
}
