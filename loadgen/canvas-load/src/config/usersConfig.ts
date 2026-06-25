import { LoadConfig } from './types';

/** Ensures count ≥ 1 and max_contexts_per_pod ≥ count. No pod/env cap — UI controls limits. */
export function normalizeUsers(users: LoadConfig['users']): void {
  users.count = Math.max(users.count, 1);
  users.max_contexts_per_pod = Math.max(users.max_contexts_per_pod, users.count);
}
