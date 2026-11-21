// Fails if any installed production dependency uses a license that is not
// compatible with shipping inside a GPL-3.0 extension.
import { execSync } from 'node:child_process';

const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Apache-2.0',
  'OFL-1.1',
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'Unlicense',
  'BlueOak-1.0.0',
  'Python-2.0',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'LGPL-3.0',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
]);

/** An SPDX expression passes if every OR-branch has at least one allowed license. */
function isAllowed(expr) {
  const cleaned = expr.replace(/[()]/g, '').trim();
  return cleaned
    .split(/\s+OR\s+/i)
    .some((branch) => branch.split(/\s+AND\s+/i).every((id) => ALLOWED.has(id.trim())));
}

const raw = execSync('pnpm licenses list --prod --json', { encoding: 'utf8' });
const byLicense = JSON.parse(raw);
const bad = [];
for (const [license, pkgs] of Object.entries(byLicense)) {
  if (!isAllowed(license)) {
    for (const p of pkgs) bad.push(`${p.name}@${p.versions?.join(',') ?? '?'} (${license})`);
  }
}

if (bad.length) {
  console.error('Disallowed licenses found:\n  ' + bad.join('\n  '));
  process.exit(1);
}
console.log(`License check passed (${Object.keys(byLicense).length} license types).`);
