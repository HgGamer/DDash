/*
 * Lazy Monaco entry point. This module statically imports monaco-editor and its
 * web workers, so importing it dynamically (see MonacoView) keeps Monaco in a
 * separate chunk that loads only when a file is first opened.
 */
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

const env: monaco.Environment = {
  getWorker(_workerId, label) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};
(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = env;

// Themes tuned to the app background (kept close to vs-dark/vs for tokens).
let themeDefined = false;
export function ensureTheme(): void {
  if (themeDefined) return;
  monaco.editor.defineTheme('dash-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0b0b0c',
      'editorGutter.background': '#0b0b0c',
      'editor.lineHighlightBackground': '#1a1a1f',
      'editorLineNumber.foreground': '#6e6e78',
    },
  });
  monaco.editor.defineTheme('dash-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editorGutter.background': '#ffffff',
      'editor.lineHighlightBackground': '#f0f0f3',
      'editorLineNumber.foreground': '#8a8a92',
      'editorLineNumber.activeForeground': '#55555c',
    },
  });
  themeDefined = true;
}

/** Monaco theme id for the current app UI theme. */
export function monacoThemeFor(appTheme: string): 'dash-dark' | 'dash-light' {
  return appTheme === 'light' ? 'dash-light' : 'dash-dark';
}

export { monaco };
