## ADDED Requirements

### Requirement: Context menus render above all surfaces
Right-click context menus SHALL render above all application chrome regardless of
which container they were invoked from, and SHALL NOT be clipped by an ancestor's
overflow or backdrop-filter.

#### Scenario: Menu invoked inside a frosted container
- **WHEN** a context menu is opened from within a surface that uses `backdrop-filter`
  (e.g. the sidebar or workspace)
- **THEN** the menu appears fully and on top, not trapped or clipped inside that
  surface

### Requirement: Keyboard operable context menus
Context menus SHALL be operable by keyboard: arrow keys move the highlight, Enter
activates the highlighted item, and Escape closes the menu returning focus to the
trigger.

#### Scenario: Navigate and activate with the keyboard
- **WHEN** a context menu is open and the user presses Down then Enter
- **THEN** the next item is highlighted and then activated

#### Scenario: Dismiss with Escape
- **WHEN** a context menu is open and the user presses Escape
- **THEN** the menu closes and focus returns to the element that opened it
