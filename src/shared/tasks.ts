/**
 * The task board: what each Claude session is working on, what waits for the
 * user, and who does what. Dash owns the data (`tasks.json` in userData);
 * sessions write it over the loopback hook port (`/tasks*`, see
 * docs/tasks-channel.md) and the user edits it in the Tasks view.
 */

/** `running` in progress, `waiting` needs the user's answer or action,
 *  `queued` not started yet, `done` finished. */
export type TaskStatus = 'running' | 'waiting' | 'queued' | 'done';

/** Display order: what needs the user first. */
export const TASK_STATUSES: TaskStatus[] = ['waiting', 'running', 'queued', 'done'];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  running: 'Running',
  waiting: 'Waiting for you',
  queued: 'Queued',
  done: 'Done',
};

export interface TaskComment {
  /** ISO timestamp. */
  at: string;
  /** A session name, or "you" for the user. */
  by: string;
  text: string;
}

export interface Task {
  /** Stable id chosen by the writer (letters, digits, `.`, `_`, `-`). */
  id: string;
  title: string;
  /** Session name that owns the task; empty while nobody has taken it. */
  who: string;
  /** The Dash console the owning session runs in (its `$DASH_PTY_KEY`), so the
   *  user's changes can be delivered there. Empty for sessions outside Dash. */
  console: string;
  status: TaskStatus;
  /** For `waiting`: exactly what the user has to answer or do. */
  waitingFor: string;
  note: string;
  project: string;
  jira: string;
  link: string;
  comments: TaskComment[];
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/** A session's heartbeat: what it is focused on and when it was last seen. */
export interface TaskSession {
  name: string;
  project: string;
  focus: string;
  console: string;
  lastSeen: string;
}

export interface TasksState {
  tasks: Task[];
  sessions: TaskSession[];
}

export interface TaskCounts {
  running: number;
  waiting: number;
  queued: number;
  done: number;
}

export function countTasks(tasks: Task[]): TaskCounts {
  const c: TaskCounts = { running: 0, waiting: 0, queued: 0, done: 0 };
  for (const t of tasks) c[t.status]++;
  return c;
}

/** A task the user writes in the Tasks view. Nobody owns it yet, so the view
 *  offers it to the sessions running in Dash ("Give to…"). */
export interface TaskDraft {
  title: string;
  /** What the session has to do; it is handed over with the task. */
  note?: string;
  project?: string;
}

/** The id for a task the user typed: its title, reduced to what ids allow. */
export function taskIdFromTitle(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'task';
}

/** A change the user makes in the Tasks view. */
export interface TaskUserEdit {
  id: string;
  status?: TaskStatus;
  /** Appended as a comment by "you". */
  comment?: string;
  /** Hand the task to a session (sets `who` and `console`). */
  assignTo?: { who: string; console: string };
  /** Also type a note about the change into the owning session's console. */
  notify?: boolean;
}

export interface TaskUserEditResult {
  ok: boolean;
  /** Whether the change was typed into a console. */
  delivered: boolean;
  reason?: 'not-found' | 'no-console' | 'console-closed';
}

export const TASK_ID_RE = /^[A-Za-z0-9._-]{1,80}$/;
