import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import type { Project, PtySpawnError, Worktree } from '@shared/types';
import { resolveTerminalStyleOptions } from '@shared/types';
import { compositeKey } from '@shared/ipc';
import { useStore } from '../store';

interface Props {
  project: Project;
  worktree: Worktree | null;
  active: boolean;
}

const CLAUDE_PROMPT_RE = /ask me something|Do you want to|❯\s*\d+\.\s/;

export function TerminalPane({ project, worktree, active }: Props) {
  const key = compositeKey(project.id, worktree?.id ?? null);
  const worktreeId = worktree?.id ?? null;
  const cwd = worktree?.path ?? project.path;
  const displayName = worktree ? `${project.name} · ${worktree.branch}` : project.name;

  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const spawnedRef = useRef(false);
  const upsertTab = useStore((s) => s.upsertTab);
  const tab = useStore((s) => s.tabs[key]);
  const termStyle = useStore((s) => s.terminalStyle);
  const [localError, setLocalError] = useState<PtySpawnError | null>(null);

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
      window.api.pty.write({ projectId: project.id, worktreeId, data });
    });
    const disposeResize = term.onResize(({ cols, rows }) => {
      window.api.pty.resize({ projectId: project.id, worktreeId, cols, rows });
    });

    let scanTimer: ReturnType<typeof setTimeout> | null = null;
    const scanForPrompt = () => {
      scanTimer = null;
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

    const matches = (ev: { projectId: string; worktreeId?: string | null }): boolean =>
      ev.projectId === project.id && (ev.worktreeId ?? null) === worktreeId;

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
      window.api.pty.write({ projectId: project.id, worktreeId, data: text });
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
      void (async () => {
        const res = await window.api.pty.open({ projectId: project.id, worktreeId, cols, rows });
        if (res.ok) {
          upsertTab(key, { status: 'running' });
          setLocalError(null);
          setTimeout(() => {
            safeFit();
            const t = termRef.current;
            if (t) {
              window.api.pty.resize({ projectId: project.id, worktreeId, cols: t.cols, rows: t.rows });
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
      host.removeEventListener('dragover', onDragOver);
      host.removeEventListener('drop', onDrop);
      disposeData.dispose();
      disposeResize.dispose();
      disposeWriteParsed.dispose();
      if (scanTimer) clearTimeout(scanTimer);
      offPtyData();
      offPtyExit();
      offPtyErr();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // Re-mount when the composite key changes (new worktree, etc).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

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

  const restart = async () => {
    if (!termRef.current) return;
    setLocalError(null);
    termRef.current.clear();
    termRef.current.write('\x1b[90m[starting new session…]\x1b[0m\r\n');
    const { cols, rows } = termRef.current;
    const res = await window.api.pty.open({ projectId: project.id, worktreeId, cols, rows });
    if (res.ok) {
      upsertTab(key, { status: 'running', exitCode: undefined, error: undefined });
    } else if (res.error) {
      setLocalError(res.error);
      upsertTab(key, { status: 'exited', error: res.error });
    }
  };

  const exited = tab?.status === 'exited';
  const displayedError = localError ?? tab?.error ?? null;
  const bg = resolveTerminalStyleOptions(termStyle).theme?.background;

  return (
    <div className="terminal-host" style={bg ? { background: bg } : undefined}>
      <div ref={hostRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 12 }} />
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
              useStore.getState().clearTab(key);
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
            <h3 style={{ color: 'var(--warn)' }}>Session exited</h3>
            <p>The Claude session for this {worktree ? 'worktree' : 'project'} has exited.</p>
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
