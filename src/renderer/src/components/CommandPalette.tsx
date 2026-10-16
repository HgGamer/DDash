import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveSelection } from '@shared/types';
import { compositeKey } from '@shared/ipc';
import { useStore } from '../store';
import { fuzzyFinder } from '../lib/fuzzy';

interface Command {
  label: string;
  hint?: string;
  run: () => void;
}

type Mode = 'commands' | 'files';
type FilesState =
  | { status: 'idle' | 'loading' | 'no-project' | 'no-repo' | 'error' }
  | { status: 'ready'; files: string[] };
type Preview =
  | { status: 'loading' }
  | { status: 'ok'; html: string }
  | { status: 'error'; reason: string };

/** Map file extensions that aren't valid highlight.js language ids/aliases. */
const HLJS_ALIAS: Record<string, string> = {
  tsx: 'typescript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
};

/** Max rows/preview lines to render — repos can hold thousands of files. */
const MAX_ROWS = 300;
const MAX_PREVIEW_LINES = 500;
const NO_FILES: string[] = [];

/** Cmd/Ctrl+K launcher. Two modes, toggled with Tab:
 *  - commands: jump to any project/worktree or run a core action
 *  - files: fuzzy-find files in the active project (fzf-style, with preview) */
export function CommandPalette({
  onClose,
  onActivate,
}: {
  onClose: () => void;
  onActivate: (sel: ActiveSelection) => void;
}) {
  const projects = useStore((s) => s.projects);
  const activeId = useStore((s) => s.activeId);
  const openSettings = useStore((s) => s.openSettings);
  const selectSidebarView = useStore((s) => s.selectSidebarView);
  const openDoc = useStore((s) => s.openDoc);
  const [mode, setMode] = useState<Mode>('commands');
  const [query, setQuery] = useState('');
  // Filtering + preview run off the deferred query so keystrokes stay snappy
  // even over thousands of files; the input itself updates immediately.
  const deferredQuery = useDeferredValue(query);
  const [index, setIndex] = useState(0);
  const [files, setFiles] = useState<FilesState>({ status: 'idle' });
  const [preview, setPreview] = useState<Preview | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (sel: ActiveSelection) => () => {
      onActivate(sel);
      onClose();
    };
    const list: Command[] = [];
    for (const p of projects) {
      list.push({ label: p.name, hint: 'Project', run: go({ projectId: p.id, worktreeId: null }) });
      for (const wt of p.worktrees) {
        list.push({
          label: `${p.name} · ${wt.branch}`,
          hint: 'Worktree',
          run: go({ projectId: p.id, worktreeId: wt.id }),
        });
      }
    }
    const view = (v: 'projects' | 'files' | 'git' | 'board') => () => {
      selectSidebarView(v);
      onClose();
    };
    list.push(
      { label: 'Board view', hint: 'View', run: view('board') },
      { label: 'Projects', hint: 'View', run: view('projects') },
      { label: 'Files', hint: 'View', run: view('files') },
      { label: 'Git', hint: 'View', run: view('git') },
      { label: 'Settings…', hint: 'Action', run: () => { openSettings(); onClose(); } },
    );
    return list;
  }, [projects, onActivate, onClose, openSettings, selectSidebarView]);

  const cmdFinder = useMemo(
    () => fuzzyFinder(commands, (c) => `${c.label} ${c.hint ?? ''}`),
    [commands],
  );
  const filteredCommands = useMemo(() => {
    const q = deferredQuery.trim();
    return q ? cmdFinder(q).map((r) => r.item) : commands;
  }, [commands, cmdFinder, deferredQuery]);

  const fileList = files.status === 'ready' ? files.files : NO_FILES;
  const fileFinder = useMemo(() => fuzzyFinder(fileList, (f) => f), [fileList]);
  const filteredFiles = useMemo(() => {
    const q = deferredQuery.trim();
    const ranked = q ? fileFinder(q).map((r) => r.item) : fileList;
    return ranked.slice(0, MAX_ROWS);
  }, [fileList, fileFinder, deferredQuery]);

  const listLen = mode === 'commands' ? filteredCommands.length : filteredFiles.length;
  const currentFile = mode === 'files' ? filteredFiles[index] ?? null : null;

  // Load the project file list the first time files mode opens.
  useEffect(() => {
    if (mode !== 'files' || files.status !== 'idle') return;
    if (!activeId) {
      setFiles({ status: 'no-project' });
      return;
    }
    setFiles({ status: 'loading' });
    window.api.git.lsFiles({ projectId: activeId.projectId }).then((res) => {
      if (res.ok) setFiles({ status: 'ready', files: res.files });
      else setFiles({ status: res.reason === 'not-a-repo' ? 'no-repo' : 'error' });
    });
  }, [mode, files.status, activeId]);

  // Preview the highlighted file. docs.read is project-root scoped (matches the
  // Files sidebar) and already guards binary/oversized files.
  useEffect(() => {
    if (!currentFile || !activeId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreview({ status: 'loading' });
    (async () => {
      const res = await window.api.docs.read({ projectId: activeId.projectId, relPath: currentFile });
      if (cancelled) return;
      if (!res.ok) {
        setPreview({ status: 'error', reason: res.reason });
        return;
      }
      const text = res.contents.split('\n').slice(0, MAX_PREVIEW_LINES).join('\n');
      // Same lazy-loaded common bundle the markdown viewer uses.
      const hljs = (await import('highlight.js/lib/common')).default;
      if (cancelled) return;
      const ext = currentFile.split('.').pop()?.toLowerCase() ?? '';
      const lang = HLJS_ALIAS[ext] ?? (hljs.getLanguage(ext) ? ext : null);
      const html = lang
        ? hljs.highlight(text, { language: lang, ignoreIllegals: true }).value
        : hljs.highlightAuto(text).value;
      setPreview({ status: 'ok', html });
    })();
    return () => {
      cancelled = true;
    };
  }, [currentFile, activeId]);

  useEffect(() => {
    setIndex(0);
  }, [query, mode]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const openFile = (relPath: string) => {
    if (!activeId) return;
    onActivate(activeId); // ensure the active workspace is showing
    openDoc(compositeKey(activeId.projectId, activeId.worktreeId), relPath);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setMode((m) => (m === 'commands' ? 'files' : 'commands'));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, listLen - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (mode === 'commands') filteredCommands[index]?.run();
      else if (currentFile) openFile(currentFile);
    }
  };

  const filesMessage =
    files.status === 'loading'
      ? 'Loading files…'
      : files.status === 'no-project'
        ? 'No active project'
        : files.status === 'no-repo'
          ? 'Not a git repository'
          : files.status === 'error'
            ? 'Could not list files'
            : filteredFiles.length === 0
              ? 'No matches'
              : null;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`command-palette${mode === 'files' ? ' files-mode' : ''}`}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="command-palette-main">
          <input
            ref={inputRef}
            className="command-palette-input"
            type="text"
            placeholder={
              mode === 'commands'
                ? 'Jump to a project, worktree, or action…  (⇥ files)'
                : 'Fuzzy-find a file…  (⇥ commands)'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <ul className="command-palette-list">
            {mode === 'commands' &&
              (filteredCommands.length === 0 ? (
                <li className="command-palette-empty">No matches</li>
              ) : (
                filteredCommands.map((c, i) => (
                  <li
                    key={`${c.label}-${i}`}
                    className={`command-palette-item${i === index ? ' active' : ''}`}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => c.run()}
                  >
                    <span className="command-palette-label">{c.label}</span>
                    {c.hint && <span className="command-palette-hint">{c.hint}</span>}
                  </li>
                ))
              ))}
            {mode === 'files' &&
              (filesMessage ? (
                <li className="command-palette-empty">{filesMessage}</li>
              ) : (
                filteredFiles.map((relPath, i) => (
                  <li
                    key={relPath}
                    className={`command-palette-item${i === index ? ' active' : ''}`}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => openFile(relPath)}
                  >
                    <span className="command-palette-label">{relPath}</span>
                  </li>
                ))
              ))}
          </ul>
          {mode === 'files' && files.status === 'ready' && (
            <div className="command-palette-count">
              {filteredFiles.length}
              {fileList.length > filteredFiles.length ? `/${fileList.length}` : ''}
            </div>
          )}
        </div>
        {mode === 'files' && (
          <div className="command-palette-preview">
            {preview?.status === 'ok' ? (
              <pre className="hljs">
                <code dangerouslySetInnerHTML={{ __html: preview.html }} />
              </pre>
            ) : (
              <div className="command-palette-preview-note">
                {preview?.status === 'loading'
                  ? 'Loading…'
                  : preview?.status === 'error'
                    ? preview.reason === 'binary'
                      ? 'Binary file'
                      : preview.reason === 'too-large'
                        ? 'File too large to preview'
                        : 'Cannot preview'
                    : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
