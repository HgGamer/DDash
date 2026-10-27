import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TasksPanel } from './components/TasksPanel';
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
// `?view=tasks` is the Tasks pop-out window (main/tasks-window.ts).
const standaloneTasks = new URLSearchParams(window.location.search).get('view') === 'tasks';
createRoot(container).render(
  <React.StrictMode>
    {standaloneTasks ? <TasksPanel visible standalone /> : <App />}
  </React.StrictMode>,
);
