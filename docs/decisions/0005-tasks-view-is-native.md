# 0005 — The Tasks view is native, and the user's changes reach the owning console

Replaces 0004.

## The question

0004 embedded the claude.ai task board page. In use, two things were missing.
The user wants to act on a task from Dash — mark it waiting or queued, add a
comment — and have the session that owns it hear about it immediately, without
switching to its tab and retyping. And the list should be filterable: click
"Running", "Done", etc. to see only those, while the default stays the whole
list. An embedded page Dash does not own can do neither: Dash cannot see its
edits, so it cannot pass them on.

## Options

1. **Keep the embed, watch the page's edits** through the frame probe. Brittle
   (it already depends on element ids) and still read-only towards the sessions.
2. **Dash owns the board.** Sessions write it over the loopback hook server, the
   view is a React list, and a change the user makes is typed into the owning
   session's console.
3. **Dash owns the board, sessions poll it** for user changes. No typing, but a
   session only notices between its own turns, if at all.

## The decision

Option 2.

- **Store:** `tasks.json` in userData (`src/main/tasks-store.ts`). Sessions write
  through `/tasks…` on the hook port (`docs/tasks-channel.md`); the view edits
  through IPC; every change is pushed to all Dash windows.
- **Which console:** Dash now sets `DASH_PTY_KEY` (the console's key) in every
  session it starts; a session reports it with its tasks.
- **Typing rule:** a console is typed into only on the user's gesture in the
  Tasks view — the same rule as the mod channel (a mod can offer a prompt, only
  the user sends it). A session's own posts are never typed anywhere. The text
  is a bracketed paste with control characters removed, then Enter
  (`src/shared/console-paste.ts`, now shared with the mod send dialog).
- **View:** counters double as filters (All, Waiting for you, Running, Queued,
  Done); the default is All, sorted waiting first. Waiting tasks and a non-zero
  "Waiting" filter pulse. Each task has a status select, a comment box, and —
  when unowned — "Give to…" a session that is running in Dash. The pop-out
  window is a second renderer showing only this view (`?view=tasks`).
- **UTF-8 only:** a request body that does not decode as UTF-8 is refused, not
  guessed at; storing the wrong accents silently was worse than a 400.

## What it costs

- The claude.ai artifact board is no longer what Dash shows. Sessions that
  wrote there must write to Dash instead (`docs/tasks-channel.md`), and tasks
  of sessions running where no Dash is open are not seen.
- Typing into a console interrupts whatever the session is doing in the same
  way the user typing would; the user chooses when, by acting in the view.
- `webviewTag` and the claude.ai partition are gone; nothing in Dash embeds
  remote pages any more.
