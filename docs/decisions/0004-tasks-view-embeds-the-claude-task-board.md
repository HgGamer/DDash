# 0004 — The Tasks view embeds the claude.ai task board instead of re-implementing it

## The question

When several Claude Code sessions run in parallel (one per Dash tab, plus
others), it gets hard to keep track of what each one is doing and, above all,
what is blocked waiting for the user's answer. The sessions already report their
tasks to a shared **task board**: a claude.ai artifact page with its own
database, written by every session through the `ArtifactData` tool (statuses
`fut` running, `rad_var` waiting for the user, `sorban` queued, `kesz` done).
The ask was to see that board inside Dash — its own view in the activity bar,
under Board, filling the main area — with what waits for the user flashing, and
openable in a separate window.

## Options

1. **Re-implement the board natively in Dash** (read the artifact database and
   render a React list). The artifact database is only reachable through
   claude.ai's runtime or Claude's own tools; there is no documented API Dash
   could call with the local OAuth token, so this would rest on an undocumented
   endpoint.
2. **A local mirror file** that sessions write next to the artifact. Two sources
   of truth, and every session would have to write both.
3. **Embed the artifact page itself** in an Electron `<webview>` (and a pop-out
   `BrowserWindow`), logged in once to claude.ai in a persistent partition.

## The decision

Option 3. The page stays the single owner of the data, the editing (adding a
task, changing a status) and the login; Dash only frames it.

- **Partition:** `persist:dash-tasks`, shared by the embedded view and the
  pop-out window, so the claude.ai login is needed once and survives restarts.
- **Locked-down guest:** `will-attach-webview` forces that partition, removes any
  preload and turns node integration off and sandboxing on, whatever the
  renderer asked for; navigation and popups are limited to claude.ai and the
  identity providers its login uses (Google, Apple, Microsoft); any other link
  opens in the system browser (`src/main/tasks-window.ts`).
- **Counters for the badge and the status-bar alert:** the artifact page runs in
  a sandboxed iframe inside claude.ai's shell, out of reach of the renderer. The
  main process runs a read-only probe in every frame of the guest
  (`frame.executeJavaScript`) that reads the page's three counters by id
  (`#c-fut`, `#c-rad`, `#c-sor`) every 10 s.
- **Always mounted:** the view is hidden, not unmounted, so the counters keep
  updating while another view is shown; when shown, it covers the whole main
  area (the workspace stays mounted underneath, terminals keep running).
- **Attention:** a pulsing badge on the Tasks icon and a pulsing "⚠ N waiting for
  you" button in the status bar; both stop under `prefers-reduced-motion`.

## What it costs

- The counters depend on three element ids of the artifact page. If the page is
  redesigned, the badge silently shows nothing until the probe is updated; the
  view itself keeps working.
- The board URL is a constant (`src/shared/tasks.ts`). Pointing Dash at another
  board means editing it; a setting can come later if anyone else uses the view.
- The first open needs a claude.ai login inside Dash.

## Also in this change

- **Plan usage popover:** clicking the status bar's plan gauge opens the exact
  percentage of each window (5-hour, weekly, and the Opus/Sonnet weekly windows
  when the plan reports them) with the reset time as a date and a countdown. The
  data is the existing `/usage` fetch; nothing new is called.
- **`DASH_USER_DATA` (dev only):** points `npm run dev` at its own settings
  folder, so a dev window beside an installed Dash neither restores and
  respawns the same project tabs nor writes into the release's store.
