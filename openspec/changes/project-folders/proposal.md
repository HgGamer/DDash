## Why

As the project list grows, a flat sidebar becomes hard to manage. Users want to
group related projects (e.g. Work / Personal / Clients) and collapse groups they
aren't using. This was prototyped on the `newdesign` branch; this change specifies
it and hardens the interaction (including making context menus behave correctly).

## What Changes

- Add **flat, one-level folders** to the project sidebar: create, rename, delete,
  collapse/expand, and reorder folders.
- **Assign projects to folders** by dragging a project onto a folder header, and via
  a right-click **"Move to folder ▸"** menu (including "Top level" to unfile).
- Deleting a folder moves its projects back to the top level (nothing on disk is
  touched); unknown/stale folder references fall back to the root.
- Folders and per-project membership **persist** across restarts.
- Fix context menus so they render **on top** of all app chrome (portal to the
  document root) and add **keyboard navigation** (arrow keys, Enter, Escape,
  focus management) for accessibility.

## Capabilities

### New Capabilities
- `project-folders`: flat grouping of projects — folder CRUD, collapse, reorder,
  project assignment (drag + menu), persistence, and orphan handling.
- `context-menus`: shared behavior for right-click menus — always render above
  other surfaces, and be operable by keyboard.

### Modified Capabilities
- `project-registry`: projects gain optional folder membership that survives
  reload and degrades safely when a folder is missing.

## Impact

- Shared: `types.ts` (`ProjectFolder`, `Project.folderId`), `ipc.ts` (folder
  channels + `project:setFolder`).
- Main: `registry.ts` (folder CRUD + assignment + orphan cleanup), `ipc.ts`
  handlers, `preload/index.ts`, `store.ts` (persist/normalize folders).
- Renderer: `store.ts`, `App.tsx` (load folders), `Sidebar.tsx` (grouped render,
  drag, menus), `FileExplorer.tsx`/`IntegratedTerminalDock.tsx` (portal menus),
  `styles/components.css`.
- Data: additive; existing state files load with an empty `folders` array.
