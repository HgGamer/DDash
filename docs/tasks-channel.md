# The task channel

Claude Code sessions report their tasks to Dash, and Dash shows them in the
Tasks view: what runs, what waits for the user, what is queued, what is done,
and who does it. This is the contract for sessions (and the instructions that
tell them to report); the code is `src/main/tasks-store.ts` (store and server)
and `src/renderer/src/components/TasksPanel.tsx` (the view).

## Reaching Dash

The port is in `~/.claude/dash-hook-port` (the loopback server Dash's Claude
hook and the mod channel use). Everything below is
`http://127.0.0.1:<port>/tasks…`, loopback only.

Sessions **Dash started** also get `DASH_PTY_KEY` in their environment: the key
of the console they run in. A session that sends it as `console` lets the user's
changes reach it (see below). A session outside Dash leaves `console` empty; its
tasks are listed but nothing is typed to it.

Request bodies are JSON objects in **UTF-8**, capped at 256 KB. A body that is
not UTF-8 or not a JSON object gets 400. From a Windows console, do not pass the
JSON inline with `curl -d '…'` (curl sends it in the console's code page, so
accented text is refused); write it to a UTF-8 file and send that:

```
curl -s -X POST "http://127.0.0.1:$(cat ~/.claude/dash-hook-port)/tasks" --data-binary @task.json
```

The data is kept in `tasks.json` in Dash's userData folder.

## `GET /tasks` — the whole board

Returns `{ "tasks": Task[], "sessions": TaskSession[] }` (`src/shared/tasks.ts`).
Read it before taking a task, to see what is already queued and who owns what.

## `POST /tasks` — create or update a task

| Field | Meaning |
| --- | --- |
| `id` | Stable id you choose: letters, digits, `.`, `_`, `-`, at most 80. Required. |
| `title` | One line. Required when the task is new. |
| `status` | `running`, `waiting` (needs the user's answer or action), `queued`, `done`. New tasks default to `queued`. |
| `waitingFor` | With `waiting`: exactly what the user has to answer or do. |
| `who` | Your session name; empty while nobody has taken the task. |
| `console` | Your `$DASH_PTY_KEY`. |
| `note`, `project`, `jira`, `link` | Free text; `link` opens in the browser. |
| `comment` | Appended to the task's comment thread. |
| `by` | Who writes (defaults to `who`). |

Fields left out keep their value, so a status change is just
`{ "id": "k66", "status": "done", "who": "RedMouse" }`. Returns the stored task.

## `POST /tasks/delete` — remove a task

`{ "id": "…" }`; 404 if there is no such task.

## `POST /tasks/session` — heartbeat

`{ "name", "project", "focus", "console" }`: who you are and what you are on.
Shown as a line above the list; the user can also hand an unowned task to any
session that sent a `console` here.

## What the user's changes do

In the Tasks view the user can change a task's status, write a comment, or hand
an unowned task to a session. Each change is saved and, if the task's `console`
is open in Dash, typed into that console as one line, for example:

```
[Task board] #k66 "K-66 metric measurement" — status set to Queued by the user — user's comment: start after the optizen queue
```

The session should treat that line as the user's instruction about the task:
pick it up, answer the comment, and report its new status back through
`POST /tasks`.

Dash types into a console only on the user's own action in the view; nothing a
session posts is ever typed anywhere (decision 0005).
