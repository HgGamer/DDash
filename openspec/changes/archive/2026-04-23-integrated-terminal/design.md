## Context

dash already runs one dedicated PTY per project/worktree to host the `claude` CLI, managed by `PtySessionManager` in `src/main/pty-session.ts`. The renderer attaches an xterm.js instance in `TerminalPane`. Users currently need an external terminal (Terminal.app, iTerm, tmux) for anything else — running dev servers, tests, scripts — which breaks the "single workspace" loop.

Adding a second, general-purpose PTY surface is architecturally cheap: `node-pty`, `xterm`, the style-settings resolver, and the per-selection lifecycle hooks already exist. The interesting design work is about *where* new sessions live, *how* they're keyed, *when* they die, and how the UI integrates without fighting the existing Git dock for space.

## Goals / Non-Goals

**Goals:**
- Bottom-docked, tabbed shell panel scoped per `(projectId, worktreeId?)`.
- Sessions outlive panel collapse (running processes keep running when the UI is hidden).
- Reuse existing terminal style settings so visuals stay consistent with the Claude pane.
- Clean up sessions when their owning project/worktree is deleted.
- Zero new runtime dependencies.

**Non-Goals:**
- Persisting shell sessions across app restarts (PTYs die with the process; reconnecting a new PTY to its scrollback is out of scope).
- Split panes, broadcast input, or tmux-style session sharing.
- Per-project/worktree overrides for shell/cwd/env — v1 uses `$SHELL` and the project/worktree path.
- Search, find-in-terminal, or link detection beyond what xterm's defaults give us.
- Opening a terminal without an active project/worktree.

## Decisions

### 1. Reuse `PtySessionManager` vs. new `ShellSessionManager`

**Chosen:** New `ShellSessionManager` in `src/main/shell-session.ts`, same shape as `PtySessionManager` but with a distinct key space and no Claude-specific bits (no `claude-resolver`, no "waiting for input" heuristic, no "restart on exit" policy).

**Why:** The Claude manager embeds Claude-specific behavior (resolver, attention flags, single session per key). Shell sessions need *N per key* (multi-tab) and should just die when they exit, not auto-restart. Forking the manager is clearer than parameterizing the existing one.

**Alternative considered:** Generalize `PtySessionManager` to support multiple sessions per key. Rejected — the Claude pane's "one session per selection" invariant is load-bearing for its UI, and bending it creates subtle bugs.

### 2. Session key

**Chosen:** `` `${projectId}:${worktreeId ?? ''}:${tabId}` `` where `tabId` is a renderer-generated UUID.

**Why:** Matches existing composite-key pattern in `src/shared/ipc.ts` (`compositeKey`) and extends it with a tab discriminator. Keeps lookup O(1) and makes cleanup-on-project-removal a prefix match.

### 3. Session lifecycle

- **Spawn:** on user-initiated "new tab" (explicit button, keyboard shortcut, or automatically when opening the panel for a project/worktree that has zero tabs).
- **Persist across panel collapse:** yes. Collapsing hides the dock `<div>` but does not call `shell:close`.
- **Persist across tab switch in the workspace:** yes. Switching projects swaps the visible tab set but backgrounded PTYs keep running (they're buffered by node-pty).
- **Die on:** explicit close (×), project/worktree removal, app quit, or PTY exit.
- **No auto-restart.** When a shell exits, the tab shows `[process exited: <code>]` and stays until the user closes it or opens a new one.

### 4. Output buffering while hidden

xterm.js instances are expensive to keep mounted for hidden tabs. Options:

- **(a)** Keep all xterm instances mounted but hidden (like Claude tabs do today).
- **(b)** Destroy xterm on hide, replay buffered PTY output from a ring buffer on show.
- **(c)** Mount only tabs for the active project/worktree; destroy the rest.

**Chosen:** (c) with a capped ring buffer (10k lines) in the main process per session. Only the active selection's shell tabs mount xterm instances; switching projects disposes the prior set and remounts the new set with a replay from the buffer.

**Why:** 10+ backgrounded projects each with 3 tabs = 30 xterm instances, which is measurably slow. (c) bounds the renderer cost and keeps the main-process bookkeeping small (a bounded buffer per PTY).

**Trade-off:** `Ctrl+L` / `clear` won't clear scrollback from before the replay — the buffer is append-only. Acceptable for v1.

### 5. Panel layout

Workspace becomes a **column** (terminals + git-view on top, shell dock on bottom), where the top row is the existing `.workspace-split` flex row. Resize handle on the shell dock's top edge. Height clamped to `[120px, 80% of workspace height]`.

**Alternative considered:** Make the shell panel a sibling of the git dock in the same row. Rejected — horizontal real-estate is already contested by the git dock, and shell output benefits from width more than height.

### 6. Tabs UI

Simple horizontal tab strip inside the dock: `[cwd-label] [× ]  [cwd-label] [× ]  [+]`. No drag-to-reorder in v1. Double-click to rename. Active tab highlighted with the accent color. If the tab label would exceed ~20 chars, truncate with ellipsis and show the full cwd in a tooltip.

### 7. Settings

New section in `settings.json`:

```ts
interface IntegratedTerminalSettings {
  version: 1;
  enabled: boolean;        // default true
  expanded: boolean;       // default false
  height: number;          // default 240, clamped [120, workspace*0.8] at render time
  defaultShell?: string;   // default: $SHELL → /bin/zsh (darwin/linux) or %COMSPEC% (win)
}
```

Persisted/migrated in `src/main/store.ts`, exposed via `SettingsManager.getIntegratedTerminal()` / `setIntegratedTerminal(patch)`, mirroring the existing `gitView` pattern.

### 8. IPC surface

```
shell:open      ({ projectId, worktreeId?, tabId, cols, rows }) → { ok } | { ok: false, reason }
shell:close     ({ tabId }) → { ok }
shell:write     ({ tabId, data })
shell:resize    ({ tabId, cols, rows })
shell:list      ({ projectId, worktreeId? }) → Array<{ tabId, cwd, shell, startedAt }>
shell:data      event → { tabId, data }   // PTY output
shell:exit      event → { tabId, code }   // PTY exited
```

All mutating channels return `{ ok, reason? }`, never throw across IPC — matches the git IPC convention.

### 9. Keyboard shortcuts

- `Ctrl/Cmd+\`` → toggle panel expanded/collapsed.
- `Ctrl/Cmd+Shift+\`` → new tab in active project/worktree (also expands if collapsed).
- Arrow-key tab switching is out of scope for v1 — use mouse.

Registered in the renderer (same pattern as existing shortcuts in `App.tsx`), not as Electron accelerators, so they only fire when the app has focus and don't fight system shortcuts.

## Risks / Trade-offs

- **[Many backgrounded PTYs → memory bloat]** → Capped 10k-line ring buffer per session. If users routinely open 50+ tabs this becomes measurable; revisit if it lands.
- **[PTY processes outlive the user's mental model]** → The tab label is the only "hey, this is still running" indicator. Acceptable for v1; future polish could add a process-name or "running" dot.
- **[xterm dispose/remount on project switch adds latency]** → Measured at ~30–60ms per tab in dev. Users switching projects are already waiting on Claude pane swaps of similar cost, so no user-visible regression expected.
- **[`$SHELL` not set on some Windows setups]** → Fall back to `%COMSPEC%` → `cmd.exe`. Document the `defaultShell` setting override.
- **[Shell exit is invisible if tab is backgrounded]** → When the user returns to that project, the tab shows `[process exited: code]` inline. Not pushed as a notification in v1.

## Migration Plan

Additive only:
1. Ship behind `integratedTerminal.enabled = true` by default; users can disable via Settings.
2. No schema migration needed beyond adding the new settings section with defaults in `migrateSettings`.
3. Rollback: flip `enabled = false` — the dock and statusbar button disappear, IPC handlers remain registered but idle.

## Open Questions

- Should tab order persist across app restarts (just the labels/cwd list, not the live processes)? Leaning **no** for v1 — restarting is a clean slate.
- Should we expose "open current file's directory" as a tab cwd override? Deferred; v1 always uses project/worktree root.
