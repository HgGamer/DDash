## Context

Dash is an Electron desktop app distributed via `electron-builder` to macOS (dmg, arm64), Windows (nsis, x64), and Linux (AppImage + deb, x64). Releases today are produced locally and uploaded to GitHub Releases by hand; the running app has no awareness of new versions. Users discover updates only by revisiting the README, which already lists download links. The codebase is small and the main process is organized into focused modules (`src/main/store.ts`, `src/main/shell-session.ts`, etc.), so adding a new updater module fits cleanly.

`electron-updater` is the de-facto pairing for `electron-builder` and supports differential downloads, channels, and a GitHub publish provider. It does, however, refuse to install on macOS unless the bundle is signed and notarized, and on Windows unless the NSIS installer is signed.

## Goals / Non-Goals

**Goals:**
- Running Dash instances learn about new GitHub releases automatically and install them with one click.
- Update flow is non-blocking: download happens in the background; the user is never stopped from working while an update is being fetched.
- Users can opt out of automatic checks and choose between `latest` (stable) and `beta` channels.
- Same code path works on macOS, Windows, and Linux (AppImage); platforms unsupported by `electron-updater` (deb) degrade gracefully to a "manual download" notice.
- The release workflow publishes the update feed (`latest-mac.yml`, `latest.yml`, `latest-linux.yml`) alongside the artifacts so the updater can find them.

**Non-Goals:**
- Delta/binary-diff updates beyond what `electron-updater` provides out of the box (no custom patch format).
- Self-hosted update server; we will rely on GitHub Releases.
- Auto-update for `.deb` packages (handled by the system package manager when installed that way).
- Forced updates / kill-switch for old versions.
- Code-signing certificate procurement is out of scope as a code change but is called out in the migration plan as a prerequisite.

## Decisions

### Decision: Use `electron-updater` with the `github` provider

**Why:** It is the standard Electron auto-update library, integrates directly with `electron-builder`'s output, supports staged rollouts and channels, and reads the GitHub Releases API without requiring a separate server. Switching providers later only requires editing `electron-builder.yml` and the constructed feed URL.

**Alternatives considered:**
- *Roll our own check-and-download:* rejected — re-implements signature verification, differential downloads, and per-platform install semantics that `electron-updater` already handles.
- *Squirrel.Mac / Squirrel.Windows directly:* rejected — lower-level, no Linux story, and we lose `electron-builder` integration.
- *Self-hosted update server (Nuts, Hazel):* rejected — adds operational burden with no benefit at our scale; can be revisited if rate limits become an issue.

### Decision: Download in background, install on quit (with optional "Restart now")

**Why:** Surprise restarts destroy in-flight terminal sessions, which is highly disruptive in a tool whose entire purpose is hosting long-running Claude Code processes. The default behavior keeps work safe; users who want the new version immediately can opt in via the notification.

The renderer surfaces three update states from the main process: `idle | checking | available | downloading | downloaded | error`. When `downloaded`, an inline banner (and a tray-style indicator in the title bar area) offers "Restart and update" or "Install on quit". Choosing the latter triggers `autoUpdater.quitAndInstall()` from `before-quit`.

### Decision: Settings live in the existing main-process settings store

**Why:** The repo already has a `src/main/store.ts` for persisted state. Adding `autoUpdate.enabled` (default `true`), `autoUpdate.channel` (`"stable" | "beta"`, default `"stable"`), and `autoUpdate.lastCheckedAt` (ISO string, nullable) there keeps configuration in one place and makes the IPC pattern uniform with existing settings.

The check schedule is fixed: once at app startup (after a 30s warm-up so it doesn't compete with first-paint) and every 6 hours while the app is running. The interval is intentionally not user-configurable to keep the UI surface small.

### Decision: Channels are spelled `stable` / `beta` in UI but `latest` / `beta` in `electron-updater`

**Why:** `electron-updater`'s default stable channel is named `latest`; that string is awkward in user-facing UI ("you are on the latest channel"). The renderer translates between the two. Pre-releases on GitHub tagged `vX.Y.Z-beta.N` will publish to the `beta` channel automatically via `electron-builder`'s `channel` detection from the version string.

### Decision: Linux `.deb` is excluded from the updater

**Why:** `electron-updater` does not support deb upgrades; users who installed via apt should update via apt. The updater detects the package format on launch (presence of `process.env.APPIMAGE`) and only enables itself for AppImage and the macOS/Windows builds. On unsupported platforms the renderer shows the current version with a "Updates managed by your package manager" note instead of the auto-update controls.

### Decision: Do not block on signing in dev / unsigned builds

**Why:** Local `npm run dev` should not crash because the running binary is unsigned. The updater is initialized only when `app.isPackaged` is true; otherwise it is a no-op stub that reports `idle` and a "Updates disabled in development" message.

## Risks / Trade-offs

- **[Risk]** macOS auto-update silently fails for unsigned/un-notarized builds → **Mitigation:** Migration plan blocks first auto-update release on completing Apple Developer ID signing + notarization; release workflow fails the build if `CSC_LINK` and `APPLE_ID` env vars are missing on the mac job.
- **[Risk]** GitHub API rate limits if many clients check at once → **Mitigation:** 6-hour interval plus the 30s startup delay keeps per-user request volume low; GitHub's anonymous rate limit (60/hr/IP) is comfortably above this. If we hit limits, we can switch to a CDN-fronted JSON feed.
- **[Risk]** A bad release auto-installs and breaks all users → **Mitigation:** use `electron-builder`'s staged rollout (`stagingPercentage`) for risky releases; document a "yank a release" procedure (delete the GitHub release + its `latest*.yml` so existing clients revert to seeing the previous one).
- **[Risk]** Update download interrupts a user's terminal session on quit-to-install → **Mitigation:** install only happens on user-initiated quit *or* an explicit "Restart now" click; the existing clean-shutdown path in the desktop shell already terminates PTYs before exit, so no behavior change is needed there.
- **[Trade-off]** No user-visible "check every N hours" setting. We accept the reduced configurability in exchange for a simpler settings surface; power users can disable auto-check entirely if 6h is too aggressive.
- **[Trade-off]** Channel is a binary stable/beta toggle, not arbitrary tags. Keeps the UI simple; can be expanded later without breaking the persisted setting.

## Migration Plan

1. **Prerequisites (one-time, outside this change's code):**
   - Obtain an Apple Developer ID Application certificate; load into the macOS release runner as `CSC_LINK` / `CSC_KEY_PASSWORD` and configure notarization (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).
   - Obtain a Windows code-signing certificate; load into the Windows runner as `CSC_LINK` / `CSC_KEY_PASSWORD`.
2. **Land code (this change):** updater module, IPC, renderer UI, settings, menu entry, `publish` config, dev-mode no-op.
3. **First signed release (`v0.7.0`):** built via `electron-builder --publish always`, uploaded to GitHub with feed files. Existing users (`<= 0.6.x`) will not auto-update *to* this release because they do not have the updater yet — they upgrade manually one last time.
4. **Subsequent releases:** any `v0.7.0+` user receives them automatically.
5. **Rollback:** if a release is bad, remove its `latest*.yml` from the GitHub release assets (or delete the release). Clients that already downloaded the update can be told to skip via a follow-up release with a higher version number; there is no remote kill switch.

## Open Questions

- Should the beta channel be enabled in v1 of this feature, or shipped dark and toggled on once we have actual pre-releases to test it against? (Current plan: ship the toggle disabled-by-default; surface in settings only after the first beta tag exists.)
- Do we want a tiny telemetry ping (anonymous version + platform) on update install to measure adoption, or stay strictly zero-telemetry? (Default: stay zero-telemetry; revisit if release confidence becomes an issue.)
