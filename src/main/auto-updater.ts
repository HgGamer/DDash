import { app, BrowserWindow, shell } from 'electron';
import { EventEmitter } from 'node:events';
import electronUpdater from 'electron-updater';
import type {
  AutoUpdateChannel,
  AutoUpdateDisabledReason,
  AutoUpdateInfo,
  AutoUpdateState,
} from '@shared/types';
import { autoUpdateChannelToFeed } from '@shared/types';
import type { SettingsManager } from './settings';
import type { JsonStore } from './store';

const STARTUP_DELAY_MS = 30_000;
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

/** Strict semver "remote > current" comparator. We can't trust electron-updater's
 *  built-in downgrade guard alone: a previously-downloaded installer cached on
 *  disk can re-emit `update-downloaded` on startup even when its version is now
 *  older than the running app (e.g. user side-loaded a newer local build). */
function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string): { core: number[]; pre: string | null } => {
    const [coreStr, pre = null] = v.split('-', 2);
    const core = coreStr.split('.').map((n) => Number.parseInt(n, 10) || 0);
    while (core.length < 3) core.push(0);
    return { core, pre };
  };
  const a = parse(remote);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i];
  }
  // Equal core: a release outranks a prerelease; otherwise compare prerelease
  // tags lexically. Identical prereleases are not "newer".
  if (a.pre === b.pre) return false;
  if (a.pre === null) return true;
  if (b.pre === null) return false;
  return a.pre > b.pre;
}

/** Detect whether this Linux install came from a deb (or any non-AppImage path
 *  that electron-updater can't update). AppImage sets APPIMAGE; without it we
 *  assume the package is managed by the system. */
function isLinuxUnsupported(): boolean {
  return process.platform === 'linux' && !process.env.APPIMAGE;
}

export interface AutoUpdater {
  /** Current snapshot of state + version + last-check. */
  getInfo(): AutoUpdateInfo;
  /** Trigger a manual check. Resolves with the info after the check (or
   *  immediately, if a check/download is already in flight or the updater is
   *  disabled on this build). */
  check(): Promise<AutoUpdateInfo>;
  /** Install + relaunch if state is 'downloaded'. No-op otherwise. */
  installNow(): Promise<void>;
  /** True iff a downloaded update is waiting to be installed on quit. */
  hasPendingInstall(): boolean;
  /** Stop timers; safe to call multiple times. */
  shutdown(): void;
  on(event: 'info', listener: (info: AutoUpdateInfo) => void): void;
  off(event: 'info', listener: (info: AutoUpdateInfo) => void): void;
}

/** No-op stub used in dev builds and on unsupported package formats. The
 *  renderer reads `state.disabledReason` to render the right empty-state. */
class NoopAutoUpdater extends EventEmitter implements AutoUpdater {
  constructor(private readonly reason: AutoUpdateDisabledReason) {
    super();
  }
  getInfo(): AutoUpdateInfo {
    return {
      currentVersion: app.getVersion(),
      state: { kind: 'idle', disabledReason: this.reason },
      lastCheckedAt: null,
    };
  }
  async check(): Promise<AutoUpdateInfo> {
    return this.getInfo();
  }
  async installNow(): Promise<void> {
    /* nothing to install */
  }
  hasPendingInstall(): boolean {
    return false;
  }
  shutdown(): void {
    /* no timers */
  }
}

interface RealAutoUpdaterDeps {
  settings: SettingsManager;
  store: JsonStore;
  getWindow: () => BrowserWindow | null;
}

class RealAutoUpdater extends EventEmitter implements AutoUpdater {
  private state: AutoUpdateState = { kind: 'idle' };
  private startupTimer: NodeJS.Timeout | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private readonly nativeUpdater: import('electron-updater').AppUpdater;
  /** macOS-only: path to the downloaded artifact. Squirrel rejects our
   *  ad-hoc-signed builds during validation, so we reveal this in Finder
   *  on installNow() instead of calling quitAndInstall. */
  private downloadedFile: string | null = null;

  constructor(private readonly deps: RealAutoUpdaterDeps) {
    super();

    // electron-updater is CJS; the default export carries the singleton.
    this.nativeUpdater = electronUpdater.autoUpdater;

    // We control quit-and-install ourselves so the main process can flush
    // PTYs first; let electron-updater download but never auto-install.
    this.nativeUpdater.autoDownload = true;
    this.nativeUpdater.autoInstallOnAppQuit = false;
    this.nativeUpdater.allowPrerelease = false;

    this.applyChannel(this.deps.settings.getAutoUpdate().channel);

    this.nativeUpdater.on('checking-for-update', () => {
      this.setState({ kind: 'checking' });
    });
    this.nativeUpdater.on('update-available', (info) => {
      if (!isNewerVersion(info.version, app.getVersion())) {
        this.discardStaleUpdate(info.version);
        return;
      }
      this.setState({ kind: 'downloading', version: info.version, percent: 0 });
      this.markChecked();
    });
    this.nativeUpdater.on('update-not-available', () => {
      this.setState({ kind: 'idle' });
      this.markChecked();
    });
    this.nativeUpdater.on('download-progress', (p) => {
      const cur = this.state;
      const version = cur.kind === 'downloading' || cur.kind === 'available' ? cur.version : '';
      this.setState({ kind: 'downloading', version, percent: Math.round(p.percent) });
    });
    this.nativeUpdater.on('update-downloaded', (info) => {
      // Guard against a stale cached installer for a version <= the running
      // app — e.g. when a user side-loads a newer local build over an
      // electron-updater-managed install. Without this, the prior download
      // would resurface as "Update ready" and silently downgrade the user.
      if (!isNewerVersion(info.version, app.getVersion())) {
        this.discardStaleUpdate(info.version);
        return;
      }
      const manualInstall = process.platform === 'darwin';
      this.downloadedFile = manualInstall ? (info.downloadedFile ?? null) : null;
      this.setState({
        kind: 'downloaded',
        version: info.version,
        ...(manualInstall ? { manualInstall: true } : {}),
      });
    });
    this.nativeUpdater.on('error', (err) => {
      this.setState({ kind: 'error', message: err?.message ?? String(err) });
    });

    // React to user toggling channel / enabled at runtime.
    this.deps.settings.on('autoUpdateChanged', (s) => {
      this.applyChannel(s.channel);
      if (!s.enabled) this.clearTimers();
      else this.scheduleTimers();
    });

    if (this.deps.settings.getAutoUpdate().enabled) this.scheduleTimers();
  }

  getInfo(): AutoUpdateInfo {
    return {
      currentVersion: app.getVersion(),
      state: this.state,
      lastCheckedAt: this.deps.settings.getAutoUpdate().lastCheckedAt,
    };
  }

  async check(): Promise<AutoUpdateInfo> {
    if (
      this.state.kind === 'checking' ||
      this.state.kind === 'downloading' ||
      this.state.kind === 'downloaded'
    ) {
      return this.getInfo();
    }
    try {
      await this.nativeUpdater.checkForUpdates();
    } catch (err) {
      this.setState({ kind: 'error', message: (err as Error)?.message ?? String(err) });
    }
    return this.getInfo();
  }

  async installNow(): Promise<void> {
    if (this.state.kind !== 'downloaded') return;
    if (this.state.manualInstall) {
      if (this.downloadedFile) shell.showItemInFolder(this.downloadedFile);
      return;
    }
    // `quitAndInstall(isSilent, isForceRunAfter)` — silent on Windows, relaunch
    // after install on all platforms.
    this.nativeUpdater.quitAndInstall(true, true);
  }

  hasPendingInstall(): boolean {
    return this.state.kind === 'downloaded';
  }

  shutdown(): void {
    this.clearTimers();
  }

  private applyChannel(channel: AutoUpdateChannel): void {
    this.nativeUpdater.channel = autoUpdateChannelToFeed(channel);
    this.nativeUpdater.allowPrerelease = channel === 'beta';
  }

  private setState(next: AutoUpdateState): void {
    this.state = next;
    this.emit('info', this.getInfo());
  }

  private markChecked(): void {
    this.deps.settings.setAutoUpdate({ lastCheckedAt: new Date().toISOString() });
    void this.deps.store.flush();
  }

  private scheduleTimers(): void {
    this.clearTimers();
    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      void this.check();
    }, STARTUP_DELAY_MS);
    this.intervalTimer = setInterval(() => {
      void this.check();
    }, RECHECK_INTERVAL_MS);
  }

  private discardStaleUpdate(remoteVersion: string): void {
    // Drop electron-updater's on-disk pending-update cache so the stale
    // installer doesn't resurface on the next check or restart.
    const helper = (this.nativeUpdater as unknown as { downloadedUpdateHelper?: { clear(): Promise<void> } })
      .downloadedUpdateHelper;
    void helper?.clear().catch(() => { /* best-effort */ });
    console.warn(
      `[auto-updater] feed advertises ${remoteVersion} <= running ${app.getVersion()}; ignoring.`,
    );
    this.setState({ kind: 'idle' });
    this.markChecked();
  }

  private clearTimers(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
}

export function createAutoUpdater(deps: RealAutoUpdaterDeps): AutoUpdater {
  if (!app.isPackaged) return new NoopAutoUpdater('development');
  if (isLinuxUnsupported()) return new NoopAutoUpdater('unsupported-platform');
  return new RealAutoUpdater(deps);
}
