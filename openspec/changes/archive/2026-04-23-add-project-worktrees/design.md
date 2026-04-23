## Context

Today, Dash maps **one project ↔ one terminal session** keyed by `project.id`. The registry stores a flat list of `Project` records (`src/shared/types.ts`), `pty-session.ts` keys live PTYs by `projectId`, and the renderer's tab/attention/style state in `store.ts` uses the same key. To run two Claude sessions on the same repo today, a user has to register the project twice with different paths or manually create a worktree outside the app.

Git's `git worktree` lets a single repository have multiple checked-out branches in different directories, sharing one `.git` store. This maps cleanly onto Dash's "I want a second pane on this project, on a different branch" need.

## Goals / Non-Goals

**Goals:**
- A project can have N worktrees, each with its own checkout path, branch, persisted record, and live Claude session.
- The sidebar reveals worktrees as children of a project, and activating a worktree opens its terminal in the main pane (same UX as activating a project today).
- Creation/removal of worktrees from inside Dash uses the `git` CLI and surfaces git's errors verbatim — no reimplementation of git semantics.
- Existing single-project flows are unchanged: a project with zero worktrees behaves exactly as today.
- Worktrees and their last-active selection persist across restarts, and are durable against crashes (same atomic-write guarantee as the project registry).

**Non-Goals:**
- GitHub PR workflows, branch policy/naming rules, or push/pull automation.
- Sharing terminal scrollback or context between worktrees.
- Multi-repo "monorepo of repos" projects.
- Auto-creating worktrees on every branch — creation is always explicit.
- Cross-machine sync of worktree state.

## Decisions

### D1: Worktrees are children of a project, not top-level peers

Each `Project` gains a `worktrees: Worktree[]` array. A `Worktree` has its own `id`, `branch`, `path`, `addedAt`, `lastOpenedAt`, and `order`. Tabs and PTY sessions are keyed by a composite `{ projectId, worktreeId | null }` (where `null` means "the project's primary working tree").

**Why:** Mirrors the user's mental model ("this project, on branch X"). Keeping the primary tree as `null` rather than a synthetic worktree record means existing registries and the existing single-tab UX cost zero migration. Making worktrees top-level peers would force the user to re-pick the project for each branch and would scatter related sessions across the sidebar.

**Alternative considered:** A single flat tab list keyed by path. Rejected — loses the project grouping that's the primary navigation today, and complicates "remove project" semantics.

### D2: Session keying — composite key, single registry

`pty-session.ts` switches from `Map<string, PtySession>` keyed by `projectId` to a `Map<string, PtySession>` keyed by a derived string `compositeKey(projectId, worktreeId)` (e.g. `${projectId}` or `${projectId}:${worktreeId}`). All IPC payloads (`pty.open`, `pty.write`, `pty.resize`, `pty.onData`, `pty.onExit`, `pty.onError`, `notify.attention`) gain an optional `worktreeId` field.

**Why:** Minimizes the surface area of the change — one map, one key, one set of IPC events. The primary tree gets a stable bare `projectId` key so existing on-disk traces and behavior are unchanged.

**Alternative considered:** Two separate maps (project sessions + worktree sessions). Rejected — duplicates lifecycle code and complicates "tab activation" routing.

### D3: Worktree directories live under a per-project root

Default location: `<project.path>.worktrees/<branch>` (sibling directory). The root path is stored on the `Project` record as `worktreesRoot?: string` so it can be overridden per-project. Branch names are sanitized for the filesystem (slashes → `-`).

**Why:** Sibling-of-project keeps the worktree close to the project on disk, makes it obvious to users browsing in Finder, and avoids polluting the project directory itself (which `git worktree` forbids anyway). Per-project override handles users who want all worktrees under e.g. `~/code/worktrees/`.

**Alternative considered:** A single global worktrees directory (e.g. `~/.dash/worktrees/`). Rejected — divorces the worktree from the project on disk, harder to find from the shell.

### D4: Worktree creation prompt — branch name first, then create

UX: From a project's sidebar row, "+ New worktree" opens a small modal asking for a branch name with two modes:
- **New branch:** `git worktree add -b <branch> <path>` (defaults to the current `HEAD`).
- **Existing branch:** `git worktree add <path> <branch>`.

Errors from `git` (branch already checked out, path exists, dirty index, etc.) are surfaced verbatim in the modal; the registry is only updated after `git worktree add` exits 0.

**Why:** Branch is the primary affordance — users think "I want a worktree for the `payments-fix` branch", not "I want a worktree at path `/foo/bar`". Doing the git work first means we never persist a record for a worktree that doesn't exist on disk.

### D5: Worktree removal — confirm, run `git worktree remove`, then unregister

On "Remove worktree", terminate the PTY for that worktree, run `git -C <project.path> worktree remove <worktree.path>` (with `--force` only after a second confirmation if git refuses due to dirty state), then remove the entry from the registry. If `git worktree remove` fails for non-dirty reasons (locked, missing), surface the error and keep the registry entry so the user can retry.

**Why:** Mirrors today's "Remove project" semantics (confirm-then-do, never silently destroy work). Refusing to force by default protects against losing uncommitted changes — the most likely user mistake.

### D6: Stale-worktree detection on launch

On launch, after loading the registry, the main process runs `git -C <project.path> worktree list --porcelain` for each project that has worktree records and reconciles:
- A registry worktree whose path is missing on disk OR not in git's worktree list is marked `status: 'missing'` and shown in the sidebar with a warning, with options to "Locate" or "Remove".
- A worktree present on disk but not in the registry is **ignored** (out of scope to auto-import — the user may have created it for non-Dash reasons).

**Why:** Same philosophy as project registry's "missing path" handling — surface, don't silently delete. Auto-importing surprise worktrees would be presumptuous.

### D7: Tab + attention + style state moves to composite-key

`store.ts`'s `tabs: Record<string, TabState>` keys change from `projectId` to the composite key. `activeId` becomes `{ projectId: string; worktreeId: string | null } | null`. Attention flags, exit codes, and style overrides flow through unchanged — they were already per-tab.

**Why:** Each worktree is a fully-independent session, so it needs its own status, attention indicator, and style. Reusing the existing per-tab state shape means no new persistence concepts.

## Risks / Trade-offs

- **Risk:** Users create dozens of worktrees and exhaust disk / leave orphaned branches.
  → **Mitigation:** Show worktree count next to project name; sidebar lists all of them so they're always visible (no out-of-sight, out-of-mind). No automatic creation.

- **Risk:** `git worktree remove` can fail in many ways (locked, dirty, submodules); incomplete failure modes leave orphaned registry entries.
  → **Mitigation:** Only mutate the registry after git's exit 0. On non-zero exit, surface stderr and leave the entry; offer a "force" path that requires a distinct confirmation.

- **Risk:** Branch name collisions on the filesystem (e.g. `feature/foo` and `feature-foo` both sanitize to `feature-foo`).
  → **Mitigation:** Suffix with `-2`, `-3`, … on collision when computing the default path; the user can also override the path manually in the modal.

- **Risk:** A project's path is not actually a git repo, so worktree creation must be hidden.
  → **Mitigation:** Probe `git rev-parse --git-dir` on project add/load and cache an `isGitRepo` flag on the project; gate the "+ New worktree" affordance on it.

- **Risk:** Removing a project with N worktrees has to clean up N PTYs and N directories — partial failures could leave dangling state.
  → **Mitigation:** Sequence: terminate all PTYs → for each worktree run `git worktree remove` (collect errors, don't abort) → remove project from registry only if all worktrees were removed; otherwise show a per-worktree error report and keep the project.

- **Trade-off:** We rely on the system `git` CLI rather than a JS git library (e.g. isomorphic-git). This is a deliberate trade — `git worktree` semantics are subtle and well-tested in upstream git, and Dash users are already running `claude` which assumes a working git environment.

## Migration Plan

Forward-compatible at the registry level: the loader treats a missing `worktrees` array as `[]` and a missing `worktreesRoot` as the default. No schema-version bump is required. Rollback is safe — an older Dash binary will simply ignore the new fields (after a one-time round-trip; see open question Q1).

## Open Questions

- **Q1:** When an older binary writes the registry back, does it strip unknown fields and lose `worktrees`? If yes, we should bump the registry version and have the new code refuse to load an unknown future version. Needs a quick check of the current loader.
- **Q2:** Should the "+ New worktree" modal offer a branch picker that lists existing local branches (via `git branch --list`) for the "existing branch" mode, or accept any free-text input and let git error out? Leaning toward picker for the common case + free-text fallback.
