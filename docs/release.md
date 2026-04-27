# Release process

Dash uses [`electron-builder`](https://www.electron.build/) to produce installers and [`electron-updater`](https://www.electron.build/auto-update) to ship them to running clients via GitHub Releases.

## Required environment

- `GH_TOKEN` — a GitHub PAT with `repo` scope. Used by `electron-builder --publish` to upload artifacts and `latest*.yml` feed files to the release.
- **macOS signing + notarization** (required — `electron-updater` refuses unsigned bundles):
  - `CSC_LINK` — base64 or `file://` path to your Developer ID Application `.p12`.
  - `CSC_KEY_PASSWORD` — password for the `.p12`.
  - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` — for notarization via `notarytool`.
- **Windows signing** (required for silent NSIS installs):
  - `CSC_LINK` and `CSC_KEY_PASSWORD` — code-signing `.p12` and its password (use distinct values from the macOS cert if you keep both on one runner).

## Cutting a release

1. Bump `version` in `package.json` (`x.y.z` for stable, `x.y.z-beta.N` for beta).
2. Commit and tag (`git tag vX.Y.Z && git push --tags`).
3. With the env vars above set, run:
   ```
   npm run dist:publish
   ```
   This builds the renderer, builds the installers, and uploads them — plus `latest-mac.yml`, `latest.yml`, and `latest-linux.yml` — to a GitHub Release matching the tag.
4. Verify the new release page on GitHub lists the platform installers and the `latest*.yml` feed files.

A version tagged `*-beta.*` is automatically published to the `beta` channel; users have to opt in via **Settings → Updates → Update channel** before they receive it.

## Yanking a bad release

If a published release is broken, clients that have not yet downloaded it can be saved by removing the feed files:

1. On the GitHub release page, delete the `latest-mac.yml`, `latest.yml`, and `latest-linux.yml` assets (keep the installers if you want to leave them downloadable manually).
2. Clients that haven't picked it up will fall back to seeing the previous release as the newest.
3. Clients that **already** downloaded the bad update will install it on next quit. Recover them by publishing `vX.Y.Z+1` with a fix; the in-place updater will pick that up on the next 6-hour cycle.

There is no remote kill switch — older clients cannot be force-rolled-back.
