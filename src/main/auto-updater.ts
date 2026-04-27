import { app, BrowserWindow } from 'electron';
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
      this.setState({ kind: 'downloaded', version: info.version });
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
