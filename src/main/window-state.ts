import type { BrowserWindow } from 'electron';
import type { WindowState } from '@shared/types';
import type { JsonStore } from './store';

export function attachWindowStatePersistence(win: BrowserWindow, store: JsonStore): void {
  const save = () => {
    if (win.isDestroyed()) return;
    const bounds = win.getBounds();
    const next: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: win.isMaximized(),
    };
    store.update((draft) => {
      draft.window = next;
    });
  };

  let t: NodeJS.Timeout | null = null;
  const debounced = () => {
    if (t) clearTimeout(t);
    t = setTimeout(save, 300);
  };

  win.on('resize', debounced);
  win.on('move', debounced);
  win.on('maximize', save);
  win.on('unmaximize', save);
  win.on('close', save);
}
