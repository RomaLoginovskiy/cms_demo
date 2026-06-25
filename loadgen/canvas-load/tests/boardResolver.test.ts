import { BoardResolver } from '../src/engine/BoardResolver';
import { defaultConfig } from '../src/config/defaults';

describe('BoardResolver', () => {
  it('shared board name includes run id', () => {
    const cfg = JSON.parse(JSON.stringify(defaultConfig));
    cfg.run.run_id = 'test-run';
    const resolver = new BoardResolver(cfg);
    expect(resolver.getSharedBoardName()).toBe('loadgen-test-run');
  });

  it('pool board names cycle', () => {
    const cfg = JSON.parse(JSON.stringify(defaultConfig));
    cfg.run.run_id = 'abc';
    cfg.boards.mode = 'pool';
    cfg.boards.pool_size = 3;
    const resolver = new BoardResolver(cfg);
    expect(resolver.getPoolBoardName(0)).toContain('pool-0');
    expect(resolver.getPoolBoardName(4)).toContain('pool-1');
  });
});
