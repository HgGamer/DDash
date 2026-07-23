import { describe, it, expect } from 'vitest';
import { buildClaudeLaunch } from '../src/main/pty-session';

describe('buildClaudeLaunch', () => {
  it('launches the binary directly with no args', () => {
    expect(buildClaudeLaunch('/usr/local/bin/claude', {})).toEqual({
      file: '/usr/local/bin/claude',
      args: [],
    });
  });

  it('adds --continue when resuming without a session id', () => {
    expect(buildClaudeLaunch('/usr/local/bin/claude', { resume: true })).toEqual({
      file: '/usr/local/bin/claude',
      args: ['--continue'],
    });
  });

  it('resumes an exact session id, taking precedence over --continue', () => {
    expect(
      buildClaudeLaunch('/usr/local/bin/claude', {
        resume: true,
        resumeSessionId: 'abc-123-DEF',
      }),
    ).toEqual({ file: '/usr/local/bin/claude', args: ['--resume', 'abc-123-DEF'] });
  });

  it('ignores a session id with shell metacharacters', () => {
    const r = buildClaudeLaunch('/usr/local/bin/claude', {
      resume: true,
      resumeSessionId: 'evil; rm -rf /',
    });
    expect(r.args).toEqual(['--continue']);
  });

  it('embeds --resume in the cmd.exe command string', () => {
    const r = buildClaudeLaunch('C:\\claude.exe', {
      winShell: 'cmd.exe',
      resume: true,
      resumeSessionId: 'sess-9',
    });
    expect(r.args).toEqual(['/d', '/s', '/c', '"C:\\claude.exe" --resume sess-9']);
  });

  it('wraps in cmd.exe with a space before --continue', () => {
    const r = buildClaudeLaunch('C:\\claude.exe', { winShell: 'cmd.exe', resume: true });
    expect(r.file).toBe('cmd.exe');
    expect(r.args).toEqual(['/d', '/s', '/c', '"C:\\claude.exe" --continue']);
  });

  it('wraps in PowerShell, escaping single quotes', () => {
    const r = buildClaudeLaunch("C:\\o'brien\\claude.exe", { winShell: 'pwsh.exe' });
    expect(r.file).toBe('pwsh.exe');
    expect(r.args).toEqual(['-NoLogo', '-Command', "& 'C:\\o''brien\\claude.exe'"]);
  });
});
