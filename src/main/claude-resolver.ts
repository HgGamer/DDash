import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';

export const CLAUDE_INSTALL_URL = 'https://docs.claude.com/en/docs/claude-code/quickstart';

interface ResolvedEnv {
  claudePath: string | null;
  env: NodeJS.ProcessEnv;
}

let cache: ResolvedEnv | null = null;

export async function resolveClaudeEnv(): Promise<ResolvedEnv> {
  if (cache) return cache;
  const isWin = process.platform === 'win32';
  const env = { ...process.env };

  if (isWin) {
    const found = await whichWindows('claude');
    cache = { claudePath: found, env };
    return cache;
  }

  // macOS / Linux: spawn the user's login shell and pull PATH + claude location.
  const shell = process.env.SHELL || '/bin/bash';
  const script = 'printf "__DASH_PATH__=%s\\n__DASH_CLAUDE__=%s\\n" "$PATH" "$(command -v claude 2>/dev/null)"';
  const result = await spawnCapture(shell, ['-ilc', script], { timeoutMs: 5000 });

  let claudePath: string | null = null;
  if (result.stdout) {
    const pathLine = /__DASH_PATH__=(.*)/.exec(result.stdout);
    const claudeLine = /__DASH_CLAUDE__=(.*)/.exec(result.stdout);
    if (pathLine?.[1]) env.PATH = pathLine[1].trim();
    if (claudeLine?.[1]?.trim()) claudePath = claudeLine[1].trim();
  }

  if (claudePath) {
    try {
      await fs.access(claudePath);
    } catch {
      claudePath = null;
    }
  }

  cache = { claudePath, env };
  return cache;
}

function spawnCapture(
  cmd: string,
  args: string[],
  opts: { timeoutMs: number },
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c) => (stdout += c.toString()));
    child.stderr?.on('data', (c) => (stderr += c.toString()));
    const timer = setTimeout(() => {
      child.kill();
    }, opts.timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: null });
    });
  });
}

async function whichWindows(name: string): Promise<string | null> {
  const res = await spawnCapture('where', [name], { timeoutMs: 3000 });
  if (res.code !== 0) return null;
  const first = res.stdout.split(os.EOL).map((l) => l.trim()).find(Boolean);
  return first || null;
}

// Primarily for tests.
export function __resetClaudeResolverCache(): void {
  cache = null;
}
