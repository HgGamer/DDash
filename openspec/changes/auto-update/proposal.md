## Why

Dash currently has no in-app update mechanism: users on macOS, Windows, and Linux must manually visit the project page, download a new installer, and reinstall to get bug fixes and new features. This causes the user base to fragment across versions and slows the feedback loop on releases. Adding auto-update will keep users on the latest release with minimal friction.

## What Changes

- Add an auto-update capability backed by `electron-updater`, fed by GitHub Releases as the update feed.
- On startup (and on a periodic interval while running), the app checks for a newer published release and downloads it in the background.
- When an update has been downloaded, the user is notified in-app and can choose to restart-and-install now or defer to the next quit.
- Add a manual "Check for updates…" entry to the application menu and a status indicator in the settings/about area showing current version, last check time, and update state.
- Add user-facing settings to enable/disable automatic checking and to choose between stable-only and pre-release channels (default: stable, auto-check enabled).
- Wire the existing `electron-builder` config to publish update artifacts (and a `latest*.yml` feed) to GitHub Releases for `mac` (dmg + zip), `win` (nsis), and `linux` (AppImage). Code signing/notarization on macOS and Windows are tracked as part of this change since `electron-updater` requires signed artifacts on those platforms.
- **BREAKING** for the release pipeline: the existing `dist:*` scripts must produce update-feed artifacts and be published via `electron-builder --publish`, not just locally built.

## Capabilities

### New Capabilities
- `auto-update`: in-app discovery, download, notification, and installation of new application releases, plus user controls for channel and frequency.

### Modified Capabilities
- `desktop-shell`: application menu and lifecycle gain "Check for updates…" entry and quit-to-install behavior.

## Impact

- **Code**: new main-process module for the updater (wraps `electron-updater`), new IPC channel and renderer UI for update state, new settings entries, additions to the application menu in the desktop shell.
- **Dependencies**: adds `electron-updater` (runtime) and configures `electron-builder` `publish` provider (`github`).
- **Build/release pipeline**: `electron-builder.yml` gains a `publish` block; release workflow must run `electron-builder --publish always` with a `GH_TOKEN`. macOS builds must be signed and notarized; Windows builds must be signed for silent installation to succeed.
- **Settings/storage**: new persisted preferences (`autoUpdate.enabled`, `autoUpdate.channel`, `autoUpdate.lastCheckedAt`).
- **Privacy**: the app will issue periodic outbound HTTPS requests to GitHub's release feed; this should be disclosed in the README.
