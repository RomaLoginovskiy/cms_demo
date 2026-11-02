/**
 * Media ids each virtual user uploaded, oldest first. Kept per user index so a
 * user only ever edits/deletes its own items, across profile slices.
 */
const owned = new Map<number, string[]>();

export function ownedMedia(userIndex: number): readonly string[] {
  return owned.get(userIndex) ?? [];
}

export function addOwnedMedia(userIndex: number, id: string): void {
  const list = owned.get(userIndex) ?? [];
  list.push(id);
  owned.set(userIndex, list);
}

export function removeOwnedMedia(userIndex: number, id: string): void {
  const list = owned.get(userIndex);
  if (!list) return;
  owned.set(
    userIndex,
    list.filter(existing => existing !== id)
  );
}

export function resetOwnedMedia(): void {
  owned.clear();
}
