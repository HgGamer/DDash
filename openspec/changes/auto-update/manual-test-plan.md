# Manual test plan — auto-update

These cover scenarios the unit tests cannot exercise (real updater + `before-quit` integration). Run them once after the first signed release.

## Quit-with-pending-update (per platform)

**Setup:** install signed `vX.Y.Z-rc.1`, then publish a signed `vX.Y.Z-rc.2` to the same channel.

1. Launch `vX.Y.Z-rc.1`. Open at least one project tab so a PTY is running.
2. Wait up to ~30s for the startup check to fire (or click **Settings → Updates → Check for updates…**).
3. Verify the inline banner appears: "Downloading update vX.Y.Z-rc.2 (NN%)…".
4. Wait for the banner to flip to "Update vX.Y.Z-rc.2 is ready."
5. Quit the app via the standard menu (Cmd+Q on macOS, File → Quit on Win/Linux).
6. ✅ The PTY shuts down cleanly (no zombie shells), the new version installs, and the app relaunches as `vX.Y.Z-rc.2`.

## Restart-and-update-now with active sessions

1. With an update in `downloaded` state and at least one project tab running, click **Restart and update** in the banner.
2. ✅ A confirmation appears: "Restart now? This will close all running terminal sessions."
3. Click **Restart and update**. ✅ App quits, installs, relaunches into the new version.
4. Repeat with **Cancel** — ✅ banner stays in `downloaded` state, sessions still running.

## macOS close-doesn't-trigger-install

1. Have an update in `downloaded` state.
2. Click the red close button on the window (do NOT use Cmd+Q).
3. ✅ Per the existing desktop-shell behavior the app quits — verify it relaunches into the new version. (If the project later changes close-on-macOS to hide-only, this test should be revisited.)

## Linux `.deb` shows the managed notice

1. Install the `.deb` and launch.
2. Open **Settings → Updates**.
3. ✅ Status reads "Updates managed by your package manager"; the **Check for updates…** button is disabled; the channel/auto-check controls are hidden.
4. ✅ The Help → Check for updates… menu item is disabled.

## Dev-mode no-op

1. Run `npm run dev`.
2. Open **Settings → Updates**.
3. ✅ Status reads "Disabled in development"; controls hidden as in the deb case.
