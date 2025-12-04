/**
 * Guest client entry point
 * For browser-based guest users connecting to the collaboration server
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import GuestApp from './GuestApp';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <GuestApp />
  </React.StrictMode>
);
