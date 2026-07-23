## REMOVED Requirements

### Requirement: Project to-do list
**Reason**: The per-project to-do list was lightly used and its UI was removed in
the redesign; keeping the backend (IPC, registry methods, store fields, settings,
types) as dead code adds maintenance cost with no user benefit.
**Migration**: No in-app migration. Any `todos` / `todoView` data left in a persisted
state file is ignored on load and dropped on the next write. External callers of the
`todo:*` IPC channels (none expected) must remove those calls.
