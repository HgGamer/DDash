import { useState } from 'react';
import { useStore } from '../store';
import { PlanUsagePopover } from './PlanUsagePopover';

const TOKEN_FORMATTER = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const USD_FORMATTER = new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PCT_FORMATTER = new Intl.NumberFormat('en', {
  style: 'percent',
  maximumFractionDigits: 1,
});

/**
 * Bottom status bar: shows the active project and Claude usage on the left and
 * the theme toggle / integrated terminal toggle on the right.
 */
export function StatusBar() {
  const activeId = useStore((s) => s.activeId);
  const projects = useStore((s) => s.projects);
  const integratedTerminal = useStore((s) => s.integratedTerminal);
  const claudeUsage = useStore((s) => s.claudeUsage);
  const planUsage = useStore((s) => s.claudePlanUsage);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const waiting = useStore((s) => s.taskCounts?.waiting ?? 0);
  const selectSidebarView = useStore((s) => s.selectSidebarView);
  const tasksShown = useStore((s) => s.sidebarOpen && s.sidebarView === 'tasks');
  const [planOpen, setPlanOpen] = useState(false);

  const proj = activeId ? (projects.find((p) => p.id === activeId.projectId) ?? null) : null;
  const worktree =
    activeId?.worktreeId && proj
      ? (proj.worktrees.find((w) => w.id === activeId.worktreeId) ?? null)
      : null;
  const showUsage = !!claudeUsage?.available && claudeUsage.totalTokens > 0;
  const totalTokens = claudeUsage?.totalTokens ?? 0;
  const share = (n: number) => (totalTokens > 0 ? n / totalTokens : 0);
  const inputShare = share(claudeUsage?.inputTokens ?? 0);
  const outputShare = share(claudeUsage?.outputTokens ?? 0);
  const cacheCreateShare = share(claudeUsage?.cacheCreateTokens ?? 0);
  const cacheReadShare = share(claudeUsage?.cacheReadTokens ?? 0);

  // Cycle dark → light → pink → dark.
  const THEME_ORDER = ['dark', 'light', 'pink'] as const;
  const THEME_LABEL = { dark: '🌙 Dark', light: '☀️ Light', pink: '🌸 Pink' } as const;
  const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];

  // Subscription plan usage (the real `/usage` numbers). The bar fills toward
  // whichever window is closest to its cap, so it grows as the plan is consumed.
  const fiveH = planUsage?.fiveHour?.utilization ?? null;
  const sevenD = planUsage?.sevenDay?.utilization ?? null;
  const showPlan = !!planUsage?.available && (fiveH !== null || sevenD !== null);
  const planGauge = Math.min(100, Math.max(fiveH ?? 0, sevenD ?? 0));
  const planLevel = planGauge >= 90 ? 'high' : planGauge >= 70 ? 'mid' : 'low';
  const fmtReset = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString() : 'unknown';
  const planTitle = planUsage?.available
    ? `Claude plan usage (from /usage)\n5-hour: ${fiveH !== null ? `${Math.round(fiveH)}%` : '—'} (resets ${fmtReset(planUsage.fiveHour?.resetsAt)})\n7-day: ${sevenD !== null ? `${Math.round(sevenD)}%` : '—'} (resets ${fmtReset(planUsage.sevenDay?.resetsAt)})`
    : 'Claude plan usage unavailable';

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        {proj && (
          <span className="statusbar-project" title={worktree?.path ?? proj.path}>
            <span className="statusbar-project-name">{proj.name}</span>
            {worktree && <span className="statusbar-project-branch">⎇ {worktree.branch}</span>}
          </span>
        )}
        {waiting > 0 && (
          <button
            type="button"
            className="statusbar-alert"
            title="Open the task board"
            onClick={() => {
              if (!tasksShown) selectSidebarView('tasks');
            }}
          >
            ⚠ {waiting} waiting for you
          </button>
        )}
        {showPlan && (
          <div className="statusbar-plan-wrap">
            {planOpen && planUsage && (
              <PlanUsagePopover usage={planUsage} onClose={() => setPlanOpen(false)} />
            )}
            <button
              type="button"
              className="statusbar-usage statusbar-usage-button"
              title={planTitle}
              aria-expanded={planOpen}
              onClick={() => setPlanOpen((v) => !v)}
            >
              <div className="statusbar-usage-copy">
                <span className="statusbar-usage-label">Plan</span>
                <span className="statusbar-usage-value">
                  {fiveH !== null && `5h ${Math.round(fiveH)}%`}
                  {fiveH !== null && sevenD !== null && ' · '}
                  {sevenD !== null && `7d ${Math.round(sevenD)}%`}
                </span>
              </div>
              <div className="statusbar-plan-bar" aria-hidden="true">
                <span
                  className="statusbar-plan-fill"
                  data-level={planLevel}
                  style={{ width: `${planGauge}%` }}
                />
              </div>
            </button>
          </div>
        )}
        {showUsage && claudeUsage && (
          <div
            className="statusbar-usage"
            title={`Claude usage today: ${claudeUsage.totalTokens.toLocaleString('en-US')} tokens across ${claudeUsage.sessions} session${claudeUsage.sessions === 1 ? '' : 's'}`}
          >
            <div className="statusbar-usage-copy">
              <span className="statusbar-usage-label">Claude today</span>
              <span className="statusbar-usage-value">
                {TOKEN_FORMATTER.format(claudeUsage.totalTokens)} tokens
                {' · '}input {PCT_FORMATTER.format(inputShare)}
                {' · '}output {PCT_FORMATTER.format(outputShare)}
                {' · '}cache write {PCT_FORMATTER.format(cacheCreateShare)}
                {' · '}cache read {PCT_FORMATTER.format(cacheReadShare)}
                {claudeUsage.estimatedCostUsd > 0
                  ? ` · ~${USD_FORMATTER.format(claudeUsage.estimatedCostUsd)} est.`
                  : ''}
              </span>
            </div>
            <div className="statusbar-usage-bar" aria-hidden="true">
              <span
                className="statusbar-usage-segment input"
                style={{ width: `${inputShare * 100}%` }}
              />
              <span
                className="statusbar-usage-segment output"
                style={{ width: `${outputShare * 100}%` }}
              />
              <span
                className="statusbar-usage-segment cache-create"
                style={{ width: `${cacheCreateShare * 100}%` }}
              />
              <span
                className="statusbar-usage-segment cache-read"
                style={{ width: `${cacheReadShare * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <div className="statusbar-right">
        <button
          type="button"
          className="statusbar-button"
          title={`Switch to ${nextTheme} theme (current: ${theme})`}
          onClick={() => setTheme(nextTheme)}
        >
          {THEME_LABEL[theme]}
        </button>
        {integratedTerminal.enabled && (
          <button
            type="button"
            className={`statusbar-button ${integratedTerminal.expanded ? 'active' : ''}`}
            title="Toggle integrated terminal (Cmd/Ctrl+`)"
            onClick={() =>
              void window.api.settings.setIntegratedTerminal({
                expanded: !integratedTerminal.expanded,
              })
            }
          >
            {'>_'} {integratedTerminal.expanded ? 'Hide terminal' : 'Terminal'}
          </button>
        )}
      </div>
    </footer>
  );
}
