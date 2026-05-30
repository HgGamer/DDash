// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import {
  ToastHost,
  TOAST_DURATION_MS,
  toast,
  dismissToast,
  getToast,
} from '../src/renderer/src/components/Toast';

describe('Toast', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    // React 18's act() expects this global.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(createElement(ToastHost));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    dismissToast();
    vi.useRealTimers();
  });

  it('shows a toast then auto-dismisses after the duration', () => {
    expect(container.querySelector('.toast')).toBeNull();

    act(() => {
      toast({ message: 'Workspace created' });
    });
    const el = container.querySelector('.toast');
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain('Workspace created');
    expect(getToast()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(container.querySelector('.toast')).toBeNull();
    expect(getToast()).toBeNull();
  });

  it('replaces the existing toast when a new one is fired', () => {
    act(() => toast({ message: 'first' }));
    act(() => vi.advanceTimersByTime(1000));
    act(() => toast({ message: 'second' }));

    const toasts = container.querySelectorAll('.toast');
    expect(toasts.length).toBe(1);
    expect(toasts[0].textContent).toContain('second');

    // The first toast's original 4s timer must not dismiss the replacement.
    act(() => vi.advanceTimersByTime(3500));
    expect(container.querySelector('.toast')?.textContent).toContain('second');
    act(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('.toast')).toBeNull();
  });

  it('runs the action and dismisses on click', () => {
    const onClick = vi.fn();
    act(() => toast({ message: 'undo me', action: { label: 'Undo', onClick } }));

    const btn = container.querySelector('.toast-action') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    act(() => {
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.toast')).toBeNull();
  });
});
