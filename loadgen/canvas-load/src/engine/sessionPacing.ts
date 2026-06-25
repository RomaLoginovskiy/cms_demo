import { LoadConfig } from '../config/types';
import { createRng } from '../util/random';

export type SessionPacingTier = 'normal' | 'long';

export interface SessionPacingAssignment {
  tier: SessionPacingTier;
  thinkMultiplier: number;
  profileMaxDurationMs: number;
}

export function resolveSessionPacing(
  config: LoadConfig,
  userIndex: number,
  _rng?: () => number
): SessionPacingAssignment | null {
  const sp = config.users.session_pacing;
  if (!sp?.enabled) {
    return null;
  }

  const tierSeed = (config.run.seed ^ (userIndex * 0x9e3779b9) ^ 77_777) >>> 0;
  const tierRng = createRng(tierSeed);
  const tier: SessionPacingTier = tierRng() < sp.long_fraction ? 'long' : 'normal';
  return {
    tier,
    thinkMultiplier: tier === 'long' ? sp.long_think_multiplier : 1,
    profileMaxDurationMs:
      tier === 'long'
        ? sp.long_profile_max_duration_ms
        : sp.normal_profile_max_duration_ms
  };
}

export function applyThinkMultiplier(
  config: LoadConfig,
  pacing: SessionPacingAssignment | null
): LoadConfig {
  if (!pacing || pacing.thinkMultiplier === 1) {
    return config;
  }

  return {
    ...config,
    users: {
      ...config.users,
      think_time_ms: Math.floor(config.users.think_time_ms * pacing.thinkMultiplier)
    }
  };
}
