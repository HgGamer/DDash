import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  countTasks,
  type Task,
  type TaskSession,
  type TasksState,
  type TaskStatus,
  type TaskUserEdit,
} from '@shared/tasks';
import { useStore } from '../store';

type Filter = 'all' | TaskStatus;

const WHEN = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function when(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? WHEN.format(new Date(t)) : '';
}

/** Waiting first, then running, queued, done; newest change first within each. */
function byAttention(a: Task, b: Task): number {
  const d = TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status);
  return d !== 0 ? d : b.updatedAt.localeCompare(a.updatedAt);
}

function outcome(r: { ok: boolean; delivered: boolean; reason?: string }, task: Task): string {
  if (!r.ok) return 'This task no longer exists.';
  if (r.delivered) return `Saved and sent to ${task.who || 'the session'}’s console.`;
  if (r.reason === 'no-console')
    return 'Saved. The owner does not run in a Dash console, so it was not sent.';
  if (r.reason === 'console-closed')
    return 'Saved. The owner’s console is closed, so it was not sent.';
  return 'Saved.';
}

function TaskRow({ task, sessions }: { task: Task; sessions: TaskSession[] }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const owners = sessions.filter((s) => s.console);

  const send = async (edit: Omit<TaskUserEdit, 'id' | 'notify'>) => {
    setBusy(true);
    try {
      const r = await window.api.tasks.edit({ id: task.id, notify: true, ...edit });
      const who = edit.assignTo?.who ?? task.who;
      setMsg(outcome(r, { ...task, who }));
      if (r.ok && edit.comment) setComment('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="task-row" data-status={task.status}>
      <div className="task-row-main">
        <span className="task-status-dot" data-status={task.status} aria-hidden="true" />
        <div className="task-row-body">
          <div className="task-row-title">
            {task.title}
            {task.jira && <span className="task-chip">{task.jira}</span>}
            {task.project && <span className="task-chip task-chip-muted">{task.project}</span>}
          </div>
          {task.status === 'waiting' && task.waitingFor && (
            <div className="task-row-waiting">{task.waitingFor}</div>
          )}
          {task.note && <div className="task-row-note">{task.note}</div>}
          <div className="task-row-meta">
            <span>{task.who || 'Not taken yet'}</span>
            <span>
              updated {when(task.updatedAt)}
              {task.updatedBy ? ` by ${task.updatedBy}` : ''}
            </span>
            <span className="task-row-id">#{task.id}</span>
            {task.link && (
              <button
                type="button"
                className="task-link"
                onClick={() => void window.api.docs.openExternal(task.link)}
              >
                Open link
              </button>
            )}
          </div>
        </div>
        <div className="task-row-controls">
          <select
            className="task-select"
            value={task.status}
            disabled={busy}
            aria-label="Status"
            onChange={(e) => void send({ status: e.target.value as TaskStatus })}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {!task.console && owners.length > 0 && (
            <select
              className="task-select"
              value=""
              disabled={busy}
              aria-label="Give to a session"
              onChange={(e) => {
                const s = owners.find((o) => o.name === e.target.value);
                if (s) void send({ assignTo: { who: s.name, console: s.console } });
              }}
            >
              <option value="">Give to…</option>
              {owners.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {task.comments.length > 0 && (
        <ul className="task-comments">
          {task.comments.slice(-5).map((c, i) => (
            <li key={i}>
              <span className="task-comment-by">{c.by}</span>
              <span className="task-comment-at">{when(c.at)}</span>
              <span className="task-comment-text">{c.text}</span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="task-comment-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (comment.trim()) void send({ comment });
        }}
      >
        <input
          className="task-comment-input"
          value={comment}
          placeholder={task.console ? `Comment — goes to ${task.who}’s console` : 'Comment'}
          disabled={busy}
          onChange={(e) => setComment(e.target.value)}
        />
        <button type="submit" className="statusbar-button" disabled={busy || !comment.trim()}>
          Send
        </button>
        {task.status === 'done' && (
          <button
            type="button"
            className="statusbar-button"
            title="Remove this finished task from the board"
            disabled={busy}
            onClick={() => void window.api.tasks.delete(task.id)}
          >
            Remove
          </button>
        )}
      </form>
      {msg && <div className="task-row-msg">{msg}</div>}
    </li>
  );
}

/**
 * The task the user writes themselves. It lands on the board queued and
 * unowned, which is what makes the row's "Give to…" appear: the user can write
 * down work first and hand it to a session later, or never.
 */
function NewTaskForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [project, setProject] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const task = await window.api.tasks.create({ title, note, project });
      if (!task) {
        setMsg('The board could not take it.');
        return;
      }
      // Kept open, cleared: writing down a list of tasks is one sitting.
      setTitle('');
      setNote('');
      setMsg(`Added #${task.id}. Hand it to a session with “Give to…”, or leave it queued.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="tasks-new"
      onSubmit={(e) => void submit(e)}
      onKeyDown={(e) => e.key === 'Escape' && onDone()}
    >
      <input
        className="task-comment-input tasks-new-title"
        value={title}
        autoFocus
        placeholder="What has to be done"
        aria-label="Task title"
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="task-comment-input"
        value={note}
        placeholder="Details — handed over with the task"
        aria-label="Details"
        disabled={busy}
        onChange={(e) => setNote(e.target.value)}
      />
      <input
        className="task-comment-input tasks-new-project"
        value={project}
        placeholder="Project"
        aria-label="Project"
        disabled={busy}
        onChange={(e) => setProject(e.target.value)}
      />
      <button type="submit" className="statusbar-button" disabled={busy || !title.trim()}>
        Add
      </button>
      <button type="button" className="statusbar-button" onClick={onDone}>
        Close
      </button>
      {msg && <div className="tasks-new-msg">{msg}</div>}
    </form>
  );
}

/**
 * Tasks view: every Claude session's tasks in one list — what runs, what waits
 * for you, what is queued, what is done, and who does it. The counters filter
 * the list. Changing a status or writing a comment saves it and types a note
 * about it into the owning session's console, so the session acts on it.
 *
 * It stays mounted while hidden so the activity-bar badge and the status-bar
 * alert keep counting. `standalone` is the pop-out window.
 */
export function TasksPanel({
  visible,
  standalone = false,
}: {
  visible: boolean;
  standalone?: boolean;
}) {
  const setTaskCounts = useStore((s) => s.setTaskCounts);
  const [state, setState] = useState<TasksState>({ tasks: [], sessions: [] });
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    void window.api.tasks.list().then((s) => alive && setState(s));
    const off = window.api.tasks.onChanged(setState);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const counts = useMemo(() => countTasks(state.tasks), [state.tasks]);
  useEffect(() => setTaskCounts(counts), [counts, setTaskCounts]);

  const shown = useMemo(
    () => state.tasks.filter((t) => filter === 'all' || t.status === filter).sort(byAttention),
    [state.tasks, filter],
  );

  const chips: Array<[Filter, string, number]> = [
    ['all', 'All', state.tasks.length],
    ['waiting', TASK_STATUS_LABEL.waiting, counts.waiting],
    ['running', TASK_STATUS_LABEL.running, counts.running],
    ['queued', TASK_STATUS_LABEL.queued, counts.queued],
    ['done', TASK_STATUS_LABEL.done, counts.done],
  ];

  return (
    <aside
      className={`tasks-panel ${standalone ? 'is-standalone' : ''} ${visible ? '' : 'is-hidden'}`}
      aria-label="Tasks"
      aria-hidden={!visible}
    >
      <header className="tasks-panel-header">
        <h1>Tasks</h1>
        <div className="tasks-filters" role="tablist" aria-label="Filter tasks">
          {chips.map(([f, label, n]) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className="tasks-filter"
              data-status={f}
              data-attention={f === 'waiting' && n > 0 ? 'true' : undefined}
              onClick={() => setFilter(f)}
            >
              <span className="tasks-filter-n">{n}</span> {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="statusbar-button"
          aria-expanded={adding}
          title="Write a task yourself, to give to a session later"
          onClick={() => setAdding((v) => !v)}
        >
          New task
        </button>
        {!standalone && (
          <button
            type="button"
            className="statusbar-button"
            title="Open the Tasks view in its own window"
            onClick={() => void window.api.tasks.openWindow()}
          >
            Open in window
          </button>
        )}
      </header>
      {adding && <NewTaskForm onDone={() => setAdding(false)} />}
      {state.sessions.length > 0 && (
        <div className="tasks-sessions">
          {state.sessions.map((s) => (
            <span key={s.name} className="tasks-session" title={`last seen ${when(s.lastSeen)}`}>
              <strong>{s.name}</strong>
              {s.focus ? ` — ${s.focus}` : ''}
            </span>
          ))}
        </div>
      )}
      <div className="tasks-list-wrap">
        {shown.length === 0 ? (
          <p className="tasks-empty">
            {state.tasks.length === 0
              ? 'No tasks yet. Write one with “New task”, or let the Claude sessions add theirs through the task channel (docs/tasks-channel.md).'
              : 'Nothing in this group.'}
          </p>
        ) : (
          <ul className="tasks-list">
            {shown.map((t) => (
              <TaskRow key={t.id} task={t} sessions={state.sessions} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
