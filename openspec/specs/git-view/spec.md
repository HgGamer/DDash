## ADDED Requirements

### Requirement: Git View is scoped to the active tab

The application SHALL render a Git View panel in the main window that reflects the working directory of the currently active project or worktree tab. When the active tab changes, the Git View SHALL reload its data to reflect the new tab's repository.

#### Scenario: Activating a tab loads its git data

- **WHEN** the user activates a tab whose working directory is inside a git repository
- **THEN** the Git View SHALL load and display that repository's working-tree status, current branch, and commit graph

#### Scenario: Switching tabs re-scopes the Git View

- **WHEN** the user switches from one tab to another and both are inside git repositories
- **THEN** the Git View SHALL discard the previous tab's data and load the newly active tab's repository data

#### Scenario: Active tab is not a git repository

- **WHEN** the active tab's working directory is not inside a git repository
- **THEN** the Git View SHALL display an empty state indicating the directory is not a git repository and SHALL NOT expose write actions

#### Scenario: `git` binary is not available

- **WHEN** the application cannot locate a usable `git` binary on `PATH`
- **THEN** the Git View SHALL display a banner explaining that `git` is required and SHALL NOT attempt any git operations

### Requirement: Working-tree status display

The Git View SHALL display the active repository's working-tree status, grouping file entries by stage (staged, unstaged, untracked) and showing each file's path and change kind (added, modified, deleted, renamed).

#### Scenario: Files appear in the correct group

- **WHEN** the active repository has staged, unstaged, and untracked changes
- **THEN** the Git View SHALL render three distinct sections — Staged, Unstaged, Untracked — each listing only the files that belong in that section

#### Scenario: Renamed files show source and destination

- **WHEN** a staged change is a rename
- **THEN** the entry SHALL display both the original and new path

#### Scenario: Empty working tree

- **WHEN** the working tree has no changes of any kind
- **THEN** the status area SHALL display a clean-state indication and the commit action SHALL be disabled

### Requirement: Stage and unstage files

The Git View SHALL allow the user to stage an unstaged or untracked file and unstage a staged file, with the change reflected in the status display after the action completes.

#### Scenario: Stage an unstaged file

- **WHEN** the user invokes Stage on an unstaged or untracked file entry
- **THEN** the application SHALL run the equivalent of `git add -- <path>` in the active tab's working directory and move the entry into the Staged section on success

#### Scenario: Unstage a staged file

- **WHEN** the user invokes Unstage on a staged file entry
- **THEN** the application SHALL run the equivalent of `git restore --staged -- <path>` and move the entry back to Unstaged on success

#### Scenario: Stage/unstage failure

- **WHEN** a stage or unstage command exits non-zero
- **THEN** the Git View SHALL surface the git stderr in an in-panel error banner and leave the status unchanged

### Requirement: Create a commit

The Git View SHALL allow the user to create a commit from currently staged changes by entering a commit message (with optional extended description) and confirming. The commit action SHALL be disabled when nothing is staged or when the message is empty.

#### Scenario: Commit with a subject line

- **WHEN** at least one file is staged and the user enters a non-empty subject and confirms Commit
- **THEN** the application SHALL run the equivalent of `git commit -m <subject>` and, on success, clear the staged list and refresh the commit graph to include the new commit

#### Scenario: Commit with subject and description

- **WHEN** the user provides both a subject and a description
- **THEN** the application SHALL produce a commit whose message has the subject as the first line, a blank line, and the description as the body

#### Scenario: Commit is disabled with no staged changes

- **WHEN** nothing is staged
- **THEN** the Commit action SHALL be disabled and SHALL NOT be invokable

#### Scenario: Commit is disabled with empty subject

- **WHEN** the subject field is empty or whitespace-only
- **THEN** the Commit action SHALL be disabled

### Requirement: Push to upstream

The Git View SHALL allow the user to push the current branch to its tracked upstream.

#### Scenario: Push succeeds

- **WHEN** the current branch has a tracked upstream and the user invokes Push
- **THEN** the application SHALL run the equivalent of `git push` and display a success indication on completion

#### Scenario: Push with no upstream

- **WHEN** the current branch has no tracked upstream
- **THEN** the Git View SHALL surface an error explaining that no upstream is configured, without attempting to silently create one

#### Scenario: Push is rejected (non-fast-forward)

- **WHEN** the remote rejects the push
- **THEN** the Git View SHALL display the git stderr in an error banner and leave local state unchanged

### Requirement: Commit graph

The Git View SHALL render a commit graph for the active repository showing commits across branches, with each commit node displaying its short hash, subject, author, and relative timestamp, and with the current HEAD visually marked.

#### Scenario: HEAD is marked

- **WHEN** the commit graph is rendered
- **THEN** the commit at HEAD SHALL be visually distinguished from other commits

#### Scenario: Branch tips are labeled

- **WHEN** a commit is the tip of a local or remote branch
- **THEN** the commit node SHALL display the branch name(s) pointing at it

#### Scenario: Graph has a commit limit

- **WHEN** the repository has more than the configured maximum commits
- **THEN** the graph SHALL display the most recent commits up to the limit and SHALL expose a way to load older commits

### Requirement: Switch branch

The Git View SHALL allow the user to switch the active repository to a different existing branch via a branch selector.

#### Scenario: Checkout succeeds

- **WHEN** the user selects a different branch and the working tree has no changes that would conflict with checkout
- **THEN** the application SHALL run the equivalent of `git checkout <branch>`, and on success the Git View SHALL refresh status, HEAD, and the commit graph

#### Scenario: Checkout blocked by local changes

- **WHEN** the working tree has local changes that would be overwritten by checkout
- **THEN** the Git View SHALL surface the git stderr in an error banner and SHALL NOT switch branches

#### Scenario: Worktree tab branch is pinned

- **WHEN** the active tab is a worktree (not the project's primary tree)
- **THEN** the branch selector SHALL either disable the switch action for that tab or require explicit confirmation, and SHALL indicate that the worktree's branch is pinned

### Requirement: Create branch

The Git View SHALL allow the user to create a new branch from the current HEAD and switch to it.

#### Scenario: Create-and-switch

- **WHEN** the user enters a new branch name and confirms Create Branch
- **THEN** the application SHALL run the equivalent of `git checkout -b <name>`, and on success the Git View SHALL refresh HEAD, the branch list, and the commit graph

#### Scenario: Invalid branch name

- **WHEN** the user enters a name that `git` rejects as invalid or already exists
- **THEN** the Git View SHALL surface the git stderr in an error banner and SHALL NOT modify repository state

### Requirement: Automatic refresh

The Git View SHALL keep its displayed data reasonably fresh without continuous polling by refreshing on active-tab change, on panel focus, and in response to changes under the repository's `.git` directory while the panel is mounted.

#### Scenario: Refresh on external commit

- **WHEN** the user runs `git commit` from outside Dash while the Git View is visible
- **THEN** the Git View SHALL observe the `.git` change and refresh the commit graph and status within a short debounce window

#### Scenario: Manual refresh

- **WHEN** the user invokes the Refresh action
- **THEN** the Git View SHALL reload status, branches, and the commit graph for the active tab's repository

### Requirement: Write operations are serialized per repository

The application SHALL NOT execute two write git operations (stage, unstage, commit, push, checkout, create-branch) concurrently against the same working directory.

#### Scenario: Serialized writes

- **WHEN** the user triggers a second write action while a previous write action is still in flight for the same working directory
- **THEN** the application SHALL queue the second action and run it after the first completes

### Requirement: Error surfacing

The Git View SHALL surface all git operation errors inline in the panel, including a human-readable summary and the underlying git stderr, and SHALL NOT silently retry failed operations.

#### Scenario: Error banner content

- **WHEN** any git operation fails
- **THEN** the Git View SHALL display a dismissible error banner containing the action name and the stderr text from git

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
