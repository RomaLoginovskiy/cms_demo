/** UUID v4 — works in older headless Chromium (no crypto.randomUUID). */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const n = (Math.random() * 16) | 0;
    const v = char === 'x' ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}
