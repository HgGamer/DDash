## ADDED Requirements

### Requirement: Terminal palette follows the light theme
When the `light` theme is active, the terminal SHALL render with a light palette
(light background, dark foreground, darkened ANSI colors) tuned for legibility of
program output on a light surface, applied both to newly created terminals and to
live terminals when the theme changes.

#### Scenario: Switching to light theme with an open terminal
- **WHEN** the light theme is activated while a terminal is open
- **THEN** the open terminal repaints with the light palette without a restart

#### Scenario: Dark and pink themes
- **WHEN** the dark or pink theme is active
- **THEN** the terminal uses the user's configured terminal style unchanged

### Requirement: Opt out of theme-driven terminal palette
The user SHALL be able to opt out so the configured terminal style is preserved in
the light theme instead of being overridden.

#### Scenario: Opt-out enabled
- **WHEN** the user opts out of the theme-driven terminal palette and activates the
  light theme
- **THEN** the terminal keeps the user's configured (e.g. custom or dark) style
