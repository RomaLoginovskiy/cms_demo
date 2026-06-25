import { pick } from '../util/random';

export type RumSyntheticRole = 'viewer' | 'editor' | 'admin';

export interface RumSyntheticUser {
  user_id: string;
  user_name: string;
  user_email: string;
  user_metadata: {
    role: RumSyntheticRole;
    plan: string;
    scenario?: string;
    loadgen: '1';
  };
}

export interface RumSyntheticUserContext {
  plan?: string;
  scenario?: string;
}

const NAMES = [
  'Curious Fox',
  'Bold Otter',
  'Brave Owl',
  'Calm Panda',
  'Merry Lynx',
  'Swift Heron'
] as const;

const ROLES: readonly RumSyntheticRole[] = ['viewer', 'editor', 'admin'];

export function buildRumSyntheticUser(
  userIndex: number,
  seed: number,
  rng: () => number,
  context: RumSyntheticUserContext = {}
): RumSyntheticUser {
  const hash = shortHash(seed, userIndex);
  const plan = context.plan ?? 'free';
  const user: RumSyntheticUser = {
    user_id: `load-${userIndex}-${hash}`,
    user_name: pick(NAMES, rng),
    user_email: `loaduser-${userIndex}@rum-demo.invalid`,
    user_metadata: {
      role: pick(ROLES, rng),
      plan,
      loadgen: '1'
    }
  };

  if (context.scenario) {
    user.user_metadata.scenario = context.scenario;
  }

  return user;
}

export function encodeRumUserParam(user: RumSyntheticUser): string {
  const json = JSON.stringify(user);
  return Buffer.from(json, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function shortHash(seed: number, userIndex: number): string {
  const combined = (seed ^ (userIndex * 2654435761)) >>> 0;
  return combined.toString(16).padStart(8, '0').slice(0, 8);
}
