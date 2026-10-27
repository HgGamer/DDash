#!/usr/bin/env node
// Sets up Claude Code on this machine to use Dash's task board (Tasks view).
//
//   node scripts/setup-tasks.mjs            install (or update) both pieces
//   node scripts/setup-tasks.mjs --remove   take both out again
//   node scripts/setup-tasks.mjs --dry-run  show what would change, write nothing
//
// It touches two files in ~/.claude, keeping a .bak copy of each it changes:
//
// - settings.json: a UserPromptSubmit hook. On every prompt it asks Dash for the
//   open tasks of the session's own console and hands them to the model, so an
//   answer given in the chat gets written back to the board. It is silent when
//   Dash is not running or the session was not started by Dash.
// - CLAUDE.md: a short block telling every session to report its tasks to the
//   board and to act on the "[Task board]" lines the user's changes type in.
//
// Both are marked ("dash-tasks"), so running it again replaces them instead of
// adding a second copy. Contract: docs/tasks-channel.md.

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';

const CLAUDE_DIR = path.join(homedir(), '.claude');
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const CLAUDE_MD = path.join(CLAUDE_DIR, 'CLAUDE.md');

const HOOK_MARKER = '# dash-tasks-reminder';
const HOOK_COMMAND =
  'p=$(cat "$HOME/.claude/dash-hook-port" 2>/dev/null); ' +
  '[ -n "$p" ] && [ -n "$DASH_PTY_KEY" ] && ' +
  'curl -sf -m 2 "http://127.0.0.1:$p/tasks/reminder?console=$DASH_PTY_KEY"; exit 0 ' +
  HOOK_MARKER;

const MD_START = '<!-- dash-tasks:start -->';
const MD_END = '<!-- dash-tasks:end -->';
const MD_BLOCK = `${MD_START}
## Dash task board

When this session runs in Dash, keep your tasks on Dash's task board (the Tasks
view): what you are doing, what waits for the user, what is queued, what is done.

- Port: \`cat ~/.claude/dash-hook-port\`. Your console: \`$DASH_PTY_KEY\` (set only in
  sessions Dash started; outside Dash, skip all of this).
- Create or update a task: \`POST http://127.0.0.1:<port>/tasks\` with a UTF-8 JSON
  object \`{id, title, status, who, console, waitingFor, note, project, jira, link}\`.
  \`status\` is \`running\`, \`waiting\` (put exactly what the user must answer or do in
  \`waitingFor\`), \`queued\` or \`done\`; \`who\` is your session name, \`console\` is
  \`$DASH_PTY_KEY\`. Fields you leave out keep their value.
- Write the JSON to a file and send it with \`curl -s -X POST <url> --data-binary @task.json\`;
  an inline \`curl -d '…'\` breaks accented text on Windows and is refused.
- Once per session: \`POST /tasks/session\` with \`{name, project, focus, console}\`.
- Update the task when you start it, when you stop to ask the user something,
  and when you finish it.
- A line \`[Task board] #<id> "<title>" — …\` typed into your console is the user
  acting on that task in Dash (a status change or a comment): treat it as their
  instruction, act on it, answer, and update the task.

Full contract: docs/tasks-channel.md in the Dash repository.
${MD_END}`;

const args = new Set(process.argv.slice(2));
const remove = args.has('--remove');
const dryRun = args.has('--dry-run');

function write(file, text) {
  if (dryRun) {
    console.log(`would write ${file}`);
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file)) copyFileSync(file, `${file}.bak-dash-tasks`);
  writeFileSync(file, text, 'utf8');
  console.log(`wrote ${file}`);
}

// settings.json — drop any earlier copy of the hook, then add it once.
{
  let settings = {};
  if (existsSync(SETTINGS)) {
    const raw = readFileSync(SETTINGS, 'utf8');
    try {
      settings = raw.trim() ? JSON.parse(raw) : {};
    } catch (err) {
      console.error(
        `${SETTINGS} is not valid JSON (${err.message}); fix it first, nothing changed.`,
      );
      process.exit(1);
    }
  }
  const before = JSON.stringify(settings);
  settings.hooks ??= {};
  const groups = (settings.hooks.UserPromptSubmit ?? [])
    .map((g) => ({
      ...g,
      hooks: (g.hooks ?? []).filter((h) => !String(h.command ?? '').includes(HOOK_MARKER)),
    }))
    .filter((g) => g.hooks.length > 0);
  if (!remove) groups.push({ hooks: [{ type: 'command', command: HOOK_COMMAND, timeout: 3 }] });
  if (groups.length > 0) settings.hooks.UserPromptSubmit = groups;
  else delete settings.hooks.UserPromptSubmit;
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  if (JSON.stringify(settings) !== before)
    write(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  else console.log(`${SETTINGS}: already up to date`);
}

// CLAUDE.md — replace the marked block, or append it.
{
  const md = existsSync(CLAUDE_MD) ? readFileSync(CLAUDE_MD, 'utf8') : '';
  const start = md.indexOf(MD_START);
  const end = md.indexOf(MD_END);
  let rest = md;
  if (start !== -1 && end > start) {
    rest = (md.slice(0, start) + md.slice(end + MD_END.length)).replace(/\n{3,}/g, '\n\n');
  }
  const next = remove
    ? rest.trimEnd() + (rest.trim() ? '\n' : '')
    : `${rest.trimEnd()}${rest.trim() ? '\n\n' : ''}${MD_BLOCK}\n`;
  if (next !== md) write(CLAUDE_MD, next);
  else console.log(`${CLAUDE_MD}: already up to date`);
}

console.log(
  remove
    ? 'Removed. Sessions started from now on no longer use the task board.'
    : 'Done. Sessions started from now on use the task board; restart running ones (or open /hooks once) to pick it up.',
);
