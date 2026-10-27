/**
 * The task board shown in the Tasks view: a claude.ai artifact page (Claude
 * sessions write their tasks into its database; the page lists what runs, what
 * waits for the user and who does what). It is embedded as-is, so the page —
 * not Dash — owns the data, the login and the editing.
 */
export const TASKS_BOARD_URL = 'https://claude.ai/artifact/4Aq18UfCWdqKGsYUvmk8rG';

/** Persistent session partition shared by the embedded view and the pop-out
 *  window, so the claude.ai login survives restarts and is needed only once. */
export const TASKS_PARTITION = 'persist:dash-tasks';

/** Hosts the embedded board may navigate to or open as a login popup. */
export const TASKS_ALLOWED_HOSTS = [
  'claude.ai',
  'www.claude.ai',
  'accounts.google.com',
  'appleid.apple.com',
  'login.microsoftonline.com',
];

export function isAllowedTasksUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (
      u.protocol === 'https:' &&
      TASKS_ALLOWED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))
    );
  } catch {
    return false;
  }
}
