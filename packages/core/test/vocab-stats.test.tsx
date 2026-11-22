import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Notebook } from '../src/panel/Notebook';
import { Panel } from '../src/panel/Panel';
import { createPanelStore } from '../src/panel/store';
import { vi } from '../src/panel/strings';
import {
  createMemoryVocabStore,
  dayKey,
  entriesToRestore,
  parseBackup,
  scheduleAnswer,
  streakOf,
  vocabToBackup,
  weekCount,
  type VocabEntry,
} from '../src/vocab';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 23, 9).getTime();
const day = (back: number) => dayKey(NOW - back * DAY);

function word(id: string, vi: string): VocabEntry {
  return { id, headword: id, vi, senses: [{ pos: 'noun', gloss: `${id}.` }], addedAt: NOW - DAY };
}
const WORDS = [word('a', 'một'), word('b', 'hai'), word('c', 'ba'), word('d', 'bốn')];

describe('review stats', () => {
  it('counts the streak up to today, or yesterday before today’s first answer', () => {
    expect(streakOf({ [day(0)]: 3, [day(1)]: 1, [day(2)]: 2, [day(4)]: 1 }, NOW)).toBe(3);
    expect(streakOf({ [day(1)]: 1, [day(2)]: 2 }, NOW)).toBe(2);
    expect(streakOf({ [day(2)]: 2 }, NOW)).toBe(0);
    expect(streakOf({}, NOW)).toBe(0);
  });

  it('sums the last seven days', () => {
    expect(weekCount({ [day(0)]: 3, [day(6)]: 2, [day(7)]: 50 }, NOW)).toBe(5);
  });
});

describe('backup', () => {
  it('round-trips, skips bad words and rejects other files', () => {
    const reviewed = scheduleAnswer(WORDS[0] as VocabEntry, true, NOW).entry;
    const text = vocabToBackup([reviewed, WORDS[1] as VocabEntry], { [day(0)]: 1 }, NOW);
    const data = parseBackup(text);
    expect(data?.entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(data?.reviewLog).toEqual({ [day(0)]: 1 });
    const broken = JSON.parse(text) as { entries: unknown[] };
    broken.entries.push({ id: 'x' });
    expect(parseBackup(JSON.stringify(broken))?.entries).toHaveLength(2);
    expect(parseBackup('{"app":"other"}')).toBeNull();
    expect(parseBackup('not json')).toBeNull();
  });

  it('restores new words and better-reviewed ones only', () => {
    const reviewed = scheduleAnswer(WORDS[0] as VocabEntry, true, NOW).entry;
    const current = [WORDS[0] as VocabEntry, WORDS[1] as VocabEntry];
    expect(
      entriesToRestore(current, [reviewed, WORDS[1] as VocabEntry, WORDS[2] as VocabEntry]).map(
        (e) => e.id,
      ),
    ).toEqual(['a', 'c']);
  });
});

describe('notebook stats', () => {
  it('shows the streak in the banner and weekly answers in the footer', () => {
    render(
      <Notebook
        entries={WORDS}
        videoId={null}
        onRemove={() => undefined}
        onJump={() => false}
        onStartReview={() => undefined}
        reviewLog={{ [day(0)]: 4, [day(1)]: 2 }}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('sl-review-banner').textContent).toContain(vi.vocabStreak(2));
    expect(screen.getByTestId('sl-vocab-count').textContent).toBe(
      `${vi.vocabCountKnown(4, 0)} · ${vi.vocabWeek(6)}`,
    );
  });
});

const flush = async () => {
  for (let i = 0; i < 5; i++) await act(() => new Promise((r) => setTimeout(r, 0)));
};

describe('export menu', () => {
  it('closes on a click elsewhere and on Esc', () => {
    render(
      <Notebook entries={WORDS} videoId={null} onRemove={() => undefined} onJump={() => false} />,
    );
    fireEvent.click(screen.getByTestId('sl-vocab-export'));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.pointerDown(screen.getByTestId('sl-vocab-search'));
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByTestId('sl-vocab-export'));
    fireEvent.keyDown(screen.getByTestId('sl-vocab-export'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('restore in the panel', () => {
  async function openNotebook(vocab = createMemoryVocabStore([WORDS[0] as VocabEntry])) {
    const store = createPanelStore({ theme: 'dark' });
    render(<Panel store={store} player={null} vocab={vocab} />);
    await flush();
    act(() => store.getState().setTab('vocab'));
    await flush();
    return vocab;
  }

  function pick(text: string) {
    const input = screen.getByTestId('sl-vocab-restore-file');
    fireEvent.change(input, {
      target: { files: [new File([text], 'backup.json', { type: 'application/json' })] },
    });
  }

  it('merges a backup file and says how many words came back', async () => {
    const vocab = await openNotebook();
    pick(vocabToBackup(WORDS, {}, NOW));
    await waitFor(() =>
      expect(screen.getByTestId('sl-vocab-flash').textContent).toBe(vi.restoreDone(3)),
    );
    expect((await vocab.list()).map((e) => e.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(screen.getByTestId('sl-tab-vocab').textContent).toBe(vi.tabVocab(4));
  });

  it('refuses a file that is not a backup', async () => {
    await openNotebook();
    pick('{"hello":1}');
    await waitFor(() =>
      expect(screen.getByTestId('sl-vocab-flash').textContent).toBe(vi.restoreBad),
    );
  });
});
