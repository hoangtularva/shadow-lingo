// Source package for addons.mozilla.org review: the whole repository as committed (git archive
// of HEAD), so reviewers can run `pnpm install` and the build from the monorepo root. Only
// tracked files go in: nothing local, generated or ignored. Commit before running it.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
const out = join(app, '.output', `shadowlingo-${version}-sources.zip`);
mkdirSync(dirname(out), { recursive: true });

const git = (...args) => execFileSync('git', args, { cwd: app, encoding: 'utf8' }).trim();
if (git('status', '--porcelain', '--untracked-files=no') !== '') {
  console.warn('warning: uncommitted changes are not in the sources zip (it packs HEAD)');
}
execFileSync('git', ['archive', '--format=zip', `--prefix=shadow-lingo/`, '-o', out, 'HEAD'], {
  cwd: join(app, '../..'),
});
console.log(
  `${out} (${Math.round(statSync(out).size / 1024)} KB, ${git('rev-parse', '--short', 'HEAD')})`,
);
