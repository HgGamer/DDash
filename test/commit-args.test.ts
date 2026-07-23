import { describe, it, expect } from 'vitest';
import { buildCommitArgs } from '../src/main/git-ipc';

describe('buildCommitArgs', () => {
  it('builds a plain commit with subject only', () => {
    expect(buildCommitArgs('fix bug', undefined, false)).toEqual(['commit', '-m', 'fix bug']);
  });

  it('appends the description as a second -m', () => {
    expect(buildCommitArgs('fix bug', 'the details', false)).toEqual([
      'commit', '-m', 'fix bug', '-m', 'the details',
    ]);
  });

  it('ignores a blank description', () => {
    expect(buildCommitArgs('fix bug', '   ', false)).toEqual(['commit', '-m', 'fix bug']);
  });

  it('amends and rewords when a subject is given', () => {
    expect(buildCommitArgs('reworded', undefined, true)).toEqual([
      'commit', '--amend', '-m', 'reworded',
    ]);
  });

  it('amends keeping the existing message when subject is empty', () => {
    expect(buildCommitArgs('', undefined, true)).toEqual(['commit', '--amend', '--no-edit']);
  });
});
