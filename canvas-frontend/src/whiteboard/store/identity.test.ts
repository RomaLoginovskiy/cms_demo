import { getOrCreateIdentity, saveDisplayName } from './identity';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test('creates and persists an ephemeral identity', () => {
  const storage = new MemoryStorage();
  const first = getOrCreateIdentity(storage);
  const second = getOrCreateIdentity(storage);

  expect(first).toEqual(second);
  expect(first.userId).toEqual(expect.any(String));
  expect(first.displayName).toEqual(expect.any(String));
  expect(first.color).toMatch(/^#/);
});

test('renames display name without changing user id', () => {
  const storage = new MemoryStorage();
  const first = getOrCreateIdentity(storage);
  const renamed = saveDisplayName('New Name', storage);

  expect(renamed.userId).toBe(first.userId);
  expect(renamed.displayName).toBe('New Name');
});
