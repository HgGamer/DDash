## ADDED Requirements

### Requirement: Worktree management is reachable from the Git View

The application SHALL expose worktree create and remove actions inside the Git View panel in addition to the existing sidebar entry points. Both surfaces SHALL invoke the same underlying create and remove flows defined elsewhere in this capability — same default-path computation, same dirty-tree force gating, same stderr surfacing, same registry semantics.

#### Scenario: Create from the Git View uses the same flow as the sidebar

- **WHEN** the user creates a worktree from the Git View
- **THEN** the application SHALL run the same `git worktree add` invocation, default-path computation, and registry write that the sidebar entry point would have run

#### Scenario: Remove from the Git View uses the same flow as the sidebar

- **WHEN** the user removes a worktree from the Git View
- **THEN** the application SHALL terminate the worktree's PTY, run `git worktree remove` (with `--force` only after explicit second confirmation for dirty worktrees), and update the registry — identically to the sidebar's remove action

#### Scenario: Both entry points remain available

- **WHEN** the Git View Worktrees section is added
- **THEN** the sidebar's "+ New worktree" affordance and per-row remove action SHALL continue to function unchanged
