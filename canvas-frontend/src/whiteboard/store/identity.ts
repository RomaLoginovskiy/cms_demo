import { randomId } from '../../util/randomId';
import { UserIdentity } from '../types/models';

const NAMES = ['Curious Fox', 'Bold Otter', 'Brave Owl', 'Calm Panda', 'Merry Lynx', 'Swift Heron'];
const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899'];

const STORAGE_KEY = 'whiteboard.identity';

function randomItem<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) {
    throw new Error('Cannot choose from an empty list.');
  }

  return item;
}

export function getOrCreateIdentity(storage: Storage = localStorage): UserIdentity {
  const existing = storage.getItem(STORAGE_KEY);
  if (existing) {
    return JSON.parse(existing) as UserIdentity;
  }

  const identity: UserIdentity = {
    userId: randomId(),
    displayName: randomItem(NAMES),
    color: randomItem(COLORS)
  };

  storage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export function saveDisplayName(displayName: string, storage: Storage = localStorage): UserIdentity {
  const current = getOrCreateIdentity(storage);
  const next = { ...current, displayName: displayName.trim() || current.displayName };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
