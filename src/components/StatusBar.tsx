/**
 * Status Bar Component
 * Displays server status, language, line info, and save status
 */
import { useCallback, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { getLanguageDisplayName } from '../utils/languageDetection';

export default function StatusBar() {
  const { state, actions } = useStore();
  const [showConnectionInfo, setShowConnectionInfo] = useState(false);

  const activeTab = state.tabs.find(t => t.id === state.activeTabId);

  const handleCopyConnectionUrl = useCallback(async () => {
    if (!state.serverStatus.running || !state.serverStatus.port) return;

    const addresses = state.serverStatus.addresses || [];
    const protocol = state.serverStatus.useTls ? 'https' : 'http';
    const url = addresses.length > 0
      ? `${protocol}://${addresses[0]}:${state.serverStatus.port}`
      : `${protocol}://localhost:${state.serverStatus.port}`;

    try {
      await navigator.clipboard.writeText(url);
      actions.showToast('success', 'Connection URL copied to clipboard');
    } catch (error) {
      actions.showToast('error', 'Failed to copy URL');
    }
  }, [state.serverStatus, actions]);

  const formatLastSaved = useCallback((date: Date | null) => {
    if (!date) return 'Never';

    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return date.toLocaleTimeString();
  }, []);

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {/* Server status */}
        <div
          className="status-item clickable"
          onClick={() => setShowConnectionInfo(!showConnectionInfo)}
          title={state.serverStatus.running ? 'Click for connection info' : 'Server not running'}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              state.serverStatus.running ? 'bg-green-400' : 'bg-red-400'
            }`}
          />
          <span>
            {state.serverStatus.running
              ? `Server: ${state.serverStatus.port}`
              : 'Server: Offline'}
          </span>
          {state.serverStatus.running && state.serverStatus.connectedClients !== undefined && (
            <span className="opacity-75">
              ({state.serverStatus.connectedClients} connected)
            </span>
          )}
        </div>

        {/* Connection info popup */}
        {showConnectionInfo && state.serverStatus.running && (
          <div
            className="absolute bottom-6 left-2 bg-editor-sidebar border border-editor-border rounded p-3 shadow-lg z-50"
            style={{ minWidth: '250px' }}
          >
            <div className="text-sm mb-2 font-medium">Connection Info</div>
            <div className="text-xs space-y-1 mb-3">
              <div>Protocol: {state.serverStatus.useTls ? 'HTTPS (TLS)' : 'HTTP'}</div>
              <div>Port: {state.serverStatus.port}</div>
              {state.serverStatus.addresses?.map((addr) => (
                <div key={addr}>IP: {addr}</div>
              ))}
            </div>
            <button
              className="btn btn-primary btn-sm w-full"
              onClick={(e) => {
                e.stopPropagation();
                handleCopyConnectionUrl();
                setShowConnectionInfo(false);
              }}
            >
              Copy URL
            </button>
          </div>
        )}

        {/* Save status */}
        <div className="status-item">
          {state.isSaving ? (
            <>
              <div className="spinner" style={{ width: 12, height: 12 }} />
              <span>Saving...</span>
            </>
          ) : (
            <span>Saved: {formatLastSaved(state.lastSaved)}</span>
          )}
        </div>
      </div>

      <div className="status-bar-right">
        {activeTab && (
          <>
            {/* Language */}
            <div className="status-item" title="Detected language">
              {getLanguageDisplayName(activeTab.language)}
            </div>

            {/* File status */}
            {activeTab.isDirty && (
              <div className="status-item text-yellow-300">
                Modified
              </div>
            )}
          </>
        )}

        {/* Project name */}
        <div className="status-item">
          {state.projectName}
        </div>
      </div>
    </div>
  );
}
