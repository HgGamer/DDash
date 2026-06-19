import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ClaudeUsageSummary } from '@shared/types';

interface PriceRow {
  /** USD per 1M tokens. */
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

// Approximate public Anthropic list prices (USD per 1M tokens). Matched by a
// substring of the model id. Used only to produce a rough estimate — the UI
// labels the figure "est." accordingly. Unknown models contribute tokens but
// no cost.
const PRICES: Array<{ match: RegExp; price: PriceRow }> = [
  { match: /opus/i, price: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 } },
  { match: /sonnet/i, price: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } },
  { match: /haiku/i, price: { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 } },
];

function priceFor(model: string | undefined): PriceRow | null {
  if (!model) return null;
  for (const p of PRICES) if (p.match.test(model)) return p.price;
  return null;
}

/** Local-time `YYYY-MM-DD` for a date. */
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptySummary(day: string): ClaudeUsageSummary {
  return {
    available: false,
    day,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreateTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    sessions: 0,
  };
}

/**
 * Scan the Claude Code JSONL transcripts under `~/.claude/projects` and
 * aggregate this local day's token usage and a rough cost estimate.
 *
 * Only transcript files modified in roughly the last day-and-a-half are read
 * (older files can't hold today's entries; the slack covers timezone offset).
 * Usage rows are de-duplicated by `(message.id, requestId)` because the same
 * row is repeated across streamed events and resumed sessions.
 */
export async function readClaudeUsageToday(): Promise<ClaudeUsageSummary> {
  const today = localDayKey(new Date());
  const root = path.join(os.homedir(), '.claude', 'projects');

  let projectDirs: string[];
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    projectDirs = entries.filter((e) => e.isDirectory()).map((e) => path.join(root, e.name));
  } catch {
    return emptySummary(today); // ~/.claude/projects absent
  }

  // Files untouched since before yesterday can't contain today's rows.
  const cutoff = Date.now() - 36 * 60 * 60 * 1000;

  const seen = new Set<string>();
  const sessions = new Set<string>();
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreateTokens = 0;
  let cacheReadTokens = 0;
  let estimatedCostUsd = 0;
  let available = false;

  for (const dir of projectDirs) {
    let files: string[];
    try {
      const ents = await fs.readdir(dir, { withFileTypes: true });
      files = ents
        .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
        .map((e) => path.join(dir, e.name));
    } catch {
      continue;
    }

    for (const file of files) {
      try {
        const st = await fs.stat(file);
        if (st.mtimeMs < cutoff) continue;
      } catch {
        continue;
      }

      let text: string;
      try {
        text = await fs.readFile(file, 'utf8');
      } catch {
        continue;
      }
      // We reached at least one readable transcript — the feature is usable.
      available = true;

      for (const line of text.split('\n')) {
        // Cheap pre-filter before the JSON parse.
        if (!line || line.indexOf('"usage"') < 0) continue;

        let obj: {
          timestamp?: string;
          requestId?: string;
          sessionId?: string;
          message?: {
            id?: string;
            model?: string;
            usage?: {
              input_tokens?: number;
              output_tokens?: number;
              cache_creation_input_tokens?: number;
              cache_read_input_tokens?: number;
            };
          };
        };
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }

        const ts = obj.timestamp;
        if (!ts) continue;
        const d = new Date(ts);
        if (Number.isNaN(d.getTime()) || localDayKey(d) !== today) continue;

        const usage = obj.message?.usage;
        if (!usage) continue;

        const msgId = obj.message?.id;
        const reqId = obj.requestId;
        if (msgId && reqId) {
          const k = `${msgId}:${reqId}`;
          if (seen.has(k)) continue;
          seen.add(k);
        }

        const inp = usage.input_tokens ?? 0;
        const out = usage.output_tokens ?? 0;
        const cw = usage.cache_creation_input_tokens ?? 0;
        const cr = usage.cache_read_input_tokens ?? 0;
        inputTokens += inp;
        outputTokens += out;
        cacheCreateTokens += cw;
        cacheReadTokens += cr;

        const price = priceFor(obj.message?.model);
        if (price) {
          estimatedCostUsd +=
            (inp * price.input +
              out * price.output +
              cw * price.cacheWrite +
              cr * price.cacheRead) /
            1_000_000;
        }

        if (obj.sessionId) sessions.add(obj.sessionId);
      }
    }
  }

  if (!available) return emptySummary(today);

  return {
    available: true,
    day: today,
    inputTokens,
    outputTokens,
    cacheCreateTokens,
    cacheReadTokens,
    totalTokens: inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens,
    estimatedCostUsd,
    sessions: sessions.size,
  };
}
