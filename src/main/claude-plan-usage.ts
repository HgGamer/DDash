import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ClaudePlanUsage, ClaudePlanWindow } from '@shared/types';

/**
 * Live subscription plan usage — the same data Claude Code's `/usage` command
 * shows. Fetched from the Anthropic OAuth usage endpoint using the local
 * credentials in `~/.claude/.credentials.json`.
 *
 * The endpoint rate-limits aggressively (HTTP 429) when polled, so results are
 * cached and refreshed at most every {@link MIN_INTERVAL_MS}; a 429 triggers a
 * longer backoff. The `User-Agent: claude-code/<version>` header is required —
 * without it the endpoint uses a far stricter bucket.
 */

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const OAUTH_BETA = 'oauth-2025-04-20';
// The endpoint keys off the `claude-code/` UA prefix for the generous bucket;
// the exact version is not validated, but we send a realistic one.
const USER_AGENT = 'claude-code/2.1.183';

const MIN_INTERVAL_MS = 5 * 60 * 1000; // refresh at most every 5 minutes
const BACKOFF_MS = 15 * 60 * 1000; // after a 429, wait this long before retrying

interface CacheEntry {
  at: number;
  data: ClaudePlanUsage;
}

let cache: CacheEntry | null = null;
let backoffUntil = 0;

function unavailable(reason: ClaudePlanUsage['reason']): ClaudePlanUsage {
  return {
    available: false,
    fiveHour: null,
    sevenDay: null,
    sevenDayOpus: null,
    sevenDaySonnet: null,
    reason,
  };
}

type TokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'no-credentials' | 'expired' };

/** Read the OAuth access token from the local Claude Code credential store. */
async function readAccessToken(): Promise<TokenResult> {
  const file = path.join(os.homedir(), '.claude', '.credentials.json');
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return { ok: false, reason: 'no-credentials' };
  }

  let obj: {
    claudeAiOauth?: { accessToken?: string; expiresAt?: number };
    accessToken?: string;
    expiresAt?: number;
  };
  try {
    obj = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'no-credentials' };
  }

  const oauth = obj.claudeAiOauth ?? obj;
  const token = oauth.accessToken;
  if (!token) return { ok: false, reason: 'no-credentials' };

  // expiresAt is epoch milliseconds when present; treat a past value as expired.
  const expiresAt = oauth.expiresAt;
  if (typeof expiresAt === 'number' && expiresAt > 0 && expiresAt < Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, token };
}

function parseWindow(w: unknown): ClaudePlanWindow | null {
  if (!w || typeof w !== 'object') return null;
  const o = w as { utilization?: unknown; resets_at?: unknown };
  if (typeof o.utilization !== 'number') return null;
  return {
    utilization: o.utilization,
    resetsAt: typeof o.resets_at === 'string' ? o.resets_at : null,
  };
}

export async function readClaudePlanUsage(): Promise<ClaudePlanUsage> {
  const now = Date.now();

  // Serve the cached value while it's fresh, or while we're backing off a 429.
  if (cache && now - cache.at < MIN_INTERVAL_MS) return cache.data;
  if (now < backoffUntil) {
    return cache?.data ?? unavailable('rate-limited');
  }

  const cred = await readAccessToken();
  if (!cred.ok) {
    const data = unavailable(cred.reason);
    cache = { at: now, data };
    return data;
  }

  let res: Response;
  try {
    res = await fetch(USAGE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cred.token}`,
        'anthropic-beta': OAUTH_BETA,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
      },
    });
  } catch {
    return cache?.data ?? unavailable('error');
  }

  if (res.status === 429) {
    backoffUntil = now + BACKOFF_MS;
    return cache?.data ?? unavailable('rate-limited');
  }
  if (!res.ok) {
    const reason = res.status === 401 || res.status === 403 ? 'expired' : 'error';
    const data = unavailable(reason);
    // Cache auth failures briefly so we don't hammer the endpoint.
    cache = { at: now, data };
    return data;
  }

  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return cache?.data ?? unavailable('error');
  }

  const data: ClaudePlanUsage = {
    available: true,
    fiveHour: parseWindow(body.five_hour),
    sevenDay: parseWindow(body.seven_day),
    sevenDayOpus: parseWindow(body.seven_day_opus),
    sevenDaySonnet: parseWindow(body.seven_day_sonnet),
  };
  cache = { at: now, data };
  return data;
}
