# 0008 — The user can write a task, and hand it over later

Builds on 0005.

## The question

0005 made Dash the owner of the board, but only sessions could put anything on
it: the view edits a task, it does not create one. So work the user thought of
before any session was on it had nowhere to live — and the one control that
hands a task to a session, "Give to…", only appears on an unowned task, which
only a session could create. The user ended up asking a session to post a task
so that they could give it to another session.

## Options

1. **Ask the session to create it.** What happens today: the user tells a
   session to `POST /tasks`, then hands the task on in the view. It works, costs
   a round trip through a session that has nothing to do with the task, and the
   session that posts it is recorded as the writer.
2. **A "New task" form in the view**, writing through the same store as the
   sessions. The task lands queued and unowned, which is exactly the state
   "Give to…" is for.
3. **A separate "my tasks" list** that is not the session board. A second place
   to look, and the handover would have to move a task between the two lists.

## The decision

Option 2.

- **One store, one shape.** `TasksStore.create` goes through `upsert` like every
  session write, with `by: 'you'`, so persistence, limits and the change
  broadcast are unchanged. The new IPC channel (`tasks:create`) carries a
  `TaskDraft` (title, note, project) — not a whole `Task`, so the renderer
  cannot set `who`, `console` or `createdAt`.
- **Queued and unowned, deliberately.** That is the state the existing handover
  works on, and it is honest: nobody has taken it. The user gives it away when
  they choose, or leaves it on the list as a note to themselves.
- **The id comes from the title**, stripped of accents and numbered when it is
  taken (`felbontas-ellenorzese`, `…-2`). Ids are the one field a human would
  have to invent to satisfy `TASK_ID_RE`, and a title-shaped id still reads in
  the `#id` chip and in the console line.
- **The handover line carries the note.** A task a session posted describes
  itself in the session's own transcript; a task the user wrote exists only on
  the board, so `assigned to you` alone would tell the session nothing. The
  note now follows it as `what to do: …`.
- **No new typing rule.** Creating a task types nothing anywhere; only the
  user's handover does, through the same `userEdit` path as before (0005).

## What it costs

- Two tasks with the same title get `-2` appended, which is a fine id and a
  confusing list. Titles are the user's problem, as they are on any board.
- The board now holds work no session has seen, so "what is Claude doing" and
  "what is on the board" are no longer the same question. The `who` column
  already said this; now it says it more often.
