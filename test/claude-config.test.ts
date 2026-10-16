import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
const { flattenHooks, groupHooks } = await import('../src/main/claude-config-ipc');

describe('claude hooks flatten / group', () => {
  const hooks = {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'a' }, { type: 'command', command: 'b', timeout: 5 }] },
      { matcher: 'AskUserQuestion|ExitPlanMode', hooks: [{ type: 'command', command: 'curl … # dash-notify-hook' }] },
    ],
    Stop: [{ hooks: [{ type: 'command', command: 'c' }] }],
  };

  it('flattens one row per command and marks dash\'s own hook', () => {
    const rows = flattenHooks({ hooks });
    expect(rows.map((r) => [r.event, r.matcher, r.command, r.managed])).toEqual([
      ['PreToolUse', 'Bash', 'a', false],
      ['PreToolUse', 'Bash', 'b', false],
      ['PreToolUse', 'AskUserQuestion|ExitPlanMode', 'curl … # dash-notify-hook', true],
      ['Stop', '', 'c', false],
    ]);
  });

  it('groups rows back into the settings shape', () => {
    expect(groupHooks(flattenHooks({ hooks }))).toEqual(hooks);
  });
});
