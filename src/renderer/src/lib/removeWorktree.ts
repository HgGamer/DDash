/**
 * Shared removal flow for a worktree. Handles the confirm prompts and the
 * dirty-tree refusal-then-explicit-force dance. Callers are responsible for
 * post-removal cleanup (clearing tab state, refreshing project list,
 * activating a fallback tab).
 */
export type RemoveWorktreeOutcome =
  | { ok: true }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error: string };

export async function removeWorktreeWithConfirm(args: {
  projectId: string;
  worktreeId: string;
  branch: string;
  path: string;
}): Promise<RemoveWorktreeOutcome> {
  const { projectId, worktreeId, branch, path } = args;
  const ok = window.confirm(
    `Remove worktree "${branch}"?\n\nThis runs \`git worktree remove\` and deletes the directory at ${path} if clean.`,
  );
  if (!ok) return { ok: false, canceled: true };

  let result = await window.api.worktrees.remove({ projectId, worktreeId, force: false });
  if (!result.ok) {
    const force = window.confirm(
      `git refused to remove the worktree:\n\n${result.error}\n\nForce removal? (this may discard uncommitted changes)`,
    );
    if (!force) return { ok: false, canceled: true };
    result = await window.api.worktrees.remove({ projectId, worktreeId, force: true });
    if (!result.ok) return { ok: false, error: result.error };
  }
  return { ok: true };
}
