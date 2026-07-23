## 1. Theme model

- [ ] 1.1 Confirm `AppTheme = 'dark' | 'light' | 'pink'` and light token set exist in `tokens.css` (scaffolded this session); fill any gaps
- [ ] 1.2 Add `followSystem: boolean` and `terminalFollowsTheme: boolean` to settings (`settings.ts`, types), defaulting to `false`/`true`
- [ ] 1.3 Persist the last explicit theme separately from the follow-system flag

## 2. Native window ↔ theme binding

- [ ] 2.1 Add an IPC channel (renderer → main) that sends the resolved light/dark base on theme change
- [ ] 2.2 In `main/index.ts`, set `nativeTheme.themeSource` from that message (pink → dark); apply once on window create
- [ ] 2.3 Verify vibrancy flips light/dark with the theme on macOS; no-op cleanly on other platforms

## 3. Follow system appearance

- [ ] 3.1 When `followSystem` is on, derive the theme from `nativeTheme.shouldUseDarkColors` and subscribe to `nativeTheme` `updated`
- [ ] 3.2 Picking an explicit theme clears `followSystem`
- [ ] 3.3 Apply the derived theme before first paint on launch

## 4. Settings UI

- [ ] 4.1 Add an Appearance section to `SettingsModal.tsx`: theme picker (dark/light/pink) + "Follow system appearance" toggle + "Terminal follows theme" toggle
- [ ] 4.2 Make the status-bar control reflect/open the same setting instead of being the source of truth

## 5. Terminal palette

- [ ] 5.1 Gate `effectiveTerminalOptions` on `terminalFollowsTheme` so opt-out preserves the user's style
- [ ] 5.2 Confirm live theme switch repaints open terminals (main + integrated dock)

## 6. Light-theme legibility

- [ ] 6.1 Audit git view, settings, diff, markdown, sidebar chips in light theme for contrast
- [ ] 6.2 Fix any AA failures; keep light-glass opacity high enough to not depend on backdrop
- [ ] 6.3 Add a token-pair contrast-check script (extends `scripts/check-no-raw-hex.mjs` style) as the durable guard

## 7. Verify

- [ ] 7.1 `npm run typecheck && npm run lint && npm test` green
- [ ] 7.2 Manual pass: toggle all three themes + follow-system, confirm window/chrome/terminal/editor all track
