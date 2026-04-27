import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/main/store';
import { SettingsManager } from '../src/main/settings';

let tmpDir: string;
let store: JsonStore;
let settings: SettingsManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dash-settings-test-'));
  store = new JsonStore({ dir: tmpDir, debounceMs: 0 });
  await store.load();
  settings = new SettingsManager(store);
});

afterEach(async () => {
  await store.flush();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('SettingsManager.terminalStyle', () => {
  it('defaults to dash-dark on a fresh install', () => {
    expect(settings.getTerminalStyle()).toEqual({ version: 1, preset: 'dash-dark' });
  });

  it('round-trips a saved preset across reload', async () => {
    settings.setTerminalStyle('default');
    await store.flush();

    const reloaded = new JsonStore({ dir: tmpDir, debounceMs: 0 });
    await reloaded.load();
    const s2 = new SettingsManager(reloaded);
    expect(s2.getTerminalStyle()).toEqual({ version: 1, preset: 'default' });
  });

  it('falls back to dash-dark when the on-disk file is corrupt JSON', async () => {
    const filePath = path.join(tmpDir, 'app-state.json');
    await fs.writeFile(filePath, '{this is not json', 'utf8');

    const reloaded = new JsonStore({ dir: tmpDir, debounceMs: 0 });
    await reloaded.load();
    const s = new SettingsManager(reloaded);
    expect(s.getTerminalStyle()).toEqual({ version: 1, preset: 'dash-dark' });
  });

  it('falls back to dash-dark when the persisted preset is unknown', async () => {
    const filePath = path.join(tmpDir, 'app-state.json');
    await fs.writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        projects: [],
        lastActiveProjectId: null,
        window: { width: 1280, height: 800, x: null, y: null, maximized: false },
        terminalStyle: { version: 1, preset: 'neon-rainbow' },
      }),
      'utf8',
    );

    const reloaded = new JsonStore({ dir: tmpDir, debounceMs: 0 });
    await reloaded.load();
    const s = new SettingsManager(reloaded);
    expect(s.getTerminalStyle()).toEqual({ version: 1, preset: 'dash-dark' });
  });

  it('emits terminalStyleChanged on set', () => {
    const events: string[] = [];
    settings.on('terminalStyleChanged', (n) => events.push(n.preset));
    settings.setTerminalStyle('default');
    settings.setTerminalStyle('dash-dark');
    expect(events).toEqual(['default', 'dash-dark']);
  });

  it('rejects an unknown preset', () => {
    // @ts-expect-error intentional misuse
    expect(() => settings.setTerminalStyle('bogus')).toThrow();
  });
});

describe('SettingsManager.autoUpdate', () => {
  it('returns defaults on a fresh install', () => {
    expect(settings.getAutoUpdate()).toEqual({
      version: 1,
      enabled: true,
      channel: 'stable',
      lastCheckedAt: null,
    });
  });

  it('round-trips channel and timestamp across reload', async () => {
    settings.setAutoUpdate({ channel: 'beta', lastCheckedAt: '2026-04-27T12:00:00.000Z' });
    await store.flush();

    const reloaded = new JsonStore({ dir: tmpDir, debounceMs: 0 });
    await reloaded.load();
    const s2 = new SettingsManager(reloaded);
    expect(s2.getAutoUpdate()).toEqual({
      version: 1,
      enabled: true,
      channel: 'beta',
      lastCheckedAt: '2026-04-27T12:00:00.000Z',
    });
  });

  it('migrates a store that has no autoUpdate block to defaults', async () => {
    const filePath = path.join(tmpDir, 'app-state.json');
    await fs.writeFile(
      filePath,
      JSON.stringify({
        version: 2,
        projects: [],
        lastActive: null,
        window: { width: 1280, height: 800, x: null, y: null, maximized: false },
      }),
      'utf8',
    );
    const reloaded = new JsonStore({ dir: tmpDir, debounceMs: 0 });
    await reloaded.load();
    const s = new SettingsManager(reloaded);
    expect(s.getAutoUpdate()).toEqual({
      version: 1,
      enabled: true,
      channel: 'stable',
      lastCheckedAt: null,
    });
  });

  it('coerces an unknown channel back to stable', async () => {
    const filePath = path.join(tmpDir, 'app-state.json');
    await fs.writeFile(
      filePath,
      JSON.stringify({
        version: 2,
        projects: [],
        lastActive: null,
        window: { width: 1280, height: 800, x: null, y: null, maximized: false },
        autoUpdate: { version: 1, enabled: false, channel: 'nightly', lastCheckedAt: null },
      }),
      'utf8',
    );
    const reloaded = new JsonStore({ dir: tmpDir, debounceMs: 0 });
    await reloaded.load();
    const s = new SettingsManager(reloaded);
    const got = s.getAutoUpdate();
    expect(got.channel).toBe('stable');
    expect(got.enabled).toBe(false);
  });

  it('emits autoUpdateChanged on set', () => {
    const events: string[] = [];
    settings.on('autoUpdateChanged', (n) => events.push(n.channel));
    settings.setAutoUpdate({ channel: 'beta' });
    settings.setAutoUpdate({ channel: 'stable' });
    expect(events).toEqual(['beta', 'stable']);
  });
});

describe('auto-update channel mapping', () => {
  it('maps stable→latest and beta→beta', async () => {
    const { autoUpdateChannelToFeed } = await import('../src/shared/types');
    expect(autoUpdateChannelToFeed('stable')).toBe('latest');
    expect(autoUpdateChannelToFeed('beta')).toBe('beta');
  });
});

describe('AutoUpdateState shape', () => {
  it('idle states can carry a disabledReason for non-packaged builds', () => {
    const dev: import('@shared/types').AutoUpdateState = {
      kind: 'idle',
      disabledReason: 'development',
    };
    const deb: import('@shared/types').AutoUpdateState = {
      kind: 'idle',
      disabledReason: 'unsupported-platform',
    };
    expect(dev.kind).toBe('idle');
    expect(deb.kind).toBe('idle');
    if (dev.kind === 'idle') expect(dev.disabledReason).toBe('development');
    if (deb.kind === 'idle') expect(deb.disabledReason).toBe('unsupported-platform');
  });
});
