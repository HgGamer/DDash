## ADDED Requirements

### Requirement: Bottom dock region in workspace

The workspace area SHALL support a bottom dock region that can host a resizable panel (the integrated terminal). When the bottom dock is expanded, the main workspace content SHALL flex to the remaining vertical space above it.

#### Scenario: Bottom dock coexists with right-side git dock

- **WHEN** both the git view and the integrated terminal are expanded
- **THEN** the workspace SHALL render the git dock on the right, the terminal dock on the bottom, and the Claude terminal pane SHALL occupy the remaining top-left rectangle

### Requirement: Statusbar hosts feature toggles

The bottom statusbar SHALL host feature toggle buttons for panels that dock to the workspace. The integrated terminal toggle SHALL appear alongside the existing git view toggle.

#### Scenario: Statusbar shows both toggles

- **WHEN** both the git view and the integrated terminal features are enabled in settings
- **THEN** the statusbar SHALL display the Git toggle and the Terminal toggle
