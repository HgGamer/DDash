import { useEffect, useMemo, useRef, useState } from 'react';
import { renderMarkdown } from '../lib/markdown';
import { toast } from './Toast';
import { MonacoView, languageForPath } from './MonacoView';
import { useStore } from '../store';

const MARKDOWN_RE = /\.(md|markdown)$/i;

/**
 * Renders a single project file, filling its container.
 *   - Markdown → sanitised HTML preview, with an Edit mode (textarea) that saves
 *     back to disk via `docs:write`.
 *   - Any other text file → read-only, syntax-highlighted code view.
 *   - Binary / oversized files → a message.
 *
 * Expected to be remounted per file (keyed by relPath) so edit state and code
 * highlighting reset cleanly when switching files.
 */
export function FileView({
  projectId,
  projectRoot,
  relPath,
}: {
  projectId: string;
  projectRoot: string;
  relPath: string;
}) {
  const isMarkdown = MARKDOWN_RE.test(relPath);
  const [raw, setRaw] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setRaw(null);
    setDraft('');
    setMode('preview');
    setMessage(null);
    void (async () => {
      let res;
      try {
        res = await window.api.docs.read({ projectId, relPath });
      } catch {
        if (!cancelled) setMessage('Docs unavailable — restart the app to load the latest build.');
        return;
      }
      if (cancelled) return;
      if (!res.ok) {
        if (res.reason === 'too-large') setMessage('This file is too large to display (limit 2 MB).');
        else if (res.reason === 'binary') setMessage('This file can’t be displayed as text.');
        else if (res.reason === 'escape') {
          toast({ message: 'That file is outside the project and cannot be opened.', tone: 'error' });
          setMessage('File is outside the project root.');
        } else if (res.reason === 'not-found') setMessage('File not found.');
        else setMessage('Could not read this file.');
        return;
      }
      setRaw(res.contents);
      setDraft(res.contents);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, relPath]);

  // Markdown preview HTML, rendered from the (possibly edited) draft.
  const html = useMemo(
    () => (isMarkdown && raw !== null && mode === 'preview' ? renderMarkdown(draft, { projectRoot }) : null),
    [isMarkdown, raw, mode, draft, projectRoot],
  );

  const dirty = raw !== null && draft !== raw;

  // Report unsaved-edit state to the store (for the close warning) and clear it
  // when this file's view unmounts.
  const setFileDirty = useStore((s) => s.setFileDirty);
  const dirtyId = `${projectId}::${relPath}`;
  useEffect(() => {
    setFileDirty(dirtyId, dirty);
  }, [dirtyId, dirty, setFileDirty]);
  useEffect(() => {
    return () => setFileDirty(dirtyId, false);
  }, [dirtyId, setFileDirty]);

  const save = async () => {
    setSaving(true);
    const res = await window.api.docs.write({ projectId, relPath, contents: draft });
    setSaving(false);
    if (res.ok) {
      setRaw(draft);
      toast({ message: 'Saved', tone: 'success' });
    } else {
      toast({ message: 'Could not save file.', tone: 'error' });
    }
  };

  // Cmd/Ctrl+S saves the active file when there are unsaved edits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saving]);

  // Highlight markdown fenced code blocks (lazy-loading highlight.js).
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || html === null) return;
    el.scrollTop = 0;
    const blocks = el.querySelectorAll('pre code');
    if (blocks.length === 0) return;
    let cancelled = false;
    void (async () => {
      const hljs = (await import('highlight.js/lib/common')).default;
      if (cancelled) return;
      blocks.forEach((block) => hljs.highlightElement(block as HTMLElement));
    })();
    return () => {
      cancelled = true;
    };
  }, [html]);

  // External links open in the OS browser; in-document hash links scroll within.
  const onBodyClick = (e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (anchor.getAttribute('data-external') === 'true') {
      e.preventDefault();
      void window.api.docs.openExternal(href);
      return;
    }
    if (href.startsWith('#')) {
      e.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      const target = bodyRef.current?.querySelector(`#${CSS.escape(id)}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="file-view">
      {raw !== null && (
        <div className="file-toolbar">
          <div className="file-toolbar-modes">
            {isMarkdown ? (
              <>
                <button
                  type="button"
                  className={`file-toolbar-btn ${mode === 'preview' ? 'active' : ''}`}
                  onClick={() => setMode('preview')}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className={`file-toolbar-btn ${mode === 'edit' ? 'active' : ''}`}
                  onClick={() => setMode('edit')}
                >
                  Edit
                </button>
              </>
            ) : (
              <span className="file-toolbar-name">{relPath.split('/').pop()}</span>
            )}
          </div>
          <button
            type="button"
            className="btn-primary file-save"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      )}
      {message && (
        <div className="docs-doc-view">
          <div className="docs-message">{message}</div>
        </div>
      )}
      {isMarkdown && mode === 'edit' && raw !== null && (
        <div className="file-monaco">
          <MonacoView value={draft} language="markdown" onChange={setDraft} />
        </div>
      )}
      {html !== null && (
        <div className="docs-doc-view" ref={bodyRef} onClick={onBodyClick}>
          <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
      {!isMarkdown && raw !== null && (
        <div className="file-monaco">
          <MonacoView value={draft} language={languageForPath(relPath)} onChange={setDraft} />
        </div>
      )}
    </div>
  );
}
