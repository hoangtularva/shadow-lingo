import { describe, expect, it } from 'vitest';
import flags from '../src/features/flags.json';
import { canUse, getFlags, resetFlags, setFlags, type Feature } from '../src/features';

describe('canUse', () => {
  it('enables every bundled feature for now', () => {
    for (const key of Object.keys(flags) as Feature[]) expect(canUse(key)).toBe(true);
  });

  it('respects overrides and ignores unknown keys', () => {
    setFlags({ clickToSeek: false, ...({ notAFeature: true } as object) });
    expect(canUse('clickToSeek')).toBe(false);
    expect(Object.keys(getFlags())).not.toContain('notAFeature');
    resetFlags();
    expect(canUse('clickToSeek')).toBe(true);
  });
});
