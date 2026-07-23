import { useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveSelection } from '@shared/types';
import { useStore } from '../store';

interface Command {
  label: string;
  hint?: string;
  run: () => void;
}

/** Cmd/Ctrl+K fuzzy launcher: jump to any project/worktree or run a core action.
 *  Filter is a plain case-insensitive substring — good enough, no fuzzy lib. */
export function CommandPalette({
  onClose,
  onActivate,
}: {
  onClose: () => void;
  onActivate: (sel: ActiveSelection) => void;
}) {
  const projects = useStore((s) => s.projects);
  const openSettings = useStore((s) => s.openSettings);
  const selectSidebarView = useStore((s) => s.selectSidebarView);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[index]?.run();
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="command-palette" role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="command-palette-input"
          type="text"
          placeholder="Jump to a project, worktree, or action…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul className="command-palette-list">
          {filtered.length === 0 && <li className="command-palette-empty">No matches</li>}
          {filtered.map((c, i) => (
            <li
              key={`${c.label}-${i}`}
              className={`command-palette-item${i === index ? ' active' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => c.run()}
            >
              <span className="command-palette-label">{c.label}</span>
              {c.hint && <span className="command-palette-hint">{c.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
