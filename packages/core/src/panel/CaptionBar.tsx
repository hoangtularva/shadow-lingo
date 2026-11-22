import { useMemo } from 'react';
import { useStore } from 'zustand';
import { canUse } from '../features';
import { annotateSentence } from '../ipa';
import { isEnglish } from '../tracks';
import type { PanelStore } from './store';
import { WordLine } from './WordLine';

export interface CaptionBarProps {
  store: PanelStore;
}

/**
 * Compact bar for theater mode: only the spoken sentence, with IPA and linking.
 * It reads the same store as the panel and never takes pointer input.
 */
export function CaptionBar({ store }: CaptionBarProps) {
  const track = useStore(store, (s) => s.track);
  const activeIndex = useStore(store, (s) => s.activeIndex);
  const pronunciations = useStore(store, (s) => s.pronunciations);
  const showIpa = useStore(store, (s) => s.showIpa);
  const showLinking = useStore(store, (s) => s.showLinking);
  const theme = useStore(store, (s) => s.theme);
  const showPos = useStore(store, (s) => s.showPos);
  const posTags = useStore(store, (s) => s.posTags);

  const sentence = track?.timed ? track.sentences[activeIndex] : undefined;
  const english = !track || track.source !== 'player' || isEnglish(track.lang);
  const annotate = english && canUse('ipa');

  const words = useMemo(
    () => (sentence && annotate ? annotateSentence(sentence.text, (k) => pronunciations[k]) : null),
    [sentence, annotate, pronunciations],
  );

  if (!sentence) return null;

  return (
    <div
      className={'sl-root font-sans text-fg ' + (theme === 'dark' ? 'dark' : '')}
      data-theme={theme}
      data-testid="sl-caption-bar"
      style={{ pointerEvents: 'none' }}
    >
      <div className="rounded-2xl border border-accent bg-bg px-4 py-3 opacity-95 shadow-panel">
        {words ? (
          <WordLine
            words={words}
            showIpa={showIpa}
            showLinking={showLinking}
            showWarnings={false}
            pos={showPos && canUse('posColors') ? posTags[sentence.text] : undefined}
          />
        ) : (
          <span className="text-[22px] leading-[30px] font-semibold">{sentence.text}</span>
        )}
      </div>
    </div>
  );
}
