export interface UserShardPlan {
  /** Virtual users to run on this pod. */
  localCount: number;
  /** Added to local spawn index for global user id / boards / RNG. */
  globalIndexOffset: number;
  /** Total users across all shards (UI value). */
  totalUsers: number;
  shardIndex: number;
  shardCount: number;
}

/** Splits totalUsers across shardCount pods; last shard takes remainder. */
export function planUsersForShard(
  totalUsers: number,
  shardIndex: number,
  shardCount: number
): UserShardPlan {
  const total = Math.max(1, totalUsers);
  const count = Math.max(1, shardCount);
  const index = Math.min(Math.max(shardIndex, 0), count - 1);
  const basePerShard = Math.ceil(total / count);
  const globalIndexOffset = index * basePerShard;
  const localCount =
    index === count - 1 ? Math.max(0, total - globalIndexOffset) : basePerShard;

  return {
    localCount: Math.max(localCount, 0),
    globalIndexOffset,
    totalUsers: total,
    shardIndex: index,
    shardCount: count
  };
}
