## Why

The rebrand-to-Dash and the `newdesign` rework left the codebase carrying dead and
transitional code: the Todo feature's UI was removed but its backend still exists,
a full legacy remote web UI (`web-ui-legacy.ts`, ~1,135 lines) is still shipped, and
the CSS is mid-migration behind a legacy alias layer. Removing this shrinks the
surface, the bundle, and the maintenance burden while the redesign is already
touching these areas.

## What Changes

- **Remove the Todo feature end-to-end.** The UI is already gone; delete the
  remaining IPC channels (`todo:*`, `settings:*TodoView`), registry methods, store
  fields, settings, and shared types. **BREAKING** for any external caller of the
  `todo:*` IPC (none expected — the desktop app is the only client).
- **Delete `web-ui-legacy.ts`** and its `LEGACY_APP_HTML` usage in `web-server.ts`,
  after confirming no client depends on the legacy remote page.
- **Finish the CSS migration.** Remove the legacy alias block and any un-migrated
  rules from `styles.css`; all component styles reference design tokens directly.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `visual-design-system`: component styles reference design tokens directly with no
  legacy alias/compatibility layer.

### Removed Capabilities
- `todos`: the project to-do list feature is removed entirely (UI + backend).

## Impact

- Todo removal: `shared/ipc.ts`, `shared/types.ts`, `main/registry.ts`,
  `main/store.ts`, `main/settings.ts`, `main/ipc.ts`, `main/auto-updater.ts`,
  `preload/index.ts`, renderer `store.ts`, `components/icons.tsx`.
- Legacy web UI: `main/web-ui-legacy.ts` (delete), `main/web-server.ts` (drop the
  legacy route/import).
- CSS: `renderer/src/styles.css` (remove legacy aliases + migrated rules).
- Persisted state: drop `todoView` / project `todos` on write; migration tolerates
  their presence in old files and ignores them.
