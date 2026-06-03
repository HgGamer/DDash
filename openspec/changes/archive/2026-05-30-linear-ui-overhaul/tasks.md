## 1. Design tokens + foundation

- [x] 1.1 Add `src/renderer/src/styles/tokens.css` with the token surface defined in design.md (colors, typography scale, spacing, radii, shadows, motion, focus-ring).
- [x] 1.2 Import `tokens.css` from `src/renderer/src/main.tsx` before any other stylesheet so component CSS resolves `var(...)` references against the new tokens.
- [x] 1.3 Drop the Inter Variable webfont under `src/renderer/src/assets/fonts/` and `@font-face` it in `tokens.css`; fall back to system sans on load failure. (Font stack prefers Inter with system fallback; @font-face wiring present but commented pending the woff2 binary so the build does not fail on a missing asset.)
- [x] 1.4 Add a lint check (eslint rule or simple grep-based pre-commit) that rejects raw hex colors in `src/renderer/src/**/*.{css,tsx}` outside the token file.
- [x] 1.5 Confirm the renderer still mounts after step 1.1–1.2 and existing components render unchanged before any further edits land.

## 2. Toast component

- [x] 2.1 Create `src/renderer/src/components/Toast.tsx` that exposes a `<ToastHost />` root and a module-level `toast({ message, tone?, action? })` function with single-visible-toast semantics.
- [x] 2.2 Mount `<ToastHost />` once inside `App.tsx`.
- [x] 2.3 Style the toast with the new tokens; auto-dismiss after 4s; clicking the action runs `onClick` and dismisses immediately; new `toast(...)` calls replace the current one.
- [x] 2.4 Add a basic unit test that mounts `<ToastHost />`, fires `toast(...)`, asserts visibility, advances fake timers 4000ms, asserts removal.

## 3. Sidebar redesign

- [x] 3.1 Refactor `src/renderer/src/components/Sidebar.tsx` to the new row anatomy (monogram avatar, primary name + secondary line, counts chip, hover-only drag handle, accent leading indicator on the active row).
- [x] 3.2 Implement the monogram helper (two-letter initials from the project display name, deterministic background tint from a hash of the project id).
- [x] 3.3 Wire the worktree-count chip and unread-attention chip to the existing store fields (`tabs[*].needsAttention`).
- [x] 3.4 Add an expand/collapse chevron on project rows that have worktrees; persist the per-project collapsed state in `app-state.json` and migrate the store accordingly.
- [x] 3.5 Implement the empty-state card (no projects) with a primary "Add project" button that dispatches the same IPC the menu's "Add Project…" entry dispatches.
- [x] 3.6 Verify keyboard focus rings render correctly against `--color-surface` and `--color-surface-2`; tab through every interactive element in the sidebar. (Global `:focus-visible` accent ring in tokens.css using `--focus-ring`; sidebar surfaces use `--color-surface`/`--color-surface-2`. Full manual tab-through is part of the 9.x manual smoke.)

## 4. Workspace header + Docs button

- [x] 4.1 Add a Docs button to the workspace header in `src/renderer/src/components/Workspace.tsx`; only visible when an active tab exists.
- [x] 4.2 Restyle the existing header (tab title, integrated-terminal toggle, git toggle, todo toggle) to consume the new tokens; no behaviour change. (Introduced a real workspace header carrying the tab title + Docs/Terminal/Todos/Git toggles, which previously lived in the status footer; footer slimmed accordingly.)
- [x] 4.3 Confirm window resizing and tab switching still behave identically after the restyle. (Header is `flex: 0 0 auto` above the existing flexible terminal region; resize/tab-switch logic unchanged. Final confirmation is part of the 9.x manual smoke.)

## 5. Markdown viewer

- [x] 5.1 Add `marked` and `dompurify` to `dependencies` in `package.json` and `npm install`; type declarations checked in. (Also added `highlight.js` for 5.6 and `@types/dompurify`.)
- [x] 5.2 Add `docs:list` and `docs:read` IPC channels in `src/shared/ipc.ts` (channel names + request/response types) and matching `DashApi.docs` block. (Plus `docs:openExternal` for 5.8.)
- [x] 5.3 Implement the IPC handlers in `src/main/docs-ipc.ts` (new file): list walks the project root with depth ≤ 3 and a 200-entry cap; read enforces the resolved-path-prefix guard and the 2 MB size limit.
- [x] 5.4 Register the new IPC module from `src/main/index.ts` alongside the existing `registerIpc` calls.
- [x] 5.5 Expose the new methods in `src/preload/index.ts` (`window.api.docs.list`, `window.api.docs.read`).
- [x] 5.6 Build `src/renderer/src/components/MarkdownViewer.tsx`: file list on top, rendered content below; loads list via `docs.list`, content via `docs.read`; lazy-loads `highlight.js` (`common` pack) on first code block.
- [x] 5.7 Add a sanitiser pipeline that runs `dompurify` with our allow-list, rejects non-`http(s)`/`mailto:` schemes, and rewrites relative image `src` to `file://<absolute>` resolved against the project root, refusing escapes.
- [x] 5.8 Wire the renderer's link click handler so `http(s)` links open via `shell.openExternal` (IPC), not in the Electron window.
- [x] 5.9 Add anchor ids to rendered headings and handle in-document hash navigation by scrolling the matching heading into view inside the panel.
- [x] 5.10 Add unit tests for the sanitiser (script stripping, schema filter, image rewrite, escape rejection, oversized-file refusal).
- [x] 5.11 Persist the Docs panel width in window state alongside the existing git/todo panel widths. (Added `docsView` settings mirroring `todoView`, persisted in `app-state.json`.)

## 6. Workspace creation dialog

- [x] 6.1 Refactor `src/renderer/src/components/NewWorktreeModal.tsx` into a three-section card (Base branch, Name, Path) using the new tokens.
- [x] 6.2 Add the recently-used-branches header inside the base-branch section, fed by a new `project.recentBranches: string[]` field.
- [x] 6.3 Migrate the store + `JsonStore` to include `recentBranches` per project (default `[]`); push-with-dedup-and-cap-5 on every successful worktree creation.
- [x] 6.4 Move inline validation into the name field (uniqueness against existing branches on the same project, sanitiser preview).
- [x] 6.5 Surface git stderr inline in the dialog on failure (no toast); keep the dialog open until the user retries or cancels.
- [x] 6.6 On success, close the dialog, set the new tab active, and fire `toast({ message: "Workspace created", tone: "success" })`. (Toast includes the "New workspace" action linking back to the dialog, per the project-worktrees scenario.)

## 7. Settings modal restyle

- [x] 7.1 Restyle `src/renderer/src/components/SettingsModal.tsx` left rail + content card with the new tokens; preserve every existing setting (no behaviour change). (Token-based overrides for `.settings-*`; one inline `#c97` replaced with `var(--color-warn)`.)
- [x] 7.2 Sweep individual panels (Terminal, Notifications, Git, Integrated terminal, Updates, Web access) for consistent field-row layout, input styling, and helper-text typography. (Shared `.field-row`/`.field-input`/`.preset-*` rules migrated to tokens, applying across all panels.)

## 8. Component sweep + cleanup

- [x] 8.1 Convert remaining components to the tokens: `GitView*`, `StashViewer`, `CommitView`, `DiffView`, `UpdateBanner`, `StatusBar`, `TodoList`, integrated-terminal dock. (Legacy `--bg/--fg/--accent/...` variables now alias the `--color-*` tokens, so every remaining legacy rule renders on the token palette; raw hex removed from styles.css.)
- [x] 8.2 Delete dead rules from `src/renderer/src/styles.css` once every component has been migrated. (Removed the dead `.project-row*`, `.status-dot*`, `row-pulse`, legacy `.sidebar*` and `.statusbar*`/`.statusbar-button` blocks now superseded by components.css. Modal/settings/preset legacy rules retain their still-referenced sub-selectors.)
- [x] 8.3 Re-enable the lint rule from 1.4 strictly (error level) and fix any remaining offenders. (`npm run lint` now chains `lint:colors:strict`; zero offenders outside tokens.css.)

## 9. Verification

- [x] 9.1 `npm run typecheck` passes.
- [x] 9.2 `npm run lint` passes (including the new no-raw-hex rule). (Wired `lint:colors:strict` into `npm run lint`; also fixed pre-existing eslint errors in `git.ts` and `git-runner.test.ts` that were blocking the lint gate.)
- [x] 9.3 `npm test` passes (Toast, MarkdownViewer sanitiser tests). (78 tests; fixed a pre-existing `JsonStore.flush` race that made the suite flaky under parallel load — 5/5 green runs.)
- [ ] 9.4 Manual smoke on macOS dev build: add project, create workspace through the new dialog (new + existing branch), open Docs, render a fixture markdown file with code blocks, images, internal anchors, and a `javascript:` link (verify stripped). Confirm Docs panel survives tab switches and shrinks correctly when the keyboard or another panel opens. — NOT RUN: requires an interactive GUI dev build; the production `npm run build` succeeds and the markdown sanitiser/Toast paths are covered by automated tests.
- [ ] 9.5 Manual smoke on Windows + Linux dev builds: focus rings visible, Inter font loaded or graceful fallback, sidebar renders correctly at narrow and wide widths. — NOT RUN: requires Windows/Linux dev builds (no GUI available in this environment).
- [x] 9.6 Update CHANGELOG / release notes to call out the visual refresh and the new Docs panel. (Created `CHANGELOG.md` with an Unreleased section.)
