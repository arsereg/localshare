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
        if (wasAuthenticated) {
          // Notify others of user leaving
          this.broadcast({
            type: WS_MESSAGE_TYPES.USER_LEAVE,
            username: client.username
          }, ws)
        }
        this.clients.delete(ws)
        console.log('Client disconnected')

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
            cursor: message.cursor
          }, ws)
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

  // Inline guest login page HTML
  private getGuestLoginPage(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LocalShare - Join Session</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/guest.css">
</head>
<body>
  <div id="login-container" class="container">
    <div class="terminal-window">
      <div class="terminal-header">
        <div class="terminal-dots">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
        </div>
        <span class="terminal-title">localshare@session</span>
      </div>
      <div class="terminal-body">
        <div class="logo-section">
          <pre class="ascii-logo">
 _                    _  ____  _
| |    ___   ___ __ _| |/ ___|| |__   __ _ _ __ ___
| |   / _ \\ / __/ _\` | |\\___ \\| '_ \\ / _\` | '__/ _ \\
| |__| (_) | (_| (_| | | ___) | | | | (_| | | |  __/
|_____\\___/ \\___\\__,_|_||____/|_| |_|\\__,_|_|  \\___|
          </pre>
          <p class="tagline">Real-time collaborative code editing</p>
        </div>

        <form id="auth-form" class="auth-form">
          <div class="input-group">
            <label for="username">
              <span class="prompt">$</span> username:
            </label>
            <input
              type="text"
              id="username"
              name="username"
              autocomplete="off"
              required
              maxlength="20"
              pattern="[a-zA-Z0-9_-]+"
              placeholder="enter_username"
            >
          </div>

          <div class="input-group">
            <label for="pin">
              <span class="prompt">$</span> access_pin:
            </label>
            <input
              type="password"
              id="pin"
              name="pin"
              autocomplete="off"
              required
              maxlength="6"
              pattern="[0-9]{6}"
              placeholder="******"
            >
          </div>

          <div id="error-message" class="error-message hidden"></div>

          <button type="submit" class="submit-btn">
            <span class="btn-text">CONNECT</span>
            <span class="btn-icon">_</span>
          </button>
        </form>

        <div class="footer">
          <span class="blink">_</span> Secure local network connection
        </div>
      </div>
    </div>
    <div class="scanline"></div>
  </div>

  <!-- Full-screen editor (shown after login) -->
  <div id="editor-screen" class="editor-screen hidden">
    <div class="editor-header">
      <div class="header-left">
        <span class="brand"><span class="text-phosphor">Local</span><span class="text-cyber">Share</span></span>
        <span class="separator">|</span>
        <span class="connection-info">
          <span class="status-dot"></span>
          <span id="connected-user-display"></span>
        </span>
      </div>
      <div class="header-right">
        <span id="users-online" class="users-online"></span>
      </div>
    </div>
    <div id="tabs-container" class="guest-tabs-container"></div>
    <div id="editor-wrapper" class="editor-wrapper">
      <div id="line-numbers" class="line-numbers"><span>1</span></div>
      <textarea id="editor-textarea" class="editor-textarea" placeholder="Start typing or wait for content to sync..."></textarea>
    </div>
    <div class="editor-footer">
      <span class="sync-status" id="sync-status">Syncing...</span>
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
      }
    });

    // Line numbers functionality
    function updateLineNumbers() {
      const lineNumbers = document.getElementById('line-numbers');
      const lines = editorTextarea.value.split('\\n');
      lineNumbers.innerHTML = lines.map((_, i) => \`<span>\${i + 1}</span>\`).join('');
    }

    editorTextarea.addEventListener('scroll', () => {
      const lineNumbers = document.getElementById('line-numbers');
      lineNumbers.scrollTop = editorTextarea.scrollTop;
    });

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
      isUpdating = true;
      editorTextarea.value = tab.content;
      isUpdating = false;
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
  --bg-deep: #0a0e14;
  --bg-base: #0d1117;
  --bg-surface: #161b22;
  --bg-elevated: #1c2128;
  --phosphor: #00ff9f;
  --phosphor-dim: #004d40;
  --phosphor-glow: rgba(0, 255, 159, 0.15);
  --cyber: #00d9ff;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #484f58;
  --error: #ff0055;
  --border: #30363d;
}

body {
  font-family: 'Space Mono', monospace;
  background: var(--bg-deep);
  color: var(--text-primary);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: hidden;
}

.container {
  position: relative;
  width: 100%;
  max-width: 560px;
}

.terminal-window {
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 0 60px rgba(0, 255, 159, 0.1);
}

.terminal-header {
  background: var(--bg-surface);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border);
}

.terminal-dots {
  display: flex;
  gap: 8px;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.dot.red { background: #ff5f56; }
.dot.yellow { background: #ffbd2e; }
.dot.green { background: #27c93f; }

.terminal-title {
  flex: 1;
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
}

.terminal-body {
  padding: 32px;
}

.logo-section {
  text-align: center;
  margin-bottom: 32px;
}

.ascii-logo {
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px;
  line-height: 1.2;
  color: var(--phosphor);
  text-shadow: 0 0 10px var(--phosphor-glow);
  white-space: pre;
  display: inline-block;
}

.tagline {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 12px;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-group label {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.prompt {
  color: var(--phosphor);
}

.input-group input {
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 12px 16px;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  transition: all 0.2s ease;
}

.input-group input:focus {
  outline: none;
  border-color: var(--phosphor);
  box-shadow: 0 0 0 3px var(--phosphor-glow);
}

.input-group input::placeholder {
  color: var(--text-muted);
}

.error-message {
  background: rgba(255, 0, 85, 0.1);
  border: 1px solid var(--error);
  border-radius: 4px;
  padding: 12px;
  color: var(--error);
  font-size: 12px;
  text-align: center;
}

.hidden {
  display: none !important;
}

.submit-btn {
  background: transparent;
  border: 1px solid var(--phosphor);
  border-radius: 4px;
  padding: 14px 24px;
  color: var(--phosphor);
  font-family: 'Space Mono', monospace;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
  margin-top: 8px;
}

.submit-btn:hover {
  background: var(--phosphor);
  color: var(--bg-deep);
  box-shadow: 0 0 20px var(--phosphor-glow);
}

.btn-icon {
  animation: blink 1s step-end infinite;
}

.editor-container {
  margin-top: 24px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--bg-surface);
  border-radius: 4px;
  margin-bottom: 16px;
}

.status-dot {
  width: 8px;
  height: 8px;
  background: var(--phosphor);
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.status-text {
  font-size: 12px;
  color: var(--text-secondary);
}

.footer {
  margin-top: 32px;
  text-align: center;
  font-size: 11px;
  color: var(--text-muted);
}

.blink {
  animation: blink 1s step-end infinite;
  color: var(--phosphor);
}

.scanline {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(
    transparent,
    rgba(0, 255, 159, 0.03),
    transparent
  );
  animation: scanline 8s linear infinite;
  pointer-events: none;
  z-index: 1000;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 4px var(--phosphor); }
  50% { opacity: 0.7; box-shadow: 0 0 8px var(--phosphor); }
}

@keyframes scanline {
  0% { transform: translateY(-100vh); }
  100% { transform: translateY(100vh); }
}

@media (max-width: 480px) {
  .terminal-body {
    padding: 24px 16px;
  }

  .ascii-logo {
    font-size: 6px;
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
  background: var(--bg-deep);
}

.editor-screen.hidden {
  display: none;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand {
  font-weight: 700;
  font-size: 14px;
}

.text-phosphor {
  color: var(--phosphor);
}

.text-cyber {
  color: var(--cyber);
}

.separator {
  color: var(--border);
}

.connection-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.connection-info .status-dot {
  width: 8px;
  height: 8px;
  background: var(--phosphor);
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.users-online {
  font-size: 12px;
  color: var(--text-muted);
}

.editor-wrapper {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.line-numbers {
  background: var(--bg-base);
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  line-height: 1.6;
  padding: 20px 12px;
  text-align: right;
  border-right: 1px solid var(--border);
  user-select: none;
  overflow: hidden;
  min-width: 50px;
}

.line-numbers span {
  display: block;
}

.editor-textarea {
  flex: 1;
  background: var(--bg-deep);
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  line-height: 1.6;
  padding: 20px;
  border: none;
  resize: none;
  outline: none;
  white-space: pre;
  overflow-wrap: normal;
  overflow-x: auto;
}

.editor-textarea::placeholder {
  color: var(--text-muted);
}

.guest-tabs-container {
  display: flex;
  background: var(--bg-base);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: none;
}

.guest-tabs-container::-webkit-scrollbar {
  display: none;
}

.guest-tab {
  padding: 10px 16px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  border-right: 1px solid var(--border);
  white-space: nowrap;
  transition: all 0.15s;
}

.guest-tab:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.guest-tab.active {
  background: var(--bg-surface);
  color: var(--phosphor);
  border-bottom: 2px solid var(--phosphor);
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 20px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
}

.sync-status {
  font-size: 11px;
  color: var(--text-muted);
}

.sync-status.synced {
  color: var(--phosphor);
}

.notification {
  position: fixed;
  bottom: 60px;
  right: 20px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  padding: 12px 20px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);
  animation: slide-in 0.3s ease;
  z-index: 1000;
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.editor-textarea.disabled {
  background: var(--bg-base);
  color: var(--text-muted);
  cursor: not-allowed;
}

.waiting-message {
  padding: 10px 16px;
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}
    `
  }
}
