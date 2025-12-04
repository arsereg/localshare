# Collaborative Code Editor

A real-time collaborative code editor built with Electron, featuring multi-tab support, syntax highlighting, and secure local network sharing.

## Features

- **Multi-tab Editor** - Open and edit multiple files simultaneously with support for drag-to-reorder tabs
- **Syntax Highlighting** - Support for JavaScript, TypeScript, Python, Java, C/C++, HTML, CSS, JSON, and Markdown
- **Language Detection** - Automatic language detection based on file extension and content heuristics
- **Real-time Collaboration** - Share your editing session with guests on your local network
- **Secure Authentication** - Credential-based guest access with username and 6-digit PIN
- **TLS Encryption** - Automatic self-signed certificate generation for secure WebSocket connections
- **Auto-save** - Automatic project saving after 2 seconds of inactivity
- **Local File Persistence** - Save and load projects in JSON format

## Tech Stack

- **Desktop Runtime**: Electron
- **Backend Runtime**: Bun/Node.js
- **HTTP Server**: Express.js
- **Real-time Communication**: WebSocket (ws library)
- **UI Framework**: React
- **Code Editor**: CodeMirror 6
- **State Synchronization**: Yjs (CRDT)
- **Styling**: Tailwind CSS

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ELECTRON APP                         │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │   Main Process  │    │      Renderer Process       │ │
│  │  ┌───────────┐  │    │  ┌───────────────────────┐  │ │
│  │  │  Express  │◄─┼────┼──│   Editor UI (React)   │  │ │
│  │  │  Server   │  │IPC │  └───────────────────────┘  │ │
│  │  └─────┬─────┘  │    │                             │ │
│  └────────┼────────┘    └─────────────────────────────┘ │
└───────────┼─────────────────────────────────────────────┘
            │ WebSocket (wss://)
            ▼
    ┌───────────────┐
    │  Guest Users  │
    │  (Browsers)   │
    └───────────────┘
```

## Installation

```bash
# Install dependencies
npm install

# Build the application
npm run build

# Start the application
npm start
```

## Development

```bash
# Start Vite dev server
npm run dev

# In another terminal, start Electron
npm run electron:watch
```

## Project Structure

```
collab-editor/
├── electron/               # Electron main process
│   ├── main.ts            # Main entry point
│   ├── preload.ts         # Preload script for IPC
│   └── server/            # Collaboration server
│       ├── index.ts       # Express + WebSocket server
│       ├── auth.ts        # Authentication manager
│       └── tls.ts         # TLS certificate generation
├── src/                   # React renderer process
│   ├── main.tsx          # Main entry point
│   ├── App.tsx           # Main application component
│   ├── components/       # UI components
│   ├── hooks/            # React hooks (state management)
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Utility functions
├── dist/                  # Built renderer files
├── dist-electron/        # Built Electron files
└── package.json
```

## Usage

### Main User

1. Launch the application
2. The collaboration server starts automatically on a random port (10000-60000)
3. Create documents using the tab interface
4. Click the "Manage Access" button in the sidebar to create guest credentials
5. Share the connection URL and credentials with guests

### Guest User

1. Open the shared URL in a web browser
2. Enter the username and PIN provided by the host
3. You can now view and edit shared documents in real-time

## Security Features

- **Credential-based Authentication**: 6-digit PIN with lockout after 3 failed attempts
- **TLS Encryption**: Self-signed certificates for secure WebSocket connections
- **In-memory Credentials**: Credentials are not persisted to disk
- **Input Validation**: All inputs are sanitized to prevent injection attacks

## File Format

Projects are saved in JSON format with the `.collab` extension:

```json
{
  "version": "1.0",
  "projectName": "My Project",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "tabs": [
    {
      "id": "uuid",
      "filename": "main.js",
      "language": "javascript",
      "content": "// Your code here"
    }
  ]
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+S | Save project |
| Ctrl+O | Open project |
| Ctrl+N | New tab |
| Ctrl+W | Close tab |

## Known Limitations

- Maximum of 20 tabs per session
- Maximum of 10 concurrent guest credentials
- Self-signed certificates may trigger browser warnings for guests

## License

MIT
