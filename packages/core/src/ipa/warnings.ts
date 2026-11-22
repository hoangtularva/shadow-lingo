import { basePhone, isVowelPhone, phoneToIpa, stressOf, type Phone } from './arpabet';

/** Sounds Vietnamese learners commonly get wrong. */
export type WarningId =
  'th-voiceless' | 'th-voiced' | 'final' | 'ae' | 'sh' | 'zh' | 'ch' | 'dj' | 'i-long' | 'i-short';

export interface PronunciationWarning {
  id: WarningId;
  /** IPA of the sound, e.g. "θ" or "kst" for a final cluster. */
  sound: string;
  /** Phone indices in the word to highlight. */
  indices: number[];
  /** Short Vietnamese title, e.g. "Âm /θ/ (think)". */
  title: string;
  /** Vietnamese tongue / lip placement tip. */
  tip: string;
}

/** Lower comes first when a sentence lists its warnings. */
export const WARNING_PRIORITY: Record<WarningId, number> = {
  'th-voiceless': 0,
  'th-voiced': 1,
  final: 2,
  ae: 3,
  sh: 4,
  zh: 5,
  ch: 6,
  dj: 7,
  'i-long': 8,
  'i-short': 9,
};

type SoundInfo = { id: WarningId; title: string; tip: string };

const SOUNDS: Partial<Record<string, SoundInfo>> = {
  TH: {
    id: 'th-voiceless',
    title: 'Âm /θ/ (think)',
    tip: 'Đặt đầu lưỡi nhẹ giữa hai hàm răng rồi thổi hơi ra, cổ họng không rung. Đừng đọc thành “t” hay “th” tiếng Việt.',
  },
  DH: {
    id: 'th-voiced',
    title: 'Âm /ð/ (this)',
    tip: 'Đầu lưỡi đặt giữa hai hàm răng như /θ/ nhưng rung cổ họng. Đừng đọc thành “d” hay “đ”.',
  },
  AE: {
    id: 'ae',
    title: 'Âm /æ/ (cat)',
    tip: 'Mở miệng rộng, hạ hàm dưới, kéo môi sang hai bên: âm nằm giữa “e” và “a”. Khác /e/: bad ≠ bed.',
  },
  SH: {
    id: 'sh',
    title: 'Âm /ʃ/ (she)',
    tip: 'Tròn môi và đưa ra trước, lưỡi lùi về sau chân răng trên, thổi hơi mạnh. Khác “s”: she ≠ see.',
  },
  ZH: {
    id: 'zh',
    title: 'Âm /ʒ/ (measure)',
    tip: 'Khẩu hình giống /ʃ/ nhưng rung cổ họng. Đừng đọc thành “d” hay “gi”.',
  },
  CH: {
    id: 'ch',
    title: 'Âm /tʃ/ (church)',
    tip: 'Áp đầu lưỡi sau chân răng trên, tròn môi rồi bật hơi mạnh. Bật hơi rõ hơn “ch” tiếng Việt.',
  },
  JH: {
    id: 'dj',
    title: 'Âm /dʒ/ (job)',
    tip: 'Giống /tʃ/ nhưng rung cổ họng. Đừng đọc thành “d” hay “gi” tiếng Việt.',
  },
  IY: {
    id: 'i-long',
    title: 'Âm /iː/ (sheep)',
    tip: 'Âm dài, căng môi như đang cười. Khác /ɪ/ ngắn: sheep ≠ ship.',
  },
  IH: {
    id: 'i-short',
    title: 'Âm /ɪ/ (ship)',
    tip: 'Âm ngắn, lưỡi thả lỏng, miệng hơi mở hơn “i”, gần giữa “i” và “ê”. Đừng kéo dài thành /iː/.',
  },
};

/** Final consonants Vietnamese has (m, n, ng) or that are rarely dropped are not flagged. */
const SAFE_FINALS = new Set(['M', 'N', 'NG', 'R', 'W', 'Y', 'HH']);
const STOPS = new Set(['P', 'T', 'K']);
const VOICED_STOPS = new Set(['B', 'D', 'G']);

function finalTip(cluster: readonly Phone[]): string {
  const ipa = cluster.map(phoneToIpa).join('');
  if (cluster.length > 1) {
    return `Cụm phụ âm cuối /${ipa}/: đọc đủ từng âm, không bỏ âm nào. Nối sang từ sau nếu từ sau bắt đầu bằng nguyên âm.`;
  }
  const b = basePhone(cluster[0] as Phone);
  if (b === 'S' || b === 'Z') {
    return `Đọc rõ âm cuối /${ipa}/ (xì hơi nhẹ). Đây thường là đuôi số nhiều hoặc động từ ngôi thứ ba, bỏ đi là sai nghĩa.`;
  }
  if (STOPS.has(b)) {
    return `Đừng nuốt âm cuối /${ipa}/: chặn hơi đúng vị trí rồi thả nhẹ, nhất là khi từ sau bắt đầu bằng nguyên âm.`;
  }
  if (VOICED_STOPS.has(b)) {
    return `Âm cuối /${ipa}/ là âm hữu thanh: giữ rung cổ họng, nguyên âm đứng trước đọc dài hơn một chút.`;
  }
  if (b === 'L') {
    return 'Âm cuối /l/: cong đầu lưỡi chạm lợi trên. Đừng bỏ qua hay đọc thành “u”.';
  }
  return `Đọc rõ âm cuối /${ipa}/, đừng bỏ mất.`;
}

export interface WarningOptions {
  /** The last phone is elided in connected speech: no final-consonant warning. */
  elidedLast?: boolean;
  /** Weak form of a function word: only /θ ð/ are worth flagging. */
  weak?: boolean;
}

/** Warnings for one word's phones, in phone order (duplicates per sound merged). */
export function warningsFor(
  phones: readonly Phone[],
  options: WarningOptions = {},
): PronunciationWarning[] {
  const byId = new Map<WarningId, PronunciationWarning>();
  phones.forEach((p, i) => {
    const info = SOUNDS[basePhone(p)];
    if (!info) return;
    if (options.weak && info.id !== 'th-voiced' && info.id !== 'th-voiceless') return;
    // /iː/ vs /ɪ/ matters in stressed syllables; unstressed ones (happy, -ing) are reduced.
    if ((info.id === 'i-long' || info.id === 'i-short') && stressOf(p) === 0) return;
    const existing = byId.get(info.id);
    if (existing) existing.indices.push(i);
    else byId.set(info.id, { ...info, sound: phoneToIpa(p), indices: [i] });
  });

  if (!options.weak) {
    const end = phones.length - (options.elidedLast ? 1 : 0);
    let start = end;
    while (start > 0 && !isVowelPhone(phones[start - 1] as Phone)) start--;
    const cluster = phones.slice(start, end);
    // A lone safe final (m, n, ng, r) is fine; clusters and other finals are not.
    const flag =
      cluster.length > 1 ||
      (cluster.length === 1 && !SAFE_FINALS.has(basePhone(cluster[0] as Phone)));
    if (flag && start > 0) {
      const ipa = cluster.map(phoneToIpa).join('');
      byId.set('final', {
        id: 'final',
        sound: ipa,
        indices: cluster.map((_, k) => start + k),
        title: `Âm cuối /${ipa}/`,
        tip: finalTip(cluster),
      });
    }
  }
  return [...byId.values()];
}
