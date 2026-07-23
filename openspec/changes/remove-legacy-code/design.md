## Context

Three independent piles of dead/transitional code: (1) the Todo backend, still
wired through IPC/registry/store/settings after the UI was removed; (2)
`web-ui-legacy.ts`, a ~1,135-line remote web page served by `web-server.ts`
alongside the current `web-ui.ts`; (3) the CSS mid-migration, with a legacy
variable-alias block in `styles.css` bridging old rules onto the new tokens.

## Goals / Non-Goals

**Goals:**
- Delete the Todo feature completely with a safe load path for old state files.
- Remove the legacy remote web UI if unused.
- Retire the CSS alias layer so tokens are the single source of truth.

**Non-Goals:**
- Refactoring the *current* web UI (`web-ui.ts`) or the remote-access feature.
- Splitting large files (e.g. `GitView.tsx`) — separate cleanup.

## Decisions

- **Store migration tolerates, then drops, Todo data.** `normalizeProject` stops
  reading `todos`; `serializeForDisk` stops writing `todoView`/`todos`. Old files
  load fine (extra keys ignored) and are rewritten clean — no destructive migration
  step, no version bump needed.
- **Gate the legacy web UI deletion on a usage check.** Confirm no client path hits
  `LEGACY_APP_HTML` (grep routes + a manual check of the remote page) before
  deleting; if a fallback is still needed, keep it one release with a deprecation
  note. Bias to delete.
- **Finish CSS migration in place.** Remove the alias `:root` block and port the few
  remaining rules to tokens, guarded by the existing `lint:colors` check.

## Risks / Trade-offs

- [An external tool calls a `todo:*` IPC channel] → unlikely (single-client desktop
  app); a grep of the repo + preload surface confirms before removal.
- [The legacy web page is still reachable by an old remote client] → verify routes;
  keep for one release if any doubt.
- [Removing CSS aliases breaks an un-migrated rule] → `lint:colors` + a manual pass
  over each removed alias's usages.

## Migration Plan

- Ship additively-safe: old persisted state loads and self-heals on next write.
- Rollback: revert the deletions; no data is destroyed (Todo data simply stops being
  read/written, and is recoverable from a pre-change backup if ever needed).

## Open Questions

- Is the legacy remote web UI still relied on by any deployed client? (Must confirm
  before deleting `web-ui-legacy.ts`.)
