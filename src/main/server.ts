/**
 * Collaboration Server
 * Express + WebSocket server for real-time document synchronization
 */
import express, { Express, Request, Response } from 'express'
import { createServer, Server as HttpServer } from 'http'
import { createServer as createHttpsServer, Server as HttpsServer } from 'https'
import { WebSocketServer, WebSocket } from 'ws'
import { networkInterfaces } from 'os'
import { join } from 'path'
import { readFileSync } from 'fs'
import { GuestCredential, ServerStatus, WS_MESSAGE_TYPES } from '../shared/types'
import * as Y from 'yjs'
import { loadOrGenerateCertificate, getCertificateContents, CertificateInfo } from './certificates'

// Port selection constants
const AVOID_PORTS = new Set([
  3000, 3001, 5000, 5001, 8000, 8080, 8443, // Common dev ports
  5432, 3306, 27017, 6379 // Database ports
])

const MIN_PORT = 10000
const MAX_PORT = 60000
const MAX_RETRIES = 10

interface AuthenticatedClient {
  ws: WebSocket
  username: string
  color: string
  isAuthenticated: boolean
  failedAttempts: number
  lockoutUntil: number | null
}

interface ServerInfo {
  port: number
  ip: string
  isEncrypted: boolean
}

export class CollaborationServer {
  private app: Express
  private server: HttpServer | HttpsServer | null = null
  private wss: WebSocketServer | null = null
  private port: number | null = null
  private clients: Map<WebSocket, AuthenticatedClient> = new Map()
  private credentials: Map<string, GuestCredential>
  private ydoc: Y.Doc
  private isEncrypted: boolean = false
  private certificateInfo: CertificateInfo | null = null

  // Tab-based content for guest sync (tabId -> content)
  private sharedTabs: Map<string, { content: string; filename: string }> = new Map()
  private activeTabId: string | null = null

  // Callback for when content is updated by guests (to notify main app)
  private onContentUpdate: ((tabId: string, content: string) => void) | null = null

  // Callback for when client count changes
  private onClientCountChange: ((count: number) => void) | null = null

  // Callback for when a user joins
  private onUserJoin: ((user: { username: string; color: string }) => void) | null = null

  // Callback for when a user leaves
  private onUserLeave: ((username: string) => void) | null = null

  // Callback for cursor updates
  private onCursorUpdate: ((data: { username: string; color: string; tabId: string; line: number; column: number }) => void) | null = null

  // Callback for selection updates
  private onSelectionUpdate: ((data: { username: string; color: string; tabId: string; anchor: { line: number; column: number }; head: { line: number; column: number } }) => void) | null = null

  // User colors for cursor display
  private readonly userColors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4',
    '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe',
    '#00b894', '#e17055'
  ]
  private colorIndex = 0

  constructor(credentials: Map<string, GuestCredential>) {
    this.app = express()
    this.credentials = credentials
    this.ydoc = new Y.Doc()
    this.setupExpress()
  }

  private setupExpress(): void {
    this.app.use(express.json())

    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', clients: this.clients.size })
    })

    // Guest login page (served to browsers)
    this.app.get('/', (_req: Request, res: Response) => {
      res.send(this.getGuestLoginPage())
    })

    // Static assets for guest page
    this.app.get('/guest.css', (_req: Request, res: Response) => {
      res.type('text/css').send(this.getGuestStyles())
    })
  }

  private getLocalIP(): string {
    const nets = networkInterfaces()
    for (const name of Object.keys(nets)) {
      const netInterface = nets[name]
      if (!netInterface) continue

      for (const net of netInterface) {
        // Skip internal and non-IPv4 addresses
        if (net.family === 'IPv4' && !net.internal) {
          return net.address
        }
      }
    }
    return '127.0.0.1'
  }

  private async findAvailablePort(): Promise<number> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const port = Math.floor(Math.random() * (MAX_PORT - MIN_PORT + 1)) + MIN_PORT

      if (AVOID_PORTS.has(port)) continue

      const isAvailable = await this.checkPort(port)
      if (isAvailable) {
        return port
      }
    }
    throw new Error('Could not find available port after maximum retries')
  }

  private checkPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const testServer = createServer()
      testServer.once('error', () => resolve(false))
      testServer.once('listening', () => {
        testServer.close(() => resolve(true))
      })
      testServer.listen(port, '0.0.0.0')
    })
  }

  async start(): Promise<ServerInfo> {
    this.port = await this.findAvailablePort()
    const ip = this.getLocalIP()

    // Try to use TLS with self-signed certificates
    try {
      this.certificateInfo = await loadOrGenerateCertificate()
      const certContents = getCertificateContents()

      if (certContents) {
        this.server = createHttpsServer(
          {
            cert: certContents.cert,
            key: certContents.key
          },
          this.app
        )
        this.isEncrypted = true
        console.log('TLS enabled with self-signed certificate')
        console.log(`Certificate fingerprint: ${this.certificateInfo?.fingerprint}`)
      } else {
        // Fallback to HTTP
        this.server = createServer(this.app)
        this.isEncrypted = false
        console.log('TLS not available, using unencrypted HTTP')
      }
    } catch (error) {
      console.warn('Failed to setup TLS, falling back to HTTP:', error)
      this.server = createServer(this.app)
      this.isEncrypted = false
    }

    this.wss = new WebSocketServer({ server: this.server })
    this.setupWebSocket()

    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, '0.0.0.0', () => {
        const protocol = this.isEncrypted ? 'https' : 'http'
        console.log(`Server listening on ${protocol}://${ip}:${this.port}`)
        resolve({
          port: this.port!,
          ip,
          isEncrypted: this.isEncrypted
        })
      })

      this.server!.on('error', (error) => {
        reject(error)
      })
    })
  }

  private setupWebSocket(): void {
    if (!this.wss) return

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket connection')

      // Initialize client as unauthenticated
      const client: AuthenticatedClient = {
        ws,
        username: '',
        color: this.userColors[this.colorIndex++ % this.userColors.length],
        isAuthenticated: false,
        failedAttempts: 0,
        lockoutUntil: null
      }
      this.clients.set(ws, client)

      // Send auth request
      ws.send(JSON.stringify({
        type: WS_MESSAGE_TYPES.AUTH_REQUEST
      }))

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(ws, message)
        } catch (error) {
          console.error('Failed to parse message:', error)
        }
      })

      ws.on('close', () => {
        const client = this.clients.get(ws)
        const wasAuthenticated = client?.isAuthenticated
        const username = client?.username
        if (wasAuthenticated) {
          // Notify others of user leaving
          this.broadcast({
            type: WS_MESSAGE_TYPES.USER_LEAVE,
            username: client.username
          }, ws)
        }
        this.clients.delete(ws)
        console.log('Client disconnected')

        // Notify main app of user leave
        if (wasAuthenticated && username && this.onUserLeave) {
          this.onUserLeave(username)
        }

        // Notify main app of client count change
        if (wasAuthenticated) {
          this.notifyClientCountChange()
        }
      })

      ws.on('error', (error) => {
        console.error('WebSocket error:', error)
        this.clients.delete(ws)
      })
    })
  }

  private handleMessage(ws: WebSocket, message: any): void {
    const client = this.clients.get(ws)
    if (!client) return

    switch (message.type) {
      case WS_MESSAGE_TYPES.AUTH_RESPONSE:
        this.handleAuth(ws, client, message)
        break

      case WS_MESSAGE_TYPES.SYNC_UPDATE:
        if (client.isAuthenticated) {
          // Handle simple text content updates (for browser guests)
          if (message.content !== undefined && message.tabId) {
            console.log(`[Server] Received content update from ${client.username} for tab ${message.tabId}:`, message.content.substring(0, 50))
            const tab = this.sharedTabs.get(message.tabId)
            if (tab) {
              tab.content = message.content
            }
            // Broadcast to other browser guests
            this.broadcast({
              type: WS_MESSAGE_TYPES.SYNC_UPDATE,
              tabId: message.tabId,
              content: message.content
            }, ws)
            // Notify main Electron app of the content change
            if (this.onContentUpdate) {
              console.log('[Server] Calling onContentUpdate callback')
              this.onContentUpdate(message.tabId, message.content)
            } else {
              console.log('[Server] WARNING: onContentUpdate callback not set!')
            }
          }
          // Apply Yjs update (for native Electron clients)
          if (message.update) {
            const update = new Uint8Array(message.update)
            Y.applyUpdate(this.ydoc, update)
            // Broadcast to other clients
            this.broadcast({
              type: WS_MESSAGE_TYPES.SYNC_UPDATE,
              update: Array.from(update)
            }, ws)
          }
        }
        break

      case WS_MESSAGE_TYPES.CURSOR_UPDATE:
        if (client.isAuthenticated) {
          this.broadcast({
            type: WS_MESSAGE_TYPES.CURSOR_UPDATE,
            username: client.username,
            color: client.color,
            tabId: message.tabId,
            line: message.line,
            column: message.column,
            timestamp: Date.now()
          }, ws)
          // Notify main app of cursor update
          if (this.onCursorUpdate) {
            this.onCursorUpdate({
              username: client.username,
              color: client.color,
              tabId: message.tabId,
              line: message.line,
              column: message.column
            })
          }
        }
        break

      case WS_MESSAGE_TYPES.SELECTION_UPDATE:
        if (client.isAuthenticated) {
          this.broadcast({
            type: WS_MESSAGE_TYPES.SELECTION_UPDATE,
            username: client.username,
            color: client.color,
            tabId: message.tabId,
            anchor: message.anchor,
            head: message.head,
            timestamp: Date.now()
          }, ws)
          // Notify main app of selection update
          if (this.onSelectionUpdate) {
            this.onSelectionUpdate({
              username: client.username,
              color: client.color,
              tabId: message.tabId,
              anchor: message.anchor,
              head: message.head
            })
          }
        }
        break

      case WS_MESSAGE_TYPES.VIEWPORT_UPDATE:
        if (client.isAuthenticated) {
          this.broadcast({
            type: WS_MESSAGE_TYPES.VIEWPORT_UPDATE,
            username: client.username,
            tabId: message.tabId,
            scrollTop: message.scrollTop,
            scrollLeft: message.scrollLeft,
            visibleLines: message.visibleLines
          }, ws)
        }
        break

      case WS_MESSAGE_TYPES.FOLLOW_REQUEST:
        if (client.isAuthenticated) {
          // Notify the target user that someone is following them
          this.clients.forEach((targetClient, targetWs) => {
            if (targetClient.username === message.targetUsername && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify({
                type: WS_MESSAGE_TYPES.FOLLOW_REQUEST,
                follower: client.username
              }))
            }
          })
        }
        break

      case WS_MESSAGE_TYPES.FOLLOW_STOP:
        if (client.isAuthenticated) {
          this.clients.forEach((targetClient, targetWs) => {
            if (targetClient.username === message.targetUsername && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify({
                type: WS_MESSAGE_TYPES.FOLLOW_STOP,
                follower: client.username
              }))
            }
          })
        }
        break

      // Voice chat signaling
      case WS_MESSAGE_TYPES.VOICE_JOIN:
        if (client.isAuthenticated) {
          this.broadcast({
            type: WS_MESSAGE_TYPES.VOICE_JOIN,
            username: client.username,
            color: client.color
          }, ws)
        }
        break

      case WS_MESSAGE_TYPES.VOICE_LEAVE:
        if (client.isAuthenticated) {
          this.broadcast({
            type: WS_MESSAGE_TYPES.VOICE_LEAVE,
            username: client.username
          }, ws)
        }
        break

      case WS_MESSAGE_TYPES.VOICE_MUTE:
        if (client.isAuthenticated) {
          this.broadcast({
            type: WS_MESSAGE_TYPES.VOICE_MUTE,
            username: client.username,
            isMuted: message.isMuted
          }, ws)
        }
        break

      case WS_MESSAGE_TYPES.VOICE_OFFER:
      case WS_MESSAGE_TYPES.VOICE_ANSWER:
      case WS_MESSAGE_TYPES.VOICE_ICE_CANDIDATE:
        if (client.isAuthenticated && message.targetUsername) {
          // Forward WebRTC signaling to specific user
          this.clients.forEach((targetClient, targetWs) => {
            if (targetClient.username === message.targetUsername && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify({
                type: message.type,
                fromUsername: client.username,
                ...message
              }))
            }
          })
        }
        break
    }
  }

  private handleAuth(ws: WebSocket, client: AuthenticatedClient, message: any): void {
    const { username, pin } = message

    // Check lockout
    if (client.lockoutUntil && Date.now() < client.lockoutUntil) {
      const remainingSeconds = Math.ceil((client.lockoutUntil - Date.now()) / 1000)
      ws.send(JSON.stringify({
        type: WS_MESSAGE_TYPES.AUTH_FAILED,
        error: `Too many attempts. Try again in ${remainingSeconds} seconds.`
      }))
      return
    }

    // Validate credentials
    const credential = this.credentials.get(username)
    if (credential && credential.pin === pin) {
      client.isAuthenticated = true
      client.username = username
      client.failedAttempts = 0
      client.lockoutUntil = null

      // Send initial sync with all tabs
      const state = Y.encodeStateAsUpdate(this.ydoc)
      const tabs = Array.from(this.sharedTabs.entries()).map(([id, tab]) => ({
        id,
        filename: tab.filename,
        content: tab.content
      }))
      console.log('[Server] Sending sync:init to guest. Tabs count:', tabs.length, 'activeTabId:', this.activeTabId)
      console.log('[Server] Tabs:', tabs.map(t => t.id + ':' + t.filename).join(', '))
      ws.send(JSON.stringify({
        type: WS_MESSAGE_TYPES.SYNC_INIT,
        state: Array.from(state),
        users: this.getAuthenticatedUsers(),
        tabs: tabs,
        activeTabId: this.activeTabId
      }))

      // Notify others
      this.broadcast({
        type: WS_MESSAGE_TYPES.USER_JOIN,
        username: client.username,
        color: client.color
      }, ws)

      console.log(`User ${username} authenticated`)

      // Notify main app of user join
      if (this.onUserJoin) {
        this.onUserJoin({ username: client.username, color: client.color })
      }

      // Notify main app of client count change
      this.notifyClientCountChange()
    } else {
      client.failedAttempts++

      if (client.failedAttempts >= 3) {
        client.lockoutUntil = Date.now() + 30000 // 30 second lockout
        ws.send(JSON.stringify({
          type: WS_MESSAGE_TYPES.AUTH_FAILED,
          error: 'Too many failed attempts. Locked out for 30 seconds.'
        }))
      } else {
        ws.send(JSON.stringify({
          type: WS_MESSAGE_TYPES.AUTH_FAILED,
          error: `Invalid credentials. ${3 - client.failedAttempts} attempts remaining.`
        }))
      }
    }
  }

  private getAuthenticatedUsers(): { username: string; color: string }[] {
    const users: { username: string; color: string }[] = []
    this.clients.forEach((client) => {
      if (client.isAuthenticated) {
        users.push({ username: client.username, color: client.color })
      }
    })
    return users
  }

  private broadcast(message: any, exclude?: WebSocket): void {
    const data = JSON.stringify(message)
    this.clients.forEach((client, ws) => {
      if (ws !== exclude && client.isAuthenticated && ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })
  }

  getStatus(): ServerStatus {
    let connectedClients = 0
    this.clients.forEach((client) => {
      if (client.isAuthenticated) connectedClients++
    })

    return {
      isRunning: this.server !== null,
      port: this.port,
      ip: this.getLocalIP(),
      connectedClients,
      isEncrypted: this.isEncrypted
    }
  }

  getConnectionUrl(): string | null {
    if (!this.port) return null
    const protocol = this.isEncrypted ? 'https' : 'http'
    return `${protocol}://${this.getLocalIP()}:${this.port}`
  }

  getCertificateFingerprint(): string | null {
    return this.certificateInfo?.fingerprint || null
  }

  /**
   * Update shared content for a specific tab from main Electron app
   * This syncs content to all connected browser guests
   */
  updateTabContent(tabId: string, content: string, filename: string): void {
    this.sharedTabs.set(tabId, { content, filename })
    // Broadcast to all authenticated clients
    this.broadcast({
      type: WS_MESSAGE_TYPES.SYNC_UPDATE,
      tabId,
      content
    })
  }

  /**
   * Set active tab (for tracking only, doesn't broadcast to guests)
   */
  setActiveTab(tabId: string): void {
    this.activeTabId = tabId
    // Don't broadcast - let guests stay on their own tabs
  }

  /**
   * Focus all guests to a specific tab
   */
  focusAllGuests(tabId: string): void {
    this.broadcast({
      type: 'tab:focus',
      tabId
    })
  }

  /**
   * Remove a tab
   */
  removeTab(tabId: string): void {
    this.sharedTabs.delete(tabId)
    // Broadcast tab removal to guests
    this.broadcast({
      type: 'tab:close',
      tabId
    })
  }

  /**
   * Rename a tab
   */
  renameTab(tabId: string, filename: string): void {
    const tab = this.sharedTabs.get(tabId)
    if (tab) {
      tab.filename = filename
      // Broadcast rename to guests
      this.broadcast({
        type: 'tab:rename',
        tabId,
        filename
      })
    }
  }

  /**
   * Add a new tab
   */
  addTab(tabId: string, filename: string, content: string): void {
    const isFirstTab = this.sharedTabs.size === 0
    console.log('[Server] addTab called:', tabId, filename, 'isFirstTab:', isFirstTab)
    this.sharedTabs.set(tabId, { content, filename })

    // Broadcast new tab to guests
    this.broadcast({
      type: 'tab:new',
      tabId,
      filename,
      content
    })

    // If this is the first tab, automatically focus all guests on it
    if (isFirstTab) {
      this.activeTabId = tabId
      this.focusAllGuests(tabId)
    }
  }

  /**
   * Broadcast host cursor position to all guests
   */
  broadcastHostCursor(tabId: string, line: number, column: number): void {
    this.broadcast({
      type: WS_MESSAGE_TYPES.CURSOR_UPDATE,
      username: 'Host',
      color: '#2dd4bf', // Accent color
      tabId,
      line,
      column,
      timestamp: Date.now()
    })
  }

  /**
   * Broadcast host selection to all guests
   */
  broadcastHostSelection(tabId: string, anchor: { line: number; column: number }, head: { line: number; column: number }): void {
    this.broadcast({
      type: WS_MESSAGE_TYPES.SELECTION_UPDATE,
      username: 'Host',
      color: '#2dd4bf', // Accent color
      tabId,
      anchor,
      head,
      timestamp: Date.now()
    })
  }

  /**
   * Get current shared content for a tab
   */
  getTabContent(tabId: string): string | null {
    return this.sharedTabs.get(tabId)?.content || null
  }

  /**
   * Set callback for when guests update content
   */
  setOnContentUpdate(callback: (tabId: string, content: string) => void): void {
    this.onContentUpdate = callback
  }

  /**
   * Set callback for when client count changes
   */
  setOnClientCountChange(callback: (count: number) => void): void {
    this.onClientCountChange = callback
  }

  /**
   * Set callback for when a user joins
   */
  setOnUserJoin(callback: (user: { username: string; color: string }) => void): void {
    this.onUserJoin = callback
  }

  /**
   * Set callback for when a user leaves
   */
  setOnUserLeave(callback: (username: string) => void): void {
    this.onUserLeave = callback
  }

  /**
   * Set callback for cursor updates
   */
  setOnCursorUpdate(callback: (data: { username: string; color: string; tabId: string; line: number; column: number }) => void): void {
    this.onCursorUpdate = callback
  }

  /**
   * Set callback for selection updates
   */
  setOnSelectionUpdate(callback: (data: { username: string; color: string; tabId: string; anchor: { line: number; column: number }; head: { line: number; column: number } }) => void): void {
    this.onSelectionUpdate = callback
  }

  /**
   * Notify about client count change
   */
  private notifyClientCountChange(): void {
    if (this.onClientCountChange) {
      let count = 0
      this.clients.forEach((client) => {
        if (client.isAuthenticated) count++
      })
      this.onClientCountChange(count)
    }
  }

  stop(): void {
    this.clients.forEach((_, ws) => {
      ws.close()
    })
    this.clients.clear()
    this.wss?.close()
    this.server?.close()
    this.server = null
    this.wss = null
    this.port = null
  }

  // Inline guest login page HTML - refined professional theme
  private getGuestLoginPage(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LocalShare - Join Session</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/guest.css">
  <!-- Highlight.js for syntax highlighting -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <!-- Common languages -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/typescript.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/javascript.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/python.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/go.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/rust.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/java.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/cpp.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/c.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/css.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/json.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/yaml.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/bash.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/sql.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/markdown.min.js"></script>
</head>
<body>
  <div id="login-container" class="container">
    <div class="login-card">
      <div class="card-content">
        <div class="logo-section">
          <div class="logo-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
          </div>
          <h1 class="logo-text">
            <span class="text-accent">Local</span><span class="text-primary">Share</span>
          </h1>
          <p class="tagline">Join collaborative editing session</p>
        </div>

        <form id="auth-form" class="auth-form">
          <div class="input-group">
            <label for="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              autocomplete="off"
              required
              maxlength="20"
              pattern="[a-zA-Z0-9_-]+"
              placeholder="Enter your username"
            >
          </div>

          <div class="input-group">
            <label for="pin">Access PIN</label>
            <input
              type="password"
              id="pin"
              name="pin"
              autocomplete="off"
              required
              maxlength="6"
              pattern="[0-9]{6}"
              placeholder="6-digit PIN"
            >
          </div>

          <div id="error-message" class="error-message hidden"></div>

          <button type="submit" class="submit-btn">
            Connect
          </button>
        </form>

        <div class="footer">
          <div class="status-indicator">
            <span class="status-dot"></span>
            <span>Local network connection</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Full-screen editor (shown after login) -->
  <div id="editor-screen" class="editor-screen hidden">
    <div class="editor-header">
      <div class="header-left">
        <span class="brand">
          <span class="text-accent">Local</span><span class="text-primary">Share</span>
        </span>
        <span class="separator"></span>
        <span class="connection-info">
          <span class="status-dot online"></span>
          <span id="connected-user-display"></span>
        </span>
      </div>
      <div class="header-right">
        <span id="users-online" class="users-online"></span>
        <!-- Actions Dropdown -->
        <div class="actions-dropdown" id="actions-dropdown">
          <button class="actions-btn" id="actions-btn">
            <span>Actions</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div class="actions-menu hidden" id="actions-menu">
            <button class="action-item" id="action-save">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              <span>Save to file</span>
            </button>
            <button class="action-item" id="action-copy">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy content</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <div id="tabs-container" class="guest-tabs-container"></div>
    <div id="editor-wrapper" class="editor-wrapper">
      <div id="line-numbers" class="line-numbers"><span>1</span></div>
      <div class="editor-content-area">
        <pre id="highlight-overlay" class="highlight-overlay"><code id="highlight-code"></code></pre>
        <textarea id="editor-textarea" class="editor-textarea" placeholder="Start typing or wait for content to sync..." spellcheck="false"></textarea>
      </div>
    </div>
    <div class="editor-footer">
      <span class="sync-status" id="sync-status">Connecting...</span>
      <span class="action-feedback hidden" id="action-feedback"></span>
    </div>
  </div>

  <script>
    const form = document.getElementById('auth-form');
    const errorMessage = document.getElementById('error-message');
    const loginContainer = document.getElementById('login-container');
    const editorScreen = document.getElementById('editor-screen');
    const connectedUserDisplay = document.getElementById('connected-user-display');
    const usersOnline = document.getElementById('users-online');
    const syncStatus = document.getElementById('sync-status');
    const editorTextarea = document.getElementById('editor-textarea');
    const tabsContainer = document.getElementById('tabs-container');

    let ws = null;
    let tabs = new Map(); // tabId -> { content, filename }
    let activeTabId = null;
    let isUpdating = false;
    let currentUsername = '';
    let remoteCursors = new Map(); // username -> { line, column, color, element }
    let lastCursorPos = { line: 0, column: 0 };
    let currentLanguage = 'plaintext';

    // Language detection from filename
    const languageMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'go': 'go',
      'rs': 'rust',
      'java': 'java',
      'cpp': 'cpp',
      'cc': 'cpp',
      'cxx': 'cpp',
      'c': 'c',
      'h': 'c',
      'hpp': 'cpp',
      'css': 'css',
      'scss': 'css',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'sh': 'bash',
      'bash': 'bash',
      'zsh': 'bash',
      'sql': 'sql',
      'md': 'markdown',
      'markdown': 'markdown',
      'html': 'xml',
      'xml': 'xml',
      'vue': 'xml',
      'svelte': 'xml'
    };

    function getLanguageFromFilename(filename) {
      if (!filename) return 'plaintext';
      const ext = filename.split('.').pop().toLowerCase();
      return languageMap[ext] || 'plaintext';
    }

    function updateSyntaxHighlighting(content, language) {
      const highlightCode = document.getElementById('highlight-code');
      const highlightOverlay = document.getElementById('highlight-overlay');

      if (!highlightCode || !highlightOverlay) {
        console.log('[Guest] Highlight elements not found');
        return;
      }

      // Escape HTML entities for the overlay
      const escapedContent = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      console.log('[Guest] Updating syntax highlighting, language:', language, 'hljs available:', typeof hljs !== 'undefined');

      if (typeof hljs !== 'undefined') {
        console.log('[Guest] hljs languages:', hljs.listLanguages ? hljs.listLanguages() : 'listLanguages not available');
      }

      if (language && language !== 'plaintext' && typeof hljs !== 'undefined') {
        const langAvailable = hljs.getLanguage && hljs.getLanguage(language);
        console.log('[Guest] Language', language, 'available:', !!langAvailable);

        if (langAvailable) {
          try {
            const result = hljs.highlight(content, { language });
            highlightCode.innerHTML = result.value + '\\n'; // Add trailing newline for proper height
            console.log('[Guest] Applied highlighting for', language);
          } catch (e) {
            console.log('[Guest] Highlight error:', e);
            highlightCode.innerHTML = escapedContent + '\\n';
          }
        } else {
          // Try auto-detection
          try {
            const result = hljs.highlightAuto(content);
            highlightCode.innerHTML = result.value + '\\n';
            console.log('[Guest] Applied auto-detected highlighting:', result.language);
          } catch (e) {
            highlightCode.innerHTML = escapedContent + '\\n';
          }
        }
      } else {
        highlightCode.innerHTML = escapedContent + '\\n';
        console.log('[Guest] No highlighting applied, showing plain text');
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('username').value;
      const pin = document.getElementById('pin').value;
      currentUsername = username;

      // Connect WebSocket
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(\`\${protocol}//\${location.host}\`);

      ws.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('Received:', message.type);

        switch (message.type) {
          case 'auth:request':
            ws.send(JSON.stringify({
              type: 'auth:response',
              username,
              pin
            }));
            break;

          case 'sync:init':
            // Authentication successful - show editor
            loginContainer.classList.add('hidden');
            editorScreen.classList.remove('hidden');
            connectedUserDisplay.textContent = username;
            errorMessage.classList.add('hidden');
            syncStatus.textContent = 'Connected';
            syncStatus.classList.add('synced');

            // Initialize tabs from server
            if (message.tabs && message.tabs.length > 0) {
              console.log('[Guest] Received', message.tabs.length, 'tabs');
              message.tabs.forEach(tab => {
                tabs.set(tab.id, { content: tab.content, filename: tab.filename });
              });
              renderTabs();
              enableEditor();

              // Set active tab
              if (message.activeTabId && tabs.has(message.activeTabId)) {
                setActiveTab(message.activeTabId);
              } else if (message.tabs.length > 0) {
                setActiveTab(message.tabs[0].id);
              }
            } else {
              // No tabs yet - disable editor and show waiting message
              disableEditor();
            }
            updateLineNumbers();

            // Show users
            if (message.users && message.users.length > 0) {
              updateUsersDisplay(message.users);
            }
            break;

          case 'sync:update':
            // Receive content update for a specific tab
            if (message.content !== undefined && message.tabId && !isUpdating) {
              console.log('[Guest] Received content update for tab', message.tabId);
              const tab = tabs.get(message.tabId);
              if (tab) {
                tab.content = message.content;
              }
              // If this is the active tab, update the editor
              if (message.tabId === activeTabId) {
                const cursorPos = editorTextarea.selectionStart;
                isUpdating = true;
                editorTextarea.value = message.content;
                editorTextarea.selectionStart = Math.min(cursorPos, message.content.length);
                editorTextarea.selectionEnd = editorTextarea.selectionStart;
                isUpdating = false;
                updateLineNumbers();
                // Update syntax highlighting
                updateSyntaxHighlighting(message.content, currentLanguage);
              }
            }
            break;

          case 'tab:change':
            // Host changed active tab
            if (message.tabId && tabs.has(message.tabId)) {
              setActiveTab(message.tabId);
            }
            break;

          case 'tab:new':
            // Host created a new tab
            if (message.tabId) {
              const wasEmpty = tabs.size === 0;
              tabs.set(message.tabId, { content: message.content || '', filename: message.filename || 'untitled.txt' });
              renderTabs();
              // If this is the first tab, enable editor (focus will come separately)
              if (wasEmpty) {
                enableEditor();
              }
            }
            break;

          case 'tab:rename':
            // Host renamed a tab
            if (message.tabId && message.filename) {
              const tab = tabs.get(message.tabId);
              if (tab) {
                tab.filename = message.filename;
                renderTabs();
              }
            }
            break;

          case 'tab:close':
            // Host closed a tab
            if (message.tabId) {
              tabs.delete(message.tabId);
              if (activeTabId === message.tabId) {
                // Switch to another tab
                const firstTab = tabs.keys().next().value;
                if (firstTab) {
                  setActiveTab(firstTab);
                } else {
                  activeTabId = null;
                  editorTextarea.value = '';
                }
              }
              renderTabs();
            }
            break;

          case 'tab:focus':
            // Host wants to focus all guests on a specific tab
            if (message.tabId && tabs.has(message.tabId)) {
              setActiveTab(message.tabId);
              showNotification('Host focused you on this tab');
            }
            break;

          case 'user:join':
            console.log('User joined:', message.username);
            showNotification(\`\${message.username} joined\`);
            break;

          case 'user:leave':
            console.log('User left:', message.username);
            showNotification(\`\${message.username} left\`);
            // Remove their cursor
            removeRemoteCursor(message.username);
            break;

          case 'cursor:update':
            // Another user moved their cursor
            if (message.username !== currentUsername && message.tabId === activeTabId) {
              updateRemoteCursor(message.username, message.color, message.line, message.column);
            }
            break;

          case 'selection:update':
            // Another user changed their selection
            if (message.username !== currentUsername && message.tabId === activeTabId) {
              updateRemoteSelection(message.username, message.color, message.anchor, message.head);
            }
            break;

          case 'auth:failed':
            errorMessage.textContent = message.error;
            errorMessage.classList.remove('hidden');
            ws.close();
            break;
        }
      };

      ws.onerror = () => {
        errorMessage.textContent = 'Connection failed. Please try again.';
        errorMessage.classList.remove('hidden');
        syncStatus.textContent = 'Disconnected';
        syncStatus.classList.remove('synced');
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        syncStatus.textContent = 'Disconnected';
        syncStatus.classList.remove('synced');
      };
    });

    // Send content updates when user types
    editorTextarea.addEventListener('input', () => {
      if (isUpdating || !activeTabId) return;

      const newContent = editorTextarea.value;
      const tab = tabs.get(activeTabId);
      if (tab && newContent !== tab.content && ws && ws.readyState === WebSocket.OPEN) {
        console.log('[Guest] Sending content update for tab', activeTabId);
        tab.content = newContent;
        ws.send(JSON.stringify({
          type: 'sync:update',
          tabId: activeTabId,
          content: newContent
        }));
        updateLineNumbers();
        // Update syntax highlighting
        updateSyntaxHighlighting(newContent, currentLanguage);
      }
    });

    // Line numbers functionality
    function updateLineNumbers() {
      const lineNumbers = document.getElementById('line-numbers');
      const lines = editorTextarea.value.split('\\n');
      lineNumbers.innerHTML = lines.map((_, i) => \`<span>\${i + 1}</span>\`).join('');
    }

    // Initialize line numbers
    updateLineNumbers();

    function renderTabs() {
      if (!tabsContainer) return;
      tabsContainer.innerHTML = '';
      tabs.forEach((tab, tabId) => {
        const tabEl = document.createElement('div');
        tabEl.className = 'guest-tab' + (tabId === activeTabId ? ' active' : '');
        tabEl.textContent = tab.filename;
        tabEl.onclick = () => setActiveTab(tabId);
        tabsContainer.appendChild(tabEl);
      });
    }

    function setActiveTab(tabId) {
      if (!tabs.has(tabId)) return;
      activeTabId = tabId;
      const tab = tabs.get(tabId);
      console.log('[Guest] setActiveTab:', tabId, 'filename:', tab.filename, 'content length:', tab.content.length);
      isUpdating = true;
      editorTextarea.value = tab.content;
      isUpdating = false;

      // Update language and syntax highlighting
      currentLanguage = getLanguageFromFilename(tab.filename);
      console.log('[Guest] Detected language:', currentLanguage, 'from filename:', tab.filename);
      updateSyntaxHighlighting(tab.content, currentLanguage);

      updateLineNumbers();
      renderTabs();
    }

    function updateUsersDisplay(users) {
      const otherUsers = users.filter(u => u.username !== currentUsername);
      if (otherUsers.length > 0) {
        usersOnline.textContent = otherUsers.length + ' other' + (otherUsers.length > 1 ? 's' : '') + ' online';
      } else {
        usersOnline.textContent = '';
      }
    }

    function showNotification(message) {
      // Simple notification
      const notification = document.createElement('div');
      notification.className = 'notification';
      notification.textContent = message;
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);
    }

    function disableEditor() {
      editorTextarea.disabled = true;
      editorTextarea.placeholder = 'Waiting for host to create a document...';
      editorTextarea.classList.add('disabled');
      tabsContainer.innerHTML = '<div class="waiting-message">Waiting for host...</div>';
    }

    function enableEditor() {
      editorTextarea.disabled = false;
      editorTextarea.placeholder = 'Start typing or wait for content to sync...';
      editorTextarea.classList.remove('disabled');
    }

    // Cursor position tracking
    function getTextareaCursorPosition() {
      const text = editorTextarea.value;
      const cursorPos = editorTextarea.selectionStart;
      const lines = text.substring(0, cursorPos).split('\\n');
      return {
        line: lines.length,
        column: lines[lines.length - 1].length + 1
      };
    }

    function sendCursorUpdate() {
      if (!ws || ws.readyState !== WebSocket.OPEN || !activeTabId) return;

      const pos = getTextareaCursorPosition();
      if (pos.line !== lastCursorPos.line || pos.column !== lastCursorPos.column) {
        lastCursorPos = pos;
        ws.send(JSON.stringify({
          type: 'cursor:update',
          tabId: activeTabId,
          line: pos.line,
          column: pos.column
        }));
      }
    }

    function sendSelectionUpdate() {
      if (!ws || ws.readyState !== WebSocket.OPEN || !activeTabId) return;

      const text = editorTextarea.value;
      const start = editorTextarea.selectionStart;
      const end = editorTextarea.selectionEnd;

      if (start === end) return; // No selection

      const beforeStart = text.substring(0, start).split('\\n');
      const beforeEnd = text.substring(0, end).split('\\n');

      const anchor = {
        line: beforeStart.length,
        column: beforeStart[beforeStart.length - 1].length + 1
      };
      const head = {
        line: beforeEnd.length,
        column: beforeEnd[beforeEnd.length - 1].length + 1
      };

      ws.send(JSON.stringify({
        type: 'selection:update',
        tabId: activeTabId,
        anchor,
        head
      }));
    }

    // Track cursor movement
    editorTextarea.addEventListener('click', sendCursorUpdate);
    editorTextarea.addEventListener('keyup', (e) => {
      // Send cursor update on navigation keys
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
        sendCursorUpdate();
      }
    });
    editorTextarea.addEventListener('input', () => {
      // Send cursor update after typing (cursor moves as you type)
      sendCursorUpdate();
    });
    editorTextarea.addEventListener('select', sendSelectionUpdate);
    editorTextarea.addEventListener('mouseup', () => {
      sendCursorUpdate();
      if (editorTextarea.selectionStart !== editorTextarea.selectionEnd) {
        sendSelectionUpdate();
      }
    });

    // Remote cursor rendering
    function updateRemoteCursor(username, color, line, column) {
      let cursorData = remoteCursors.get(username);

      if (!cursorData) {
        // Create cursor element
        const cursorEl = document.createElement('div');
        cursorEl.className = 'remote-cursor';
        cursorEl.innerHTML = \`
          <div class="remote-cursor-line" style="background: \${color}"></div>
          <div class="remote-cursor-label" style="background: \${color}">\${username}</div>
        \`;
        document.getElementById('editor-wrapper').appendChild(cursorEl);
        cursorData = { element: cursorEl, line, column, color };
        remoteCursors.set(username, cursorData);
      }

      cursorData.line = line;
      cursorData.column = column;

      // Position the cursor
      positionRemoteCursor(cursorData);
    }

    function positionRemoteCursor(cursorData) {
      const lineHeight = 22.1; // Approximate line height
      const charWidth = 7.8; // Approximate character width for monospace
      const paddingTop = 20;
      const paddingLeft = 68; // Account for line numbers

      const top = paddingTop + (cursorData.line - 1) * lineHeight - editorTextarea.scrollTop;
      const left = paddingLeft + (cursorData.column - 1) * charWidth - editorTextarea.scrollLeft;

      cursorData.element.style.top = top + 'px';
      cursorData.element.style.left = left + 'px';
      cursorData.element.style.display = (top >= 0 && top < editorTextarea.offsetHeight) ? 'block' : 'none';
    }

    function removeRemoteCursor(username) {
      const cursorData = remoteCursors.get(username);
      if (cursorData) {
        if (cursorData.element) {
          cursorData.element.remove();
        }
        if (cursorData.selectionElement) {
          cursorData.selectionElement.remove();
        }
      }
      remoteCursors.delete(username);
    }

    function updateRemoteSelection(username, color, anchor, head) {
      // Update cursor at head position
      updateRemoteCursor(username, color, head.line, head.column);

      // Get or create cursor data
      let cursorData = remoteCursors.get(username);
      if (!cursorData) return;

      // Store anchor and head for re-rendering on scroll
      cursorData.anchor = anchor;
      cursorData.head = head;

      // Remove existing selection highlight
      if (cursorData.selectionElement) {
        cursorData.selectionElement.remove();
        cursorData.selectionElement = null;
      }

      // Check if there's actually a selection (not just cursor)
      if (anchor.line === head.line && anchor.column === head.column) {
        return;
      }

      // Create selection highlight container
      const selectionContainer = document.createElement('div');
      selectionContainer.className = 'remote-selection-container';
      selectionContainer.style.cssText = 'position: absolute; top: 0; left: 0; pointer-events: none; z-index: 40;';

      // Calculate selection range
      const startLine = Math.min(anchor.line, head.line);
      const endLine = Math.max(anchor.line, head.line);
      const lineHeight = 22.1;
      const charWidth = 7.8;
      const paddingTop = 20;
      const paddingLeft = 68;

      // Get text to calculate positions accurately
      const lines = editorTextarea.value.split('\\n');

      for (let line = startLine; line <= endLine; line++) {
        const lineText = lines[line - 1] || '';
        let startCol, endCol;

        if (line === startLine && line === endLine) {
          // Single line selection
          startCol = Math.min(anchor.column, head.column);
          endCol = Math.max(anchor.column, head.column);
        } else if (line === startLine) {
          // First line of multi-line selection
          startCol = anchor.line < head.line ? anchor.column : head.column;
          endCol = lineText.length + 1;
        } else if (line === endLine) {
          // Last line of multi-line selection
          startCol = 1;
          endCol = anchor.line < head.line ? head.column : anchor.column;
        } else {
          // Middle line - select entire line
          startCol = 1;
          endCol = lineText.length + 1;
        }

        const highlight = document.createElement('div');
        highlight.className = 'remote-selection-highlight';
        const top = paddingTop + (line - 1) * lineHeight - editorTextarea.scrollTop;
        const left = paddingLeft + (startCol - 1) * charWidth - editorTextarea.scrollLeft;
        const width = Math.max((endCol - startCol) * charWidth, 4);

        highlight.style.cssText = \`
          position: absolute;
          top: \${top}px;
          left: \${left}px;
          width: \${width}px;
          height: \${lineHeight}px;
          background: \${color}25;
          border-radius: 2px;
          pointer-events: none;
        \`;

        selectionContainer.appendChild(highlight);
      }

      document.getElementById('editor-wrapper').appendChild(selectionContainer);
      cursorData.selectionElement = selectionContainer;
    }

    function repositionSelections() {
      // Re-render all selections on scroll
      remoteCursors.forEach((cursorData, username) => {
        if (cursorData.selectionElement && cursorData.anchor && cursorData.head) {
          updateRemoteSelection(username, cursorData.color, cursorData.anchor, cursorData.head);
        }
      });
    }

    // Update cursor and selection positions on scroll
    editorTextarea.addEventListener('scroll', () => {
      const lineNumbers = document.getElementById('line-numbers');
      lineNumbers.scrollTop = editorTextarea.scrollTop;

      // Sync scroll to highlight overlay
      const highlightOverlay = document.getElementById('highlight-overlay');
      if (highlightOverlay) {
        highlightOverlay.scrollTop = editorTextarea.scrollTop;
        highlightOverlay.scrollLeft = editorTextarea.scrollLeft;
      }

      remoteCursors.forEach((cursorData, username) => {
        positionRemoteCursor(cursorData);
        // Re-render selection if it exists
        if (cursorData.anchor && cursorData.head) {
          updateRemoteSelection(username, cursorData.color, cursorData.anchor, cursorData.head);
        }
      });
    });

    // Actions dropdown functionality
    const actionsBtn = document.getElementById('actions-btn');
    const actionsMenu = document.getElementById('actions-menu');
    const actionSave = document.getElementById('action-save');
    const actionCopy = document.getElementById('action-copy');
    const actionFeedback = document.getElementById('action-feedback');

    actionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      actionsMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      actionsMenu.classList.add('hidden');
    });

    function showFeedback(message) {
      actionFeedback.textContent = message;
      actionFeedback.classList.remove('hidden');
      setTimeout(() => actionFeedback.classList.add('hidden'), 2000);
    }

    // Save to file
    actionSave.addEventListener('click', () => {
      if (!activeTabId) return;
      const tab = tabs.get(activeTabId);
      if (!tab) return;

      // Create a blob and download link
      const blob = new Blob([tab.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = tab.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      actionsMenu.classList.add('hidden');
      showFeedback('File downloaded');
    });

    // Copy to clipboard
    actionCopy.addEventListener('click', async () => {
      if (!activeTabId) return;
      const tab = tabs.get(activeTabId);
      if (!tab) return;

      try {
        await navigator.clipboard.writeText(tab.content);
        showFeedback('Copied to clipboard');
      } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = tab.content;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showFeedback('Copied to clipboard');
      }

      actionsMenu.classList.add('hidden');
    });
  </script>
</body>
</html>`
  }

  private getGuestStyles(): string {
    return `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  /* Core backgrounds */
  --bg-base: #0c0c0e;
  --bg-surface: #141417;
  --bg-elevated: #1c1c21;
  --bg-hover: #252529;

  /* Accent colors - refined teal */
  --accent-primary: #2dd4bf;
  --accent-primary-dim: rgba(45, 212, 191, 0.15);
  --accent-secondary: #f97066;
  --accent-tertiary: #a78bfa;

  /* Text hierarchy */
  --text-primary: #f4f4f5;
  --text-secondary: #a1a1aa;
  --text-tertiary: #71717a;
  --text-disabled: #52525b;

  /* Status colors */
  --status-error: #f87171;
  --status-warning: #fbbf24;
  --status-success: #34d399;

  /* Border colors */
  --border-subtle: rgba(255, 255, 255, 0.04);
  --border-default: rgba(255, 255, 255, 0.08);
  --border-emphasis: rgba(255, 255, 255, 0.12);
}

body {
  font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  background: var(--bg-base);
  color: var(--text-primary);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  -webkit-font-smoothing: antialiased;
}

.container {
  position: relative;
  width: 100%;
  max-width: 380px;
}

.login-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.card-content {
  padding: 40px 32px;
}

.logo-section {
  text-align: center;
  margin-bottom: 32px;
}

.logo-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border-radius: 12px;
  border: 1px solid var(--border-default);
  color: var(--accent-primary);
}

.logo-text {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.text-accent {
  color: var(--accent-primary);
}

.text-primary {
  color: var(--text-primary);
}

.tagline {
  color: var(--text-secondary);
  font-size: 13px;
  margin-top: 6px;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.input-group input {
  width: 100%;
  background: var(--bg-base);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 12px 14px;
  color: var(--text-primary);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 13px;
  transition: all 0.15s ease;
}

.input-group input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-dim);
}

.input-group input::placeholder {
  color: var(--text-disabled);
}

.error-message {
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid var(--status-error);
  border-radius: 8px;
  padding: 10px 14px;
  color: var(--status-error);
  font-size: 12px;
  text-align: center;
}

.hidden {
  display: none !important;
}

.submit-btn {
  width: 100%;
  background: var(--accent-primary);
  border: none;
  border-radius: 8px;
  padding: 12px 20px;
  color: var(--bg-base);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-top: 4px;
}

.submit-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 0 20px rgba(45, 212, 191, 0.25);
}

.submit-btn:active {
  transform: translateY(0);
}

.footer {
  margin-top: 24px;
  text-align: center;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.status-dot {
  width: 6px;
  height: 6px;
  background: var(--status-success);
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@media (max-width: 480px) {
  .card-content {
    padding: 32px 24px;
  }

  .logo-text {
    font-size: 20px;
  }
}

/* Editor Screen Styles */
.editor-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-base);
  z-index: 100;
}

.editor-screen.hidden {
  display: none;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand {
  font-weight: 700;
  font-size: 13px;
}

.separator {
  width: 1px;
  height: 14px;
  background: var(--border-default);
}

.connection-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.status-dot.online {
  background: var(--status-success);
}

.users-online {
  font-size: 11px;
  color: var(--text-tertiary);
}

.editor-wrapper {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
  background: var(--bg-base);
}

.editor-content-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.line-numbers {
  background: transparent;
  color: var(--text-tertiary);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 13px;
  line-height: 1.7;
  padding: 20px 12px;
  text-align: right;
  border-right: 1px solid var(--border-subtle);
  user-select: none;
  overflow: hidden;
  min-width: 48px;
}

.line-numbers span {
  display: block;
}

/* Syntax highlighting overlay */
.highlight-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0;
  padding: 20px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre;
  overflow: auto;
  pointer-events: none;
  background: transparent;
  border: none;
  color: var(--text-primary);
  tab-size: 2;
  -moz-tab-size: 2;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Hide scrollbar on overlay - we'll scroll it via JS */
.highlight-overlay::-webkit-scrollbar {
  display: none;
}

.highlight-overlay code {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  background: transparent;
  padding: 0;
}

/* Override highlight.js background */
.highlight-overlay code.hljs {
  background: transparent;
  padding: 0;
}

.editor-textarea {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: transparent;
  color: transparent;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 13px;
  line-height: 1.7;
  padding: 20px;
  border: none;
  resize: none;
  outline: none;
  white-space: pre;
  overflow-wrap: normal;
  overflow: auto;
  caret-color: var(--accent-primary);
  tab-size: 2;
  -moz-tab-size: 2;
  z-index: 1;
}

.editor-textarea::selection {
  background: var(--accent-primary-dim);
}

.editor-textarea::placeholder {
  color: var(--text-disabled);
  /* Override transparent color for placeholder */
  -webkit-text-fill-color: var(--text-disabled);
}

/* Hide overlay when code is empty to show placeholder */
.highlight-overlay code:empty::after {
  content: '';
}

.guest-tabs-container {
  display: flex;
  gap: 2px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  overflow-x: auto;
  scrollbar-width: none;
  padding: 4px 8px 0;
}

.guest-tabs-container::-webkit-scrollbar {
  display: none;
}

.guest-tab {
  padding: 8px 14px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  border-radius: 6px 6px 0 0;
  border: 1px solid transparent;
  border-bottom: none;
}

.guest-tab:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.guest-tab.active {
  background: var(--bg-elevated);
  color: var(--accent-primary);
  border-color: var(--border-default);
  position: relative;
}

.guest-tab.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent-primary);
  border-radius: 2px 2px 0 0;
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-subtle);
}

.sync-status {
  font-size: 11px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.sync-status.synced {
  color: var(--status-success);
}

.sync-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.notification {
  position: fixed;
  bottom: 60px;
  right: 20px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-primary);
  animation: slide-in 0.2s ease;
  z-index: 1000;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

/* Remote cursor styles */
.remote-cursor {
  position: absolute;
  pointer-events: none;
  z-index: 50;
  transition: top 0.05s ease, left 0.05s ease;
}

.remote-cursor-line {
  width: 2px;
  height: 20px;
  border-radius: 1px;
}

.remote-cursor-label {
  position: absolute;
  top: -18px;
  left: 0;
  padding: 2px 6px;
  border-radius: 4px 4px 4px 0;
  font-size: 10px;
  font-weight: 600;
  color: var(--bg-base);
  white-space: nowrap;
  animation: cursor-fade-in 0.15s ease;
}

@keyframes cursor-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.editor-textarea.disabled {
  background: var(--bg-surface);
  color: transparent;
  cursor: not-allowed;
}

.editor-textarea.disabled + .highlight-overlay,
.editor-textarea.disabled ~ .highlight-overlay {
  color: var(--text-disabled);
}

.waiting-message {
  padding: 10px 14px;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* Actions Dropdown */
.actions-dropdown {
  position: relative;
  margin-left: 12px;
}

.actions-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.actions-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-emphasis);
}

.actions-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 160px;
  padding: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.actions-menu.hidden {
  display: none;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: all 0.1s ease;
}

.action-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.action-item svg {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.action-item:hover svg {
  color: var(--accent-primary);
}

/* Action feedback */
.action-feedback {
  font-size: 11px;
  color: var(--status-success);
  padding: 4px 10px;
  background: rgba(52, 211, 153, 0.1);
  border-radius: 4px;
  animation: fade-in 0.15s ease;
}

.action-feedback.hidden {
  display: none;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
    `
  }
}
