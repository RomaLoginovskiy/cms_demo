import { LoadConfig } from './types';
import { isInClusterFlag } from './runtime';
export function validateConfig(config: LoadConfig): string[] {
  const errors: string[] = [];

  try {
    const url = new URL(config.target.frontend_base_url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      errors.push('target.frontend_base_url must be http or https');
    }
    if (
      isInClusterFlag() &&
      process.env.CANVAS_LOAD_ALLOW_LOCALHOST_TARGET !== 'true' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    ) {
      errors.push(
        'target.frontend_base_url cannot be localhost inside Kubernetes — use http://canvas-frontend (set CANVAS_LOAD_ALLOW_LOCALHOST_TARGET=true to override)'
      );
    }
  } catch {
    errors.push('target.frontend_base_url is required and must be a valid URL');
  }

  const mixSum = Object.values(config.profiles.mix).reduce((a, b) => a + b, 0);
  if (Math.abs(mixSum - 1) > 0.001) {
    errors.push(`profiles.mix must sum to 1.0 (got ${mixSum})`);
  }

  const shardCount = Math.max(config.shard?.count ?? 1, 1);
  if (config.users.count < 1) {
    errors.push('users.count must be at least 1');
  } else if (config.users.count < shardCount) {
    errors.push(`users.count (${config.users.count}) must be >= shard.count (${shardCount})`);
  }

  if (config.users.max_contexts_per_pod < 1) {
    errors.push('users.max_contexts_per_pod must be at least 1');
  }

  const sp = config.users.session_pacing;
  if (sp?.enabled) {
    if (sp.long_fraction < 0 || sp.long_fraction > 1) {
      errors.push('users.session_pacing.long_fraction must be between 0 and 1');
    }
    if (sp.long_think_multiplier < 1) {
      errors.push('users.session_pacing.long_think_multiplier must be at least 1');
    }
    if (sp.normal_profile_max_duration_ms < 60_000) {
      errors.push('users.session_pacing.normal_profile_max_duration_ms must be at least 60000');
    }
    if (sp.long_profile_max_duration_ms < sp.normal_profile_max_duration_ms) {
      errors.push(
        'users.session_pacing.long_profile_max_duration_ms must be >= normal_profile_max_duration_ms'
      );
    }
  }

  if (
    config.browser.action_timeout_ms < 1000 ||
    config.browser.action_timeout_ms > 60000
  ) {
    errors.push('browser.action_timeout_ms must be between 1000 and 60000');
  }

  if (config.chaos.overlay_weight < 0 || config.chaos.overlay_weight > 1) {
    errors.push('chaos.overlay_weight must be between 0 and 1');
  }

  if (config.abort.error_rate_threshold < 0 || config.abort.error_rate_threshold > 1) {
    errors.push('abort.error_rate_threshold must be between 0 and 1');
  }

  return errors;
}
