import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Service worker only in a secure context — registration over plain HTTP
// silently fails anyway, so don't even try.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
