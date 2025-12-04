/**
 * Sidebar Component
 * Provides quick access buttons for common actions
 */

interface SidebarProps {
  onAction: (action: string) => void;
}

export default function Sidebar({ onAction }: SidebarProps) {
  return (
    <div className="sidebar">
      {/* New project */}
      <button
        className="sidebar-btn"
        onClick={() => onAction('new')}
        data-tooltip="New Project"
        title="New Project (Ctrl+Shift+N)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      </button>

      {/* Open project */}
      <button
        className="sidebar-btn"
        onClick={() => onAction('open')}
        data-tooltip="Open Project"
        title="Open Project (Ctrl+O)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {/* Save project */}
      <button
        className="sidebar-btn"
        onClick={() => onAction('save')}
        data-tooltip="Save Project"
        title="Save Project (Ctrl+S)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Credentials/Share */}
      <button
        className="sidebar-btn"
        onClick={() => onAction('credentials')}
        data-tooltip="Manage Access"
        title="Manage Guest Access"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </button>
    </div>
  );
}
