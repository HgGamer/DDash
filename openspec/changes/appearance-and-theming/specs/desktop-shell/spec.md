## ADDED Requirements

### Requirement: Window material tracks the active theme
On macOS, the native window appearance SHALL track the active UI theme by setting
`nativeTheme.themeSource` so the window vibrancy renders a light material under the
`light` theme and a dark material under `dark` and `pink`.

#### Scenario: Switching to the light theme
- **WHEN** the user activates the light theme
- **THEN** the window vibrancy becomes light so the frosted chrome reads as light
  frosted glass rather than muddy dark glass

#### Scenario: Switching to a dark theme
- **WHEN** the user activates the dark or pink theme
- **THEN** the window vibrancy becomes dark

#### Scenario: Non-macOS platforms
- **WHEN** the app runs on a platform without vibrancy
- **THEN** the window uses the theme's solid background and no vibrancy call is made
