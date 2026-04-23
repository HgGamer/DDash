import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import type { ActiveSelection, ShellTab } from '@shared/types';
import {
  INTEGRATED_TERMINAL_MAX_HEIGHT_RATIO,
  INTEGRATED_TERMINAL_MIN_HEIGHT,
  resolveTerminalStyleOptions,
} from '@shared/types';
import { compositeKey } from '@shared/ipc';
import { useStore } from '../store';

interface Props {
  active: ActiveSelection;
  height: number;
  workspaceHeight: number;
}

export function IntegratedTerminalDock({ active, height, workspaceHeight }: Props) {
  const selectionKey = compositeKey(active.projectId, active.worktreeId);
  const entry = useStore((s) => s.shellTabs[selectionKey]);
  const tabs = entry?.tabs ?? [];
  const activeTabId = entry?.activeTabId ?? null;

  const addShellTab = useStore((s) => s.addShellTab);
  const removeShellTab = useStore((s) => s.removeShellTab);
  const renameShellTab = useStore((s) => s.renameShellTab);
  const setActiveShellTab = useStore((s) => s.setActiveShellTab);

  const maxHeight = Math.max(
    INTEGRATED_TERMINAL_MIN_HEIGHT,
    Math.floor(workspaceHeight * INTEGRATED_TERMINAL_MAX_HEIGHT_RATIO),
  );
  const clampedHeight = Math.min(
    maxHeight,
    Math.max(INTEGRATED_TERMINAL_MIN_HEIGHT, height),
  );

  const [liveHeight, setLiveHeight] = useState(clampedHeight);
  useEffect(() => setLiveHeight(clampedHeight), [clampedHeight]);
  const liveHeightRef = useRef(liveHeight);
  useEffect(() => {
    liveHeightRef.current = liveHeight;
  }, [liveHeight]);

  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStateRef.current = { startY: e.clientY, startHeight: liveHeight };
      const onMove = (ev: MouseEvent) => {
        const s = dragStateRef.current;
        if (!s) return;
        // Dragging up grows the dock.
        const delta = s.startY - ev.clientY;
        const next = Math.min(maxHeight, Math.max(INTEGRATED_TERMINAL_MIN_HEIGHT, s.startHeight + delta));
        setLiveHeight(next);
      };
      const onUp = () => {
        const s = dragStateRef.current;
        dragStateRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (s) void window.api.settings.setIntegratedTerminal({ height: liveHeightRef.current });
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [liveHeight, maxHeight],
  );

  // Auto-spawn a first tab when opened with no tabs.
  useEffect(() => {
    if (tabs.length > 0) return;
    let cancelled = false;
    void (async () => {
      const tabId = crypto.randomUUID();
      const r = await window.api.shell.open({
        projectId: active.projectId,
        worktreeId: active.worktreeId,
        tabId,
        cols: 80,
        rows: 24,
      });
      if (cancelled || !r.ok) return;
      addShellTab(selectionKey, r.tab);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectionKey, tabs.length, active.projectId, active.worktreeId, addShellTab]);

  const openNewTab = useCallback(async () => {
    const tabId = crypto.randomUUID();
    const r = await window.api.shell.open({
      projectId: active.projectId,
      worktreeId: active.worktreeId,
      tabId,
      cols: 80,
      rows: 24,
    });
    if (r.ok) addShellTab(selectionKey, r.tab);
  }, [active.projectId, active.worktreeId, addShellTab, selectionKey]);

  const closeTab = useCallback(
    async (tabId: string) => {
      await window.api.shell.close({ tabId });
      removeShellTab(selectionKey, tabId);
    },
    [removeShellTab, selectionKey],
  );

  return (
    <div className="integrated-terminal-dock" style={{ height: liveHeight }}>
      <div
        className="integrated-terminal-resize-handle"
        onMouseDown={onResizeMouseDown}
        title="Drag to resize"
      />
      <TabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={(id) => setActiveShellTab(selectionKey, id)}
        onClose={(id) => void closeTab(id)}
        onRename={(id, label) => {
          renameShellTab(selectionKey, id, label);
          void window.api.shell.rename({ tabId: id, label });
        }}
        onNew={() => void openNewTab()}
      />
      <div className="integrated-terminal-body">
        {tabs.map((tab) => (
          <ShellTerminalView
            key={tab.tabId}
            tab={tab}
            active={tab.tabId === activeTabId}
            selectionKey={selectionKey}
          />
        ))}
        {tabs.length === 0 && (
          <div className="integrated-terminal-empty fg-muted">Starting shell…</div>
        )}
      </div>
    </div>
  );
}

interface TabStripProps {
  tabs: ShellTab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onNew: () => void;
}

function TabStrip({ tabs, activeTabId, onSelect, onClose, onRename, onNew }: TabStripProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');

  const commitRename = (id: string) => {
    const label = draftLabel.trim();
    if (label.length > 0) onRename(id, label);
    setEditingId(null);
  };

  return (
    <div className="it-tab-strip">
      {tabs.map((t) => {
        const isActive = t.tabId === activeTabId;
        const isEditing = editingId === t.tabId;
        const exited = t.exitCode !== null;
        return (
          <div
            key={t.tabId}
            className={`it-tab${isActive ? ' active' : ''}${exited ? ' exited' : ''}`}
            onClick={() => !isEditing && onSelect(t.tabId)}
            onDoubleClick={() => {
              setEditingId(t.tabId);
              setDraftLabel(t.label);
            }}
            title={t.cwd}
          >
            {isEditing ? (
              <input
                autoFocus
                className="it-tab-rename"
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                onBlur={() => commitRename(t.tabId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(t.tabId);
                  else if (e.key === 'Escape') setEditingId(null);
                }}
              />
            ) : (
              <>
                <span className="it-tab-label">{t.label}</span>
                <button
                  className="it-tab-close"
                  title="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(t.tabId);
                  }}
                >
                  ×
                </button>
              </>
            )}
          </div>
        );
      })}
      <button className="it-tab-new" title="New shell tab" onClick={onNew}>
        +
      </button>
    </div>
  );
}

interface ShellTerminalViewProps {
  tab: ShellTab;
  active: boolean;
  selectionKey: string;
}

function ShellTerminalView({ tab, active }: ShellTerminalViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termStyle = useStore((s) => s.terminalStyle);
  const exited = tab.exitCode !== null;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const initialStyle = resolveTerminalStyleOptions(useStore.getState().terminalStyle);
    const term = new Terminal({
      cursorBlink: initialStyle.cursorBlink ?? true,
      cursorStyle: initialStyle.cursorStyle,
      allowProposedApi: true,
      scrollback: initialStyle.scrollback ?? 10_000,
      theme: initialStyle.theme,
      fontFamily: initialStyle.fontFamily,
      fontSize: initialStyle.fontSize,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;

    const safeFit = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      try {
        fit.fit();
      } catch {
        /* no-op */
      }
    };

    const disposeData = term.onData((data) => {
      if (tab.exitCode === null) window.api.shell.write({ tabId: tab.tabId, data });
    });
    const disposeResize = term.onResize(({ cols, rows }) => {
      window.api.shell.resize({ tabId: tab.tabId, cols, rows });
    });

    const offData = window.api.shell.onData((ev) => {
      if (ev.tabId === tab.tabId) term.write(ev.data);
    });
    const offExit = window.api.shell.onExit((ev) => {
      if (ev.tabId !== tab.tabId) return;
      term.write(`\r\n\x1b[33m[process exited${
        ev.exitCode != null ? `: ${ev.exitCode}` : ''
      }]\x1b[0m\r\n`);
    });

    // Re-open to pick up the buffered replay (no-op if session already exists).
    void (async () => {
      const rect = host.getBoundingClientRect();
      const cols = rect.width > 0 ? undefined : 80;
      const rows = rect.height > 0 ? undefined : 24;
      requestAnimationFrame(() => safeFit());
      const r = await window.api.shell.open({
        projectId: tab.projectId,
        worktreeId: tab.worktreeId,
        tabId: tab.tabId,
        cols: cols ?? (term.cols || 80),
        rows: rows ?? (term.rows || 24),
        label: tab.label,
      });
      if (r.ok && r.replay.length > 0) {
        term.write(r.replay);
      }
    })();

    const observer = new ResizeObserver(() => safeFit());
    observer.observe(host);

    return () => {
      observer.disconnect();
      disposeData.dispose();
      disposeResize.dispose();
      offData();
      offExit();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [tab.tabId]);

  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term) return;
    const opts = resolveTerminalStyleOptions(termStyle);
    term.options.theme = opts.theme;
    term.options.fontFamily = opts.fontFamily;
    term.options.fontSize = opts.fontSize;
    term.options.cursorStyle = opts.cursorStyle;
    term.options.cursorBlink = opts.cursorBlink ?? true;
    if (typeof opts.scrollback === 'number') term.options.scrollback = opts.scrollback;
    try {
      fit?.fit();
    } catch {
      /* no-op */
    }
  }, [termStyle]);

  useEffect(() => {
    if (!active) return;
    const raf = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        /* no-op */
      }
      termRef.current?.focus();
    });
    const onResize = () => {
      try {
        fitRef.current?.fit();
      } catch {
        /* no-op */
      }
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [active]);

  const bg = resolveTerminalStyleOptions(termStyle).theme?.background;

  return (
    <div
      className="it-term-view"
      style={{
        display: active ? 'block' : 'none',
        background: bg,
      }}
    >
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      {exited && (
        <div className="it-exited-badge">process exited{tab.exitCode != null ? `: ${tab.exitCode}` : ''}</div>
      )}
    </div>
  );
}

export const useWorkspaceHeight = (ref: React.RefObject<HTMLElement>): number => {
  const [h, setH] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setH(el.clientHeight));
    obs.observe(el);
    setH(el.clientHeight);
    return () => obs.disconnect();
  }, [ref]);
  return h;
};
