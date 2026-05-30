# visual-design-system Specification

## Purpose
TBD - created by archiving change linear-ui-overhaul. Update Purpose after archive.
## Requirements
### Requirement: Single design-token layer

The renderer SHALL define all colors, typography sizes, spacing values, radii, shadow definitions, and motion durations as CSS custom properties in a single token stylesheet that is imported before every other component stylesheet. Renderer components MUST consume those tokens via `var(--token-name)` and MUST NOT hard-code raw hex colors, raw pixel spacing, or raw motion durations in component CSS.

#### Scenario: Token stylesheet is loaded first

- **WHEN** the renderer mounts the root component
- **THEN** the token stylesheet SHALL be in the document's stylesheet list before any component stylesheet, so that `var(...)` references in components resolve to the token values

#### Scenario: Component lints are free of raw color literals

- **WHEN** the project's lint configuration is run against `src/renderer/src/**/*.{css,tsx}`
- **THEN** no component file SHALL contain a hex color literal outside the token stylesheet (enforced by lint rule or code review)

### Requirement: Dark theme as the only shipped theme

The renderer SHALL ship a single dark theme tuned for the terminal-centric UI. The token values MUST produce a near-black application background, off-black surface elevations, and a single accent color used for focus rings and primary actions. A light theme is explicitly out of scope for this capability.

#### Scenario: Application background is near-black

- **WHEN** the application launches with default settings
- **THEN** the document body's background SHALL resolve to the dark theme's `--color-bg` value

### Requirement: Standard focus indication

The renderer SHALL apply a visible focus ring to every interactive element when it receives keyboard focus. The focus ring MUST use the accent color and MUST be visible on every surface elevation (background, surface, surface-2). Mouse focus SHALL NOT show the ring unless the element also has keyboard focus (via `:focus-visible`).

#### Scenario: Keyboard focus shows the ring

- **WHEN** the user tabs to an interactive element (button, link, input, sidebar row)
- **THEN** that element SHALL render the accent-colored focus ring

#### Scenario: Mouse click does not show the ring

- **WHEN** the user clicks an interactive element with a pointing device and the element does not retain keyboard focus
- **THEN** the focus ring SHALL NOT be rendered

### Requirement: Standard motion durations

Interactive transitions (hover, active, focus, panel open/close) SHALL use motion durations from the token layer (`--motion-fast` and `--motion-base`) with the shared easing token (`--ease-out`). Components MUST NOT define ad-hoc transition durations.

#### Scenario: Hover transitions use the token

- **WHEN** the user hovers a sidebar row or button
- **THEN** the visual change SHALL animate over `--motion-fast` using `--ease-out`

### Requirement: Toast notification component

The renderer SHALL provide a shared `Toast` element mounted at the application root that displays a single transient notification at a time. Toasts MUST auto-dismiss after four seconds and MAY include a single inline action button. Programmatic API: a global `toast({ message, tone?, action? })` function callable from any component.

#### Scenario: Toast appears and auto-dismisses

- **WHEN** any component calls `toast({ message: "Workspace created" })`
- **THEN** a notification SHALL appear at the bottom of the window and SHALL be removed automatically after four seconds

#### Scenario: New toast replaces existing toast

- **WHEN** a toast is currently visible and another component calls `toast(...)`
- **THEN** the existing toast SHALL be replaced by the new one without waiting for the four-second timer

#### Scenario: Toast action runs on click

- **WHEN** a toast is shown with an `action: { label, onClick }` and the user clicks the action button
- **THEN** `onClick` SHALL run and the toast SHALL dismiss

