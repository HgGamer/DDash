import { useEffect, useRef, useState } from 'react';
import type { ActiveSelection } from '@shared/types';
import type { GitBranch, GitCommit, GitStatus } from '@shared/git';

export type GitViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'not-a-repo' }
  | { kind: 'git-missing' }
  | {
      kind: 'ready';
      status: GitStatus;
      branches: GitBranch[];
      commits: GitCommit[];
    }
  | { kind: 'error'; message: string };

interface UseGitView {
  state: GitViewState;
  /** Force a full refresh (status + branches + log). */
  refresh: () => void;
  /** Re-fetch the commit log with a larger limit. No-op in non-ready states. */
  loadMoreCommits: () => void;
  /** Current limit used by the last log fetch. */
  commitLimit: number;
}

const INITIAL_COMMIT_LIMIT = 500;
const COMMIT_LIMIT_STEP = 500;

const REFRESH_DEBOUNCE_MS = 150;

/**
 * Drives the Git View for the currently selected tab. Pass `null` when no tab
 * is active. Handles:
 *   - Re-scoping (cancel in-flight reload, discard stale data) when the tab changes
 *   - "Not a repo" and "git missing" states
 *   - Auto-refresh on `git:changed` events from the main process, debounced
 *   - Subscribing/unsubscribing the main-process watcher for the active tab
 */
export function useGitView(active: ActiveSelection | null): UseGitView {
  const [state, setState] = useState<GitViewState>({ kind: 'idle' });
  const [commitLimit, setCommitLimit] = useState(INITIAL_COMMIT_LIMIT);
  // Track the tab we last loaded for so late-arriving responses from a
  // previous tab don't overwrite the current one.
  const epochRef = useRef(0);
  const cwdRef = useRef<string | null>(null);

  // Reset the commit limit whenever the active tab changes — but not on
  // commitLimit changes (which would otherwise create an infinite loop).
  useEffect(() => {
    setCommitLimit(INITIAL_COMMIT_LIMIT);
  }, [active?.projectId, active?.worktreeId]);

  useEffect(() => {
    const api = window.api.git;
    const epoch = ++epochRef.current;
    cwdRef.current = null;

    if (!active) {
      setState({ kind: 'idle' });
      return;
    }

    setState({ kind: 'loading' });

    let cancelled = false;
    let subscribedCwd: string | null = null;

    const load = async () => {
      const probe = await api.isRepo(active);
      if (cancelled || epochRef.current !== epoch) return;
      if (!probe.ok) {
        if (probe.reason === 'git-missing') setState({ kind: 'git-missing' });
        else setState({ kind: 'not-a-repo' });
        return;
      }
      cwdRef.current = probe.cwd;
      // Subscribe for filesystem change events on this repo.
      await api.subscribe(active);
      if (cancelled || epochRef.current !== epoch) {
        // We raced a tab change — undo the subscription.
        await api.unsubscribe(active);
        return;
      }
      subscribedCwd = probe.cwd;

      const [status, branches, log] = await Promise.all([
        api.status(active),
        api.branches(active),
        api.log({ ...active, limit: commitLimit }),
      ]);
      if (cancelled || epochRef.current !== epoch) return;

      if (!status.ok) {
        setState({
          kind: 'error',
          message: status.stderr || 'Failed to read git status',
        });
        return;
      }
      if (!branches.ok || !log.ok) {
        setState({
          kind: 'error',
          message: (!branches.ok ? branches.stderr : (log as { stderr?: string }).stderr) ?? 'git error',
        });
        return;
      }
      setState({
        kind: 'ready',
        status: status.status,
        branches: branches.branches,
        commits: log.commits,
      });
    };

    void load();

    // Debounced refresh driven by main-process `git:changed` events.
    let debounceTimer: number | null = null;
    const unsubscribe = api.onChanged((ev) => {
      if (cwdRef.current && ev.cwd === cwdRef.current) {
        if (debounceTimer !== null) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          debounceTimer = null;
          // Only refresh if we're still showing this tab.
          if (epochRef.current === epoch) void reload(epoch);
        }, REFRESH_DEBOUNCE_MS);
      }
    });

    const reload = async (e: number) => {
      if (!active) return;
      const [status, branches, log] = await Promise.all([
        api.status(active),
        api.branches(active),
        api.log({ ...active, limit: commitLimit }),
      ]);
      if (epochRef.current !== e) return;
      if (status.ok && branches.ok && log.ok) {
        setState({
          kind: 'ready',
          status: status.status,
          branches: branches.branches,
          commits: log.commits,
        });
      }
    };

    return () => {
      cancelled = true;
      unsubscribe();
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      if (subscribedCwd !== null) void api.unsubscribe(active);
    };
  }, [active?.projectId, active?.worktreeId, active, commitLimit]);

  return {
    state,
    commitLimit,
    loadMoreCommits: () => setCommitLimit((n) => n + COMMIT_LIMIT_STEP),
    refresh: () => {
      // Bumping the epoch + re-running the effect is overkill; just trigger a
      // reload in place by faking a changed event for the current cwd.
      if (!active) return;
      const api = window.api.git;
      void Promise.all([api.status(active), api.branches(active), api.log({ ...active })]).then(
        ([status, branches, log]) => {
          if (status.ok && branches.ok && log.ok) {
            setState({
              kind: 'ready',
              status: status.status,
              branches: branches.branches,
              commits: log.commits,
            });
          }
        },
      );
    },
  };
}
