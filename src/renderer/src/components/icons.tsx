/*
 * Small inline SVG icon set (no dependency). All icons inherit `currentColor`
 * so callers can tint them via CSS `color` / a token var.
 */
import type { CSSProperties } from 'react';

const base = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function HooksIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <path d="M12 3v9a4 4 0 1 1-4-4" />
      <circle cx="12" cy="3" r="1" />
    </svg>
  );
}

export function ProjectsIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

export function FilesIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

export function FolderIcon({ open }: { open?: boolean }) {
  return (
    <svg {...base} aria-hidden="true" style={{ color: 'var(--color-fg-muted)' }}>
      {open ? (
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2H5l-2 8V7z" />
      ) : (
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      )}
    </svg>
  );
}

export function GitIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

export function BoardIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function RevealIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 13l2 2 4-4" />
    </svg>
  );
}

export function WrapIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M3 12h13a3 3 0 0 1 0 6h-4" />
      <polyline points="14 15 12 18 14 21" />
      <path d="M3 18h5" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function FileGlyph({ style }: { style?: CSSProperties }) {
  return (
    <svg {...base} aria-hidden="true" style={style}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

// Extension → token color, for VS Code-ish type tinting.
const TINTS: Record<string, string> = {
  ts: 'var(--color-accent)',
  tsx: 'var(--color-accent)',
  js: 'var(--color-warn)',
  jsx: 'var(--color-warn)',
  mjs: 'var(--color-warn)',
  cjs: 'var(--color-warn)',
  json: 'var(--color-warn)',
  yml: 'var(--color-warn)',
  yaml: 'var(--color-warn)',
  toml: 'var(--color-warn)',
  ini: 'var(--color-warn)',
  css: 'var(--color-accent)',
  scss: 'var(--color-accent)',
  less: 'var(--color-accent)',
  html: 'var(--color-danger)',
  htm: 'var(--color-danger)',
  md: 'var(--color-fg)',
  markdown: 'var(--color-fg)',
  txt: 'var(--color-fg-muted)',
  png: 'var(--color-success)',
  jpg: 'var(--color-success)',
  jpeg: 'var(--color-success)',
  gif: 'var(--color-success)',
  svg: 'var(--color-success)',
  webp: 'var(--color-success)',
  ico: 'var(--color-success)',
  py: 'var(--color-accent)',
  go: 'var(--color-accent)',
  rs: 'var(--color-warn)',
  rb: 'var(--color-danger)',
  sh: 'var(--color-success)',
  bash: 'var(--color-success)',
  zsh: 'var(--color-success)',
  lock: 'var(--color-fg-subtle)',
  log: 'var(--color-fg-subtle)',
};

export function FileTypeIcon({ name }: { name: string }) {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const color = TINTS[ext] ?? 'var(--color-fg-subtle)';
  return <FileGlyph style={{ color }} />;
}
