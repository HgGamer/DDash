import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/main/store';
import { ProjectRegistry } from '../src/main/registry';

let tmpDir: string;
let store: JsonStore;
let registry: ProjectRegistry;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dash-test-'));
  store = new JsonStore({ dir: tmpDir, debounceMs: 0 });
  await store.load();
  registry = new ProjectRegistry(store);
});

afterEach(async () => {
  // Drain any pending debounced writes before nuking the tmp dir, so they
  // don't ENOENT-race against fs.rm.
  await store.flush();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('ProjectRegistry', () => {
  it('adds a project and persists it', async () => {
    const proj = registry.add('/tmp/example');
    await store.flush();
    expect(proj.name).toBe('example');
    expect(path.isAbsolute(proj.path)).toBe(true);
    expect(proj.order).toBe(0);

    const reloaded = new JsonStore({ dir: tmpDir, debounceMs: 0 });
    await reloaded.load();
    const reg2 = new ProjectRegistry(reloaded);
    expect(reg2.list()).toHaveLength(1);
    expect(reg2.list()[0].path).toBe(proj.path);
  });

  it('dedupes by absolute path', () => {
    const a = registry.add('/tmp/same');
    const b = registry.add('/tmp/same');
    expect(a.id).toBe(b.id);
    expect(registry.list()).toHaveLength(1);
  });

  it('removes a project and repacks order', async () => {
    const a = registry.add('/tmp/a');
    const b = registry.add('/tmp/b');
    const c = registry.add('/tmp/c');
    registry.remove(b.id);
    const list = registry.list();
    expect(list.map((p) => p.id)).toEqual([a.id, c.id]);
    expect(list.map((p) => p.order)).toEqual([0, 1]);
  });

  it('renames a project (trimmed, non-empty)', () => {
    const a = registry.add('/tmp/a');
    registry.rename(a.id, '  New Name  ');
    expect(registry.list()[0].name).toBe('New Name');

    registry.rename(a.id, '   ');
    expect(registry.list()[0].name).toBe('New Name');
  });

  it('reorders projects and persists', async () => {
    const a = registry.add('/tmp/a');
    const b = registry.add('/tmp/b');
    const c = registry.add('/tmp/c');
    registry.reorder([c.id, a.id, b.id]);
    expect(registry.list().map((p) => p.id)).toEqual([c.id, a.id, b.id]);

    await store.flush();
    const reloaded = new JsonStore({ dir: tmpDir, debounceMs: 0 });
    await reloaded.load();
    expect(new ProjectRegistry(reloaded).list().map((p) => p.id)).toEqual([c.id, a.id, b.id]);
  });

  it('clears lastActiveProjectId when the active project is removed', () => {
    const a = registry.add('/tmp/a');
    registry.setLastActive(a.id);
    registry.remove(a.id);
    expect(registry.getLastActive()).toBeNull();
  });
});

describe('JsonStore atomic write', () => {
  it('recovers from a corrupt state file by renaming it', async () => {
    const filePath = path.join(tmpDir, 'app-state.json');
    await fs.writeFile(filePath, '{not valid json', 'utf8');

    const fresh = new JsonStore({ dir: tmpDir, debounceMs: 0 });
    const state = await fresh.load();
    expect(state.projects).toEqual([]);

    const entries = await fs.readdir(tmpDir);
    expect(entries.some((n) => n.startsWith('app-state.json.corrupt-'))).toBe(true);
  });

  it('never leaves a partial file behind when write completes', async () => {
    registry.add('/tmp/a');
    await store.flush();
    const filePath = path.join(tmpDir, 'app-state.json');
    const contents = await fs.readFile(filePath, 'utf8');
    expect(() => JSON.parse(contents)).not.toThrow();
    const parsed = JSON.parse(contents);
    expect(parsed.projects).toHaveLength(1);

    const entries = await fs.readdir(tmpDir);
    // No lingering temp files.
    expect(entries.filter((n) => n.includes('.tmp-'))).toHaveLength(0);
  });
});
