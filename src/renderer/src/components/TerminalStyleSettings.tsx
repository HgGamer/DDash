import { useEffect, useState } from 'react';
import type { TerminalStylePreset } from '@shared/types';
import { useStore } from '../store';

interface PresetOption {
  id: Exclude<TerminalStylePreset, 'custom'>;
  label: string;
  description: string;
}

const BUILTIN_OPTIONS: PresetOption[] = [
  {
    id: 'default',
    label: 'Default terminal style (xterm)',
    description: "Uses xterm.js's built-in defaults — no custom theme, font, or size.",
  },
  {
    id: 'dash-dark',
    label: 'Dash dark',
    description: 'Black background, SF Mono / Menlo font stack, 13px.',
  },
];

export function TerminalStyleSettingsModal({ onClose }: { onClose: () => void }) {
  const current = useStore((s) => s.terminalStyle);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = async (preset: TerminalStylePreset) => {
    if (preset === current.preset) return;
    setLoadError(null);
    await window.api.settings.setTerminalStyle(preset);
  };

  const browse = async () => {
    setLoadError(null);
    const result = await window.api.settings.browseTerminalStyle();
    if (result.ok) return;
    if (result.reason === 'canceled') return;
    setLoadError(result.message);
  };

  const hasCustom = !!current.customStyle;
  const customLabel = current.customStyleName
    ? `Custom — ${current.customStyleName}`
    : 'Custom';

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card" role="dialog" aria-label="Terminal style settings">
        <h3>Terminal Style</h3>
        <p className="fg-muted">
          Choose how the embedded terminal looks. Changes apply immediately to all open sessions.
        </p>
        <div className="preset-list">
          {BUILTIN_OPTIONS.map((opt) => (
            <label key={opt.id} className="preset-row">
              <input
                type="radio"
                name="terminal-style-preset"
                value={opt.id}
                checked={current.preset === opt.id}
                onChange={() => void pick(opt.id)}
              />
              <div>
                <div className="preset-label">{opt.label}</div>
                <div className="preset-desc">{opt.description}</div>
              </div>
            </label>
          ))}
          {hasCustom && (
            <label className="preset-row">
              <input
                type="radio"
                name="terminal-style-preset"
                value="custom"
                checked={current.preset === 'custom'}
                onChange={() => void pick('custom')}
              />
              <div>
                <div className="preset-label">{customLabel}</div>
                <div className="preset-desc">Loaded from a JSON style file.</div>
              </div>
            </label>
          )}
        </div>
        <div className="preset-browse-row">
          <button onClick={() => void browse()}>Browse…</button>
          <span className="preset-desc">
            Load a JSON style file or a macOS <code>.terminal</code> profile.
          </span>
        </div>
        {loadError && <div className="preset-error">{loadError}</div>}
        <div className="modal-actions">
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
