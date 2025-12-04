/**
 * Collaboration Server
 * Handles WebSocket connections, authentication, and real-time document synchronization
 */
import express, { Express, Request, Response } from 'express';
import { createServer, Server as HttpServer } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { WebSocket, WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { generateCertificate, CertificateResult } from './tls';
import { AuthManager, AuthResult } from './auth';
import * as path from 'path';
import * as fs from 'fs';

// Port ranges to avoid
const AVOIDED_PORTS = new Set([
  // System reserved
  ...Array.from({ length: 1024 }, (_, i) => i),
  // Common dev ports
  3000, 3001, 5000, 5001, 8000, 8080, 8443, 4200,
  // Database ports
  5432, 3306, 27017, 6379,
]);

/**
 * Message types for WebSocket communication
 */
interface WSMessage {
  type: string;
  payload?: unknown;
}

interface SyncMessage extends WSMessage {
  type: 'sync';
  payload: {
    docId: string;
    update: Uint8Array;
  };
}

interface AuthMessage extends WSMessage {
  type: 'auth';
  payload: {
    username: string;
    pin: string;
  };
}

interface DocRequestMessage extends WSMessage {
  type: 'doc-request';
  payload: {
    docId: string;
  };
}

/**
 * Connected client information
 */
interface ConnectedClient {
  ws: WebSocket;
  username: string;
  authenticated: boolean;
  subscribedDocs: Set<string>;
}

/**
 * Collaboration Server Class
 */
export class CollabServer {
  private app: Express;
  private server: HttpServer | HttpsServer | null = null;
  private wss: WebSocketServer | null = null;
  private port: number = 0;
  private authManager: AuthManager;
  private documents: Map<string, Y.Doc> = new Map();
  private clients: Map<WebSocket, ConnectedClient> = new Map();
  private useTls: boolean = false;
  private tlsCert: CertificateResult | null = null;

  constructor() {
    this.app = express();
    this.authManager = new AuthManager();
    this.setupExpressRoutes();
  }

  /**
   * Sets up Express routes for HTTP endpoints
   */
  private setupExpressRoutes(): void {
    this.app.use(express.json());

    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        connectedClients: this.clients.size,
        documents: this.documents.size,
      });
    });

    // Serve guest client page
    this.app.get('/', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../../dist/guest.html'));
    });

    // Serve static assets
    this.app.use(express.static(path.join(__dirname, '../../dist')));
  }

  /**
   * Selects an available port using the specified algorithm
   */
  private async selectPort(maxRetries: number = 10): Promise<number> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Generate random port in range 10000-60000
      const port = Math.floor(Math.random() * 50000) + 10000;

      if (AVOIDED_PORTS.has(port)) {
        continue;
      }

      // Try to bind to the port
      const available = await this.isPortAvailable(port);
      if (available) {
        return port;
      }
    }

    throw new Error(
      `Failed to find available port after ${maxRetries} attempts. ` +
      'Please specify a port manually.'
    );
  }

  /**
   * Checks if a port is available
   */
  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const testServer = createServer();

      testServer.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      });

      testServer.once('listening', () => {
        testServer.close(() => {
          resolve(true);
        });
      });

      testServer.listen(port, '0.0.0.0');
    });
  }

  /**
   * Starts the collaboration server
   */
  async start(): Promise<{ port: number; addresses: string[] }> {
    if (this.server) {
      throw new Error('Server is already running');
    }

    // Select port
    this.port = await this.selectPort();

    // Try to set up TLS
    try {
      this.tlsCert = await generateCertificate();
      this.useTls = true;
      this.server = createHttpsServer(
        {
          key: this.tlsCert.privateKey,
          cert: this.tlsCert.certificate,
        },
        this.app
      );
      console.log('TLS enabled with self-signed certificate');
    } catch (error) {
      console.warn('TLS setup failed, falling back to HTTP:', error);
      this.useTls = false;
      this.server = createServer(this.app);
    }

    // Set up WebSocket server
    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocketHandlers();

    // Start listening
    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, '0.0.0.0', () => {
        const addresses = this.getNetworkAddresses();
        console.log(`Server listening on port ${this.port}`);
        console.log(`Network addresses: ${addresses.join(', ')}`);
        resolve({ port: this.port, addresses });
      });

      this.server!.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Stops the collaboration server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all client connections
      for (const [ws] of this.clients) {
        ws.close(1000, 'Server shutting down');
      }
      this.clients.clear();

      // Clear documents
      this.documents.clear();

      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
        this.wss = null;
      }

      // Close HTTP server
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.port = 0;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Gets the current server status
   */
  getStatus(): {
    running: boolean;
    port?: number;
    addresses?: string[];
    connectedClients?: number;
    useTls?: boolean;
  } {
    if (!this.server) {
      return { running: false };
    }

    return {
      running: true,
      port: this.port,
      addresses: this.getNetworkAddresses(),
      connectedClients: this.clients.size,
      useTls: this.useTls,
    };
  }

  /**
   * Gets local network addresses
   */
  private getNetworkAddresses(): string[] {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(iface.address);
        }
      }
    }

    return addresses;
  }

  /**
   * Sets up WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New client connected');

      // Initialize client state
      const client: ConnectedClient = {
        ws,
        username: '',
        authenticated: false,
        subscribedDocs: new Set(),
      };
      this.clients.set(ws, client);

      // Send authentication challenge
      this.sendMessage(ws, {
        type: 'auth-required',
        payload: { message: 'Please authenticate with username and PIN' },
      });

      // Handle messages
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WSMessage;
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('Failed to parse message:', error);
          this.sendMessage(ws, {
            type: 'error',
            payload: { message: 'Invalid message format' },
          });
        }
      });

      // Handle disconnect
      ws.on('close', () => {
        console.log('Client disconnected');
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
  }

  /**
   * Handles incoming WebSocket messages
   */
  private handleMessage(ws: WebSocket, message: WSMessage): void {
    const client = this.clients.get(ws);
    if (!client) return;

    switch (message.type) {
      case 'auth':
        this.handleAuth(ws, client, message as AuthMessage);
        break;

      case 'doc-request':
        if (!client.authenticated) {
          this.sendMessage(ws, {
            type: 'error',
            payload: { message: 'Not authenticated' },
          });
          return;
        }
        this.handleDocRequest(ws, client, message as DocRequestMessage);
        break;

      case 'sync':
        if (!client.authenticated) {
          this.sendMessage(ws, {
            type: 'error',
            payload: { message: 'Not authenticated' },
          });
          return;
        }
        this.handleSync(ws, client, message as SyncMessage);
        break;

      case 'awareness':
        if (!client.authenticated) return;
        this.broadcastAwareness(ws, message);
        break;

      default:
        this.sendMessage(ws, {
          type: 'error',
          payload: { message: `Unknown message type: ${message.type}` },
        });
    }
  }

  /**
   * Handles authentication requests
   */
  private handleAuth(ws: WebSocket, client: ConnectedClient, message: AuthMessage): void {
    const { username, pin } = message.payload;
    const result = this.authManager.authenticate(username, pin);

    if (result.success) {
      client.authenticated = true;
      client.username = username;

      this.sendMessage(ws, {
        type: 'auth-success',
        payload: { username },
      });

      console.log(`Client authenticated: ${username}`);
    } else {
      this.sendMessage(ws, {
        type: 'auth-failure',
        payload: {
          message: result.message,
          retriesRemaining: result.retriesRemaining,
          lockoutUntil: result.lockoutUntil,
        },
      });
    }
  }

  /**
   * Handles document requests
   */
  private handleDocRequest(ws: WebSocket, client: ConnectedClient, message: DocRequestMessage): void {
    const { docId } = message.payload;

    // Get or create document
    let doc = this.documents.get(docId);
    if (!doc) {
      doc = new Y.Doc();
      this.documents.set(docId, doc);
    }

    // Subscribe client to document updates
    client.subscribedDocs.add(docId);

    // Send current document state
    const state = Y.encodeStateAsUpdate(doc);
    this.sendMessage(ws, {
      type: 'doc-state',
      payload: {
        docId,
        state: Array.from(state),
      },
    });
  }

  /**
   * Handles sync updates
   */
  private handleSync(_ws: WebSocket, client: ConnectedClient, message: SyncMessage): void {
    const { docId, update } = message.payload;

    // Get document
    const doc = this.documents.get(docId);
    if (!doc) {
      return;
    }

    // Apply update
    const updateArray = new Uint8Array(update);
    Y.applyUpdate(doc, updateArray);

    // Broadcast to other subscribed clients
    for (const [clientWs, clientInfo] of this.clients) {
      if (clientInfo.subscribedDocs.has(docId) && clientInfo.authenticated) {
        // Don't send back to the originator
        if (clientWs !== client.ws) {
          this.sendMessage(clientWs, {
            type: 'sync',
            payload: {
              docId,
              update: Array.from(updateArray),
            },
          });
        }
      }
    }
  }

  /**
   * Broadcasts awareness updates to other clients
   */
  private broadcastAwareness(senderWs: WebSocket, message: WSMessage): void {
    for (const [ws, client] of this.clients) {
      if (ws !== senderWs && client.authenticated) {
        this.sendMessage(ws, message);
      }
    }
  }

  /**
   * Sends a message to a WebSocket client
   */
  private sendMessage(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // Credential management methods (delegated to AuthManager)

  createCredential(username: string): { success: boolean; pin?: string; error?: string } {
    return this.authManager.createCredential(username);
  }

  revokeCredential(username: string): { success: boolean; error?: string } {
    return this.authManager.revokeCredential(username);
  }

  listCredentials(): { success: boolean; credentials: Array<{ username: string; createdAt: Date }> } {
    return this.authManager.listCredentials();
  }

  /**
   * Updates the shared document state (called from main user's editor)
   */
  updateDocument(docId: string, content: string): void {
    let doc = this.documents.get(docId);
    if (!doc) {
      doc = new Y.Doc();
      this.documents.set(docId, doc);
    }

    const text = doc.getText('content');
    doc.transact(() => {
      text.delete(0, text.length);
      text.insert(0, content);
    });

    // Broadcast update to all subscribed clients
    const update = Y.encodeStateAsUpdate(doc);
    for (const [ws, client] of this.clients) {
      if (client.subscribedDocs.has(docId) && client.authenticated) {
        this.sendMessage(ws, {
          type: 'sync',
          payload: {
            docId,
            update: Array.from(update),
          },
        });
      }
    }
  }

  /**
   * Gets the current content of a document
   */
  getDocumentContent(docId: string): string | null {
    const doc = this.documents.get(docId);
    if (!doc) return null;
    return doc.getText('content').toString();
  }
}
