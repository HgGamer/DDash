# 0003 — `/mod/wait` can acknowledge the press it received

## The question

Button presses reach a mod through a long poll: dash writes the key into the
mod's open `GET /mod/wait` response. That is fire-and-forget, and it has a hole
dash cannot see from the inside. If the polling client goes away without the
socket closing — the session was killed, the machine slept, a proxy dropped the
connection — the response still looks writable, the write "succeeds", no error
is emitted, and the key is gone. The user sees a window that does not react, and
dash believes it delivered the press.

Everything that could be done on the dash side alone is already in place:
presses are queued while nobody polls, the queue is cleared with the view, and a
response that is visibly ended or throws on write hands its key back. The
remaining case is invisible by construction — the only party that knows whether
a key arrived is the mod.

## Options

1. **Socket-level heuristics** (keep-alive probes, short socket timeouts, waiting
   for `writableFinished`). None of them establish that the *client* processed
   the bytes, only that the kernel accepted them; it would trade a silent loss
   for a guess.
2. **Dash redelivers whenever a new poll arrives for the same view.** Correct for
   a dead poll, but a well-behaved mod would get every key twice.
3. **The mod acknowledges the key on its next poll.** The mod is the only one
   who knows, and it polls in a loop anyway, so the acknowledgement rides along
   on a request that was going to be made regardless.

## The decision

Option 3, as an **optional** query parameter: `GET /mod/wait?id=<id>&ack=<key>`,
where `<key>` is what the previous poll returned (empty when it returned
nothing).

- Sending `ack` at all marks that view as acknowledging. A mod that never sends
  it keeps exactly today's behaviour, so nothing has to change in lockstep and
  older mods are unaffected — the parameter is the whole protocol change.
- Dash remembers the key it last handed an acknowledging view. If the next poll
  acknowledges a different key (or none), that key never arrived and goes back
  to the **front** of the queue, ahead of presses made after it, so the mod sees
  them in the order the user made them.
- The remembered key is dropped with the view, wherever the queue is dropped
  (`/mod/close`, and a `/mod/show` that reopens a closed view).

## Consequences

- Delivery becomes **at-least-once**, not exactly-once: a mod that processes a
  key and dies before acknowledging it will be handed that key again. Mod keys
  should therefore be idempotent, or harmless to repeat — "open message 7" and
  "mark read" are, "send the reply" is not without a guard on the mod side.
- The mod has to keep one string between polls. That is the entire cost on its
  side.
- Dash keeps two more small maps per view. They are bounded by the number of
  views and cleared with them.
