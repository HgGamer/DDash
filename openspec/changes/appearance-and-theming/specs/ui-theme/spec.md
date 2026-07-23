## ADDED Requirements

### Requirement: Theme selection
The app SHALL offer three UI themes — `dark` (default), `light`, and `pink` — and
apply the selected theme to the renderer before first paint to avoid a flash.

#### Scenario: Applying a theme
- **WHEN** a theme is selected
- **THEN** the corresponding token set is applied to the document root and every
  themed surface (chrome, popovers, editor, terminal) reflects it

#### Scenario: Default on first run
- **WHEN** no theme has ever been chosen
- **THEN** the app uses the `dark` theme

### Requirement: Theme persistence
The selected theme SHALL persist across restarts.

#### Scenario: Restart restores theme
- **WHEN** the user selects a theme and relaunches the app
- **THEN** the previously selected theme is applied before the window is shown

### Requirement: Follow system appearance
The app SHALL offer a "Follow system appearance" option that maps the OS
light/dark setting to the `light`/`dark` themes and updates live when the OS
setting changes.

#### Scenario: System toggles to dark
- **WHEN** "Follow system appearance" is enabled and the OS switches to dark mode
- **THEN** the app applies the `dark` theme without a restart

#### Scenario: Explicit choice overrides follow
- **WHEN** the user picks an explicit theme
- **THEN** "Follow system appearance" is disabled and the explicit theme is kept

### Requirement: Theme propagates to native window and terminal
A theme change SHALL propagate to the main process so the native window material
and the terminal palette match the active theme (see `desktop-shell` and
`terminal-style-settings`).

#### Scenario: Theme change reaches main process
- **WHEN** the theme changes in the renderer
- **THEN** the main process is notified and updates the native window appearance
