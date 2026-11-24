import { describe, expect, it } from 'vitest';
import { DISCLAIMER, FAQ, FEATURES, HERO, PLATFORMS, RELEASES } from '../app/content';

describe('landing page content', () => {
  it('links only to the project on GitHub', () => {
    for (const p of PLATFORMS) {
      if (p.href) expect(p.href).toBe(RELEASES);
    }
    expect(RELEASES).toMatch(/^https:\/\/github\.com\/hoangtularva\/shadow-lingo\//);
  });

  it('every demo clip has a description, and the page says it is independent', () => {
    for (const f of [...FEATURES, HERO.media]) expect(f.alt.length).toBeGreaterThan(20);
    expect(DISCLAIMER).toContain('không liên kết với YouTube');
    expect(FAQ.length).toBeGreaterThan(0);
  });
});
