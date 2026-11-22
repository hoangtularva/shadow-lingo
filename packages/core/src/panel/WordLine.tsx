import { canUse } from '../features';
import {
  WARNING_PRIORITY,
  type AnnotatedWord,
  type IpaPart,
  type PronunciationWarning,
} from '../ipa';
import { vi } from './strings';

export interface WordLineProps {
  words: readonly AnnotatedWord[];
  showWarnings: boolean;
}

function warningAt(word: AnnotatedWord, index: number): PronunciationWarning | undefined {
  return word.warnings.find((w) => w.indices.includes(index));
}

function IpaParts({ word, showWarnings }: { word: AnnotatedWord; showWarnings: boolean }) {
  return (
    <>
      {word.parts.map((part: IpaPart, k) => {
        if (part.kind === 'stress') return <span key={k}>{part.text}</span>;
        if (part.elided) {
          const sound = part.text;
          return (
            <span key={k} className="opacity-50" title={vi.elided(sound)} data-elided="true">
              ({sound})
            </span>
          );
        }
        const warn = showWarnings ? warningAt(word, part.index) : undefined;
        return warn ? (
          <span key={k} className="sl-warn" title={warn.title} data-warn={warn.id}>
            {part.text}
          </span>
        ) : (
          <span key={k}>{part.text}</span>
        );
      })}
    </>
  );
}

function linkTitle(word: AnnotatedWord): string | undefined {
  if (word.linkNext === 'consonant') return vi.linkConsonant;
  if (word.linkNext) return vi.linkGlide(word.linkNext);
  return undefined;
}

/** Words of a sentence with IPA under each one, linking marks and warnings. */
export function WordLine({ words, showWarnings }: WordLineProps) {
  const linking = canUse('linking');
  const weakForms = canUse('weakForms');
  return (
    <span className="flex flex-wrap items-start gap-x-1.5 gap-y-1" data-testid="sl-words">
      {words.map((w, i) => (
        <span key={i} className="inline-flex flex-col">
          <span className="text-base leading-snug">
            {w.before.trim()}
            {w.text}
            {w.after.trim()}
          </span>
          <span
            className={
              'font-ipa text-[13px] leading-[18px] ' +
              (w.weak && weakForms ? 'text-weak italic' : 'text-muted')
            }
            title={w.weak && weakForms ? vi.weakForm : undefined}
            data-testid="sl-ipa"
            data-weak={w.weak && weakForms ? 'true' : undefined}
          >
            {w.ipa ? <IpaParts word={w} showWarnings={showWarnings} /> : ' '}
            {linking && w.linkNext && (
              <span className="text-accent not-italic" title={linkTitle(w)} data-link={w.linkNext}>
                {w.linkNext === 'consonant' ? '‿' : `‿${w.linkNext}`}
              </span>
            )}
          </span>
        </span>
      ))}
    </span>
  );
}

const MAX_TIPS = 3;

/** The few most useful pronunciation tips for one sentence (Vietnamese). */
export function topWarnings(
  words: readonly AnnotatedWord[],
  max = MAX_TIPS,
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

export function PronunciationTips({ words }: { words: readonly AnnotatedWord[] }) {
  const tips = topWarnings(words);
  if (tips.length === 0) return null;
  return (
    <div
      className="mx-3 mt-2 mb-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-xs"
      data-testid="sl-tips"
    >
      <p className="mb-1.5 font-semibold text-fg">{vi.tipsTitle}</p>
      <ul className="space-y-1.5 text-muted">
        {tips.map(({ warning, word }) => (
          <li key={warning.id} data-warn={warning.id}>
            <span className="font-semibold text-fg">{warning.title}</span>
            {' · '}
            <span className="italic">{word}</span>: {warning.tip}
          </li>
        ))}
      </ul>
    </div>
  );
}
