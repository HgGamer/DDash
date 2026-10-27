import { useEffect, useRef, useState } from 'react';
import type { ClaudePlanUsage, ClaudePlanWindow } from '@shared/types';

const PCT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const WHEN = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "in 2 h 13 min", "in 3 d 4 h", "now" — the time left until `iso`. */
function timeLeft(iso: string, now: number): string {
  const min = Math.max(0, Math.round((Date.parse(iso) - now) / 60000));
  if (min === 0) return 'now';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `in ${d} d ${h} h`;
  if (h > 0) return `in ${h} h ${m} min`;
  return `in ${m} min`;
}

function level(pct: number): 'low' | 'mid' | 'high' {
  return pct >= 90 ? 'high' : pct >= 70 ? 'mid' : 'low';
}

function Row({ label, w, now }: { label: string; w: ClaudePlanWindow; now: number }) {
  return (
    <div className="plan-pop-row">
      <div className="plan-pop-head">
        <span className="plan-pop-label">{label}</span>
        <span className="plan-pop-pct" data-level={level(w.utilization)}>
          {PCT.format(w.utilization)}%
        </span>
      </div>
      <div className="statusbar-plan-bar plan-pop-bar" aria-hidden="true">
        <span
          className="statusbar-plan-fill"
          data-level={level(w.utilization)}
          style={{ width: `${Math.min(100, w.utilization)}%` }}
        />
      </div>
      <div className="plan-pop-reset">
        {w.resetsAt ? (
          <>
            Resets {WHEN.format(new Date(w.resetsAt))}{' '}
            <span className="plan-pop-left">({timeLeft(w.resetsAt, now)})</span>
          </>
        ) : (
          'Reset time unknown'
        )}
      </div>
    </div>
  );
}

/**
 * Click-open detail for the status bar's plan gauge: each window's exact
 * percentage and when it resets, as a date and a countdown. Closes on Escape or
 * a click outside.
 */
export function PlanUsagePopover({
  usage,
  onClose,
}: {
  usage: ClaudePlanUsage;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const rows: Array<[string, ClaudePlanWindow | null]> = [
    ['5-hour window', usage.fiveHour],
    ['Weekly window', usage.sevenDay],
    ['Weekly · Opus', usage.sevenDayOpus],
    ['Weekly · Sonnet', usage.sevenDaySonnet],
  ];

  return (
    <div className="plan-pop" ref={ref} role="dialog" aria-label="Claude plan usage">
      <div className="plan-pop-title">Claude plan usage</div>
      {rows.map(([label, w]) => (w ? <Row key={label} label={label} w={w} now={now} /> : null))}
      <div className="plan-pop-foot">
        Same figures as Claude Code&rsquo;s /usage, refreshed at most every 5 minutes.
      </div>
    </div>
  );
}
