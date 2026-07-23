## 1. Data model & persistence

- [ ] 1.1 Add `ProjectFolder` type and `Project.folderId` to `shared/types.ts`; add `folders: []` to `AppState`/defaults
- [ ] 1.2 `main/store.ts`: `normalizeFolder`, migrate/normalize `folders`, read `folderId` on projects
- [ ] 1.3 `registry.ts`: `listFolders`, `createFolder`, `renameFolder`, `removeFolder` (unfile members), `setFolderCollapsed`, `reorderFolders`, `setProjectFolder` (ignore unknown ids)

## 2. IPC surface

- [ ] 2.1 Add folder channels + `project:setFolder` and arg types to `shared/ipc.ts` and the `DashApi` surface
- [ ] 2.2 Wire handlers in `main/ipc.ts` and expose them in `preload/index.ts`

## 3. Renderer state

- [ ] 3.1 Add `folders` + `setFolders` to renderer `store.ts`
- [ ] 3.2 Load folders alongside projects in `App.tsx` refresh

## 4. Sidebar UI

- [ ] 4.1 Group rendering: folders (collapsible) with nested projects + an ungrouped section
- [ ] 4.2 Folder header: create/rename inline, delete + collapse, count chip, drop target with highlight
- [ ] 4.3 Drag a project onto a folder to assign; drop on "Top level" to unfile
- [ ] 4.4 Right-click: project "Move to folder ▸ / New folder…"; folder "Rename / New folder / Delete"
- [ ] 4.5 "New folder" button in the Projects header
- [ ] 4.6 Folder styles in `styles/components.css`

## 5. Context menus (shared)

- [ ] 5.1 Portal all context menus to `document.body` (project, folder, file-explorer, terminal dock)
- [ ] 5.2 Add keyboard support: arrow navigation, Enter to activate, Escape to close + return focus
- [ ] 5.3 Preserve close-on-outside-click / blur behavior after portaling

## 6. Verify

- [ ] 6.1 Registry test: assign to folder, ignore unknown id, delete unfiles members (extend `test/registry.test.ts`)
- [ ] 6.2 `npm run typecheck && npm run lint && npm test` green
- [ ] 6.3 Manual: create/rename/delete/collapse folders, drag + menu assignment, reload persistence, menu z-order + keyboard
