import { useCallback, useEffect, useState } from 'react';
import type { ClaudeConfigResult, ClaudeHookEntry, ClaudeHookScope } from '@shared/ipc';
import type { ActiveSelection } from '@shared/types';
import { useStore } from '../store';
import { toast } from './Toast';

/** Claude Code's hook events (the ones a settings.json hook can name). */
const EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStop', 'SessionStart', 'SessionEnd', 'PreCompact'];
const SCOPES: Array<[ClaudeHookScope, string]> = [['user', 'User'], ['project', 'Project'], ['local', 'Local']];
const BLANK: ClaudeHookEntry = { event: 'PreToolUse', matcher: '', type: 'command', command: '', managed: false };

interface Props {
  active: ActiveSelection | null;
}

/** Right-hand panel: the hooks in Claude Code's user / project / local
 *  settings (add, edit, delete) and the installed plugins and dev mods.
 *  Reads and writes go through main (claude-config-ipc.ts). */
export function ClaudePanel({ active }: Props) {
  const close = useStore((s) => s.toggleClaudePanel);
  const [tab, setTab] = useState<'hooks' | 'plugins'>('hooks');
  const [scope, setScope] = useState<ClaudeHookScope>('user');
  const [cfg, setCfg] = useState<ClaudeConfigResult | null>(null);
  const [edit, setEdit] = useState<{ index: number | null; row: ClaudeHookEntry } | null>(null);

  const args = { projectId: active?.projectId ?? null, worktreeId: active?.worktreeId ?? null };
  const load = useCallback(() => {
    void window.api.claude.readConfig(args).then(setCfg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.projectId, active?.worktreeId]);
  useEffect(load, [load]);

  const info = cfg?.scopes.find((s) => s.scope === scope);
  const save = async (hooks: ClaudeHookEntry[]): Promise<boolean> => {
    const r = await window.api.claude.saveHooks({ ...args, scope, hooks });
    if (!r.ok) toast({ message: r.message, tone: 'error' });
    else toast({ message: 'Hooks saved. New Claude sessions pick them up; running ones may ask you to review them in /hooks.', tone: 'success' });
    load();
    return r.ok;
  };
  const submit = async (): Promise<void> => {
    if (!info || !edit) return;
    const list = [...info.hooks];
    if (edit.index === null) list.push(edit.row);
    else list[edit.index] = edit.row;
    if (await save(list)) setEdit(null);
  };

  const byEvent = new Map<string, Array<[number, ClaudeHookEntry]>>();
  info?.hooks.forEach((h, i) => byEvent.set(h.event, [...(byEvent.get(h.event) ?? []), [i, h]]));

  return (
    <aside className="claude-panel" aria-label="Claude hooks and plugins">
      <div className="claude-panel-head">
        <div className="claude-tabs" role="tablist">
          {(['hooks', 'plugins'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'hooks' ? 'Hooks' : 'Plugins & mods'}
            </button>
          ))}
        </div>
        <button className="btn-ghost" title="Reload" aria-label="Reload" onClick={load}>
          ↻
        </button>
        <button className="btn-ghost" title="Close" aria-label="Close" onClick={close}>
          ✕
        </button>
      </div>

      {tab === 'hooks' && (
        <div className="claude-panel-body">
          <div className="claude-tabs claude-scopes">
            {SCOPES.map(([s, label]) => {
              const n = cfg?.scopes.find((x) => x.scope === s);
              return (
                <button key={s} className={scope === s ? 'on' : ''} disabled={!n} title={n ? n.path : 'Open a project tab first'} onClick={() => { setScope(s); setEdit(null); }}>
                  {label} {n ? <span className="claude-count">{n.hooks.length}</span> : null}
                </button>
              );
            })}
          </div>
          {info && <div className="claude-path" title={info.path}>{info.path}{info.exists ? '' : ' (not created yet)'}</div>}
          {info && !info.isValid && <div className="claude-warn">This file is not valid JSON; fix it by hand before editing here.</div>}

          {[...byEvent].map(([event, rows]) => (
            <section key={event} className="claude-event">
              <h4>{event}</h4>
              {rows.map(([i, h]) => (
                <div key={i} className="claude-hook">
                  <div className="claude-hook-meta">
                    {h.matcher && <span className="claude-chip">{h.matcher}</span>}
                    {h.timeout ? <span className="claude-dim">{h.timeout}s</span> : null}
                    {h.managed && <span className="claude-chip">dash</span>}
                    <span className="claude-spacer" />
                    {!h.managed && (
                      <>
                        <button className="btn-ghost" onClick={() => setEdit({ index: i, row: { ...h } })}>Edit</button>
                        <button className="btn-ghost" onClick={() => void save(info!.hooks.filter((_, j) => j !== i))}>Delete</button>
                      </>
                    )}
                  </div>
                  <code className="claude-cmd">{h.command}</code>
                </div>
              ))}
            </section>
          ))}
          {info && info.hooks.length === 0 && <p className="claude-dim">No hooks in this scope.</p>}

          {edit ? (
            <div className="claude-form">
              <label>Event</label>
              <select className="field-input" value={edit.row.event} onChange={(e) => setEdit({ ...edit, row: { ...edit.row, event: e.target.value } })}>
                {[...new Set([...EVENTS, edit.row.event])].map((ev) => <option key={ev}>{ev}</option>)}
              </select>
              <label>Matcher <span className="claude-dim">(tool names, e.g. Bash|Edit; empty = all)</span></label>
              <input className="field-input" value={edit.row.matcher} onChange={(e) => setEdit({ ...edit, row: { ...edit.row, matcher: e.target.value } })} />
              <label>Command</label>
              <textarea className="field-input claude-cmd-input" rows={4} value={edit.row.command} onChange={(e) => setEdit({ ...edit, row: { ...edit.row, command: e.target.value } })} />
              <label>Timeout (s) <span className="claude-dim">(optional)</span></label>
              <input className="field-input" type="number" min={1} value={edit.row.timeout ?? ''} onChange={(e) => setEdit({ ...edit, row: { ...edit.row, timeout: e.target.value ? +e.target.value : undefined } })} />
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
                <button className="btn-primary" disabled={!edit.row.command.trim()} onClick={() => void submit()}>
                  {edit.index === null ? 'Add hook' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            info?.isValid && <button className="btn-ghost claude-add" onClick={() => setEdit({ index: null, row: { ...BLANK } })}>+ Add hook</button>
          )}
        </div>
      )}

      {tab === 'plugins' && (
        <div className="claude-panel-body">
          {cfg?.plugins.length === 0 && <p className="claude-dim">No plugins or dev mods installed.</p>}
          {cfg?.plugins.map((p) => (
            <div key={p.id} className="claude-hook">
              <div className="claude-hook-meta">
                <strong>{p.name}</strong>
                <span className="claude-chip">{p.kind === 'dev-mod' ? 'dev mod' : p.isMod ? 'mod' : 'plugin'}</span>
                {p.version && <span className="claude-dim">{p.version}</span>}
                <span className="claude-spacer" />
                {!p.enabled && <span className="claude-dim">disabled</span>}
              </div>
              {p.description && <div className="claude-desc">{p.description}</div>}
              {p.events.length > 0 && (
                <div className="claude-hook-meta">
                  {p.events.map((ev) => <span key={ev} className="claude-chip">{ev}</span>)}
                </div>
              )}
              <div className="claude-path" title={p.path}>{p.path}</div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
