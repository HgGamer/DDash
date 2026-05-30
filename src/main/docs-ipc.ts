import { ipcMain, shell } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  IPC,
  type DocsDirEntry,
  type DocsFileEntry,
  type DocsListArgs,
  type DocsListDirArgs,
  type DocsListDirResult,
  type DocsListResult,
  type DocsOpenExternalArgs,
  type DocsReadArgs,
  type DocsReadResult,
  type DocsWriteArgs,
  type DocsWriteResult,
} from '@shared/ipc';
import type { ProjectRegistry } from './registry';

/** Maximum directory depth (relative to the project root) to walk. */
const MAX_DEPTH = 3;
/** Hard cap on the number of markdown files returned by a single list call. */
const MAX_ENTRIES = 200;
/** Refuse to read files larger than this. */
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
/** Directories never worth walking for docs. */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.worktrees', 'out', 'dist', 'release', '.cache']);

const MD_EXT = /\.(md|markdown)$/i;

/** True if `child` is the same as, or nested within, `root`. */
function isWithinRoot(root: string, child: string): boolean {
  const rel = path.relative(root, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function walkDocs(root: string): Promise<DocsFileEntry[]> {
  const out: DocsFileEntry[] = [];
  // Breadth-first so the depth cap is easy to reason about and the 200-entry
  // cap favors shallower (more relevant) files.
  let frontier: { abs: string; depth: number }[] = [{ abs: root, depth: 0 }];
  while (frontier.length > 0 && out.length < MAX_ENTRIES) {
    const next: { abs: string; depth: number }[] = [];
    for (const { abs, depth } of frontier) {
      if (out.length >= MAX_ENTRIES) break;
      let entries: import('node:fs').Dirent[];
      try {
        entries = await fs.readdir(abs, { withFileTypes: true });
      } catch {
        continue;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const ent of entries) {
        if (out.length >= MAX_ENTRIES) break;
        if (ent.name.startsWith('.') && ent.isDirectory()) continue;
        const full = path.join(abs, ent.name);
        if (ent.isDirectory()) {
          if (SKIP_DIRS.has(ent.name)) continue;
          if (depth + 1 <= MAX_DEPTH) next.push({ abs: full, depth: depth + 1 });
        } else if (ent.isFile() && MD_EXT.test(ent.name)) {
          try {
            const st = await fs.stat(full);
            out.push({
              relPath: path.relative(root, full).split(path.sep).join('/'),
              mtime: st.mtimeMs,
              size: st.size,
            });
          } catch {
            /* skip unreadable file */
          }
        }
      }
    }
    frontier = next;
  }
  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out.slice(0, MAX_ENTRIES);
}

export function registerDocsIpc(args: { registry: ProjectRegistry }): void {
  const { registry } = args;

  ipcMain.handle(IPC.DocsList, async (_e, a: DocsListArgs): Promise<DocsListResult> => {
    const proj = registry.getById(a.projectId);
    if (!proj) return { ok: false, reason: 'project-missing' };
    try {
      const files = await walkDocs(path.resolve(proj.path));
      return { ok: true, files };
    } catch (err) {
      return { ok: false, reason: 'error', message: (err as Error).message };
    }
  });

  ipcMain.handle(
    IPC.DocsListDir,
    async (_e, a: DocsListDirArgs): Promise<DocsListDirResult> => {
      const proj = registry.getById(a.projectId);
      if (!proj) return { ok: false, reason: 'project-missing' };
      const root = path.resolve(proj.path);
      const resolved = path.resolve(root, a.relPath || '.');
      if (!isWithinRoot(root, resolved)) return { ok: false, reason: 'escape' };
      try {
        const st = await fs.stat(resolved);
        if (!st.isDirectory()) return { ok: false, reason: 'not-found' };
        const dirents = await fs.readdir(resolved, { withFileTypes: true });
        const entries: DocsDirEntry[] = [];
        for (const ent of dirents) {
          if (!ent.isDirectory() && !ent.isFile()) continue; // skip symlinks/sockets
          if (entries.length >= 1000) break; // sanity cap for huge directories
          const full = path.join(resolved, ent.name);
          entries.push({
            name: ent.name,
            relPath: path.relative(root, full).split(path.sep).join('/'),
            type: ent.isDirectory() ? 'dir' : 'file',
          });
        }
        // Directories first, then files, each alphabetical (case-insensitive).
        entries.sort((a2, b2) => {
          if (a2.type !== b2.type) return a2.type === 'dir' ? -1 : 1;
          return a2.name.localeCompare(b2.name, undefined, { sensitivity: 'base' });
        });
        return { ok: true, entries };
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'ENOENT') return { ok: false, reason: 'not-found' };
        return { ok: false, reason: 'error', message: e.message };
      }
    },
  );

  ipcMain.handle(IPC.DocsRead, async (_e, a: DocsReadArgs): Promise<DocsReadResult> => {
    const proj = registry.getById(a.projectId);
    if (!proj) return { ok: false, reason: 'project-missing' };
    const root = path.resolve(proj.path);
    const resolved = path.resolve(root, a.relPath);
    // Path-traversal guard: the resolved absolute path must stay within root.
    if (!isWithinRoot(root, resolved)) {
      return { ok: false, reason: 'escape' };
    }
    try {
      const st = await fs.stat(resolved);
      if (!st.isFile()) return { ok: false, reason: 'not-found' };
      if (st.size > MAX_FILE_BYTES) return { ok: false, reason: 'too-large' };
      const buf = await fs.readFile(resolved);
      // Binary detection: a NUL byte in the first chunk means it's not text.
      const probe = buf.subarray(0, Math.min(buf.length, 8000));
      if (probe.includes(0)) return { ok: false, reason: 'binary' };
      return { ok: true, contents: buf.toString('utf8') };
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') return { ok: false, reason: 'not-found' };
      return { ok: false, reason: 'error', message: e.message };
    }
  });

  ipcMain.handle(IPC.DocsWrite, async (_e, a: DocsWriteArgs): Promise<DocsWriteResult> => {
    const proj = registry.getById(a.projectId);
    if (!proj) return { ok: false, reason: 'project-missing' };
    const root = path.resolve(proj.path);
    const resolved = path.resolve(root, a.relPath);
    if (!isWithinRoot(root, resolved) || resolved === root) {
      return { ok: false, reason: 'escape' };
    }
    if (Buffer.byteLength(a.contents, 'utf8') > MAX_FILE_BYTES) {
      return { ok: false, reason: 'too-large' };
    }
    try {
      await fs.writeFile(resolved, a.contents, 'utf8');
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: 'error', message: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.DocsOpenExternal, async (_e, a: DocsOpenExternalArgs): Promise<void> => {
    // Only ever hand http(s)/mailto URLs to the OS; the renderer already
    // filters, but defend in depth here too.
    let scheme = '';
    try {
      scheme = new URL(a.url).protocol;
    } catch {
      return;
    }
    if (scheme === 'http:' || scheme === 'https:' || scheme === 'mailto:') {
      await shell.openExternal(a.url);
    }
  });
}
