# Local builds

`docs/release.md` covers cutting a signed, published release. This is the other
thing we do often: building the Windows artifacts on a dev machine to hand to
someone, or to try a change in the real app rather than in `npm run dev`.

## Building

```
npm run dist:win
```

That is `electron-vite build` into `.stage/` followed by `electron-builder --win`,
which rebuilds `node-pty` for the target and writes both Windows targets from
`electron-builder.yml`:

```
release/<version>/
  Dash-<version>-win-x64-setup.exe      NSIS installer, per-user, no admin prompt
  Dash-<version>-win-x64-setup.exe.blockmap
  Dash-<version>-win-x64-portable.exe   single-file, nothing installed
  latest.yml                            auto-update feed (only useful once published)
  win-unpacked/                         the unpacked app, handy for a quick check
```

Hand over **setup.exe** for a normal install — that is the one `electron-updater`
can later update in place; **portable.exe** is for trying a build without
touching an existing installation. The output directory is keyed by `version`
from `package.json`, so builds of different versions sit side by side and an old
one is never silently overwritten.

## Before you build

- **After pulling or rebasing, run `npm install` first.** Dependencies move
  between `dependencies` and `devDependencies` as the bundle is tuned, and
  `electron-builder` packs `node_modules` as it finds it — a stale tree either
  bloats the artifact or drops something the app needs at runtime.
- **Do not bump `version` to get a distinct artifact.** The version belongs to
  the release commits in `main`; bumping it locally produces a build that claims
  to be a release that does not exist, and it collides the moment upstream
  releases that number. Build from the branch as it is; if two builds of the same
  version have to be told apart, rename the file you hand over.
- A local build is **unsigned**. It installs and runs, SmartScreen will warn on
  first run, and auto-update will not accept it — that is expected, and it is why
  real releases go through `npm run dist:publish`.

## When the build fails

- `winCodeSign` extraction errors on Windows come from a half-downloaded
  electron-builder cache: delete `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign`
  and build again, which re-downloads it.
- A build that succeeds but starts with a blank window usually means `.stage/`
  is stale from an interrupted `electron-vite build`; remove it and rebuild.

## Running `npm run dev` beside an installed Dash

The dev build and an installed Dash read the same settings folder by default, so
a dev window restores the same project tabs and starts a second Claude Code
session in them. Give the dev run its own folder:

```
DASH_USER_DATA="$APPDATA/dash-dev" npm run dev        # Git Bash
$env:DASH_USER_DATA="$env:APPDATA\dash-dev"; npm run dev   # PowerShell
```

It starts with no projects; anything you add there stays in that folder.
