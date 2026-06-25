import { LoadConfig } from '../config/types';
import { BrowserLoadEngine } from './BrowserLoadEngine';

const DEFAULT_LEADER =
  process.env.CANVAS_LOAD_LEADER_URL ??
  'http://canvas-load-0.canvas-load-headless.cms-demo.svc.cluster.local:8090';

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Workers mirror control-plane config and run/pause state from shard 0. */
export function startLeaderSync(engine: BrowserLoadEngine): NodeJS.Timeout {
  return setInterval(() => void syncFromLeader(engine), 5000);
}

export async function syncFromLeader(engine: BrowserLoadEngine): Promise<void> {
  if (engine.isControlPlane()) return;

  const [state, cfg] = await Promise.all([
    fetchJson<Record<string, unknown>>(`${DEFAULT_LEADER}/api/control/state`),
    fetchJson<LoadConfig & { target?: { effective_frontend_base_url?: string } }>(
      `${DEFAULT_LEADER}/api/control/config`
    )
  ]);

  if (!cfg) return;

  const partial = {
    users: {
      count: cfg.users.count,
      max_contexts_per_pod: cfg.users.max_contexts_per_pod,
      think_time_ms: cfg.users.think_time_ms
    },
    profiles: cfg.profiles,
    chaos: cfg.chaos,
    shard: cfg.shard,
    run: { paused: Boolean(state?.paused) },
    ...(cfg.target?.frontend_base_url
      ? { target: { frontend_base_url: cfg.target.frontend_base_url } }
      : {})
  } as Partial<LoadConfig>;

  engine.mergeConfig(partial);

  if (!state) return;

  const leaderPaused = Boolean(state.paused);
  if (leaderPaused && !engine.isPaused()) {
    await engine.pause();
  } else if (!leaderPaused && engine.isPaused()) {
    try {
      await engine.resume();
    } catch {
      /* leader target may not be ready yet */
    }
  }
}
