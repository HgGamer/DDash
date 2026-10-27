import { useEffect, useRef, useState } from 'react';
import { TASKS_BOARD_URL, TASKS_PARTITION } from '@shared/tasks';
import { useStore } from '../store';

/** The subset of Electron's <webview> element this panel uses. */
interface BoardWebview extends HTMLElement {
  getWebContentsId(): number;
  reload(): void;
}

const POLL_MS = 10_000;

/** <webview>-only attributes React's DOM typings don't know; main forces the
 *  partition anyway (tasks-window.ts), this keeps login popups working. */
const WEBVIEW_ATTRS = { partition: TASKS_PARTITION, allowpopups: 'true' } as Record<string, string>;

/**
 * Tasks view: the claude.ai task board (what runs, what waits for you, who does
 * what) covering the whole main area, with a pop-out window. It stays mounted
 * while hidden so the activity-bar badge and the status-bar alert keep counting.
 */
export function TasksPanel({ visible }: { visible: boolean }) {
  const ref = useRef<BoardWebview | null>(null);
  const setTaskCounts = useStore((s) => s.setTaskCounts);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const wv = ref.current;
    if (!wv) return;
    const onReady = () => setReady(true);
    wv.addEventListener('dom-ready', onReady);
    return () => wv.removeEventListener('dom-ready', onReady);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    const tick = async () => {
      const wv = ref.current;
      if (!wv) return;
      try {
        const counts = await window.api.tasks.readCounts(wv.getWebContentsId());
        if (!stopped && counts) setTaskCounts(counts);
      } catch {
        /* guest reloading */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [ready, setTaskCounts]);

  return (
    <aside
      className={`tasks-panel ${visible ? '' : 'is-hidden'}`}
      aria-label="Tasks"
      aria-hidden={!visible}
    >
      <header className="tasks-panel-header">
        <h1>Tasks</h1>
        <div className="tasks-panel-actions">
          <button
            type="button"
            className="statusbar-button"
            title="Reload the board"
            onClick={() => ref.current?.reload()}
          >
            Reload
          </button>
          <button
            type="button"
            className="statusbar-button"
            title="Open the board in its own window"
            onClick={() => void window.api.tasks.openWindow()}
          >
            Open in window
          </button>
        </div>
      </header>
      <webview
        ref={ref as never}
        className="tasks-panel-view"
        src={TASKS_BOARD_URL}
        {...WEBVIEW_ATTRS}
      />
    </aside>
  );
}
