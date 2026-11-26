import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DISCLAIMER,
  DONATE,
  DONATE_QR,
  FAQ,
  FEATURES,
  HERO,
  PLATFORMS,
  RELEASES,
} from '../app/content';

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

describe('donation section', () => {
  it('names a QR file that ships with the page, or stays hidden', () => {
    if (DONATE_QR === null) return;
    expect(DONATE_QR.file).toMatch(/^[a-z0-9-]+\.(png|jpg|webp)$/);
    expect(
      existsSync(join(dirname(fileURLToPath(import.meta.url)), '../public', DONATE_QR.file)),
    ).toBe(true);
    expect(DONATE_QR.bank.length).toBeGreaterThan(0);
    if (DONATE_QR.holder !== undefined) expect(DONATE_QR.holder.length).toBeGreaterThan(0);
  });

  it('promises the gift is voluntary', () => {
    expect(DONATE.points.join(' ')).toContain('tự nguyện');
  });
});
