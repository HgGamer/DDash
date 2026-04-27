## ADDED Requirements

### Requirement: Worktrees section in Git View

The Git View SHALL render a Worktrees section that lists every worktree of the active tab's project, including the project's primary tree, regardless of which of those worktrees the active tab corresponds to. Each row SHALL display the worktree's branch, its absolute filesystem path, and its current HEAD as a short commit hash.

#### Scenario: Section lists primary tree and all worktrees

- **WHEN** the active tab's project has a primary tree and two registered worktrees A and B
- **THEN** the Git View Worktrees section SHALL render three rows — the primary tree, A, and B — each showing branch, path, and HEAD short hash

#### Scenario: Active tab is marked

- **WHEN** the active tab corresponds to one of the listed worktrees (or the primary tree)
- **THEN** that row SHALL be visually distinguished as the active worktree

#### Scenario: HEAD short hash is unavailable

- **WHEN** a row's worktree path is missing on disk or its HEAD cannot be read
- **THEN** the HEAD column SHALL render a placeholder (e.g. `—`) and the row SHALL still display branch and path

#### Scenario: Active tab is not a git repository

- **WHEN** the active tab's working directory is not inside a git repository
- **THEN** the Worktrees section SHALL NOT be rendered, consistent with the rest of the Git View's empty state

### Requirement: Create a worktree from the Git View

The Git View Worktrees section SHALL expose a "+ New worktree" action that opens the application's existing new-worktree dialog, scoped to the active tab's project. The action SHALL be subject to the same git-availability gating as the rest of the Git View.

#### Scenario: New action opens the new-worktree dialog

- **WHEN** the user invokes "+ New worktree" from the Git View Worktrees section
- **THEN** the application SHALL open the new-worktree dialog with the active tab's project pre-selected, and on successful creation the new worktree SHALL appear in the Worktrees section without requiring a manual refresh

#### Scenario: New action is hidden without git

- **WHEN** the active tab is not a git repository, or `git` is not available
- **THEN** the "+ New worktree" action SHALL NOT be invokable from the Git View

### Requirement: Activate a worktree from the Git View

The Git View Worktrees section SHALL allow the user to switch the active tab to any listed worktree by activating its row. Activating the row corresponding to the already-active tab SHALL be a no-op.

#### Scenario: Activate a sibling worktree

- **WHEN** the user activates a row that is not the active tab
- **THEN** the application SHALL switch the active tab to that worktree, creating the tab if it does not already exist, and the Git View SHALL re-scope to the new active tab

#### Scenario: Activate the already-active row

- **WHEN** the user activates the row corresponding to the active tab
- **THEN** the active tab SHALL NOT change and no tab SHALL be created

### Requirement: Remove a worktree from the Git View

The Git View Worktrees section SHALL expose a per-row Remove action for every worktree row except the project's primary tree. Removal initiated from the Git View SHALL use the application's existing worktree removal flow without modification, including PTY termination, the dirty-tree refusal-then-explicit-force confirmation, and stderr surfacing.

#### Scenario: Primary tree row has no Remove action

- **WHEN** the Worktrees section renders the project's primary tree row
- **THEN** that row SHALL NOT expose a Remove action

#### Scenario: Remove a clean sibling worktree

- **WHEN** the user invokes Remove on a clean worktree row and confirms
- **THEN** the application SHALL run the standard removal flow (terminate PTY, `git worktree remove`, registry cleanup), and the row SHALL disappear from the section on success

#### Scenario: Remove a dirty worktree requires explicit force

- **WHEN** the worktree being removed has uncommitted changes
- **THEN** the Git View SHALL surface git's refusal and SHALL require an explicit second confirmation before invoking removal with `--force`, matching the existing sidebar behavior

#### Scenario: Removing the active worktree falls back to the primary tree

- **WHEN** the user removes the worktree that corresponds to the active tab
- **THEN** the application SHALL switch the active tab to the project's primary tree before removing the registry entry, so the Git View does not point at a removed tab

#### Scenario: Removal failure leaves the row in place

- **WHEN** `git worktree remove` exits non-zero and the user has not authorized force
- **THEN** the row SHALL remain in the Worktrees section, the registry SHALL be unchanged, and the Git View SHALL surface the git stderr in its standard error banner

### Requirement: Worktrees section refresh

The Git View Worktrees section SHALL refresh its rows (including each row's HEAD short hash) on the same triggers as the rest of the Git View — active-tab change, panel focus, manual Refresh, and `.git` directory changes — without continuous polling.

#### Scenario: External worktree creation appears after refresh

- **WHEN** a worktree is created or removed by an action outside the Git View while the panel is mounted, and a refresh trigger fires
- **THEN** the Worktrees section SHALL reflect the updated set of worktrees and their HEADs within the same debounce window as the rest of the panel
