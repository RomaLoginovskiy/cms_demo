import { LoadConfig } from './types';
import { mergeConfig } from './scenarios';
import { normalizeUsers } from './usersConfig';
import { validateConfig } from './validate';

/** Merge partial config and apply the same user normalization as the live engine. */
export function previewMergedConfig(
  base: LoadConfig,
  partial: Partial<LoadConfig>
): LoadConfig {
  const preview = mergeConfig(base, partial);
  if (partial.users) {
    normalizeUsers(preview.users);
  }
  return preview;
}

export function validateMergedConfig(
  base: LoadConfig,
  partial: Partial<LoadConfig>
): { preview: LoadConfig; errors: string[] } {
  const preview = previewMergedConfig(base, partial);
  return { preview, errors: validateConfig(preview) };
}
