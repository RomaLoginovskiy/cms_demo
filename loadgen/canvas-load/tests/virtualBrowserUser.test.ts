jest.mock('playwright', () => ({}));

import { VirtualBrowserUser } from '../src/engine/VirtualBrowserUser';
import { LoadConfig } from '../src/config/types';

jest.mock('../src/behaviors', () => ({
  runProfile: jest.fn(),
  pickProfile: jest.fn()
}));

import { runProfile, pickProfile } from '../src/behaviors';

type HandlerMap = Record<string, Array<(...args: unknown[]) => void>>;

class FakePage {
  private closed = false;
  private readonly handlers: HandlerMap = {};
  setDefaultTimeout(): void {}
  setDefaultNavigationTimeout(): void {}
  on(event: string, handler: (...args: unknown[]) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }
  isClosed(): boolean {
    return this.closed;
  }
  trigger(event: string, ...args: unknown[]): void {
    for (const h of this.handlers[event] ?? []) h(...args);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.trigger('close');
  }
}

class FakeContext {
  readonly pages: FakePage[] = [];
  async newPage(): Promise<FakePage> {
    const p = new FakePage();
    this.pages.push(p);
    return p;
  }
  async close(): Promise<void> {}
}

class FakeBrowser {
  readonly contexts: FakeContext[] = [];
  readonly contextOptions: Array<Record<string, unknown>> = [];
  async newContext(options?: Record<string, unknown>): Promise<FakeContext> {
    this.contextOptions.push(options ?? {});
    const ctx = new FakeContext();
    this.contexts.push(ctx);
    return ctx;
  }
  get context(): FakeContext {
    return this.contexts[this.contexts.length - 1]!;
  }
}

function makeConfig(): LoadConfig {
  return {
    run: {
      run_id: null,
      seed: 1,
      duration: null,
      ramp_up: '0s',
      ramp_down: '0s',
      scenario: null,
      cleanup: false,
      paused: false
    },
    target: {
      frontend_base_url: 'http://localhost:3000',
      cms_probe_url: null
    },
    users: {
      count: 1,
      max_contexts_per_pod: 1,
      think_time_ms: 0,
      session_pacing: {
        enabled: false,
        long_fraction: 0.25,
        long_think_multiplier: 3,
        normal_profile_max_duration_ms: 180_000,
        long_profile_max_duration_ms: 720_000
      }
    },
    browser: {
      headless: true,
      viewport_width: 1000,
      viewport_height: 800,
      action_timeout_ms: 1000,
      navigation_timeout_ms: 1000,
      slow_mo_ms: 0,
      fingerprint: {
        enabled: true
      }
    },
    boards: {
      mode: 'shared',
      shared_board_name: null,
      shared_board_id: null,
      pool_size: 0,
      name_prefix: 't',
      precreate_shapes: 0
    },
    profiles: {
      mix: { active_drawer: 1 },
      lurker: { mouse_move_interval_ms: 1000, mouse_move_probability: 0 },
      active_drawer: {
        tools: ['Rectangle'],
        draw_interval_ms: 0,
        select_and_move_probability: 0,
        delete_probability: 0,
        max_shapes_before_delete: 10
      },
      collaborator: {
        mouse_move_interval_ms: 1000,
        selection_interval_ms: 1000,
        property_edit_interval_ms: 1000
      },
      admin: {
        boards_per_session_min: 1,
        boards_per_session_max: 1,
        rename_probability: 0,
        delete_probability: 0,
        time_on_list_ms: 0
      },
      media_placer: {
        search_queries: [],
        place_interval_ms: 0,
        skip_if_cms_unavailable: true
      },
      complex_placer: {
        templates: [{ tab: 'path', name: 'Cross (small)' }],
        place_interval_ms: 0
      },
      text_editor: {
        edit_interval_ms: 1000,
        min_shapes: 0
      }
    },
    chaos: {
      enabled: false,
      overlay_weight: 0,
      reload_probability: 0,
      invalid_route_probability: 0,
      spam_tools_probability: 0,
      dialog_auto_accept: true
    },
    abort: {
      warmup: '0s',
      error_rate_threshold: 1,
      max_consecutive_action_errors: 999,
      on_abort: 'degrade'
    },
    report: {
      rolling_interval_s: 10,
      path: 'out.json'
    },
    control: {
      listen_port: 0,
      metrics_port: 0
    },
    shard: {
      count: 1
    }
  };
}

describe('VirtualBrowserUser', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('applies distinct browser fingerprints per user index', async () => {
    (pickProfile as jest.Mock).mockReturnValue('lurker');
    (runProfile as jest.Mock).mockImplementation(
      (_profile: string, ctx: { signal: AbortSignal }) =>
        new Promise<void>(resolve => {
          if (ctx.signal.aborted) {
            resolve();
            return;
          }
          ctx.signal.addEventListener('abort', () => resolve(), { once: true });
        })
    );

    const cfg = makeConfig();
    const browser0 = new FakeBrowser();
    const browser1 = new FakeBrowser();

    const user0 = new VirtualBrowserUser(browser0 as never, cfg, {} as never, 0);
    const user1 = new VirtualBrowserUser(browser1 as never, cfg, {} as never, 1);

    await user0.start();
    await user1.start();

    const opts0 = browser0.contextOptions[0]!;
    const opts1 = browser1.contextOptions[0]!;

    expect(opts0.userAgent).toBeTruthy();
    expect(opts1.userAgent).toBeTruthy();
    expect(opts0.userAgent).not.toBe(opts1.userAgent);
    expect(opts0.viewport).not.toEqual(opts1.viewport);
    expect(opts0.locale).toBeTruthy();
    expect(opts0.geolocation).toBeTruthy();

    await user0.stop();
    await user1.stop();
  });

  it('recreates page when current page closes', async () => {
    (pickProfile as jest.Mock).mockReturnValue('active_drawer');

    const browser = new FakeBrowser();
    const cfg = makeConfig();
    const user = new VirtualBrowserUser(browser as never, cfg, {} as never, 0);

    let callCount = 0;
    let secondCtxPage: FakePage | undefined;
    const secondCall = new Promise<void>(resolve => {
      (runProfile as jest.Mock).mockImplementation(async (_profile: string, ctx: { page: FakePage }) => {
        callCount++;
        if (callCount === 1) {
          ctx.page.close();
          throw new Error('boom');
        }
        secondCtxPage = ctx.page;
        resolve();
      });
    });

    await user.start();
    await Promise.race([
      secondCall,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]);

    expect(browser.context.pages.length).toBeGreaterThanOrEqual(2);
    expect(secondCtxPage).toBe(browser.context.pages[1]);

    await user.stop();
  }, 10000);

  it('rotates profiles when session pacing caps profile duration', async () => {
    (pickProfile as jest.Mock).mockReturnValue('active_drawer');

    const browser = new FakeBrowser();
    const cfg = makeConfig();
    cfg.users.session_pacing = {
      enabled: true,
      long_fraction: 0,
      long_think_multiplier: 1,
      normal_profile_max_duration_ms: 30,
      long_profile_max_duration_ms: 60_000
    };

    const user = new VirtualBrowserUser(browser as never, cfg, {} as never, 0);

    let callCount = 0;
    const thirdCall = new Promise<void>(resolve => {
      (runProfile as jest.Mock).mockImplementation((_profile: string, ctx: { signal: AbortSignal }) => {
        callCount++;
        if (callCount >= 3) resolve();
        return new Promise<void>(done => {
          if (ctx.signal.aborted) {
            done();
            return;
          }
          ctx.signal.addEventListener('abort', () => done(), { once: true });
        });
      });
    });

    await user.start();
    await Promise.race([
      thirdCall,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
    ]);

    expect(callCount).toBeGreaterThanOrEqual(3);
    await user.stop();
  }, 10000);
});
