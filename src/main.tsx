/**
 * Main entry point for the Electron renderer process
 * Initializes React and renders the main application
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Ensure root element exists
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

// Create React root and render
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
