import { planUsersForShard } from '../src/config/userSharding';
import { resolveShard } from '../src/config/shard';

describe('planUsersForShard', () => {
  it('assigns all users to single shard', () => {
    const p = planUsersForShard(500, 0, 1);
    expect(p.localCount).toBe(500);
    expect(p.globalIndexOffset).toBe(0);
  });

  it('splits 500 across 5 shards without overlap', () => {
    const plans = [0, 1, 2, 3, 4].map(i => planUsersForShard(500, i, 5));
    expect(plans.map(p => p.localCount)).toEqual([100, 100, 100, 100, 100]);
    const ranges = plans.map(p => ({
      start: p.globalIndexOffset,
      end: p.globalIndexOffset + p.localCount - 1
    }));
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]!.start).toBe(ranges[i - 1]!.end + 1);
    }
    expect(ranges[4]!.end).toBe(499);
  });

  it('handles uneven remainder on last shard', () => {
    const plans = [0, 1, 2].map(i => planUsersForShard(10, i, 3));
    expect(plans.map(p => p.localCount)).toEqual([4, 4, 2]);
    expect(plans[2]!.globalIndexOffset).toBe(8);
  });
});

describe('resolveShard', () => {
  const origHost = process.env.HOSTNAME;
  const origCount = process.env.CANVAS_LOAD_SHARD_COUNT;
  const origIndex = process.env.CANVAS_LOAD_SHARD_INDEX;

  afterEach(() => {
    if (origHost === undefined) delete process.env.HOSTNAME;
    else process.env.HOSTNAME = origHost;
    if (origCount === undefined) delete process.env.CANVAS_LOAD_SHARD_COUNT;
    else process.env.CANVAS_LOAD_SHARD_COUNT = origCount;
    if (origIndex === undefined) delete process.env.CANVAS_LOAD_SHARD_INDEX;
    else process.env.CANVAS_LOAD_SHARD_INDEX = origIndex;
  });

  it('parses ordinal from StatefulSet hostname', () => {
    delete process.env.CANVAS_LOAD_SHARD_INDEX;
    process.env.HOSTNAME = 'canvas-load-3';
    expect(resolveShard(5)).toEqual({ index: 3, count: 5 });
  });
});
