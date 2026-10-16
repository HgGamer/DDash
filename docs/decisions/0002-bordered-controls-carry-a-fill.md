# 0002 — Bordered controls carry a fill of their own

## The question

Buttons were a hairline border over `background: transparent`. On every surface
they sit on — the settings modal, dialogs, the mod modal — the body of the
button was exactly the colour of what was behind it, so only the outline was
visible. It reads as an empty rectangle rather than something pressable, and it
was reported as a bug more than once.

The obvious reach is `--color-surface-2`, the existing hover material. That is
the wrong token: it is defined as *the hover state*, so using it as the resting
fill leaves nothing for hover, and its value is tuned for rows in glass chrome,
not for chips on an opaque modal.

## The decision

A dedicated pair of tokens, defined per theme in `styles/tokens.css`:

| theme | `--color-control` | `--color-control-hover` |
| --- | --- | --- |
| dark | `rgba(255, 255, 255, 0.09)` | `rgba(255, 255, 255, 0.16)` |
| light | `rgba(0, 0, 0, 0.06)` | `rgba(0, 0, 0, 0.12)` |
| pink | `rgba(255, 92, 175, 0.16)` | `rgba(255, 92, 175, 0.3)` |

They are **translucent on purpose**. A control can sit on the app background, on
an opaque modal surface, or on a glass bar, and a translucent fill lifts it one
step above whichever of those is behind it. A solid colour would have to be
picked per surface, and would go wrong the moment a control moved.

The pink theme keeps its own hue rather than borrowing the neutral white wash —
a grey chip in a saturated rose UI reads as a different, older widget.

Applied to the global `button` rule (`styles.css`) and to `.btn-ghost`
(`styles/components.css`), both of which also moved from `--color-border` to
`--color-border-strong`, so the edge still reads once there is a fill inside it.

## Exceptions

- **Context menu rows** (`.context-menu button`) opt out with an explicit
  `background: transparent` and their own hover. They are flat rows in a popover,
  not chips, and they only looked right before because they inherited the global
  rule's transparent fill.
- **Toolbar and status-bar icon buttons** (`.ws-header-btn`, `.statusbar-button`,
  `.claude-tabs button`, `.file-toolbar-icon`) were left alone: they carry
  `border: 1px solid transparent`, so they have no visible outline to be
  mismatched with, and a fill would turn quiet chrome into a row of chips.

## Consequences

- Any new bordered control inherits the fill from the global rule; a control that
  is meant to be flat has to say so, as the context menu now does.
- `--color-surface-2` keeps its single meaning (hover/active material), and the
  two token pairs should not be mixed.
- A theme added later has to define both control tokens, or its buttons fall back
  to the dark theme's values; the colour linter does not catch a missing token.
