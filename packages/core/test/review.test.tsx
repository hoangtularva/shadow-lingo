import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi as vitestVi } from 'vitest';
import type { PlayerAdapter } from '../src/adapters';
import { setFlags } from '../src/features';
import { Notebook } from '../src/panel/Notebook';
import { Panel } from '../src/panel/Panel';
import { Review } from '../src/panel/Review';
import { createPanelStore } from '../src/panel/store';
import { vi } from '../src/panel/strings';
import {
  canQuiz,
  createMemoryVocabStore,
  formatInterval,
  isVocabEntry,
  makeQuiz,
  reviewQueue,
  scheduleAnswer,
  statusOf,
  type VocabEntry,
} from '../src/vocab';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 22, 12);

function word(id: string, vi: string, addedAt = NOW - DAY): VocabEntry {
  return {
    id,
    headword: id,
    vi,
    pos: 'verb',
    senses: [{ pos: 'verb', gloss: `Gloss of ${id}.` }],
    context: { text: `We ${id} today.`, words: [1], start: 1000, videoId: 'abc', title: 'Video' },
    addedAt,
  };
}

const WORDS = [
  word('give', 'cho', NOW - 4 * DAY),
  word('take', 'lấy', NOW - 3 * DAY),
  word('make', 'làm', NOW - 2 * DAY),
  word('find', 'tìm', NOW - DAY),
];

/** Deterministic "random": always the first index (no shuffling). */
const fixed = () => 0;

describe('review scheduling', () => {
  it('right answers push the word further, wrong ones bring it back soon', () => {
    const first = scheduleAnswer(WORDS[0] as VocabEntry, true, NOW);
    expect(isVocabEntry(first.entry)).toBe(true);
    expect(first.nextInMs).toBeGreaterThan(0);
    const later = scheduleAnswer(first.entry, true, first.entry.review?.due ?? NOW);
    expect(later.nextInMs).toBeGreaterThan(first.nextInMs);
    const wrong = scheduleAnswer(later.entry, false, later.entry.review?.due ?? NOW);
    expect(wrong.nextInMs).toBeLessThan(later.nextInMs);
    expect(wrong.entry.review?.lapses).toBe(1);
  });

  it('names statuses and builds the queue: overdue first, then new', () => {
    const seen = scheduleAnswer(WORDS[1] as VocabEntry, true, NOW - 10 * DAY).entry;
    const known: VocabEntry = {
      ...(WORDS[2] as VocabEntry),
      review: {
        due: NOW + 30 * DAY,
        stability: 40,
        difficulty: 5,
        elapsedDays: 30,
        scheduledDays: 30,
        reps: 5,
        lapses: 0,
        state: 2,
      },
    };
    const list = [WORDS[0] as VocabEntry, seen, known, WORDS[3] as VocabEntry];
    expect(list.map((e) => statusOf(e, NOW))).toEqual(['new', 'due', 'known', 'new']);
    expect(reviewQueue(list, NOW).map((e) => e.id)).toEqual(['take', 'give', 'find']);
  });

  it('makes four distinct choices with the right one among them', () => {
    const quiz = makeQuiz(WORDS[0] as VocabEntry, WORDS, fixed);
    expect(quiz?.choices).toHaveLength(4);
    expect(new Set(quiz?.choices).size).toBe(4);
    expect(quiz?.choices[quiz.answer]).toBe('cho');
    expect(canQuiz(WORDS.slice(0, 3))).toBe(false);
    expect(makeQuiz(WORDS[0] as VocabEntry, WORDS.slice(0, 3))).toBeNull();
  });

  it('formats intervals in Vietnamese', () => {
    expect(formatInterval(30_000)).toBe('1 phút');
    expect(formatInterval(10 * 60_000)).toBe('10 phút');
    expect(formatInterval(3 * 3_600_000)).toBe('3 giờ');
    expect(formatInterval(2 * DAY)).toBe('2 ngày');
    expect(formatInterval(95 * DAY)).toBe('3 tháng');
  });
});

describe('review session', () => {
  function setup(queue = WORDS.slice(0, 2)) {
    const onAnswer = vitestVi.fn(() => 2 * DAY);
    const onExit = vitestVi.fn();
    render(
      <Review
        queue={queue}
        pool={WORDS}
        onAnswer={onAnswer}
        onExit={onExit}
        onProgress={() => undefined}
        random={fixed}
      />,
    );
    return { onAnswer, onExit };
  }

  const choices = () => screen.getAllByTestId('sl-review-choice');
  const answerIndex = (meaning: string) =>
    choices().findIndex((c) => c.textContent?.slice(1) === meaning);

  it('right answer: green, details, next with Space', () => {
    const { onAnswer } = setup();
    expect(screen.getByText(vi.reviewQuestion('give'))).toBeTruthy();
    fireEvent.click(choices()[answerIndex('cho')] as HTMLElement);
    expect(onAnswer).toHaveBeenCalledWith(WORDS[0], true);
    expect(choices()[answerIndex('cho')]?.dataset.state).toBe('ok');
    expect(screen.getByTestId('sl-review-result').textContent).toBe(vi.reviewRight('2 ngày'));
    expect(screen.getByTestId('sl-review-details').textContent).toContain('Gloss of give.');
    fireEvent.keyDown(screen.getByTestId('sl-review'), { key: ' ' });
    expect(screen.getByText(vi.reviewQuestion('take'))).toBeTruthy();
    expect(screen.getByTestId('sl-review-count').textContent).toBe('1/2');
  });

  it('wrong answer by key: red, the word comes back once at the end', () => {
    const { onAnswer } = setup(WORDS.slice(0, 1));
    const wrongKey = String(choices().findIndex((c) => c.textContent?.slice(1) !== 'cho') + 1);
    fireEvent.keyDown(screen.getByTestId('sl-review'), { key: wrongKey });
    expect(onAnswer).toHaveBeenCalledWith(WORDS[0], false);
    expect(choices().some((c) => c.dataset.state === 'no')).toBe(true);
    expect(choices()[answerIndex('cho')]?.dataset.state).toBe('ok');
    expect(screen.getByTestId('sl-review-count').textContent).toBe('0/2');
    fireEvent.click(screen.getByTestId('sl-review-next'));
    expect(screen.getByText(vi.reviewQuestion('give'))).toBeTruthy();
    fireEvent.click(choices()[answerIndex('cho')] as HTMLElement);
    fireEvent.click(screen.getByTestId('sl-review-next'));
    expect(screen.getByTestId('sl-review-done').textContent).toBe(vi.reviewDone(1, 2));
  });

  it('Esc leaves the session', () => {
    const { onExit } = setup();
    fireEvent.keyDown(screen.getByTestId('sl-review'), { key: 'Escape' });
    expect(onExit).toHaveBeenCalled();
  });
});

describe('notebook review entry points', () => {
  it('shows the banner and status filters, or asks for more words', () => {
    const { unmount } = render(
      <Notebook
        entries={WORDS}
        videoId="abc"
        onRemove={() => undefined}
        onJump={() => false}
        onStartReview={() => undefined}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('sl-review-banner').textContent).toContain(vi.vocabDue(4));
    expect(screen.getByTestId('sl-vocab-due').textContent).toBe(`${vi.vocabStatus.due} 4`);
    expect(screen.getAllByTestId('sl-vocab-status')[0]?.textContent).toBe(vi.vocabStatus.new);
    unmount();
    render(
      <Notebook
        entries={WORDS.slice(0, 2)}
        videoId="abc"
        onRemove={() => undefined}
        onJump={() => false}
        onStartReview={() => undefined}
        now={NOW}
      />,
    );
    expect(screen.queryByTestId('sl-review-banner')).toBeNull();
    expect(screen.getByTestId('sl-review-need-more').textContent).toBe(vi.vocabNeedMore(2));
  });
});

function fakePlayer(): PlayerAdapter {
  return {
    getCurrentTime: () => 0,
    seekTo: vitestVi.fn(),
    play: vitestVi.fn(),
    pause: vitestVi.fn(),
    isPaused: () => true,
    getPlaybackRate: () => 1,
    setPlaybackRate: () => undefined,
    onTimeUpdate: () => () => undefined,
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await act(() => new Promise((r) => setTimeout(r, 0)));
};

describe('review in the panel', () => {
  it('saves each answer and Space does not reach the player', async () => {
    const vocab = createMemoryVocabStore(WORDS);
    const store = createPanelStore({ theme: 'dark' });
    store.getState().setVideo('abc');
    const player = fakePlayer();
    render(<Panel store={store} player={player} vocab={vocab} />);
    await flush();
    act(() => store.getState().setTab('vocab'));
    await flush();
    fireEvent.click(screen.getByTestId('sl-review-start'));
    expect(screen.getByTestId('sl-source').textContent).toBe(vi.reviewBadge(0, 4));
    fireEvent.click(screen.getAllByTestId('sl-review-choice')[0] as HTMLElement);
    fireEvent.keyDown(screen.getByTestId('sl-review'), { key: ' ' });
    expect(player.play).not.toHaveBeenCalled();
    await flush();
    const saved = await vocab.list();
    expect(saved.filter((e) => e.review)).toHaveLength(1);
    fireEvent.click(screen.getByTestId('sl-review-exit'));
    expect(screen.getByTestId('sl-notebook')).toBeTruthy();
  });

  it('respects the review flag', async () => {
    setFlags({ vocabReview: false });
    const store = createPanelStore({ theme: 'dark' });
    render(<Panel store={store} player={null} vocab={createMemoryVocabStore(WORDS)} />);
    await flush();
    act(() => store.getState().setTab('vocab'));
    await flush();
    expect(screen.queryByTestId('sl-review-banner')).toBeNull();
    expect(screen.queryByTestId('sl-vocab-due')).toBeNull();
  });
});
