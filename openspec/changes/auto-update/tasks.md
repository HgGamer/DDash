## 1. Dependencies and build configuration

- [x] 1.1 Add `electron-updater` to runtime `dependencies` in `package.json` and run `npm install`
- [x] 1.2 Add a `publish` block to `electron-builder.yml` using the `github` provider (owner/repo, `releaseType: release`)
- [x] 1.3 Add a `zip` target alongside `dmg` in the `mac` build (required by `electron-updater` for macOS)
- [x] 1.4 Add `dist:publish` script in `package.json` that runs `electron-vite build && electron-builder --publish always`
- [ ] 1.5 Verify locally that `npm run dist:mac` produces `latest-mac.yml` (and `.zip`) in `release/<version>/`

## 2. Main-process settings store changes

- [x] 2.1 Extend the persisted settings schema in `src/main/store.ts` with `autoUpdate.enabled` (bool, default true), `autoUpdate.channel` (`"stable" | "beta"`, default `"stable"`), and `autoUpdate.lastCheckedAt` (string|null, default null)
- [x] 2.2 Add migration for existing stores that lack the `autoUpdate` block (defaults applied on first read)
- [x] 2.3 Add unit tests in `test/` covering default values and round-trip persistence

## 3. Updater module

- [x] 3.1 Create `src/main/auto-updater.ts` exporting `initAutoUpdater(mainWindow)` and a typed state machine: `idle | checking | available | downloading | downloaded | error`
- [x] 3.2 Wrap `electron-updater`'s `autoUpdater`: configure feed URL, channel mapping (`stable` → `latest`, `beta` → `beta`), disable auto-download is OFF (we want background download), and disable auto-install on quit (we control quit-and-install)
- [x] 3.3 Implement environment guards: if `!app.isPackaged`, return a no-op stub that always reports `idle` with reason `"disabled in development"`
- [x] 3.4 Implement platform guard: detect Linux `.deb` (no `process.env.APPIMAGE` and not on a supported updater path) and return a no-op stub with reason `"unsupported package format"`
- [x] 3.5 Schedule the startup check at +30s and a recurring check every 6h via `setInterval`; cancel intervals on `before-quit`
- [x] 3.6 Update `autoUpdate.lastCheckedAt` in the store after every check (success or no-update); skip on error
- [x] 3.7 Bridge `electron-updater` events (`checking-for-update`, `update-available`, `update-not-available`, `download-progress`, `update-downloaded`, `error`) into state-machine transitions and broadcast to the renderer
- [x] 3.8 Implement `quitAndInstall` flow: call from `before-quit` when state is `downloaded`, after the existing PTY shutdown completes; also expose an explicit `installNow()` IPC for the "Restart and update" button
- [x] 3.9 Add unit tests for the no-op stubs (dev build, deb) and the channel-mapping helper

## 4. IPC contract

- [x] 4.1 Define new IPC channels in `src/shared/ipc.ts`: `autoUpdate:getState`, `autoUpdate:check`, `autoUpdate:installNow`, `autoUpdate:getSettings`, `autoUpdate:setSettings`, and a one-way `autoUpdate:state` push
- [x] 4.2 Define corresponding TypeScript types in `src/shared/types.ts` for `AutoUpdateState`, `AutoUpdateSettings`, and `AutoUpdateInfo` (current version, target version, progress, lastCheckedAt, error message)
- [x] 4.3 Wire main-process handlers for the request/response channels and the broadcast push from the updater module
- [x] 4.4 Expose the new IPC surface in the preload script

## 5. Renderer UI

- [x] 5.1 Add a renderer hook `useAutoUpdate()` that subscribes to `autoUpdate:state` and exposes `state`, `info`, `settings`, `check()`, `installNow()`, `setSettings()`
- [x] 5.2 Add an "Updates" section to the settings/about panel showing: current version, last-checked timestamp (locale-formatted, "Never" if null), state, "Check for updates…" button, "Automatically check for updates" toggle, and "Update channel" select (stable/beta)
- [x] 5.3 Render an inline banner/toast when state is `available`, `downloading` (with percentage), or `downloaded` (with "Restart and update" / "Install on quit" actions)
- [x] 5.4 In the unsupported / dev-build case, render the version line plus a small static notice ("Updates managed by your package manager" / "Updates disabled in development") in place of the controls
- [x] 5.5 Confirm-on-active-sessions: when the user clicks "Restart and update" while any project session is running, show a confirmation dialog before proceeding

## 6. Application menu integration

- [x] 6.1 Add a "Check for updates…" menu item to the application menu in the desktop-shell main-process menu builder (under the App menu on macOS, Help on Windows/Linux)
- [x] 6.2 Disable or hide the menu item on dev builds and on unsupported package formats
- [x] 6.3 Ensure existing keyboard shortcuts and menu entries from the desktop-shell spec still work unchanged

## 7. Quit / shutdown integration

- [x] 7.1 In the existing `before-quit` handler, after the PTY clean-shutdown step, invoke `autoUpdater.quitAndInstall(true, true)` if updater state is `downloaded`
- [x] 7.2 Verify the macOS hide-on-close behavior is unchanged (close should not trigger an install; only an actual quit does)
- [x] 7.3 Add an integration test (or scripted manual test plan in the change folder) covering quit-with-pending-update

## 8. Documentation and release pipeline

- [x] 8.1 Update `README.md` with a short "Updates" section describing automatic update behavior, the manual check, channel options, and the GitHub-Releases data flow (privacy note)
- [x] 8.2 Document the release process: required env vars (`GH_TOKEN`, macOS signing/notarization vars, Windows signing vars) and the `npm run dist:publish` command
- [x] 8.3 Add a "yank a release" runbook entry covering deletion of `latest*.yml` from a bad GitHub release

## 9. Verification

- [x] 9.1 `npm run typecheck` passes
- [x] 9.2 `npm run lint` passes
- [x] 9.3 `npm run test` passes (including new updater unit tests)
- [ ] 9.4 Manual end-to-end on macOS: build v0.7.0-rc.1 signed/notarized, install, then publish v0.7.0-rc.2 and verify the running v0.7.0-rc.1 detects, downloads, and installs on quit
- [ ] 9.5 Manual end-to-end on Windows: same flow with signed NSIS installer
- [ ] 9.6 Manual end-to-end on Linux AppImage: same flow
- [ ] 9.7 Verify the `.deb` build shows the "managed by your package manager" notice and does not attempt updates
- [x] 9.8 `openspec validate auto-update --strict` passes
