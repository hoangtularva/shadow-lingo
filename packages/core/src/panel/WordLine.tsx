import { canUse } from '../features';
import {
  WARNING_PRIORITY,
  type AnnotatedWord,
  type PronunciationWarning,
  type WarningId,
} from '../ipa';
import { PARTS_OF_SPEECH, type PartOfSpeech } from '../pos';
import { vi } from './strings';

/** Static class names so Tailwind keeps them. */
const POS_TEXT: Record<PartOfSpeech, string> = {
  noun: 'text-pos-noun',
  verb: 'text-pos-verb',
  adjective: 'text-pos-adjective',
  adverb: 'text-pos-adverb',
  pronoun: 'text-pos-pronoun',
};
const POS_DOT: Record<PartOfSpeech, string> = {
  noun: 'bg-pos-noun',
  verb: 'bg-pos-verb',
  adjective: 'bg-pos-adjective',
  adverb: 'bg-pos-adverb',
  pronoun: 'bg-pos-pronoun',
};

/** Sounds worth a "/θ/ hay sai" tag under the word (finals and /iː ɪ/ are too common). */
const TAGGED: ReadonlySet<WarningId> = new Set([
  'th-voiceless',
  'th-voiced',
  'ae',
  'sh',
  'zh',
  'ch',
  'dj',
]);

type Tag = { text: string; warn: boolean };

/** One short tag per word; each hard sound is tagged only on its first word. */
function wordTags(words: readonly AnnotatedWord[], warnings: boolean): (Tag | null)[] {
  const tagged = new Set<WarningId>();
  return words.map((word) => {
    if (word.weak && canUse('weakForms')) return { text: vi.weakTag, warn: false };
    if (!warnings) return null;
    const top = word.warnings
      .filter((w) => TAGGED.has(w.id) && !tagged.has(w.id))
      .sort((a, b) => WARNING_PRIORITY[a.id] - WARNING_PRIORITY[b.id])[0];
    if (!top) return null;
    tagged.add(top.id);
    return { text: vi.hardSound(top.sound), warn: true };
  });
}

function linkTitle(word: AnnotatedWord): string | undefined {
  if (word.linkNext === 'consonant') return vi.linkConsonant;
  if (word.linkNext) return vi.linkGlide(word.linkNext);
  return undefined;
}

function Ipa({ word }: { word: AnnotatedWord }) {
  if (!word.ipa) return null;
  return (
    <span className="font-ipa text-[12px] leading-4 text-ipa" data-testid="sl-ipa">
      /
      {word.parts.map((part, k) =>
        part.kind === 'phone' && part.elided ? (
          <span key={k} className="opacity-60" title={vi.elided(part.text)} data-elided="true">
            ({part.text})
          </span>
        ) : (
          <span key={k}>{part.text}</span>
        ),
      )}
      /
    </span>
  );
}

export interface WordLineProps {
  words: readonly AnnotatedWord[];
  showIpa: boolean;
  showLinking: boolean;
  showWarnings: boolean;
  /** Word classes, one per word; colours the words when given. */
  pos?: readonly (PartOfSpeech | null)[];
}

/** The spoken sentence: large words, IPA under each, linking marks and short tags. */
export function WordLine({ words, showIpa, showLinking, showWarnings, pos }: WordLineProps) {
  const linking = showLinking && canUse('linking');
  const tags = wordTags(words, showWarnings);
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1.5" data-testid="sl-words">
      {words.map((w, i) => {
        const tag = tags[i];
        const wordPos = pos?.[i] ?? null;
        return (
          <span key={i} className="flex flex-col gap-0.5" data-weak={w.weak ? 'true' : undefined}>
            <span className="flex items-baseline">
              <span
                className={
                  'text-[16px] leading-[22px] font-semibold ' +
                  (wordPos ? POS_TEXT[wordPos] : 'text-fg')
                }
                title={wordPos ? vi.pos[wordPos] : undefined}
                data-pos={wordPos ?? undefined}
              >
                {w.before.trim()}
                {w.text}
                {w.after.trim()}
              </span>
              {linking && w.linkNext && (
                <span
                  className="ml-0.5 text-[16px] text-link"
                  title={linkTitle(w)}
                  aria-label={linkTitle(w)}
                  data-link={w.linkNext}
                >
                  ‿
                </span>
              )}
            </span>
            {showIpa && <Ipa word={w} />}
            {tag && (
              <span
                className={
                  'text-[10.5px] leading-[14px] ' + (tag.warn ? 'text-tag-warn' : 'text-muted')
                }
                data-testid="sl-tag"
              >
                {tag.text}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** The most useful pronunciation tips for one sentence, highest priority first. */
export function topWarnings(
  words: readonly AnnotatedWord[],
  max = 1,
): { warning: PronunciationWarning; word: string }[] {
  const seen = new Map<string, { warning: PronunciationWarning; word: string }>();
  for (const w of words) {
    for (const warning of w.warnings) {
      if (!seen.has(warning.id)) seen.set(warning.id, { warning, word: w.text });
    }
  }
  return [...seen.values()]
    .sort((a, b) => WARNING_PRIORITY[a.warning.id] - WARNING_PRIORITY[b.warning.id])
    .slice(0, max);
}

/** One pronunciation warning for the spoken sentence, as in the UI spec. */
export function PronunciationTip({ words }: { words: readonly AnnotatedWord[] }) {
  const [top] = topWarnings(words, 1);
  if (!top) return null;
  const { warning, word } = top;
  const sound = warning.id === 'final' ? `Âm cuối /${warning.sound}/` : `/${warning.sound}/`;
  return (
    <div
      className="flex items-start gap-2.5 rounded-[10px] bg-tip-bg px-3 py-2.5"
      data-testid="sl-tips"
      data-warn={warning.id}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        className="mt-px flex-none text-tip-icon"
        role="img"
        aria-label={vi.pronunciationWarning}
      >
        <path
          d="M9 2 L16.5 15.5 H1.5 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M9 7 V10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="9" cy="13" r="0.9" fill="currentColor" />
      </svg>
      <p className="text-[12.5px] leading-normal text-tip-fg">
        <b>{vi.tipLead(sound, word)}</b> {warning.tip}
      </p>
    </div>
  );
}

/** Colour key for the part-of-speech colours (UI spec, under the sentence list). */
export function PosLegend() {
  return (
    <div
      className="flex shrink-0 flex-wrap gap-x-3.5 gap-y-1 border-t border-line px-4 py-2 text-[11px] leading-4 text-secondary"
      aria-label={vi.posLegend}
      data-testid="sl-pos-legend"
    >
      {PARTS_OF_SPEECH.map((p) => (
        <span key={p} className="flex items-center gap-[5px]">
          <span className={'size-2 rounded-full ' + POS_DOT[p]} aria-hidden="true" />
          {vi.pos[p]}
        </span>
      ))}
    </div>
  );
}
