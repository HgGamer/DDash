import { useEffect, useState } from 'react';
import type { ModSendOffer } from '@shared/ipc';
import { ENTER_DELAY_MS, pastePayload } from '../lib/console-paste';

/** A console a mod's offered prompt can go to: one open Claude / agent pane. */
export interface SendTarget {
  key: string;
  label: string;
  detail: string;
  projectId: string;
  worktreeId: string | null;
  agentId: string | null;
}

/** A prompt a mod offered (POST /mod/send-offer) with the open consoles to send
 *  it to. Nothing is typed until the user picks one and presses Send: a mod can
 *  only propose, so no program can type into a console on its own. The mod
 *  hears '__sent' or '__cancel' on its /mod/wait. */
export function ModSendDialog({
  targets,
  defaultKey,
}: {
  targets: SendTarget[];
  defaultKey: string | null;
}): JSX.Element | null {
  const [offer, setOffer] = useState<ModSendOffer | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(
    () =>
      window.api.mod.onSendOffer((o) => {
        setOffer(o);
        setPicked(null);
      }),
    [],
  );
  if (!offer) return null;

  const target =
    targets.find((t) => t.key === picked) ?? targets.find((t) => t.key === defaultKey) ?? targets[0] ?? null;
  const finish = (key: '__sent' | '__cancel'): void => {
    window.api.mod.press(offer.id, key);
    setOffer(null);
  };
  const send = (): void => {
    if (!target) return;
    const to = { projectId: target.projectId, worktreeId: target.worktreeId, agentId: target.agentId };
    window.api.pty.write({ ...to, data: pastePayload(offer.text) });
    setTimeout(() => window.api.pty.write({ ...to, data: '\r' }), ENTER_DELAY_MS);
    finish('__sent');
  };

  return (
    <div
      className="mod-modal mod-send-dialog"
      role="dialog"
      aria-label={offer.title || 'Send prompt'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') finish('__cancel');
      }}
    >
      <div className="mod-modal-head">
        <span className="mod-modal-title">{offer.title || 'Send prompt to a console'}</span>
        <button className="btn-ghost" aria-label="Cancel" onClick={() => finish('__cancel')}>
          ✕
        </button>
      </div>
      <div className="mod-modal-body">
        <pre className="mod-send-preview">{offer.text}</pre>
        {targets.length ? (
          <div className="mod-rows" role="radiogroup" aria-label="Console">
            {targets.map((t) => (
              <button
                key={t.key}
                role="radio"
                aria-checked={t.key === target?.key}
                className="mod-row"
                onClick={() => setPicked(t.key)}
                onDoubleClick={() => {
                  setPicked(t.key);
                  if (t.key === target?.key) send();
                }}
              >
                <span className={`mod-row-dot${t.key === target?.key ? ' on' : ''}`} aria-hidden="true" />
                <span className="mod-row-text">
                  <span className="mod-row-label">{t.label}</span>
                  <span className="mod-row-detail">{t.detail}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mod-send-empty">No console is open.</p>
        )}
        <div className="mod-modal-buttons">
          <button className="btn-primary" disabled={!target} onClick={send}>
            Send
          </button>
          <button className="btn-ghost" onClick={() => finish('__cancel')}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
