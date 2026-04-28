## MODIFIED Requirements

### Requirement: Automatic refresh

The Git View SHALL keep its displayed data reasonably fresh without continuous polling by refreshing on active-tab change, on panel focus, and in response to changes under the repository's `.git` directory while the panel is mounted. Refreshes SHALL include the stash list alongside the working-tree status, branches, and commit graph.

#### Scenario: Refresh on external commit

- **WHEN** the user runs `git commit` from outside Dash while the Git View is visible
- **THEN** the Git View SHALL observe the `.git` change and refresh the commit graph and status within a short debounce window

#### Scenario: Refresh on external stash mutation

- **WHEN** the user runs `git stash push`, `git stash pop`, or `git stash drop` from outside Dash while the Git View is visible
- **THEN** the Git View SHALL observe the `.git` change and refresh the stash list within a short debounce window

#### Scenario: Manual refresh

- **WHEN** the user invokes the Refresh action
- **THEN** the Git View SHALL reload status, branches, the commit graph, and the stash list for the active tab's repository

### Requirement: Write operations are serialized per repository

The application SHALL NOT execute two write git operations (stage, unstage, commit, push, checkout, create-branch, stash push, stash pop, stash apply, stash drop) concurrently against the same working directory.

#### Scenario: Serialized writes

- **WHEN** the user triggers a second write action while a previous write action is still in flight for the same working directory
- **THEN** the application SHALL queue the second action and run it after the first completes

#### Scenario: Stash writes serialize with other writes

- **WHEN** a commit, stage, or checkout is in flight and the user invokes a stash push, pop, apply, or drop on the same repository
- **THEN** the application SHALL queue the stash write and run it after the in-flight write completes
