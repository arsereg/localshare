/**
 * Tab Bar Component
 * Displays open document tabs with drag-to-reorder support
 */
import React, { useCallback, useState } from 'react';
import { useStore } from '../hooks/useStore';

export default function TabBar() {
  const { state, actions } = useStore();
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleTabClick = useCallback((tabId: string) => {
    actions.setActiveTab(tabId);
  }, [actions]);

  const handleTabClose = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const tab = state.tabs.find(t => t.id === tabId);

    if (tab?.isDirty) {
      // In production, would show a confirmation dialog
      const confirmed = confirm(`${tab.filename} has unsaved changes. Close anyway?`);
      if (!confirmed) return;
    }

    actions.removeTab(tabId);
  }, [actions, state.tabs]);

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    setDraggedTab(tabId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();

    if (!draggedTab || draggedTab === targetTabId) {
      setDraggedTab(null);
      return;
    }

    const tabs = [...state.tabs];
    const draggedIndex = tabs.findIndex(t => t.id === draggedTab);
    const targetIndex = tabs.findIndex(t => t.id === targetTabId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTab(null);
      return;
    }

    // Reorder tabs
    const [removed] = tabs.splice(draggedIndex, 1);
    tabs.splice(targetIndex, 0, removed);

    // Update state through dispatch
    const { dispatch } = useStore();
    dispatch({ type: 'REORDER_TABS', payload: tabs });

    setDraggedTab(null);
  }, [draggedTab, state.tabs]);

  const handleDragEnd = useCallback(() => {
    setDraggedTab(null);
  }, []);

  const handleDoubleClick = useCallback((tabId: string, filename: string) => {
    setEditingTabId(tabId);
    setEditValue(filename);
  }, []);

  const handleRenameSubmit = useCallback((tabId: string) => {
    if (editValue.trim()) {
      actions.renameTab(tabId, editValue.trim());
    }
    setEditingTabId(null);
    setEditValue('');
  }, [actions, editValue]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent, tabId: string) => {
    if (e.key === 'Enter') {
      handleRenameSubmit(tabId);
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
      setEditValue('');
    }
  }, [handleRenameSubmit]);

  const handleAddTab = useCallback(() => {
    actions.addTab();
  }, [actions]);

  // Warning when approaching tab limit
  const tabCount = state.tabs.length;
  const showWarning = tabCount >= 18;

  return (
    <div className="tab-bar">
      {state.tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === state.activeTabId ? 'active' : ''} ${
            draggedTab === tab.id ? 'opacity-50' : ''
          }`}
          onClick={() => handleTabClick(tab.id)}
          onDoubleClick={() => handleDoubleClick(tab.id, tab.filename)}
          draggable
          onDragStart={(e) => handleDragStart(e, tab.id)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, tab.id)}
          onDragEnd={handleDragEnd}
        >
          {editingTabId === tab.id ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => handleRenameSubmit(tab.id)}
              onKeyDown={(e) => handleRenameKeyDown(e, tab.id)}
              className="bg-transparent border-none outline-none text-white text-sm w-full"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <span className="tab-filename">{tab.filename}</span>
              {tab.isDirty && <span className="tab-dirty">*</span>}
              <button
                className="tab-close"
                onClick={(e) => handleTabClose(e, tab.id)}
                title="Close tab"
              >
                ×
              </button>
            </>
          )}
        </div>
      ))}

      {/* Add tab button */}
      <button
        className="flex items-center justify-center w-8 h-full text-gray-500 hover:text-white hover:bg-editor-active transition-colors"
        onClick={handleAddTab}
        disabled={tabCount >= 20}
        title={tabCount >= 20 ? 'Maximum tabs reached' : 'New tab'}
      >
        +
      </button>

      {/* Tab limit warning */}
      {showWarning && (
        <div className="flex items-center px-3 text-xs text-yellow-500">
          {20 - tabCount} tabs remaining
        </div>
      )}
    </div>
  );
}
