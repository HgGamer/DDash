import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import type { IDecoration, IMarker } from 'xterm';
import { fuzzyFinder, type FuzzyResult } from '../lib/fuzzy';
import type { Project, PtySpawnError, Worktree } from '@shared/types';
import { agentKey, compositeKey } from '@shared/ipc';
import { useStore } from '../store';
import { effectiveTerminalOptions } from '../lib/theme';
import { attachTerminalClipboard } from '../lib/terminal-clipboard';

interface Props {
  project: Project;
  worktree: Worktree | null;
  active: boolean;
  /** When set, this pane runs a custom agent rather than the Claude session. */
  agentId?: string;
  /** Display label for the agent (used in status/error overlays). */
  agentLabel?: string;
}

const CLAUDE_PROMPT_RE = /ask me something|Do you want to|❯\s*\d+\.\s/;

/** A scrollback line that can match the fuzzy find. */
interface SearchLine {
  line: number;
  text: string;
}
/** Cap on rendered/navigable matches — scrollback can be tens of thousands of lines. */
const MAX_SEARCH_MATCHES = 300;

export function TerminalPane({ project, worktree, active, agentId, agentLabel }: Props) {
  const aid = agentId ?? null;
  // Selection key (Claude session / tab cleanup) vs. session key (this pane's
  // PTY + tab state — distinct per agent so agents don't clobber Claude).
  const selectionKey = compositeKey(project.id, worktree?.id ?? null);
  const key = agentKey(project.id, worktree?.id ?? null, aid);
  const worktreeId = worktree?.id ?? null;
  const cwd = worktree?.path ?? project.path;
  const sessionLabel = agentLabel ?? 'Claude';
  const displayName = worktree ? `${project.name} · ${worktree.branch}` : project.name;

  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);
  // The finder + active decoration are imperative; matched lines render as a
  // list, so they live in state. `index` is 1-based (0 = no active match).
  const finderRef = useRef<((q: string) => FuzzyResult<SearchLine>[]) | null>(null);
  const matchesRef = useRef<SearchLine[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const curRef = useRef(0);
  const decoRef = useRef<{ marker: IMarker; deco: IDecoration | undefined } | null>(null);
  const spawnedRef = useRef(false);
  const [search, setSearch] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  });
  const [results, setResults] = useState<SearchLine[]>([]);
  const upsertTab = useStore((s) => s.upsertTab);
  const tab = useStore((s) => s.tabs[key]);
  const termStyle = useStore((s) => s.terminalStyle);
  const appTheme = useStore((s) => s.theme);
  const [localError, setLocalError] = useState<PtySpawnError | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const initialStyle = effectiveTerminalOptions(
      useStore.getState().terminalStyle,
      useStore.getState().theme,
    );
    const term = new Terminal({
      cursorBlink: initialStyle.cursorBlink ?? true,
      cursorStyle: initialStyle.cursorStyle,
      allowProposedApi: true,
      scrollback: initialStyle.scrollback ?? 10_000,
      theme: initialStyle.theme,
      fontFamily: initialStyle.fontFamily,
      fontSize: initialStyle.fontSize,
      // Default the render-critical metrics — passing `undefined` here overrides
      // xterm's own defaults and yields NaN cell sizes (tiny/cramped output).
      fontWeight: initialStyle.fontWeight ?? 'normal',
      fontWeightBold: initialStyle.fontWeightBold ?? 'bold',
      lineHeight: initialStyle.lineHeight ?? 1.0,
      letterSpacing: initialStyle.letterSpacing ?? 0,
      macOptionIsMeta: initialStyle.macOptionIsMeta ?? false,
      // Light theme: force a minimum contrast so dim/gray output (incl. 256-color
      // grays the palette can't remap) stays readable on the light bg. xterm halves
      // the ratio for SGR-dim cells (DomRendererRowFactory), so 9 → dim clears ~4.5:1.
      minimumContrastRatio: useStore.getState().theme === 'light' ? 9 : 1,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // Open links in the system browser — the default handler uses window.open,
    // which is inert in the Electron renderer.
    term.loadAddon(new WebLinksAddon((_e, uri) => void window.api.docs.openExternal(uri)));
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;
    // Cmd/Ctrl+F opens the fuzzy find bar instead of reaching the PTY. It goes
    // through the clipboard helper because xterm holds a single custom key
    // handler: registering a second one here replaced the copy/paste bindings.
    const detachClipboard = attachTerminalClipboard(term, host, (e) => {
      if (e.type === 'keydown' && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        openSearch();
        return false;
      }
      return true;
    });

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
      window.api.pty.write({ projectId: project.id, worktreeId, agentId: aid, data });
    });
    const disposeResize = term.onResize(({ cols, rows }) => {
      window.api.pty.resize({ projectId: project.id, worktreeId, agentId: aid, cols, rows });
    });

    let scanTimer: ReturnType<typeof setTimeout> | null = null;
    const scanForPrompt = () => {
      scanTimer = null;
      // The prompt/attention heuristic is Claude-specific; skip for agents.
      if (aid) return;
      const cur = useStore.getState().activeId;
      const isActiveTab =
        !!cur && cur.projectId === project.id && (cur.worktreeId ?? null) === worktreeId;
      if (isActiveTab) return;
      const buf = term.buffer.active;
      const startY = Math.max(0, buf.baseY + term.rows - 20);
      let text = '';
      for (let y = startY; y < buf.baseY + term.rows; y++) {
        const line = buf.getLine(y);
        if (line) text += line.translateToString(true) + '\n';
      }
      if (CLAUDE_PROMPT_RE.test(text)) {
        const already = useStore.getState().tabs[key]?.needsAttention;
        useStore.getState().upsertTab(key, { needsAttention: true });
        if (!already) {
          window.api.notify.attention({
            projectId: project.id,
            worktreeId,
            projectName: displayName,
          });
        }
      }
    };
    const disposeWriteParsed = term.onWriteParsed(() => {
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = setTimeout(scanForPrompt, 150);
    });

    const matches = (ev: {
      projectId: string;
      worktreeId?: string | null;
      agentId?: string | null;
    }): boolean =>
      ev.projectId === project.id &&
      (ev.worktreeId ?? null) === worktreeId &&
      (ev.agentId ?? null) === aid;

    const offPtyData = window.api.pty.onData((ev) => {
      if (matches(ev)) term.write(ev.data);
    });
    const offPtyExit = window.api.pty.onExit((ev) => {
      if (!matches(ev)) return;
      term.write(`\r\n\x1b[33m[session exited${
        ev.exitCode != null ? ` (code ${ev.exitCode})` : ''
      }]\x1b[0m\r\n`);
    });
    const offPtyErr = window.api.pty.onError((ev) => {
      if (matches(ev)) setLocalError(ev.error);
    });

    upsertTab(key, { status: 'not-started' });

    const onDragOver = (e: DragEvent) => {
      const hasFiles =
        e.dataTransfer?.types?.includes('Files') ||
        Array.from(e.dataTransfer?.items ?? []).some((i) => i.kind === 'file');
      if (!hasFiles) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      const files = Array.from(e.dataTransfer.files) as Array<File & { path?: string }>;
      const paths = files.map((f) => f.path).filter((p): p is string => !!p && p.length > 0);
      if (paths.length === 0) return;
      e.preventDefault();
      const text = paths.map(shellQuote).join(' ') + ' ';
      window.api.pty.write({ projectId: project.id, worktreeId, agentId: aid, data: text });
      term.focus();
    };
    host.addEventListener('dragover', onDragOver);
    host.addEventListener('drop', onDrop);

    const observer = new ResizeObserver(() => safeFit());
    observer.observe(host);

    let attempts = 0;
    const spawnWhenSized = () => {
      if (spawnedRef.current) return;
      attempts++;
      const rect = host.getBoundingClientRect();
      const haveSize = rect.width >= 40 && rect.height >= 40;
      if (!haveSize && attempts < 20) {
        requestAnimationFrame(spawnWhenSized);
        return;
      }
      spawnedRef.current = true;
      if (haveSize) safeFit();
      const cols = term.cols || 80;
      const rows = term.rows || 24;
      // Only the primary Claude tab (no agent) asks to resume; main gates it to
      // the first spawn per key and picks the session id. Extra windows / custom
      // agents always start fresh.
      const resume = aid === null && useStore.getState().restoreSession;
      void (async () => {
        const res = await window.api.pty.open({ projectId: project.id, worktreeId, agentId: aid, resume, cols, rows });
        if (res.ok) {
          upsertTab(key, { status: 'running' });
          setLocalError(null);
          setTimeout(() => {
            safeFit();
            const t = termRef.current;
            if (t) {
              window.api.pty.resize({ projectId: project.id, worktreeId, agentId: aid, cols: t.cols, rows: t.rows });
            }
          }, 400);
        } else if (res.error) {
          setLocalError(res.error);
          upsertTab(key, { status: 'exited', error: res.error });
        }
      })();
    };
    requestAnimationFrame(spawnWhenSized);

    return () => {
      observer.disconnect();
      detachClipboard();
      host.removeEventListener('dragover', onDragOver);
      host.removeEventListener('drop', onDrop);
      disposeData.dispose();
      disposeResize.dispose();
      disposeWriteParsed.dispose();
      clearHighlight();
      if (scanTimer) clearTimeout(scanTimer);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      offPtyData();
      offPtyExit();
      offPtyErr();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      finderRef.current = null;
    };
    // Re-mount when the composite key changes (new worktree, etc).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term) return;
    const opts = effectiveTerminalOptions(termStyle, appTheme);
    term.options.theme = opts.theme;
    term.options.minimumContrastRatio = appTheme === 'light' ? 9 : 1;
    term.options.fontFamily = opts.fontFamily;
    term.options.fontSize = opts.fontSize;
    term.options.fontWeight = opts.fontWeight ?? 'normal';
    term.options.fontWeightBold = opts.fontWeightBold ?? 'bold';
    term.options.lineHeight = opts.lineHeight ?? 1.0;
    term.options.letterSpacing = opts.letterSpacing ?? 0;
    term.options.cursorStyle = opts.cursorStyle;
    term.options.cursorBlink = opts.cursorBlink ?? true;
    term.options.macOptionIsMeta = opts.macOptionIsMeta ?? false;
    if (typeof opts.scrollback === 'number') term.options.scrollback = opts.scrollback;
    try {
      fit?.fit();
    } catch {
      /* no-op */
    }
  }, [termStyle, appTheme]);

  // Keep the highlighted match visible as you navigate the results list.
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [search.index]);

  useEffect(() => {
    if (!active) return;
    const host = hostRef.current;
    const doFit = () => {
      if (!host || !fitRef.current) return;
      const rect = host.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      try {
        fitRef.current.fit();
        termRef.current?.focus();
      } catch {
        /* no-op */
      }
    };
    const raf = requestAnimationFrame(doFit);
    window.addEventListener('resize', doFit);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', doFit);
    };
  }, [active]);

  const clearHighlight = () => {
    if (!decoRef.current) return;
    decoRef.current.deco?.dispose();
    decoRef.current.marker.dispose();
    decoRef.current = null;
  };

  // Highlight the whole matched line and scroll it into view.
  // ponytail: line-level highlight, not per-char. Upgrade to per-position
  // decorations (fzf `positions`) if we want to color the matched chars.
  const gotoMatch = (i: number) => {
    const term = termRef.current;
    const matches = matchesRef.current;
    clearHighlight();
    if (!term || matches.length === 0) return;
    const idx = ((i % matches.length) + matches.length) % matches.length;
    curRef.current = idx;
    const line = matches[idx].line;
    term.scrollToLine(Math.max(0, line - 2));
    const buf = term.buffer.active;
    const marker = term.registerMarker(line - (buf.baseY + buf.cursorY));
    if (marker) {
      const accent = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-accent')
        .trim();
      const deco = term.registerDecoration({
        marker,
        width: term.cols,
        backgroundColor: accent, // xterm decorations accept only #RRGGBB
        layer: 'bottom',
      });
      decoRef.current = { marker, deco };
    }
    setSearch((s) => ({ ...s, index: idx + 1 }));
  };

  const openSearch = () => {
    const term = termRef.current;
    if (!term) return;
    const buf = term.buffer.active;
    const lines: SearchLine[] = [];
    for (let y = 0; y < buf.baseY + term.rows; y++) {
      const text = buf.getLine(y)?.translateToString(true) ?? '';
      if (text.trim()) lines.push({ line: y, text });
    }
    finderRef.current = fuzzyFinder(lines, (l) => l.text);
    setSearch({ open: true, index: 0 });
    setResults([]);
    requestAnimationFrame(() => searchInputRef.current?.select());
  };

  const runFuzzy = () => {
    const q = searchInputRef.current?.value ?? '';
    const ranked = (finderRef.current?.(q) ?? []).slice(0, MAX_SEARCH_MATCHES).map((r) => r.item);
    matchesRef.current = ranked;
    setResults(ranked);
    curRef.current = 0;
    if (ranked.length > 0) gotoMatch(0);
    else {
      clearHighlight();
      setSearch((s) => ({ ...s, index: 0 }));
    }
  };
  // Debounced so fast typing keeps the input responsive — the fuzzy pass and
  // its decoration churn only run once typing settles.
  const scheduleFuzzy = () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(runFuzzy, 90);
  };

  const closeSearch = () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    clearHighlight();
    matchesRef.current = [];
    setResults([]);
    setSearch({ open: false, index: 0 });
    termRef.current?.focus();
  };

  const restart = async () => {
    if (!termRef.current) return;
    setLocalError(null);
    termRef.current.clear();
    termRef.current.write('\x1b[90m[starting new session…]\x1b[0m\r\n');
    const { cols, rows } = termRef.current;
    const res = await window.api.pty.open({ projectId: project.id, worktreeId, agentId: aid, cols, rows });
    if (res.ok) {
      upsertTab(key, { status: 'running', exitCode: undefined, error: undefined });
    } else if (res.error) {
      setLocalError(res.error);
      upsertTab(key, { status: 'exited', error: res.error });
    }
  };

  const exited = tab?.status === 'exited';
  const displayedError = localError ?? tab?.error ?? null;
  const bg = effectiveTerminalOptions(termStyle, appTheme).theme?.background;

  return (
    <div className="terminal-host" style={bg ? { background: bg } : undefined}>
      <div ref={hostRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 12 }} />
      {search.open && (
        <div className="term-search">
          <div className="term-search-bar">
            <input
              ref={searchInputRef}
              className="field-input"
              placeholder="Fuzzy find"
              spellCheck={false}
              autoFocus
              onChange={scheduleFuzzy}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  gotoMatch(curRef.current + (e.key === 'Enter' && e.shiftKey ? -1 : 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  gotoMatch(curRef.current - 1);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  closeSearch();
                }
              }}
            />
            <span className="term-search-count">
              {results.length ? `${search.index}/${results.length}` : searchInputRef.current?.value ? '0/0' : ''}
            </span>
            <button title="Previous (↑ / ⇧⏎)" onClick={() => gotoMatch(curRef.current - 1)}>↑</button>
            <button title="Next (↓ / ⏎)" onClick={() => gotoMatch(curRef.current + 1)}>↓</button>
            <button title="Close (Esc)" onClick={closeSearch}>✕</button>
          </div>
          {results.length > 0 && (
            <ul className="term-search-results">
              {results.map((m, i) => (
                <li
                  key={m.line}
                  ref={i === search.index - 1 ? activeItemRef : null}
                  className={`term-search-item${i === search.index - 1 ? ' active' : ''}`}
                  // mousedown, not click: don't steal focus from the input.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    gotoMatch(i);
                  }}
                >
                  {m.text.trim()}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {displayedError && (
        <ErrorOverlay
          error={displayedError}
          path={cwd}
          isWorktree={!!worktree}
          onRetry={restart}
          onRemove={async () => {
            if (worktree) {
              const r = await window.api.worktrees.remove({
                projectId: project.id,
                worktreeId: worktree.id,
                force: false,
              });
              if (!r.ok) {
                window.alert(`Failed to remove worktree:\n${r.error}`);
                return;
              }
              useStore.getState().clearTab(selectionKey);
              const list = await window.api.projects.list();
              useStore.getState().setProjects(list);
              const proj = list.find((p) => p.id === project.id);
              useStore
                .getState()
                .setActive(
                  proj ? { projectId: proj.id, worktreeId: proj.worktrees[0]?.id ?? null } : null,
                );
            } else {
              const r = await window.api.projects.remove(project.id);
              if (!r.ok) {
                window.alert(
                  'Some worktrees could not be removed:\n' +
                    r.errors.map((e) => `• ${e.worktreeId}: ${e.message}`).join('\n'),
                );
                return;
              }
              useStore.getState().clearProjectAndWorktrees(project.id);
              const list = await window.api.projects.list();
              useStore.getState().setProjects(list);
              useStore
                .getState()
                .setActive(list[0] ? { projectId: list[0].id, worktreeId: null } : null);
            }
          }}
        />
      )}
      {!displayedError && exited && (
        <div className="error-overlay">
          <div className="error-card">
            <h3 style={{ color: 'var(--color-warn)' }}>Session exited</h3>
            <p>The {sessionLabel} session for this {worktree ? 'worktree' : 'project'} has exited.</p>
            <div className="actions">
              <button onClick={restart}>Start new session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function shellQuote(p: string): string {
  if (/^[A-Za-z0-9@%+=:,./_-]+$/.test(p)) return p;
  return `'${p.replace(/'/g, "'\\''")}'`;
}

function ErrorOverlay(props: {
  error: PtySpawnError;
  path: string;
  isWorktree: boolean;
  onRetry: () => void;
  onRemove: () => void;
}) {
  if (props.error.kind === 'path-missing') {
    return (
      <div className="error-overlay">
        <div className="error-card">
          <h3>{props.isWorktree ? 'Worktree path not found' : 'Project path not found'}</h3>
          <p>
            The directory <code>{props.path}</code> does not exist or is not a directory.
            It may have been moved, renamed, or deleted.
          </p>
          <div className="actions">
            <button onClick={props.onRetry}>Retry</button>
            <button className="danger" onClick={props.onRemove}>
              {props.isWorktree ? 'Remove worktree' : 'Remove project'}
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="error-overlay">
      <div className="error-card">
        <h3>Claude not found</h3>
        <p>
          The <code>claude</code> CLI could not be located on your <code>PATH</code>.
        </p>
        <p>
          Install Claude Code by following the{' '}
          <a href={props.error.installUrl} target="_blank" rel="noreferrer">
            quickstart guide
          </a>
          , then click Retry.
        </p>
        <div className="actions">
          <button onClick={props.onRetry}>Retry</button>
        </div>
      </div>
    </div>
  );
}
