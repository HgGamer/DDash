# 0007 — The toolbar's command button is the user's, and it is not board-only

## The question

b1295fb put a **✉ Mail** button on the board toolbar that types `/mail right`
into the active console (the agent-mail mod's inbox). Two things were wrong
with it: it only existed in board mode, so the same console was one click away
there and no clicks away anywhere else; and both the label and the command were
hard-coded to one person's mod. The command is `/mail` here; on another machine
it is something else entirely.

## Options

1. **Keep it hard-coded, add it to the tab bar.** Fixes the placement, leaves
   Dash shipping someone else's slash command as a built-in.
2. **One configurable button** — label + command + on/off — rendered wherever a
   console is active.
3. **A list of buttons,** like the Agents list. More to configure and more to
   fit in a tab bar, for a need nobody has stated yet.

## The decision

Option 2.

- **Setting:** `consoleCommand` in the app state (`ConsoleCommandSettings`:
  `enabled`, `label`, `command`), with its own IPC channels, edited under
  Settings → Agents → *Command button*.
- **Defaults stay `✉ Mail` / `/mail right`,** so the button an existing user
  already has keeps working without them touching anything.
- **A blank label or command falls back to the default** rather than being
  stored as `""`; an empty button that types nothing is worse than the default
  one, and this is the only validation the field needs.
- **One component, two places** (`ConsoleCommandButton` in `Workspace.tsx`): the
  board toolbar beside *Add window*, and the workspace tab bar beside the agent
  launcher. In the tab bar a doc tab covers the console, so the click brings the
  console forward before typing.
- **The typing rule is unchanged** (0005): a console is typed into only on the
  user's gesture, as a bracketed paste then Enter.

## What it costs

- Only one such button. A second quick command means revisiting this as a list.
- The button types into the *active* console, which may be a custom agent that
  knows nothing about the command — the same trade-off the Mail button had.
- Dash still ships a default pointing at a mod the user may not have installed;
  the command then lands in the console as an unknown slash command, visibly.
