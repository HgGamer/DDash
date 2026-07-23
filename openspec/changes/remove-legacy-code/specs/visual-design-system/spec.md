## ADDED Requirements

### Requirement: Component styles reference tokens directly
All component styles SHALL reference design tokens (`--color-*`, `--space-*`, etc.)
directly, with no legacy alias or compatibility layer remaining, so tokens are the
single source of truth for the visual system.

#### Scenario: No legacy alias layer
- **WHEN** the stylesheets are audited
- **THEN** there is no legacy variable-alias block and every component rule resolves
  against the design tokens

#### Scenario: Themes stay consistent
- **WHEN** a theme is applied after the migration
- **THEN** all surfaces render correctly with no rule falling back to a removed alias
