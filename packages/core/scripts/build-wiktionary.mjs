// Builds packages/core/data/dict/*.txt (English definitions and examples) from the
// English Wiktionary extract by Wiktextract (kaikki.org), CC BY-SA 4.0 / GFDL.
//
// Usage: node packages/core/scripts/build-wiktionary.mjs path/to/raw-wiktextract-data.jsonl.gz
// Download: https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz (about 3 GB, once).
//
// Kept: English entries whose headword is in the bundled CMU Dict (so: words learners meet
// in speech), plus multi-word verbs, phrases and idioms made of such words, and the
// lemmas that inflected forms point to. Per part of speech: up to MAX_SENSES senses,
// each with its first gloss and at most one short usage example.
//
// Output: one file per first letter ("a".."z", "_" for the rest), lines
//   headword \t sense \t sense ...
// where sense = pos | gloss | example, or pos | @lemma for "form of" senses; an optional
// first field "vi | a; b" holds Vietnamese translations from Wiktionary's tables.
import { createReadStream, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

const MAX_SENSES = 2;
const MAX_POS = 3;
const MAX_GLOSS = 160;
const MAX_EXAMPLE = 120;
const MAX_PHRASE_WORDS = 4;
/** Human Vietnamese translations kept per headword (Wiktionary translation tables). */
const MAX_VI = 4;

/** Wiktextract part-of-speech codes we keep, in display order of preference. */
const POS = new Set([
  'noun',
  'verb',
  'adj',
  'adv',
  'pron',
  'prep',
  'conj',
  'intj',
  'det',
  'article',
  'num',
  'particle',
  'contraction',
  'phrase',
  'prep_phrase',
  'proverb',
  'abbrev',
]);
/** Multi-word entries: only these (phrasal verbs, idioms, set phrases). */
const PHRASE_POS = new Set(['verb', 'phrase', 'prep_phrase', 'adv', 'adj', 'intj', 'proverb']);
/** Senses learners should not get as the first meaning. */
const SKIP_TAGS = new Set([
  'obsolete',
  'archaic',
  'rare',
  'dated',
  'historical',
  'nonstandard',
  'misspelling',
]);

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../data/dict');
const input = process.argv[2];
if (!input) throw new Error('usage: build-wiktionary.mjs raw-wiktextract-data.jsonl.gz');

// Headwords we care about: the CMU Dict words (lower case).
const cmu = new Set();
for (const line of readFileSync(join(here, '../data/cmudict.txt'), 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  cmu.add(line.slice(0, line.indexOf('\t')).toLowerCase());
}

const clean = (s) =>
  String(s)
    .replace(/[\t|\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function cut(s, max) {
  if (s.length <= max) return s;
  const at = s.lastIndexOf(' ', max - 1);
  return `${s.slice(0, at > max / 2 ? at : max - 1)}…`;
}

function wanted(word, pos) {
  if (word !== word.toLowerCase() && word.toLowerCase() !== 'i') return false; // names, acronyms
  const parts = word.split(' ');
  if (parts.length === 1) return cmu.has(word);
  if (parts.length > MAX_PHRASE_WORDS || !PHRASE_POS.has(pos)) return false;
  return parts.every((p) => cmu.has(p.replace(/^one's$/, 'one')));
}

/** headword -> Map(pos -> senses[]) */
const entries = new Map();
/** headword -> Vietnamese translations, in source order */
const vietnamese = new Map();

function addVietnamese(word, list) {
  const out = vietnamese.get(word) ?? [];
  for (const t of list ?? []) {
    if (out.length >= MAX_VI) break;
    if (t?.lang_code !== 'vi' || typeof t.word !== 'string') continue;
    const vi = clean(t.word).replace(/;/g, ',');
    if (vi && vi.length <= 40 && !out.includes(vi)) out.push(vi);
  }
  if (out.length > 0) vietnamese.set(word, out);
}
let lines = 0;
let kept = 0;

const rl = createInterface({
  input: createReadStream(input).pipe(createGunzip()),
  crlfDelay: Infinity,
});
for await (const line of rl) {
  lines += 1;
  if (lines % 1_000_000 === 0) console.error(`${lines / 1e6}M lines, ${kept} entries`);
  // Cheap pre-filter before parsing: English entries only.
  if (!/"lang_code":\s*"en"/.test(line)) continue;
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  if (e.lang_code !== 'en' || typeof e.word !== 'string' || !POS.has(e.pos)) continue;
  const word = clean(e.word);
  if (!wanted(word, e.pos)) continue;
  addVietnamese(word, e.translations);
  for (const s of e.senses ?? []) addVietnamese(word, s.translations);
  const senses = [];
  for (const s of e.senses ?? []) {
    if (senses.length >= MAX_SENSES) break;
    const tags = s.tags ?? [];
    if (tags.some((t) => SKIP_TAGS.has(t))) continue;
    const of = (s.form_of ?? s.alt_of ?? [])[0]?.word;
    if (of) {
      senses.push(`${e.pos}|@${clean(of)}`);
      continue;
    }
    const gloss = s.glosses?.[s.glosses.length - 1];
    if (!gloss) continue;
    const ex = (s.examples ?? []).find(
      (x) => x.type !== 'quotation' && typeof x.text === 'string' && x.text.length <= MAX_EXAMPLE,
    );
    senses.push(`${e.pos}|${cut(clean(gloss), MAX_GLOSS)}|${ex ? clean(ex.text) : ''}`);
  }
  if (senses.length === 0) continue;
  const byPos = entries.get(word) ?? new Map();
  if (!byPos.has(e.pos) && byPos.size >= MAX_POS) continue;
  const list = byPos.get(e.pos) ?? [];
  for (const s of senses) if (list.length < MAX_SENSES && !list.includes(s)) list.push(s);
  byPos.set(e.pos, list);
  entries.set(word, byPos);
  kept += 1;
}

const shardOf = (w) => (/^[a-z]/.test(w) ? w[0] : '_');
const shards = new Map();
for (const [word, byPos] of [...entries.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const shard = shardOf(word);
  const list = shards.get(shard) ?? [];
  const vi = vietnamese.get(word);
  const fields = [...(vi ? [`vi|${vi.join('; ')}`] : []), ...[...byPos.values()].flat()];
  list.push(`${word}\t${fields.join('\t')}`);
  shards.set(shard, list);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
let bytes = 0;
for (const [shard, list] of shards) {
  const text = list.join('\n') + '\n';
  bytes += Buffer.byteLength(text);
  writeFileSync(join(outDir, `${shard}.txt`), text);
}
writeFileSync(
  join(outDir, 'NOTICE.txt'),
  [
    'English definitions, examples and Vietnamese translations in this folder are a shortened',
    'excerpt of English Wiktionary (Wiktionary contributors, https://en.wiktionary.org), taken from',
    'the Wiktextract data at https://kaikki.org and re-formatted.',
    'License: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/',
    `Source file: ${basename(input)}, built ${new Date().toISOString().slice(0, 10)}.`,
    '',
  ].join('\n'),
);
console.log(`read ${lines} lines, wrote ${entries.size} headwords, ${(bytes / 1e6).toFixed(1)} MB`);
