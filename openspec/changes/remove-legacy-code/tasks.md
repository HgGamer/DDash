## 1. Remove the Todo backend

- [x] 1.1 Delete `todo:*` and `settings:*TodoView` channels + arg/return types from `shared/ipc.ts` and the `DashApi` surface
- [x] 1.2 Remove Todo handlers from `main/ipc.ts` and the exposed methods in `preload/index.ts`
- [x] 1.3 Remove Todo methods/fields from `main/registry.ts`, `main/settings.ts` (no real `auto-updater.ts` ref — the grep hit was `autoDownload`)
- [x] 1.4 `main/store.ts`: stop reading `todos` in `normalizeProject`; drop `migrateTodoView`/`normalizeTodo`; old `todos`/`todoView` keys are ignored on load
- [x] 1.5 Remove `Todo`, `TodoViewSettings`, `DEFAULT_TODO_VIEW_SETTINGS`, and `todos`/`todoView` from `shared/types.ts`
- [x] 1.6 Remove `todoView`/`setTodoView` from renderer `store.ts` and the unused `TodosIcon` from `icons.tsx`; delete dead `.todo-view*` CSS; fix `Project` literal in `test/git-worktrees-with-heads.test.ts`
- [x] 1.7 Old state files with `todos`/`todoView` load without error (typecheck + 95 tests green)

## 2. Remove the legacy web UI — DROPPED

`web-ui-legacy.ts` is NOT dead code: it is a deliberate ES5 fallback served to
pre-ES6 WebKit browsers (BlackBerry 10 / PlayBook) and via `?ui=legacy`. Kept by
decision. This task group is intentionally not implemented.

- [x] 2.1 Investigated: `LEGACY_APP_HTML` is an intentional legacy-browser fallback in `web-server.ts` → keep

## 3. Finish the CSS migration

- [x] 3.1 Removed the legacy variable-alias `:root` block from `styles.css`
- [x] 3.2 Ported all alias-using rules to `--color-*` tokens (145 replacements across `styles.css`, `GitView.tsx`, `TerminalPane.tsx`); deleted the "legacy" comment
- [x] 3.3 `npm run lint:colors:strict` passes

## 4. Verify

- [x] 4.1 `npm run typecheck && npm run lint && npm test` green (95 tests) + `npm run build` succeeds
- [x] 4.2 No Todo references remain in `src` (grep clean, excluding the `autoDownload` false positive)
- [x] 4.3 Todo backend removed. NOTE: legacy web UI kept by decision (intentional ES5 fallback), so the big deletion in the original plan did not land
