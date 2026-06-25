import { LoadConfig } from './types';
import { normalizeUsers } from './usersConfig';

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export const scenarioOverrides: Record<string, DeepPartial<LoadConfig>> = {
  smoke: {
    run: { duration: '60s' },
    users: { count: 5, think_time_ms: 100 },
    chaos: { enabled: false },
    profiles: {
      mix: {
        lurker: 0.35,
        active_drawer: 0.3,
        collaborator: 0.35,
        admin: 0,
        media_placer: 0
      }
    }
  },
  stress: {
    run: { duration: '10m' },
    users: { count: 100, think_time_ms: 50, max_contexts_per_pod: 100 }
  },
  chaos: {
    run: { duration: '5m' },
    users: { count: 15 },
    chaos: { enabled: true },
    abort: { on_abort: 'degrade' }
  },
  write_storm: {
    users: { count: 25 },
    boards: { mode: 'shared' },
    profiles: {
      mix: {
        lurker: 0.1,
        active_drawer: 0.9,
        collaborator: 0,
        admin: 0,
        media_placer: 0
      }
    }
  },
  fanout_storm: {
    boards: { mode: 'shared' },
    profiles: {
      mix: {
        lurker: 0.1,
        active_drawer: 0,
        collaborator: 0.9,
        admin: 0,
        media_placer: 0
      }
    }
  },
  connection_churn: {
    users: { count: 15, think_time_ms: 20 },
    chaos: { enabled: true, reload_probability: 0.4 }
  },
  navigation_storm: {
    profiles: {
      mix: {
        lurker: 0.2,
        active_drawer: 0.1,
        collaborator: 0.2,
        admin: 0.5,
        media_placer: 0
      },
      admin: { time_on_list_ms: 500 }
    }
  },
  media_storm: {
    chaos: { enabled: false },
    profiles: {
      mix: {
        lurker: 0.05,
        active_drawer: 0.05,
        collaborator: 0.1,
        admin: 0,
        media_placer: 0.8
      }
    }
  },
  large_board: {
    run: { duration: '10m' },
    users: { count: 8, think_time_ms: 200 },
    boards: {
      mode: 'shared',
      shared_board_name: 'loadgen-large',
      name_prefix: 'loadgen'
    },
    chaos: { enabled: false },
    profiles: {
      mix: {
        lurker: 0.1,
        active_drawer: 0,
        collaborator: 0,
        admin: 0,
        media_placer: 0,
        text_editor: 0.9
      }
    }
  }
};

export function mergeConfig(base: LoadConfig, partial: DeepPartial<LoadConfig>): LoadConfig {
  const clone = JSON.parse(JSON.stringify(base)) as LoadConfig;
  mergeInto(clone as unknown as Record<string, unknown>, partial as Record<string, unknown>);
  return clone;
}

function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(source)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== 'object') target[k] = {};
      mergeInto(target[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      target[k] = v;
    }
  }
}

export function applyScenarioSafe(config: LoadConfig, scenario: string): void {
  const overlay = scenarioOverrides[scenario];
  if (!overlay) throw new Error(`Unknown scenario: ${scenario}`);
  const merged = mergeConfig(config, overlay);
  Object.assign(config, merged);
  normalizeUsers(config.users);
  config.run.scenario = scenario;
}
