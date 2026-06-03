import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Markdown → sanitised HTML pipeline for the in-app Docs viewer.
 *
 * Security policy (see the markdown-viewer capability):
 *   - Parse with `marked`, sanitise with `dompurify` (script/handler stripping,
 *     allow-list of tags/attrs).
 *   - Links are restricted to http/https/mailto and in-document `#anchor`s.
 *     Anything else is rendered as inert text.
 *   - Relative image `src` is rewritten to a `file://` URL resolved against the
 *     project root; images that escape the root are replaced by their alt text.
 *   - Headings receive stable, unique ids for in-document navigation.
 */

const ALLOWED_LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:']);
const SCHEME_RE = /^([a-zA-Z][a-zA-Z\d+.-]*):/;

export interface RenderMarkdownOptions {
  /** Absolute path of the project root, used to resolve relative image src. */
  projectRoot: string;
}

/** GitHub-ish slug from heading text. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Resolve `rel` against `root`, collapsing `.`/`..`, and return the absolute
 * path ONLY if it stays within `root`. Returns null on escape, or when `rel`
 * is absolute / has a URL scheme. Handles posix and Windows-style roots.
 */
export function resolveWithinRoot(root: string, rel: string): string | null {
  if (!rel) return null;
  if (SCHEME_RE.test(rel)) return null; // has a scheme (http:, data:, file:, …)
  if (rel.startsWith('/') || rel.startsWith('\\')) return null; // absolute
  if (/^[a-zA-Z]:[\\/]/.test(rel)) return null; // windows drive-absolute

  const isWin = /^[a-zA-Z]:[\\/]/.test(root) || (root.includes('\\') && !root.startsWith('/'));
  const rootParts = root.split(/[\\/]+/).filter(Boolean);
  const stack = [...rootParts];
  for (const part of rel.split(/[\\/]+/)) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (stack.length <= rootParts.length) return null; // would escape root
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  // Confirm the result still starts with the root.
  for (let i = 0; i < rootParts.length; i++) {
    if (stack[i] !== rootParts[i]) return null;
  }
  return (isWin ? '' : '/') + stack.join('/');
}

/** Convert an absolute filesystem path to a file:// URL. */
export function toFileUrl(absPath: string): string {
  let p = absPath.replace(/\\/g, '/');
  if (!p.startsWith('/')) p = '/' + p; // windows drive letter
  return 'file://' + encodeURI(p);
}

/**
 * Sanitise already-parsed HTML and apply the link/image/heading transforms.
 * Exposed separately from `renderMarkdown` so unit tests can exercise it with
 * raw HTML fixtures. Requires a DOM (browser or jsdom).
 */
export function sanitizeHtml(dirtyHtml: string, opts: RenderMarkdownOptions): string {
  const clean = DOMPurify.sanitize(dirtyHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button'],
    FORBID_ATTR: ['style'],
  });

  const doc = new DOMParser().parseFromString(clean, 'text/html');

  // Stable, unique heading ids.
  const usedIds = new Set<string>();
  doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    const base = h.getAttribute('id') || slugify(h.textContent || '');
    if (!base) return;
    let id = base;
    let n = 1;
    while (usedIds.has(id)) id = `${base}-${n++}`;
    usedIds.add(id);
    h.setAttribute('id', id);
  });

  // Link scheme filtering.
  doc.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('#')) return; // in-document anchor — keep
    let scheme: string | null = null;
    const m = SCHEME_RE.exec(href);
    if (m) scheme = m[1].toLowerCase() + ':';
    if (scheme && ALLOWED_LINK_SCHEMES.has(scheme)) {
      a.setAttribute('data-external', 'true');
      a.setAttribute('rel', 'noreferrer noopener');
      return;
    }
    // Disallowed scheme, relative link, or stripped href → render inert text.
    a.replaceWith(doc.createTextNode(a.textContent ?? ''));
  });

  // Relative image rewriting + escape rejection.
  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    const m = SCHEME_RE.exec(src);
    if (m) {
      const scheme = m[1].toLowerCase() + ':';
      // Remote images over http(s) pass through; anything else (data:, file:, …)
      // is dropped to its alt text.
      if (scheme === 'http:' || scheme === 'https:') return;
      img.replaceWith(doc.createTextNode(img.getAttribute('alt') ?? ''));
      return;
    }
    const abs = resolveWithinRoot(opts.projectRoot, src);
    if (abs === null) {
      img.replaceWith(doc.createTextNode(img.getAttribute('alt') ?? ''));
      return;
    }
    img.setAttribute('src', toFileUrl(abs));
  });

  return doc.body.innerHTML;
}

/** Parse markdown and return sanitised HTML ready to inject. */
export function renderMarkdown(md: string, opts: RenderMarkdownOptions): string {
  const dirty = marked.parse(md, { async: false }) as string;
  return sanitizeHtml(dirty, opts);
}
