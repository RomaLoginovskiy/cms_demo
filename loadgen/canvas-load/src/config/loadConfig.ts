import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import { defaultConfig } from './defaults';
import { applyScenarioSafe } from './scenarios';
import { validateConfig } from './validate';
import { applyResolvedTarget } from './resolveTargetUrl';
import { normalizeUsers } from './usersConfig';
import { resolveShard, isControlShard } from './shard';
import { LoadConfig } from './types';

export interface LoadOptions {
  configPath?: string;
  scenario?: string;
}

export async function loadConfig(options: LoadOptions = {}): Promise<LoadConfig> {
  let config = JSON.parse(JSON.stringify(defaultConfig)) as LoadConfig;

  if (options.configPath && fs.existsSync(options.configPath)) {
    const raw = yaml.load(fs.readFileSync(options.configPath, 'utf8')) as Partial<LoadConfig>;
    Object.assign(config, mergeDeep(config, raw));
  } else if (options.configPath) {
    throw new Error(`Config file not found: ${options.configPath}`);
  }

  const scenario = options.scenario ?? config.run.scenario;
  if (scenario) {
    applyScenarioSafe(config, scenario);
  }

  if (!config.run.run_id) {
    config.run.run_id = uuidv4();
  }

  normalizeUsers(config.users);

  const resolved = applyResolvedTarget(config);
  const rewriteNote = resolved.rewrittenFrom
    ? ` (rewrote ${resolved.rewrittenFrom})`
    : '';
  console.log(
    `Resolved canvas target: ${resolved.url} (source: ${resolved.source})${rewriteNote}`
  );

  const shard = resolveShard(config.shard?.count);
  config.shard = { count: shard.count };

  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid config:\n${errors.join('\n')}`);
  }

  const role = isControlShard(shard) ? 'control' : `worker-${shard.index}`;
  console.log(
    `Shard ${shard.index + 1}/${shard.count} (${role}); total virtual users (UI): ${config.users.count}`
  );

  return config;
}

function mergeDeep(base: LoadConfig, partial: Partial<LoadConfig>): LoadConfig {
  return JSON.parse(
    JSON.stringify({
      ...base,
      ...partial,
      run: { ...base.run, ...partial.run },
      target: { ...base.target, ...partial.target },
      users: {
        ...base.users,
        ...partial.users,
        session_pacing: partial.users?.session_pacing
          ? { ...base.users.session_pacing, ...partial.users.session_pacing }
          : { ...base.users.session_pacing }
      },
      browser: {
        ...base.browser,
        ...partial.browser,
        fingerprint: partial.browser?.fingerprint
          ? { ...base.browser.fingerprint, ...partial.browser.fingerprint }
          : { ...base.browser.fingerprint }
      },
      boards: { ...base.boards, ...partial.boards },
      profiles: {
        ...base.profiles,
        ...partial.profiles,
        // When mix is set in YAML, it is the full distribution — do not keep default weights for omitted profiles.
        mix: partial.profiles?.mix
          ? { ...partial.profiles.mix }
          : { ...base.profiles.mix }
      },
      chaos: { ...base.chaos, ...partial.chaos },
      abort: { ...base.abort, ...partial.abort },
      report: { ...base.report, ...partial.report },
      control: { ...base.control, ...partial.control },
      shard: { ...base.shard, ...partial.shard }
    })
  ) as LoadConfig;
}

export function resolveConfigPath(cliPath?: string): string | undefined {
  if (cliPath) return path.resolve(cliPath);
  const local = path.join(process.cwd(), 'config', 'load.yaml');
  if (fs.existsSync(local)) return local;
  return undefined;
}

export function parseDurationMs(duration: string | null): number | null {
  if (!duration) return null;
  const m = duration.match(/^(\d+)(ms|s|m|h)$/);
  if (!m) throw new Error(`Invalid duration: ${duration}`);
  const n = parseInt(m[1]!, 10);
  switch (m[2]) {
    case 'ms':
      return n;
    case 's':
      return n * 1000;
    case 'm':
      return n * 60_000;
    case 'h':
      return n * 3_600_000;
    default:
      return null;
  }
}
