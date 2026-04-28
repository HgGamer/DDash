## ADDED Requirements

### Requirement: Stash list display

The Git View SHALL display a Stashes section listing the active repository's stash entries in stack order (most recent first). Each entry SHALL show its stack index, message, the branch the stash was created on, and a relative timestamp.

#### Scenario: Repository has stashes

- **WHEN** the active repository has one or more stash entries
- **THEN** the Stashes section SHALL render one row per entry, ordered with `stash@{0}` first, each showing index, message, source branch, and relative time

#### Scenario: Repository has no stashes

- **WHEN** the active repository has no stash entries
- **THEN** the Stashes section SHALL render an empty state and SHALL NOT expose Apply/Pop/Drop actions

#### Scenario: Stash list load failure

- **WHEN** the underlying `git stash list` call exits non-zero
- **THEN** the Stashes section SHALL surface the git stderr in an in-panel error banner and SHALL NOT display a stale list

### Requirement: Create a stash

The Git View SHALL allow the user to create a new stash entry from the working tree, optionally with a user-supplied message and optionally including untracked files. The action SHALL be disabled when the working tree has no changes that `git stash` would capture.

#### Scenario: Stash with message

- **WHEN** the user opens the Stash dialog, enters a message, and confirms
- **THEN** the application SHALL run the equivalent of `git stash push -m <message>` and, on success, refresh the working-tree status (which is now clean of the stashed changes) and prepend the new entry to the Stashes list

#### Scenario: Stash including untracked files

- **WHEN** the user enables the "include untracked" option and confirms
- **THEN** the application SHALL run the equivalent of `git stash push --include-untracked` (combined with `-m <message>` if a message is given)

#### Scenario: Stash without a message

- **WHEN** the user confirms with an empty message field
- **THEN** the application SHALL run `git stash push` (no `-m`) and let git generate the default `WIP on <branch>` message

#### Scenario: Nothing to stash

- **WHEN** the working tree has no changes that `git stash` would capture
- **THEN** the Stash action SHALL be disabled

#### Scenario: Stash failure

- **WHEN** `git stash push` exits non-zero
- **THEN** the Git View SHALL surface the git stderr in an in-panel error banner and SHALL NOT modify the Stashes list or working-tree status

### Requirement: Apply a stash

The Git View SHALL allow the user to apply a stash entry, restoring its changes to the working tree without removing the entry from the stash stack.

#### Scenario: Apply succeeds

- **WHEN** the user invokes Apply on a stash entry and the working tree allows the apply to complete cleanly
- **THEN** the application SHALL run the equivalent of `git stash apply <ref>` and, on success, refresh the working-tree status to show the restored changes; the entry SHALL remain in the Stashes list

#### Scenario: Apply produces conflicts

- **WHEN** `git stash apply` reports merge conflicts
- **THEN** the Git View SHALL surface the git stderr in an in-panel error banner indicating the conflict, refresh the working-tree status to show the conflicted files, and SHALL leave the stash entry in the list

#### Scenario: Apply failure (clean refusal)

- **WHEN** `git stash apply` exits non-zero without modifying the working tree (for example, a missing ref)
- **THEN** the Git View SHALL surface the git stderr in an in-panel error banner and SHALL NOT modify working-tree status or the Stashes list

### Requirement: Pop a stash

The Git View SHALL allow the user to pop a stash entry, applying its changes and removing it from the stash stack on success.

#### Scenario: Pop succeeds

- **WHEN** the user invokes Pop on a stash entry and the apply completes without conflicts
- **THEN** the application SHALL run the equivalent of `git stash pop <ref>` and, on success, refresh the working-tree status and remove the entry from the Stashes list

#### Scenario: Pop produces conflicts

- **WHEN** `git stash pop` reports merge conflicts
- **THEN** the Git View SHALL surface the git stderr in an in-panel error banner, refresh the working-tree status to show the conflicted files, and SHALL leave the stash entry in the list (matching git's behavior of not dropping a conflicted pop)

#### Scenario: Pop failure (clean refusal)

- **WHEN** `git stash pop` exits non-zero without modifying the working tree
- **THEN** the Git View SHALL surface the git stderr in an in-panel error banner and SHALL NOT modify working-tree status or the Stashes list

### Requirement: Drop a stash

The Git View SHALL allow the user to drop a stash entry, removing it from the stash stack without applying its changes. The action SHALL require explicit confirmation before executing.

#### Scenario: Drop with confirmation

- **WHEN** the user invokes Drop on a stash entry and confirms the destructive-action prompt
- **THEN** the application SHALL run the equivalent of `git stash drop <ref>` and, on success, remove the entry from the Stashes list

#### Scenario: Drop confirmation cancelled

- **WHEN** the user invokes Drop on a stash entry and dismisses the confirmation prompt
- **THEN** the application SHALL NOT run any git command and the stash entry SHALL remain in the list

#### Scenario: Drop failure

- **WHEN** `git stash drop` exits non-zero
- **THEN** the Git View SHALL surface the git stderr in an in-panel error banner and SHALL NOT modify the Stashes list

### Requirement: Select a stash entry

The Git View SHALL allow the user to select a stash entry by clicking its row, opening a stash detail view that shows the stash's metadata and its list of changed files.

#### Scenario: Clicking a stash row opens its detail view

- **WHEN** the user clicks a stash entry row
- **THEN** the Git View SHALL mark that entry as selected and display a stash detail view containing the stash's full ref (e.g., `stash@{0}`), source branch, full message, and changed-file list

#### Scenario: Clicking the already-selected stash closes the detail view

- **WHEN** the user clicks the stash row that is currently selected
- **THEN** the Git View SHALL clear the stash selection and close the detail view

#### Scenario: Selecting a stash clears any selected commit or working-tree file

- **WHEN** a commit detail view or working-tree file diff is open and the user clicks a stash row
- **THEN** the Git View SHALL close that view and show the stash detail view in its place

#### Scenario: Selecting a commit or working-tree file clears any selected stash

- **WHEN** a stash detail view is open and the user clicks a commit row or working-tree file row
- **THEN** the Git View SHALL close the stash detail view and show the new selection's view in its place

### Requirement: Stash detail displays changed files

The stash detail view SHALL list every file changed in the selected stash, showing each file's path and change kind (added, modified, deleted).

#### Scenario: Files and kinds are listed

- **WHEN** a stash entry is selected
- **THEN** the stash detail view SHALL display one row per file changed in the stash, each labeled with its change kind

#### Scenario: Stash includes untracked files

- **WHEN** the selected stash was created with `--include-untracked`
- **THEN** the changed-file list SHALL include those untracked files, labeled as added

#### Scenario: Failure to load changed files

- **WHEN** the underlying git call to list changed files exits non-zero
- **THEN** the stash detail view SHALL surface the git stderr in an in-panel error banner and SHALL NOT display a stale file list

### Requirement: View per-file diff for a selected stash

The Git View SHALL allow the user to click a file in the stash detail view to display that file's diff as captured by the selected stash. The diff SHALL be rendered with the same unified-diff renderer used for working-tree and commit diffs.

#### Scenario: Clicking a file loads its stash-scoped diff

- **WHEN** the user clicks a file row in the stash detail view
- **THEN** the Git View SHALL load the diff for that path at the selected stash and render it with the unified-diff renderer

#### Scenario: Binary files in a stash

- **WHEN** the selected file is binary at the selected stash
- **THEN** the diff area SHALL display a "binary file — diff preview not available" indicator rather than raw bytes

#### Scenario: Diff load failure

- **WHEN** the underlying git call for the stash-scoped diff exits non-zero
- **THEN** the diff area SHALL surface the git stderr in an in-panel error banner and SHALL NOT display a stale diff

#### Scenario: Rapid selection changes

- **WHEN** the user clicks multiple files or stashes in quick succession before prior diffs finish loading
- **THEN** the Git View SHALL display only the diff for the most recently selected file/stash pair and SHALL discard responses for superseded selections

### Requirement: Stash selection is cleared when entry no longer exists

The Git View SHALL clear the stash selection automatically if the selected stash ref is not present in the refreshed stash list (for example, after the entry is dropped or popped from outside Dash).

#### Scenario: Selected stash disappears after external drop

- **WHEN** the stash list refreshes and the previously selected stash ref is no longer present
- **THEN** the Git View SHALL clear the selection and close the stash detail view without surfacing an error banner
