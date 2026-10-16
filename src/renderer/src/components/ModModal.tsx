import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ModModalView } from '@shared/ipc';
import { renderMarkdown } from '../lib/markdown';

/** A mod's view docked as a right-hand panel (placement 'sidebar'); lives in the
 *  app-main flex row beside the workspace, so it takes room rather than covering it. */
export function ModSidePanel(): JSX.Element | null {
  const [view, setView] = useModView('sidebar');
  if (!view) return null;
  const press = (key: string): void => window.api.mod.press(view.id, key);
  const dismiss = (): void => {
    press('__close');
    setView(null);
  };
  return (
    <aside className="claude-panel" aria-label={view.title}>
      <div className="claude-panel-head">
        <span className="mod-modal-title">{view.title}</span>
        <button className="btn-ghost" aria-label="Close" onClick={dismiss}>
          ✕
        </button>
      </div>
      <ModViewBody view={view} className="claude-panel-body" />
    </aside>
  );
}

/** A view's content: its tab strip (switched here, the mod isn't asked), the
 *  shown tab's (or the view's) markdown, and its buttons, pressed back to the mod. */
export function ModViewBody({ view, className }: { view: ModModalView; className: string }): JSX.Element {
  if (view.html) return <ModHtmlFrame view={view} className={className} />;
  return <ModMarkdownBody view={view} className={className} />;
}

/** dash's theme as CSS custom properties (every --var on :root), resolved now. */
function themeVars(): string {
  const names = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of Array.from(rules)) {
      const st = (r as CSSStyleRule).style;
      if (st) for (let i = 0; i < st.length; i++) if (st[i]!.startsWith('--')) names.add(st[i]!);
    }
  }
  const cs = getComputedStyle(document.documentElement);
  return [...names].map((n) => `${n}:${cs.getPropertyValue(n)};`).join('');
}

/** A mod's own HTML, sandboxed with no scripts at all (dash's CSP is inherited by
 *  srcdoc frames, and the sandbox has no allow-scripts): dash listens from outside —
 *  a click on a [data-key] element presses that key, and the frame takes its
 *  content's height. allow-same-origin only lets dash reach the frame's DOM. */
function ModHtmlFrame({ view, className }: { view: ModModalView; className: string }): JSX.Element {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const doc = useMemo(() => {
    const md = view.markdown ? `<div class="markdown-body">${renderMarkdown(view.markdown, { projectRoot: '' })}</div>` : '';
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">
<style>:root{${themeVars()}color-scheme:dark light}
html,body{margin:0;background:transparent;color:var(--color-fg);font:var(--text-md)/1.5 system-ui,-apple-system,sans-serif}
a{color:var(--color-accent)} button{font:inherit;color:inherit}
code,pre{font-family:var(--font-mono);font-size:var(--text-sm)}</style></head>
<body>${view.html!.replace('<!--markdown-->', md)}</body></html>`;
  }, [view.html, view.markdown]);
  const wire = (): void => {
    const d = ref.current?.contentDocument;
    if (!d) return;
    d.addEventListener('click', (e) => {
      const t = e.target as Element | null;
      if (t?.closest('a')) e.preventDefault(); // links never navigate the frame
      const el = t?.closest('[data-key]');
      if (el) window.api.mod.press(view.id, el.getAttribute('data-key') ?? '');
    });
    const fit = (): void => setHeight(Math.min(4000, Math.max(40, d.documentElement.scrollHeight)));
    new ResizeObserver(fit).observe(d.documentElement);
    fit();
  };
  return (
    <div className={className}>
      <iframe ref={ref} className="mod-html" title={view.title} sandbox="allow-same-origin" srcDoc={doc} onLoad={wire} style={{ height }} />
    </div>
  );
}

function ModMarkdownBody({ view, className }: { view: ModModalView; className: string }): JSX.Element {
  const [tabKey, setTabKey] = useState<string | null>(null);
  const tab = view.tabs?.find((t) => t.key === tabKey) ?? view.tabs?.[0];
  const markdown = tab ? tab.markdown : view.markdown;
  const buttons = tab ? tab.buttons : view.buttons;
  const html = useMemo(() => renderMarkdown(markdown, { projectRoot: '' }), [markdown]);
  return (
    <div className={className}>
      {view.tabs && (
        <div className="claude-tabs mod-view-tabs" role="tablist">
          {view.tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTabKey(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {markdown && <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />}
      {buttons.some((b) => b.row) && (
        <div className="mod-rows">
          {buttons.filter((b) => b.row).map((b) => (
            <button key={b.key} className="mod-row" onClick={() => window.api.mod.press(view.id, b.key)}>
              <span className={`mod-row-dot${b.dot ? ' on' : ''}`} aria-hidden="true" />
              <span className="mod-row-text">
                <span className="mod-row-label">{b.label}</span>
                {b.detail && <span className="mod-row-detail">{b.detail}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {buttons.some((b) => !b.row) && (
        <div className="mod-modal-buttons">
          {buttons.filter((b) => !b.row).map((b) => (
            <button key={b.key} className={b.primary ? 'btn-primary' : 'btn-ghost'} onClick={() => window.api.mod.press(view.id, b.key)}>
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Mods' 'bottom' views, one list for the whole renderer: tabs in the integrated
// shell dock's strip (IntegratedTerminalDock), or ModBottomPanel when the dock is closed.
let bottom: { views: ModModalView[]; added: string | null } = { views: [], added: null };
const bottomSubs = new Set<() => void>();
let bottomStarted = false;
function startBottom(): void {
  if (bottomStarted) return;
  bottomStarted = true;
  const set = (next: typeof bottom) => {
    bottom = next;
    bottomSubs.forEach((f) => f());
  };
  const drop = (id: string) => bottom.views.some((v) => v.id === id) && set({ ...bottom, views: bottom.views.filter((v) => v.id !== id) });
  window.api.mod.onShow((v) => {
    if (v.placement !== 'bottom') return void drop(v.id); // moved elsewhere
    const has = bottom.views.some((x) => x.id === v.id);
    set({ views: has ? bottom.views.map((x) => (x.id === v.id ? v : x)) : [...bottom.views, v], added: has ? bottom.added : v.id });
  });
  window.api.mod.onClose((id) => void drop(id));
}
/** The bottom views, and the id of the one added last (a new one gets focus). */
export function useBottomModViews(): { views: ModModalView[]; added: string | null } {
  startBottom();
  return useSyncExternalStore(
    (f) => {
      bottomSubs.add(f);
      return () => bottomSubs.delete(f);
    },
    () => bottom,
  );
}

/** The mods' bottom views while the shell dock is closed: the same tabs, on their own. */
export function ModBottomPanel(): JSX.Element | null {
  const { views } = useBottomModViews();
  const [current, setCurrent] = useState<string | null>(null);
  if (!views.length) return null;
  const view = views.find((v) => v.id === current) ?? views[views.length - 1]!;
  return (
    <section className="mod-bottom-panel" aria-label="Mod panels">
      <div className="it-tab-strip">
        {views.map((v) => (
          <div key={v.id} className={`it-tab${v === view ? ' active' : ''}`} onClick={() => setCurrent(v.id)}>
            <span className="it-tab-label">{v.title}</span>
            <button
              className="it-tab-close"
              title="Close"
              onClick={(e) => {
                e.stopPropagation();
                window.api.mod.press(v.id, '__close');
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <ModViewBody key={view.id} view={view} className="mod-bottom-body" />
    </section>
  );
}

/** The last view shown for one placement, until its mod closes it (or ✕). */
function useModView(
  placement: 'float' | 'sidebar',
): [ModModalView | null, (v: ModModalView | null) => void] {
  const [view, setView] = useState<ModModalView | null>(null);
  useEffect(() => {
    const offShow = window.api.mod.onShow((v) => {
      if ((v.placement ?? 'float') === placement) setView(v);
      else setView((cur) => (cur?.id === v.id ? null : cur));   // the same id moved to the other placement
    });
    const offClose = window.api.mod.onClose((id) => setView((cur) => (cur?.id === id ? null : cur)));
    return () => {
      offShow();
      offClose();
    };
  }, [placement]);
  return [view, setView];
}

/** The floating modal Claude Code mods draw through dash (main/mod-modal.ts).
 *  No backdrop: the terminal stays usable underneath. Drag it by its header;
 *  Esc or ✕ dismisses it (the mod hears '__close'). */
export function ModModal(): JSX.Element | null {
  const [view, setView] = useModView('float');
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  if (!view) return null;
  // Clear locally right away so ✕/Esc always dismiss — even if the mod has
  // exited or never echoes /mod/close; still signal the mod it was closed.
  const dismiss = (): void => {
    window.api.mod.press(view.id, '__close');
    setView(null);
  };

  return (
    <div
      className="mod-modal"
      role="dialog"
      aria-label={view.title}
      style={pos ? { left: pos.x, top: pos.y, right: 'auto' } : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape') dismiss();
      }}
    >
      <div
        className="mod-modal-head"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return; // capturing here would swallow the ✕ click
          const r = e.currentTarget.parentElement!.getBoundingClientRect();
          drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current) setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <span className="mod-modal-title">{view.title}</span>
        <button className="btn-ghost" aria-label="Close" onClick={dismiss}>
          ✕
        </button>
      </div>
      <ModViewBody view={view} className="mod-modal-body" />
    </div>
  );
}
