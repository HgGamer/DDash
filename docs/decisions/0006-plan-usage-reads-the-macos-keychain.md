# 0006 — Plan usage reads the macOS keychain, once

## The question

The status bar's plan gauge (and the popover behind it) showed nothing on
macOS. `src/main/claude-plan-usage.ts` reads the OAuth token from
`~/.claude/.credentials.json`, which is where Claude Code keeps it on Windows
and Linux — on macOS it keeps it in the login keychain instead, so the read
failed with `no-credentials`, `available` stayed false, and the button never
rendered.

## Options

1. **Shell out to `security find-generic-password`.** The supported way to read
   a keychain item; it can raise an allow/deny prompt the first time.
2. **A native keychain binding** (keytar and friends). A prebuilt native module
   per platform for one string, in an app that otherwise ships none.
3. **Ask the user to export the token** into a file or env var. Shifts a setup
   step onto the user for a status-bar gauge.

## The decision

Option 1, with two guards.

- **File first, keychain second.** The file read stays the first attempt on
  every platform, so Linux and Windows are untouched and a macOS install that
  does have the file never reaches the keychain.
- **One pending read.** The prompt blocks until the user answers it, so a
  second refresh must not start a second `security`; the in-flight promise is
  shared.
- **Denied once, denied for the run.** `security` exits 128 when the user
  dismisses or denies the prompt. The 5-minute refresh would otherwise reopen
  that dialog all day, so a denial stops the keychain path until Dash restarts.
  Exit 44 ("no such item") is not a denial and is not latched — it just means
  Claude Code has not logged in on this machine.

## What it costs

- The first click of the gauge on macOS can raise a system prompt that names
  `security`, not Dash. Clicking *Always Allow* makes it a one-time cost.
- A user who denies by accident has to restart Dash to be asked again.
- `security` is macOS-only; the branch is behind `process.platform === 'darwin'`
  and nothing else in the main process depends on it.
