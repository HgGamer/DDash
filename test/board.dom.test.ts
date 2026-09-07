// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Store = typeof import('../src/renderer/src/store');

/** The store reads localStorage once, at module evaluation — so each case seeds
 *  storage first and then imports it fresh. */
async function freshStore(seed: Record<string, string> = {}): Promise<Store> {
  localStorage.clear();
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  vi.resetModules();
  return import('../src/renderer/src/store');
}

const A = '9d7562ca-82b8-4899-ab87-149a1c04200d';
const B = 'f9f02a34-8da6-4d3a-84c3-dd671abae01e';

// Closing a window reaches through the preload bridge to kill its PTY. These
// tests only assert the state transitions, so a recording stub is enough.
const ptyClose = vi.fn();
beforeEach(() => {
  ptyClose.mockClear();
  (window as unknown as { api: unknown }).api = {
    pty: { close: ptyClose },
    notify: { attentionClear: vi.fn() },
  };
});

describe('board persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restores pinned windows from localStorage', async () => {
    const { useStore } = await freshStore({ 'dash.board': JSON.stringify([A, B]) });
    expect(useStore.getState().board).toEqual([A, B]);
  });

  it('drops entries an external drop injected into the board', async () => {
    const junk = 'https://chat.zengo.eu/file-upload/abc/Clipboard.png';
    const { useStore } = await freshStore({ 'dash.board': JSON.stringify([A, junk, B]) });
    expect(useStore.getState().board).toEqual([A, B]);
  });

  it('pinning and unpinning survives a reload', async () => {
    const { useStore } = await freshStore();
    useStore.getState().toggleBoard(A);
    useStore.getState().toggleBoard(B);
    expect(JSON.parse(localStorage.getItem('dash.board') ?? '[]')).toEqual([A, B]);

    useStore.getState().toggleBoard(A);
    expect(JSON.parse(localStorage.getItem('dash.board') ?? '[]')).toEqual([B]);
  });

  it('reorder ignores a key that is not on the board', async () => {
    const { useStore } = await freshStore({ 'dash.board': JSON.stringify([A, B]) });
    // What a drop from outside the app carries in `text/plain`.
    useStore.getState().reorderBoard('https://example.com/pasted.png', B);
    expect(useStore.getState().board).toEqual([A, B]);

    useStore.getState().reorderBoard(B, A);
    expect(useStore.getState().board).toEqual([B, A]);
  });
});

describe('window names', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists a renamed window and restores it', async () => {
    const first = await freshStore();
    first.useStore.getState().setWindowLabel(A, 'Backend');
    expect(JSON.parse(localStorage.getItem('dash.windowLabels') ?? '{}')).toEqual({
      [A]: 'Backend',
    });

    // Reload: the name comes back.
    vi.resetModules();
    const second = await import('../src/renderer/src/store');
    expect(second.useStore.getState().windowLabels[A]).toBe('Backend');
  });

  it('trims the name and an empty one reverts to the default', async () => {
    const { useStore } = await freshStore();
    useStore.getState().setWindowLabel(A, '  Backend  ');
    expect(useStore.getState().windowLabels[A]).toBe('Backend');

    useStore.getState().setWindowLabel(A, '   ');
    expect(useStore.getState().windowLabels[A]).toBeUndefined();
    expect(JSON.parse(localStorage.getItem('dash.windowLabels') ?? '{}')).toEqual({});
  });
});

describe('closing the built-in Claude window', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const CLAUDE_2 = 'claude:11111111-1111-4111-8111-111111111111';

  it('is refused while it is the only window', async () => {
    const { useStore } = await freshStore();
    useStore.getState().closePrimaryWindow(A);
    expect(useStore.getState().primaryClosed[A]).toBeUndefined();
  });

  it('closes it and hands the content area to a remaining window', async () => {
    const { useStore } = await freshStore();
    useStore.getState().openAgent(A, CLAUDE_2);
    useStore.getState().closePrimaryWindow(A);

    expect(useStore.getState().primaryClosed[A]).toBe(true);
    expect(useStore.getState().activeAgentByKey[A]).toBe(CLAUDE_2);
    // The built-in window's session is the one killed: no agentId.
    expect(ptyClose).toHaveBeenCalledWith({ projectId: A, worktreeId: null });
  });

  it('unpins it from the board', async () => {
    const { useStore } = await freshStore();
    useStore.getState().toggleBoard(A);
    useStore.getState().openAgent(A, CLAUDE_2);
    useStore.getState().closePrimaryWindow(A);
    expect(useStore.getState().board).not.toContain(A);
  });

  it('comes back when the last extra window is closed', async () => {
    const { useStore } = await freshStore();
    useStore.getState().openAgent(A, CLAUDE_2);
    useStore.getState().closePrimaryWindow(A);
    useStore.getState().closeAgent(A, CLAUDE_2);

    expect(useStore.getState().primaryClosed[A]).toBeUndefined();
    expect(useStore.getState().activeAgentByKey[A]).toBeNull();
  });

  it('stays closed across a reload, with an extra window active', async () => {
    const first = await freshStore();
    first.useStore.getState().openAgent(A, CLAUDE_2);
    first.useStore.getState().closePrimaryWindow(A);

    vi.resetModules();
    const second = await import('../src/renderer/src/store');
    expect(second.useStore.getState().primaryClosed[A]).toBe(true);
    expect(second.useStore.getState().activeAgentByKey[A]).toBe(CLAUDE_2);
  });

  it('is not restored if no extra window survived the reload', async () => {
    const { useStore } = await freshStore({
      'dash.windows': JSON.stringify({ open: {}, active: {}, primaryClosed: { [A]: true } }),
    });
    expect(useStore.getState().primaryClosed[A]).toBeUndefined();
  });
});
