import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, loadTheme } from './lib/theme';
import './styles/tokens.css';
import './styles.css';
import './styles/components.css';
import 'xterm/css/xterm.css';

// Apply the persisted UI theme before the first paint to avoid a flash.
applyTheme(loadTheme());

// Mark macOS so the CSS can go transparent and let the native window vibrancy
// (see main/index.ts) show through the chrome. Non-mac keeps solid backgrounds.
if (navigator.platform.startsWith('Mac')) {
  document.documentElement.classList.add('is-mac');
}

const container = document.getElementById('root');
if (!container) throw new Error('root element missing');
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
