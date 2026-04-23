import { useEffect } from 'react';
import type { ActiveSelection } from '@shared/types';
import { compositeKey } from '@shared/ipc';
import { useStore } from '../store';

/**
 * Keeps the renderer store's shell-tab list for the active selection in sync
 * with the main-process session manager, and routes `shell:exit` events.
 */
export function useShellTabs(active: ActiveSelection | null, enabled: boolean): void {
  const setShellTabsFor = useStore((s) => s.setShellTabsFor);
  const recordShellExit = useStore((s) => s.recordShellExit);

  useEffect(() => {
    if (!enabled || !active) return;
    let cancelled = false;
    const selectionKey = compositeKey(active.projectId, active.worktreeId);
    void (async () => {
      const list = await window.api.shell.list({
        projectId: active.projectId,
        worktreeId: active.worktreeId,
      });
      if (cancelled) return;
      setShellTabsFor(selectionKey, list);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, active?.projectId, active?.worktreeId, setShellTabsFor]);

  useEffect(() => {
    if (!enabled) return;
    const off = window.api.shell.onExit(({ tabId, exitCode }) => {
      const all = useStore.getState().shellTabs;
      for (const [selectionKey, entry] of Object.entries(all)) {
        if (entry.tabs.some((t) => t.tabId === tabId)) {
          recordShellExit(selectionKey, tabId, exitCode);
          break;
        }
      }
    });
    return () => off();
  }, [enabled, recordShellExit]);
}
