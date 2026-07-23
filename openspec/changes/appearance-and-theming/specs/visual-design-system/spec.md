## ADDED Requirements

### Requirement: Light theme token set
The design-token system SHALL provide a complete `light` token set — background,
surfaces, text, borders, accents, status colors, and glass materials — such that
every token referenced by component CSS resolves in the light theme.

#### Scenario: No unresolved tokens in light theme
- **WHEN** the light theme is active
- **THEN** no themed surface falls back to a dark-theme value and no text renders
  on a same-lightness background

### Requirement: Per-theme glass materials
Frosted chrome surfaces (sidebar, bars, headers, popovers) SHALL define glass
materials per theme whose opacity keeps foreground text legible regardless of the
wallpaper or vibrancy behind the window.

#### Scenario: Light glass over a dark desktop
- **WHEN** the light theme is active and the desktop behind the window is dark
- **THEN** chrome text and controls remain legible (contrast does not depend on
  the backdrop)

### Requirement: WCAG AA contrast across themes
Text and interactive controls SHALL meet WCAG AA contrast (4.5:1 body, 3:1 large
text/controls) in every theme, verified on the heavy surfaces (git view, settings,
diff, markdown, sidebar chips).

#### Scenario: Contrast audit
- **WHEN** a theme is audited
- **THEN** all foreground/background pairings meet the AA thresholds, or the
  failing pairing is corrected
