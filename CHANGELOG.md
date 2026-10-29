# Changelog

All notable changes to Dash are documented here.

## Unreleased

### Added
- **You can write a task in the Tasks view.** "New task" takes a title, details
  and a project, and puts it on the board `queued` with no owner — the state the
  row's "Give to…" works on, so you can note work down now and hand it to a
  session later, or leave it as a reminder to yourself. The id is made from the
  title (accents stripped, numbered when it is taken). A handover now also types
  the task's details into the session's console (`what to do: …`), because a task
  you wrote exists only on the board. See `docs/decisions/0008-the-user-writes-tasks-too.md`.
- **A mod can acknowledge the press it received** (`GET /mod/wait?id=…&ack=<key>`).
  A press was written into the mod’s open long poll and forgotten, which lost it
  if that poll’s client was gone while its socket still looked writable. A mod
  that names the previous poll’s key back gets an unacknowledged key handed out
  again, ahead of later presses; one that never sends `ack` keeps the previous
  behaviour. Delivery is therefore at-least-once, so mod keys should be
  idempotent. The channel is documented in `docs/mod-channel.md`.
- **Mods can offer a prompt for a console you pick.** A Claude Code mod in a
  dash terminal posts `POST /mod/send-offer { id, title, text }`; dash shows the
  text with every open Claude / agent console (the active one preselected), and
  only on **Send** pastes it into the chosen one and presses Enter. A mod can
  only propose, so no program can type into a console on its own. The text goes
  in as one bracketed paste with control characters dropped, so a multi-line
  prompt lands whole and cannot press keys. The mod hears `__sent` or
  `__cancel` on its `/mod/wait`. (The mail mod's "Reply in…" uses it.)
- **Linear-inspired visual refresh.** A new design-token layer (`styles/tokens.css`)
  drives colors, typography, spacing, radii, motion, and focus rings across the
  whole renderer. The project sidebar gains monogram avatars, worktree/attention
  count chips, an accent leading indicator on the active row, persisted
  expand/collapse per project, and an empty-state with an "Add project" CTA.
- **In-app Docs panel (markdown viewer).** Open it from the new **Docs** button in
  the workspace header to browse and read a project's markdown files
  (`*.md` / `*.markdown`, up to three directories deep). Content is parsed with
  `marked`, sanitised with `dompurify`, code blocks are syntax-highlighted on
  demand (lazy-loaded `highlight.js`), headings get anchors for in-document
  navigation, external links open in the OS browser, and relative images resolve
  safely within the project root. File access is scoped to the project root with
  a path-traversal guard and a 2 MB read limit. The panel width is persisted.
- **Toast notifications.** A single-at-a-time transient toast (`toast({ … })`),
  used by the new workspace-creation flow.
- **Restructured "New workspace" dialog.** Three sections (Base branch → Name →
  Path), a recently-used-branches shortcut (persisted per project, capped at 5),
  inline name validation, verbatim inline git errors on failure, and a success
  toast that links back to the dialog.

### Changed
- Settings modal and all remaining renderer surfaces (git/diff/commit/stash
  views, todos, integrated terminal, update banner, status bar) migrated onto the
  shared design tokens.
- The view toggles (Docs / Terminal / Todos / Git) now live in the workspace
  header rather than the status bar.

### Fixed
- **Buttons are filled, not just outlined.** A hairline border over a transparent
  background made a button exactly the colour of the surface behind it, so only
  its outline showed — clearest on the settings buttons and the mod modal’s
  secondary actions. Bordered controls now carry a translucent fill of their own
  (`--color-control`, per theme), so they lift one step above whatever surface
  they sit on. Context-menu rows stay flat, and toolbar/status-bar icon buttons
  (which have no visible border) are unchanged. In a mod’s own HTML view every
  `[data-key]` element — not only `<button>` — starts from the same filled chip,
  which the mod’s CSS may override.
- **A mod view no longer swallows or replays the wrong button press.** A press
  made while the mod was not polling is queued, but the queue outlived the view:
  reopening a view under the same id handed the mod the previous view’s press
  first, typically its dismissal, so the reopened window closed itself again. A
  show that only redraws a live view now keeps its queued presses (a mail mod
  refreshing its list no longer drops the button just pressed), `/mod/close`
  clears them, and a press counts as delivered only when the poll could take it.
- **Board “Main + stack” layout now fills the workspace at any window count.**
  It was locked to two columns, so a fourth window went into a 1 + 3 split.
  Columns are now sized from the window count (2 → halves, 3 → main column plus a
  stack of two, 4 → 2×2, 5 → main plus two stacks of two …) and every column is
  filled top to bottom, leaving no empty space. In the tile layout a part-filled
  last row now stretches across the leftover columns instead of leaving a gap.
- `JsonStore.flush()` now drains any debounce-timer-triggered write before
  resolving, removing a race where a write could still be in flight after flush.

### Notes
- **Breaking for custom CSS theme overrides:** renderer chrome variable names
  changed (now `--color-*` tokens). The xterm terminal theming layer is
  unchanged. A single dark theme ships; a light theme may follow later.
