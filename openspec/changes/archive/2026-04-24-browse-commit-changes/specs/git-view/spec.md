## ADDED Requirements

### Requirement: Select a commit from the graph

The Git View SHALL allow the user to select a commit from the commit graph by clicking its row. Selecting a commit SHALL open a commit detail view showing that commit's metadata and the list of files changed in that commit.

#### Scenario: Clicking a commit opens its detail view

- **WHEN** the user clicks a commit row in the commit graph
- **THEN** the Git View SHALL mark that commit as selected and display a commit detail view containing the commit's full hash, author, date, full message, and changed-file list

#### Scenario: Clicking the already-selected commit closes the detail view

- **WHEN** the user clicks the commit row that is currently selected
- **THEN** the Git View SHALL clear the commit selection and close the commit detail view

#### Scenario: Selecting a commit clears any selected working-tree file

- **WHEN** a working-tree file diff is open and the user clicks a commit row
- **THEN** the Git View SHALL close the working-tree file diff and show the commit detail view in its place

#### Scenario: Selecting a working-tree file clears any selected commit

- **WHEN** a commit is selected and the user clicks a working-tree file entry
- **THEN** the Git View SHALL close the commit detail view and show the working-tree file diff in its place

### Requirement: Commit detail displays changed files

The commit detail view SHALL list every file changed in the selected commit, showing each file's path and change kind (added, modified, deleted, renamed).

#### Scenario: Files and kinds are listed

- **WHEN** a commit is selected
- **THEN** the commit detail view SHALL display one row per file changed in that commit, each labeled with its change kind

#### Scenario: Renamed files show source and destination

- **WHEN** the commit contains a rename
- **THEN** the corresponding row SHALL display both the original and new path

#### Scenario: Root commit

- **WHEN** the selected commit is the repository's root commit (no parent)
- **THEN** the changed-file list SHALL show every file introduced by that commit as added

#### Scenario: Failure to load changed files

- **WHEN** the underlying git call to list changed files exits non-zero
- **THEN** the commit detail view SHALL surface the git stderr in an in-panel error banner and SHALL NOT display a stale file list

### Requirement: View per-file diff for a selected commit

The Git View SHALL allow the user to click a file in the commit detail view to display that file's diff as introduced by the selected commit. The diff SHALL be rendered with the same unified-diff renderer used for working-tree diffs.

#### Scenario: Clicking a file loads its commit-scoped diff

- **WHEN** the user clicks a file row in the commit detail view
- **THEN** the Git View SHALL load the diff for that path at the selected commit and render it with the unified-diff renderer

#### Scenario: Binary files in a commit

- **WHEN** the selected file is binary at the selected commit
- **THEN** the diff area SHALL display a "binary file — diff preview not available" indicator rather than raw bytes

#### Scenario: Diff load failure

- **WHEN** the underlying git call for the commit-scoped diff exits non-zero
- **THEN** the diff area SHALL surface the git stderr in an in-panel error banner and SHALL NOT display a stale diff

#### Scenario: Rapid selection changes

- **WHEN** the user clicks multiple files or commits in quick succession before prior diffs finish loading
- **THEN** the Git View SHALL display only the diff for the most recently selected file/commit pair and SHALL discard responses for superseded selections

### Requirement: Commit selection is cleared on refresh when hash no longer exists

The Git View SHALL clear the commit selection automatically if the selected commit hash is not present in the refreshed commit graph (for example, after a force-push or history rewrite).

#### Scenario: Selected commit disappears after history rewrite

- **WHEN** the commit graph refreshes and the previously selected commit hash is no longer present
- **THEN** the Git View SHALL clear the selection and close the commit detail view without surfacing an error banner
