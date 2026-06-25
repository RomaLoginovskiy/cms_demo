import { LoadConfig, ProfileName } from '../config/types';

const PROFILE_NAMES: ProfileName[] = [
  'lurker',
  'active_drawer',
  'collaborator',
  'admin',
  'media_placer',
  'complex_placer',
  'text_editor',
  'chaos'
];

export function pickProfile(config: LoadConfig, rng: () => number): ProfileName {
  if (config.chaos.enabled && rng() < config.chaos.overlay_weight) {
    return 'chaos';
  }

  const mix = config.profiles.mix;
  const roll = rng();
  let cumulative = 0;
  for (const name of PROFILE_NAMES) {
    if (name === 'chaos') continue;
    const weight = mix[name] ?? 0;
    cumulative += weight;
    if (roll < cumulative) return name;
  }
  return 'lurker';
}

export function pickProfileForTest(mix: Record<string, number>, rng: () => number): string {
  const roll = rng();
  let cumulative = 0;
  for (const [name, weight] of Object.entries(mix)) {
    cumulative += weight;
    if (roll < cumulative) return name;
  }
  return 'lurker';
}
