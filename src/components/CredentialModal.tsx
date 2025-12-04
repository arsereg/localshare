/**
 * Credential Management Modal
 * Allows main user to create and revoke guest credentials
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useStore } from '../hooks/useStore';

interface CredentialModalProps {
  onClose: () => void;
}

export default function CredentialModal({ onClose }: CredentialModalProps) {
  const { state, actions } = useStore();
  const [newUsername, setNewUsername] = useState('');
  const [createdPin, setCreatedPin] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Refresh credentials on mount
  useEffect(() => {
    actions.refreshCredentials();
  }, [actions]);

  const handleCreate = useCallback(async () => {
    if (!newUsername.trim()) {
      actions.showToast('error', 'Please enter a username');
      return;
    }

    setIsCreating(true);
    const result = await actions.createCredential(newUsername.trim());
    setIsCreating(false);

    if (result.success && result.pin) {
      setCreatedPin(result.pin);
      setNewUsername('');
    }
  }, [newUsername, actions]);

  const handleRevoke = useCallback(async (username: string) => {
    const confirmed = confirm(`Are you sure you want to revoke access for "${username}"?`);
    if (confirmed) {
      await actions.revokeCredential(username);
    }
  }, [actions]);

  const handleCopyCredentials = useCallback(async (username: string, pin: string) => {
    const text = `Username: ${username}\nPIN: ${pin}`;
    try {
      await navigator.clipboard.writeText(text);
      actions.showToast('success', 'Credentials copied to clipboard');
    } catch {
      actions.showToast('error', 'Failed to copy credentials');
    }
  }, [actions]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isCreating) {
      handleCreate();
    }
  }, [handleCreate, isCreating]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Manage Guest Access</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Server status warning */}
        {!state.serverStatus.running && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded p-3 mb-4 text-yellow-200 text-sm">
            Server is not running. Guest access will not work until the server is started.
          </div>
        )}

        {/* Connection info */}
        {state.serverStatus.running && (
          <div className="bg-blue-900/30 border border-blue-700 rounded p-3 mb-4 text-sm">
            <div className="font-medium text-blue-200 mb-1">Share this with guests:</div>
            <div className="text-blue-100">
              {state.serverStatus.useTls ? 'https' : 'http'}://
              {state.serverStatus.addresses?.[0] || 'localhost'}:
              {state.serverStatus.port}
            </div>
          </div>
        )}

        {/* Create new credential */}
        <div className="form-group">
          <label className="form-label">Create New Credential</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="form-input flex-1"
              placeholder="Enter username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isCreating || state.credentials.length >= 10}
            />
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={isCreating || !newUsername.trim() || state.credentials.length >= 10}
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
          {state.credentials.length >= 10 && (
            <div className="text-sm text-yellow-500 mt-2">
              Maximum of 10 credentials reached. Revoke some to create new ones.
            </div>
          )}
        </div>

        {/* Show newly created PIN */}
        {createdPin && (
          <div className="bg-green-900/30 border border-green-700 rounded p-3 mb-4">
            <div className="font-medium text-green-200 mb-1">Credential Created!</div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Username: <span className="font-mono">{state.credentials[state.credentials.length - 1]?.username}</span></div>
                <div className="text-sm">PIN: <span className="font-mono text-lg">{createdPin}</span></div>
              </div>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => handleCopyCredentials(
                  state.credentials[state.credentials.length - 1]?.username || '',
                  createdPin
                )}
              >
                Copy
              </button>
            </div>
            <div className="text-xs text-green-300 mt-2">
              Share these credentials with your guest. The PIN will not be shown again.
            </div>
            <button
              className="btn btn-sm btn-secondary mt-2"
              onClick={() => setCreatedPin(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Credential list */}
        <div className="form-group">
          <label className="form-label">
            Active Credentials ({state.credentials.length}/10)
          </label>
          {state.credentials.length === 0 ? (
            <div className="text-sm text-gray-500 py-4 text-center">
              No credentials created yet. Create one above to allow guests to connect.
            </div>
          ) : (
            <ul className="credential-list">
              {state.credentials.map((cred) => (
                <li key={cred.username} className="credential-item">
                  <div className="credential-info">
                    <span className="credential-username">{cred.username}</span>
                    <span className="credential-date">
                      Created: {new Date(cred.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleRevoke(cred.username)}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Help text */}
        <div className="text-xs text-gray-500 mt-4">
          <strong>How it works:</strong>
          <ul className="list-disc ml-4 mt-1 space-y-1">
            <li>Create a credential with a username</li>
            <li>Share the username, PIN, and connection URL with your guest</li>
            <li>Guest opens the URL in their browser and enters credentials</li>
            <li>They can now see and edit the shared documents</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
