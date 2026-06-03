import { useCallback, useEffect, useState } from 'react';
import type { DocsDirEntry } from '@shared/ipc';
import { FolderIcon, FileTypeIcon } from './icons';

interface Props {
  projectId: string;
  /** relPath of the file currently shown in the active tab, for highlighting. */
  activeRelPath: string | null;
  onOpenFile: (relPath: string) => void;
}

/** Right-click menu target. `entry` is null when the root background is clicked. */
interface MenuState {
  x: number;
  y: number;
  entry: DocsDirEntry | null;
}

/** Parent directory of a relPath ('' for top-level entries). */
function parentOf(relPath: string): string {
  const i = relPath.lastIndexOf('/');
  return i === -1 ? '' : relPath.slice(0, i);
}

/**
 * VS Code-style lazy file tree scoped to the project root. Directories load
 * their children the first time they are expanded.
 */
export function FileExplorer({ projectId, activeRelPath, onOpenFile }: Props) {
  const [childrenByDir, setChildrenByDir] = useState<Record<string, DocsDirEntry[]>>({});
  const [errorDirs, setErrorDirs] = useState<Record<string, true>>({});
  // Root ('') starts expanded.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ '': true });
  const [menu, setMenu] = useState<MenuState | null>(null);

  const loadDir = useCallback(
    async (relPath: string) => {
      const res = await window.api.docs.listDir({ projectId, relPath });
      if (res.ok) {
        setChildrenByDir((c) => ({ ...c, [relPath]: res.entries }));
        setErrorDirs((e) => {
          if (!e[relPath]) return e;
          const next = { ...e };
          delete next[relPath];
          return next;
        });
      } else {
        setErrorDirs((e) => ({ ...e, [relPath]: true }));
      }
    },
    [projectId],
  );

  // Reset and load the root whenever the project changes.
  useEffect(() => {
    setChildrenByDir({});
    setErrorDirs({});
    setExpanded({ '': true });
    void loadDir('');
  }, [projectId, loadDir]);

  // Close the context menu on any outside click, scroll, or window blur.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  const toggleDir = (relPath: string) => {
    const willExpand = !expanded[relPath];
    setExpanded((e) => ({ ...e, [relPath]: willExpand }));
    if (willExpand && childrenByDir[relPath] === undefined && !errorDirs[relPath]) {
      void loadDir(relPath);
    }
  };

  // ---- Context-menu actions -------------------------------------------------

  const doReveal = async (entry: DocsDirEntry) => {
    await window.api.docs.reveal({ projectId, relPath: entry.relPath });
  };

  const doCopyPath = async (entry: DocsDirEntry) => {
    try {
      await navigator.clipboard.writeText(entry.relPath);
    } catch {
      /* clipboard unavailable */
    }
  };

  const doRename = async (entry: DocsDirEntry) => {
    const next = window.prompt(`Rename "${entry.name}" to:`, entry.name);
    if (next === null) return;
    const newName = next.trim();
    if (!newName || newName === entry.name) return;
    const res = await window.api.docs.rename({ projectId, relPath: entry.relPath, newName });
    if (!res.ok) {
      window.alert(
        res.reason === 'exists'
          ? `An entry named "${newName}" already exists.`
          : res.reason === 'invalid'
            ? 'That name is not allowed.'
            : `Could not rename: ${res.message ?? res.reason}`,
      );
      return;
    }
    await loadDir(parentOf(entry.relPath));
    if (entry.type === 'file' && activeRelPath === entry.relPath) onOpenFile(res.relPath);
  };

  const doDelete = async (entry: DocsDirEntry) => {
    const ok = window.confirm(
      `Move "${entry.name}" to the Trash?` +
        (entry.type === 'dir' ? '\n\nThis moves the folder and all its contents.' : ''),
    );
    if (!ok) return;
    const res = await window.api.docs.delete({ projectId, relPath: entry.relPath });
    if (!res.ok) {
      window.alert(`Could not delete: ${res.message ?? res.reason}`);
      return;
    }
    await loadDir(parentOf(entry.relPath));
  };

  const doCreate = async (dirRelPath: string, type: 'file' | 'dir') => {
    const label = type === 'dir' ? 'folder' : 'file';
    const input = window.prompt(`New ${label} name:`, '');
    if (input === null) return;
    const name = input.trim();
    if (!name) return;
    const res = await window.api.docs.create({ projectId, dirRelPath, name, type });
    if (!res.ok) {
      window.alert(
        res.reason === 'exists'
          ? `An entry named "${name}" already exists.`
          : res.reason === 'invalid'
            ? 'That name is not allowed.'
            : `Could not create ${label}: ${res.message ?? res.reason}`,
      );
      return;
    }
    // Make sure the destination is expanded so the new entry is visible.
    setExpanded((e) => ({ ...e, [dirRelPath]: true }));
    await loadDir(dirRelPath);
    if (type === 'file') onOpenFile(res.relPath);
  };

  const openMenu = (e: React.MouseEvent, entry: DocsDirEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const renderLevel = (dirRelPath: string, depth: number): JSX.Element[] => {
    const entries = childrenByDir[dirRelPath];
    if (entries === undefined) return [];
    const out: JSX.Element[] = [];
    for (const ent of entries) {
      const pad = { paddingLeft: `${depth * 12 + 8}px` };
      if (ent.type === 'dir') {
        const isOpen = !!expanded[ent.relPath];
        out.push(
          <button
            key={ent.relPath}
            type="button"
            className="fx-row fx-dir"
            style={pad}
            onClick={() => toggleDir(ent.relPath)}
            onContextMenu={(e) => openMenu(e, ent)}
            title={ent.relPath}
          >
            <span className="fx-twisty">{isOpen ? '▾' : '▸'}</span>
            <span className="fx-icon">
              <FolderIcon open={isOpen} />
            </span>
            <span className="fx-name">{ent.name}</span>
          </button>,
        );
        if (isOpen) {
          if (errorDirs[ent.relPath]) {
            out.push(
              <div key={`${ent.relPath}::err`} className="fx-note" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
                Could not read folder
              </div>,
            );
          } else if (childrenByDir[ent.relPath] === undefined) {
            out.push(
              <div key={`${ent.relPath}::loading`} className="fx-note" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
                Loading…
              </div>,
            );
          } else {
            out.push(...renderLevel(ent.relPath, depth + 1));
          }
        }
      } else {
        out.push(
          <button
            key={ent.relPath}
            type="button"
            className={`fx-row fx-file ${activeRelPath === ent.relPath ? 'active' : ''}`}
            style={pad}
            onClick={() => onOpenFile(ent.relPath)}
            onContextMenu={(e) => openMenu(e, ent)}
            title={ent.relPath}
          >
            <span className="fx-twisty" />
            <span className="fx-icon">
              <FileTypeIcon name={ent.name} />
            </span>
            <span className="fx-name">{ent.name}</span>
          </button>,
        );
      }
    }
    return out;
  };

  const rootEntries = childrenByDir[''];

  return (
    <div className="fx">
      <div className="fx-tree" onContextMenu={(e) => openMenu(e, null)}>
        {errorDirs[''] ? (
          <div className="fx-note">Could not read project folder.</div>
        ) : rootEntries === undefined ? (
          <div className="fx-note">Loading…</div>
        ) : rootEntries.length === 0 ? (
          <div className="fx-note">This folder is empty.</div>
        ) : (
          renderLevel('', 0)
        )}
      </div>
      {menu && (
        <FileContextMenu
          x={menu.x}
          y={menu.y}
          entry={menu.entry}
          onOpen={(ent) => onOpenFile(ent.relPath)}
          onNewFile={(dir) => doCreate(dir, 'file')}
          onNewFolder={(dir) => doCreate(dir, 'dir')}
          onReveal={doReveal}
          onCopyPath={doCopyPath}
          onRename={doRename}
          onDelete={doDelete}
        />
      )}
    </div>
  );
}

function FileContextMenu(props: {
  x: number;
  y: number;
  entry: DocsDirEntry | null;
  onOpen: (entry: DocsDirEntry) => void;
  onNewFile: (dirRelPath: string) => void;
  onNewFolder: (dirRelPath: string) => void;
  onReveal: (entry: DocsDirEntry) => void;
  onCopyPath: (entry: DocsDirEntry) => void;
  onRename: (entry: DocsDirEntry) => void;
  onDelete: (entry: DocsDirEntry) => void;
}) {
  const { entry } = props;
  const isDir = entry?.type === 'dir';
  const isFile = entry?.type === 'file';
  // For background clicks new entries land in the root; for a folder, inside it.
  const newDir = entry ? (isDir ? entry.relPath : parentOf(entry.relPath)) : '';

  return (
    <div className="context-menu" style={{ left: props.x, top: props.y }} onClick={(e) => e.stopPropagation()}>
      {isFile && <button onClick={() => props.onOpen(entry)}>Open</button>}
      <button onClick={() => props.onNewFile(newDir)}>New File…</button>
      <button onClick={() => props.onNewFolder(newDir)}>New Folder…</button>
      {entry && (
        <>
          <div className="context-menu-sep" />
          <button onClick={() => props.onReveal(entry)}>Reveal in Finder</button>
          <button onClick={() => props.onCopyPath(entry)}>Copy Relative Path</button>
          <button onClick={() => props.onRename(entry)}>Rename…</button>
          <button className="danger" onClick={() => props.onDelete(entry)}>
            Delete
          </button>
        </>
      )}
    </div>
  );
}
