export interface ShardInfo {
  index: number;
  count: number;
}

/** Pod ordinal from StatefulSet hostname (canvas-load-2 → 2) or env overrides. */
export function resolveShard(configuredCount?: number): ShardInfo {
  const count = parseShardCount(configuredCount ?? process.env.CANVAS_LOAD_SHARD_COUNT);
  let index = parseShardIndex(process.env.CANVAS_LOAD_SHARD_INDEX);
  if (index === null) {
    index = ordinalFromHostname(process.env.HOSTNAME ?? '');
  }
  return {
    index: Math.min(Math.max(index, 0), Math.max(count - 1, 0)),
    count: Math.max(count, 1)
  };
}

export function isControlShard(shard: ShardInfo): boolean {
  return shard.index === 0;
}

function parseShardCount(raw: string | number | undefined): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseShardIndex(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function ordinalFromHostname(hostname: string): number {
  const m = hostname.match(/-(\d+)$/);
  return m ? parseInt(m[1]!, 10) : 0;
}
