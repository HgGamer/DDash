import { useCallback, useEffect, useState } from 'react';
import type { DocsDirEntry } from '@shared/ipc';
import { FolderIcon, FileTypeIcon } from './icons';

interface Props {
  projectId: string;
  /** relPath of the file currently shown in the active tab, for highlighting. */
  activeRelPath: string | null;
  onOpenFile: (relPath: string) => void;
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

  const loadDir = useCallback(
    async (relPath: string) => {
      const res = await window.api.docs.listDir({ projectId, relPath });
      if (res.ok) {
        setChildrenByDir((c) => ({ ...c, [relPath]: res.entries }));
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

  const toggleDir = (relPath: string) => {
    const willExpand = !expanded[relPath];
    setExpanded((e) => ({ ...e, [relPath]: willExpand }));
    if (willExpand && childrenByDir[relPath] === undefined && !errorDirs[relPath]) {
      void loadDir(relPath);
    }
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
      <div className="fx-tree">
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
    </div>
  );
}
