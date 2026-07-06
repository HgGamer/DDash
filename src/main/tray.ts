import { app, Tray, nativeImage, type BrowserWindow } from 'electron';
import path from 'node:path';

// Braille spinner — the frames animate as the Tray title next to the clock.
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** macOS menu-bar presence for dash: shows the app icon near the clock, with an
 *  animated spinner while any Claude session is working and a dot when one is
 *  waiting for input. Fed by the Claude Code hook state (see claude-hooks.ts). */
export class ClaudeTray {
  private tray: Tray | null = null;
  private working = new Set<string>();
  private waiting = new Set<string>();
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  start(): void {
    // The animated menu-bar title is a macOS affordance; skip elsewhere.
    if (process.platform !== 'darwin') return;
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(app.getAppPath(), 'build', 'icon.png');
    let img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) img = img.resize({ width: 18, height: 18 });
    this.tray = new Tray(img);
    this.tray.on('click', () => {
      const win = this.getWindow();
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    });
    this.render();
  }

  /** Apply a hook state transition for one session tab. */
  update(key: string, state: 'busy' | 'done' | 'input'): void {
    if (state === 'busy') {
      this.working.add(key);
      this.waiting.delete(key);
    } else if (state === 'input') {
      this.working.delete(key);
      this.waiting.add(key);
    } else {
      // done
      this.working.delete(key);
      this.waiting.delete(key);
    }
    this.render();
  }

  private render(): void {
    if (!this.tray) return;
    // ponytail: a hard kill of Claude mid-generation leaves its key in `working`
    // until the next hook fires — spinner may linger. Acceptable; Stop clears it
    // on any normal turn end.
    if (this.waiting.size > 0) {
      this.stopAnim();
      this.tray.setTitle(' ●');
      this.tray.setToolTip(`Claude needs input (${this.waiting.size})`);
    } else if (this.working.size > 0) {
      this.startAnim();
      this.tray.setToolTip(`Claude working (${this.working.size})`);
    } else {
      this.stopAnim();
      this.tray.setTitle('');
      this.tray.setToolTip('dash — idle');
    }
  }

  private startAnim(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER.length;
      this.tray?.setTitle(' ' + SPINNER[this.frame]);
    }, 100);
  }

  private stopAnim(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  destroy(): void {
    this.stopAnim();
    this.tray?.destroy();
    this.tray = null;
  }
}
