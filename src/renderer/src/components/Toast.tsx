import { useSyncExternalStore } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
}

interface ToastEntry extends ToastOptions {
  /** Monotonic id so React can key the element and so we can ignore stale timers. */
  id: number;
}

/** Auto-dismiss delay. Exposed for tests. */
export const TOAST_DURATION_MS = 4000;

// ---------------------------------------------------------------------------
// Singleton observable store. Kept framework-agnostic so it can be unit-tested
// without rendering React or a DOM.
// ---------------------------------------------------------------------------

let current: ToastEntry | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

/** Show a toast. Replaces any currently-visible toast immediately (single
 *  visible toast at a time; no queueing). Auto-dismisses after 4 seconds. */
export function toast(opts: ToastOptions): void {
  clearTimer();
  const entry: ToastEntry = { id: ++seq, ...opts };
  current = entry;
  timer = setTimeout(() => {
    // Ignore if a newer toast has since replaced this one.
    if (current?.id === entry.id) {
      current = null;
      timer = null;
      emit();
    }
  }, TOAST_DURATION_MS);
  emit();
}

/** Dismiss the current toast immediately, if any. */
export function dismissToast(): void {
  clearTimer();
  if (current !== null) {
    current = null;
    emit();
  }
}

export function getToast(): ToastEntry | null {
  return current;
}

export function subscribeToast(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---------------------------------------------------------------------------
// React host. Mount once at the app root.
// ---------------------------------------------------------------------------

export function ToastHost() {
  const entry = useSyncExternalStore(subscribeToast, getToast, getToast);
  if (!entry) return null;
  return (
    <div className="toast-host" role="status" aria-live="polite">
      <div className={`toast toast-${entry.tone ?? 'info'}`}>
        <span className="toast-message">{entry.message}</span>
        {entry.action && (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              entry.action?.onClick();
              dismissToast();
            }}
          >
            {entry.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
