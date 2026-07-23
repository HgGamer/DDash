## Context

Projects are a flat, `order`-sorted array persisted by `ProjectRegistry` over a
`JsonStore`. The sidebar renders them with drag-to-reorder and per-project worktree
collapse. Context menus are rendered inline inside their component. The frosted
redesign put `backdrop-filter` on the sidebar and workspace, which turns those
elements into containing blocks for `position: fixed`, trapping/clipping menus.

## Goals / Non-Goals

**Goals:**
- Flat folders that are easy to manage (drag + right-click), persisted, safe on
  delete.
- Context menus that always render on top and are keyboard-operable.

**Non-Goals:**
- Nested folders (tree). Explicitly one level.
- Folder-scoped settings or per-folder sessions.

## Decisions

- **Folders are a sibling array, membership is a field.** Add `folders:
  ProjectFolder[]` to app state and `folderId?: string | null` on `Project`, rather
  than nesting projects inside folders. Keeps the existing flat `order`/reconcile
  logic intact and makes "ungrouped" the natural default. Chosen over a nested tree
  (more migration + edge cases) since the product need is one level.
- **Delete unfiles, never deletes projects.** Removing a folder clears `folderId`
  on its members. Unknown folder ids are treated as ungrouped at render and ignored
  on assignment — no orphan can vanish.
- **Assignment via drag AND menu.** Drag onto a folder header for the fast path; a
  right-click "Move to folder ▸" (incl. "Top level") for discoverability and
  keyboard users.
- **Portal context menus to `document.body`.** Fixes the backdrop-filter trap for
  all menus (project, folder, file-explorer, terminal dock) in one pattern, instead
  of reworking the glass layers. Menus use viewport coordinates already.

## Risks / Trade-offs

- [Row-drop reorder vs folder-drop assign can feel ambiguous] → folder headers are
  distinct drop targets with their own highlight; document the behavior, refine if
  users conflate them.
- [Portaled menus lose their close-on-outside-click if not wired] → keep the
  existing window-level click/blur close handlers.
- [WorktreeList's ⋯ menu is `position: absolute`] → out of scope here; clipped by
  sidebar overflow independent of folders.

## Migration Plan

- Additive: `normalizeFolder` + default `folders: []`; old state files load cleanly.
- Rollback: hide the folder UI; membership fields are ignored harmlessly.

## Open Questions

- Should folder reorder be drag-based in the UI, or is registry-level reorder plus a
  future control enough? (Registry supports it; UI affordance TBD.)
