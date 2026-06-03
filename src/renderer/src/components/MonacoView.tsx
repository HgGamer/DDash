import { useEffect, useRef } from 'react';
import type * as Monaco from 'monaco-editor';

/** Map a file path to a Monaco language id (best-effort, by extension). Kept
 *  here (not in lib/monaco) so it's importable without eagerly bundling Monaco. */
export function languageForPath(relPath: string): string {
  const ext = relPath.slice(relPath.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    mjs: 'javascript', cjs: 'javascript', json: 'json', css: 'css', scss: 'scss',
    less: 'less', html: 'html', htm: 'html', md: 'markdown', markdown: 'markdown',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', sh: 'shell',
    bash: 'shell', zsh: 'shell', yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini',
    xml: 'xml', sql: 'sql', swift: 'swift', kt: 'kotlin', dockerfile: 'dockerfile',
  };
  return map[ext] ?? 'plaintext';
}

interface Props {
  value: string;
  /** Monaco language id. */
  language: string;
  readOnly?: boolean;
  /** Called with the editor's content on every edit (only when not readOnly). */
  onChange?: (value: string) => void;
}

/**
 * Thin React wrapper around a standalone Monaco editor. Monaco itself is
 * lazy-loaded on first mount. The component is created once from its initial
 * props (callers remount it per file via a `key`), so it never fights React
 * over cursor/selection state.
 */
export function MonacoView({ value, language, readOnly, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let disposed = false;
    let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
    void (async () => {
      const { monaco, ensureTheme } = await import('../lib/monaco');
      if (disposed || !hostRef.current) return;
      ensureTheme();
      editor = monaco.editor.create(hostRef.current, {
        value,
        language,
        theme: 'dash-dark',
        readOnly: !!readOnly,
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: 'var(--font-mono)',
        scrollBeyondLastLine: false,
        renderWhitespace: 'selection',
        smoothScrolling: true,
        tabSize: 2,
        wordWrap: 'off',
      });
      editorRef.current = editor;
      editor.onDidChangeModelContent(() => {
        onChangeRef.current?.(editor!.getValue());
      });
    })();
    return () => {
      disposed = true;
      editor?.dispose();
      editorRef.current = null;
    };
    // Intentionally create once; callers remount via `key` when the file changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="monaco-host" ref={hostRef} />;
}
