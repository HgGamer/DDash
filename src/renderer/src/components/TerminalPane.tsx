import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import type { Project, PtySpawnError } from '@shared/types';
import { useStore } from '../store';

interface Props {
  project: Project;
  active: boolean;
}

export function TerminalPane({ project, active }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const spawnedRef = useRef(false);
  const upsertTab = useStore((s) => s.upsertTab);
  const tab = useStore((s) => s.tabs[project.id]);
  const [localError, setLocalError] = useState<PtySpawnError | null>(null);

  // Mount the xterm instance once per project. Even when this pane is hidden
  // (active=false) the terminal stays alive in the DOM so its PTY keeps
  // producing output and scrollback is preserved.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily:
        '"SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      theme: { background: '#000000' },
      allowProposedApi: true,
      scrollback: 10_000,
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
      window.api.pty.write({ projectId: project.id, data });
    });
    const disposeResize = term.onResize(({ cols, rows }) => {
      window.api.pty.resize({ projectId: project.id, cols, rows });
    });

    // Subscribe to this project's PTY output.
    const offPtyData = window.api.pty.onData((ev) => {
      if (ev.projectId === project.id) term.write(ev.data);
    });
    const offPtyExit = window.api.pty.onExit((ev) => {
      if (ev.projectId !== project.id) return;
      term.write(`\r\n\x1b[33m[session exited${
        ev.exitCode != null ? ` (code ${ev.exitCode})` : ''
      }]\x1b[0m\r\n`);
    });
    const offPtyErr = window.api.pty.onError((ev) => {
      if (ev.projectId === project.id) setLocalError(ev.error);
    });

    upsertTab(project.id, { status: 'not-started' });

    // Watch host size. Also used to know when we have real dimensions.
    const observer = new ResizeObserver(() => safeFit());
    observer.observe(host);

    // Defer first fit + PTY spawn until layout is settled. Give up after a
    // handful of frames and spawn with a default 80×24 — it's better to have
    // a live session at a slightly-wrong size than no session at all.
    let attempts = 0;
    const spawnWhenSized = () => {
      if (spawnedRef.current) return;
      attempts++;
      const rect = host.getBoundingClientRect();
      const haveSize = rect.width >= 40 && rect.height >= 40;
      // eslint-disable-next-line no-console
      console.log(
        `[term:${project.id.slice(0, 6)}] spawnWhenSized attempt=${attempts} size=${rect.width}x${rect.height} haveSize=${haveSize}`,
      );
      if (!haveSize && attempts < 20) {
        requestAnimationFrame(spawnWhenSized);
        return;
      }
      spawnedRef.current = true;
      if (haveSize) safeFit();
      const cols = term.cols || 80;
      const rows = term.rows || 24;
      // eslint-disable-next-line no-console
      console.log(`[term:${project.id.slice(0, 6)}] opening pty cols=${cols} rows=${rows}`);
      void (async () => {
        const res = await window.api.pty.open({ projectId: project.id, cols, rows });
        // eslint-disable-next-line no-console
        console.log(`[term:${project.id.slice(0, 6)}] pty.open result`, res);
        if (res.ok) {
          upsertTab(project.id, { status: 'running' });
          setLocalError(null);
        } else if (res.error) {
          setLocalError(res.error);
          upsertTab(project.id, { status: 'exited', error: res.error });
        }
      })();
    };
    requestAnimationFrame(spawnWhenSized);

    return () => {
      observer.disconnect();
      disposeData.dispose();
      disposeResize.dispose();
      offPtyData();
      offPtyExit();
      offPtyErr();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // Intentionally only depends on project.id — we mount exactly once per project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // Re-fit + focus whenever this pane becomes active.
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
    // Next frame so CSS visibility change has taken effect.
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
    const res = await window.api.pty.open({ projectId: project.id, cols, rows });
    if (res.ok) {
      upsertTab(project.id, { status: 'running', exitCode: undefined, error: undefined });
    } else if (res.error) {
      setLocalError(res.error);
      upsertTab(project.id, { status: 'exited', error: res.error });
    }
  };

  const exited = tab?.status === 'exited';
  const displayedError = localError ?? tab?.error ?? null;

  return (
    <div className="terminal-host">
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      {displayedError && (
        <ErrorOverlay
          error={displayedError}
          projectPath={project.path}
          onRetry={restart}
          onRemove={async () => {
            await window.api.projects.remove(project.id);
            useStore.getState().clearTab(project.id);
            const list = await window.api.projects.list();
            useStore.getState().setProjects(list);
            useStore.getState().setActive(list[0]?.id ?? null);
          }}
        />
      )}
      {!displayedError && exited && (
        <div className="error-overlay">
          <div className="error-card">
            <h3 style={{ color: 'var(--warn)' }}>Session exited</h3>
            <p>The Claude session for this project has exited.</p>
            <div className="actions">
              <button onClick={restart}>Start new session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ErrorOverlay(props: {
  error: PtySpawnError;
  projectPath: string;
  onRetry: () => void;
  onRemove: () => void;
}) {
  if (props.error.kind === 'path-missing') {
    return (
      <div className="error-overlay">
        <div className="error-card">
          <h3>Project path not found</h3>
          <p>
            The directory <code>{props.projectPath}</code> does not exist or is not a directory.
            It may have been moved, renamed, or deleted.
          </p>
          <div className="actions">
            <button onClick={props.onRetry}>Retry</button>
            <button className="danger" onClick={props.onRemove}>
              Remove project
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
