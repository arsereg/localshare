/**
 * Main Application Component
 * Provides the primary editor interface with multi-tab support
 */
import React, { useCallback, useEffect } from 'react';
import { StoreContext, useStoreProvider } from './hooks/useStore';
import TabBar from './components/TabBar';
import Editor from './components/Editor';
import StatusBar from './components/StatusBar';
import Sidebar from './components/Sidebar';
import ToastContainer from './components/ToastContainer';
import CredentialModal from './components/CredentialModal';

function AppContent() {
  const store = useStoreProvider();
  const { state, actions } = store;

  const [showCredentialModal, setShowCredentialModal] = React.useState(false);

  // Create initial tab if none exist
  useEffect(() => {
    if (state.tabs.length === 0) {
      actions.addTab({
        filename: 'untitled.js',
        content: '// Welcome to Collaborative Code Editor\n// Start typing to begin...\n\nfunction hello() {\n  console.log("Hello, World!");\n}\n\nhello();\n',
      });
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S = Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        actions.saveProject();
      }
      // Ctrl/Cmd + O = Open
      else if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        actions.loadProject();
      }
      // Ctrl/Cmd + N = New Tab
      else if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        actions.addTab();
      }
      // Ctrl/Cmd + W = Close Tab
      else if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (state.activeTabId) {
          actions.removeTab(state.activeTabId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, state.activeTabId]);

  const handleSidebarAction = useCallback((action: string) => {
    switch (action) {
      case 'new':
        actions.newProject();
        break;
      case 'open':
        actions.loadProject();
        break;
      case 'save':
        actions.saveProject();
        break;
      case 'credentials':
        setShowCredentialModal(true);
        break;
    }
  }, [actions]);

  const activeTab = state.tabs.find(t => t.id === state.activeTabId);

  return (
    <StoreContext.Provider value={store}>
      <div className="h-full flex flex-col bg-editor-bg">
        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <Sidebar onAction={handleSidebarAction} />

          {/* Editor area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab bar */}
            <TabBar />

            {/* Editor */}
            <div className="flex-1 overflow-hidden">
              {activeTab ? (
                <Editor
                  key={activeTab.id}
                  tabId={activeTab.id}
                  content={activeTab.content}
                  language={activeTab.language}
                  onChange={(content) => actions.updateTabContent(activeTab.id, content)}
                />
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">📝</div>
                  <div className="empty-state-text">No file open</div>
                  <button
                    className="btn btn-primary mt-4"
                    onClick={() => actions.addTab()}
                  >
                    Create New File
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status bar */}
        <StatusBar />

        {/* Toast notifications */}
        <ToastContainer />

        {/* Credential management modal */}
        {showCredentialModal && (
          <CredentialModal onClose={() => setShowCredentialModal(false)} />
        )}
      </div>
    </StoreContext.Provider>
  );
}

export default function App() {
  return <AppContent />;
}
