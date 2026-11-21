import bundledFlags from './flags.json';

/** Every gated feature. Add a key to flags.json to add a feature. */
export type Feature = keyof typeof bundledFlags;

export type FeatureFlags = Record<Feature, boolean>;

let flags: FeatureFlags = { ...bundledFlags };

/**
 * Single gate for every feature. Today every flag in the bundled config is on; a future
 * Pro tier would change only the config, not the call sites.
 */
export function canUse(feature: Feature): boolean {
  return flags[feature] === true;
}

export function getFlags(): Readonly<FeatureFlags> {
  return flags;
}

/** Overrides flags (tests, or a future bundled Pro config). Unknown keys are ignored. */
export function setFlags(overrides: Partial<FeatureFlags>): void {
  const next = { ...flags };
  for (const key of Object.keys(next) as Feature[]) {
    const value = overrides[key];
    if (typeof value === 'boolean') next[key] = value;
  }
  flags = next;
}

export function resetFlags(): void {
  flags = { ...bundledFlags };
}
