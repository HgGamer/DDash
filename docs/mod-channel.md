# The mod channel

A Claude Code mod running in a dash terminal can draw a view in dash and get the
user's button presses back. This is the contract for mod authors; the code is
`src/main/mod-modal.ts` (server) and `src/renderer/src/components/ModModal.tsx`
(rendering).

## Reaching dash

Sessions **dash started** get `DASH_MOD_MODAL=1` in their environment. The port
is in `~/.claude/dash-hook-port` (the same loopback server dash's Claude hook
posts to), so a mod finds dash with:

```
if ($DASH_MOD_MODAL == 1) port = read("~/.claude/dash-hook-port")
```

Everything below is `http://127.0.0.1:<port>/mod/…`, loopback only. A mod that
finds no port should fall back to whatever UI it has of its own — dash is not
there, or it did not start this session.

Request bodies are JSON, capped at 1 MB. A non-GET/POST method gets 405, a body
that is not JSON or carries no `id` gets 400.

## `POST /mod/show` — draw or replace a view

The body is a `ModModalView` (`src/shared/ipc.ts`):

| Field | Meaning |
| --- | --- |
| `id` | the view's identity, **stable for the life of the view**; a second show with the same id replaces its contents in place |
| `title` | header text |
| `markdown` | the body, rendered and sanitised by dash |
| `buttons` | up to 40; `{ key, label, primary?, row?, detail?, dot? }` |
| `placement` | `'float'` (default) a draggable card over the app, `'sidebar'` a panel docked on the right, `'bottom'` a tab beside the integrated shell dock |
| `tabs` | up to 12 `{ key, label, markdown, buttons }`; each replaces `markdown`/`buttons` while shown, and dash switches between them **without telling the mod** |
| `html` | the mod's own UI, up to 512 000 characters — see below |

A `row: true` button is drawn as a full-width list item (bold label, muted
`detail` under it, `dot` for an unread-style marker) above the plain action
buttons; `primary: true` gets the accent fill.

Unknown `placement` values fall back to `'float'`. Fields other than those above
are dropped.

## `POST /mod/close` — take the view down

Body `{ id }`. Also discards the presses queued for that view (see *Delivery*).

## `GET /mod/wait?id=<id>[&ack=<key>]` — the user's presses

Long poll. Returns `200 { "key": "<button key>" }` when a button is pressed, or
`204` after 20 seconds with nothing. Keys dash sends on its own:

| Key | Meaning |
| --- | --- |
| `__close` | the user dismissed the view (✕ or Esc) |
| `__sent` | the user sent an offered prompt to a console |
| `__cancel` | the user dismissed the console picker |

Only one poll per view is open at a time: a new poll releases the previous one
with 204.

`ack` is optional and makes delivery reliable — see *Delivery*.

## `POST /mod/send-offer` — offer a prompt to a console

Body `{ id, title, text }`, `text` non-empty and at most 100 000 characters.
Dash lists the open consoles and lets the user pick one; **nothing is typed until
they press Send**. The mod then hears `__sent` (or `__cancel`) on its poll. The
mod never learns which console was picked.

## The mod's own HTML

`html` is drawn instead of `markdown`/`buttons`/`tabs`, in a sandboxed iframe
with **no scripts and no network** (`default-src 'none'; style-src
'unsafe-inline'; img-src data:; font-src data:`). Within that:

- dash's theme tokens are injected as CSS custom properties, so
  `var(--color-fg)`, `var(--color-accent)`, `var(--color-control)` and the rest
  follow the user's theme;
- a click on any element carrying `data-key` presses that key — it does not have
  to be a `<button>`, and every `[data-key]` element starts from dash's filled
  chip look, which the mod's own CSS may override;
- the comment `<!--markdown-->` is replaced by `markdown`, rendered and
  sanitised;
- the frame's height follows its content (up to 4000 px).

Links never navigate the frame. A mod that wants interactivity beyond button
presses has to do it by redrawing the view, since scripts cannot run.

## Delivery

A press made while no poll is open is **queued** — up to 10 per view — and handed
to the next poll. The queue is dropped with the view: on `/mod/close`, and on a
`/mod/show` that opens a view which had been closed. A show that only replaces a
live view's contents keeps it, so redrawing a list does not swallow the button
the user just pressed.

By default a press is written into the open poll and forgotten, which loses it if
that poll's client is gone while its socket still looks writable (see
[decision 0003](decisions/0003-mod-wait-acknowledges-presses.md)). To avoid that,
send back the key the previous poll returned:

```
GET /mod/wait?id=mail&ack=         first poll: nothing to acknowledge yet
GET /mod/wait?id=mail&ack=m7       the previous poll returned "m7"
```

Sending `ack` at all opts that view in: a key handed out but not acknowledged is
handed out again, ahead of presses made after it. Acknowledge a key when you
**receive** it, including one you decide to ignore, or dash will keep offering
it. A mod that never sends `ack` keeps the fire-and-forget behaviour.

This makes delivery **at-least-once**: a mod that processes a key and dies before
acknowledging it will see that key again, so keys should be idempotent or
harmless to repeat.

## What dash will not do

Dash renders what the mod asks for and reports presses. It does not run the mod's
code, does not let a view reach the network or the DOM outside its frame, and
does not tell the mod anything about the workspace — no project paths, no console
contents, no other views. A mod that needs any of that gets it through Claude
Code, not through this channel.
