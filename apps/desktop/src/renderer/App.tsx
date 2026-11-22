import {
  CaptionCollector,
  type AdsAdapter,
  type PosAdapter,
  type StorageAdapter,
  type TranslationCache,
  type VocabStore,
} from '@shadow-lingo/core';
import {
  createPanelStore,
  Panel,
  syncPreferences,
  type PanelStore,
} from '@shadow-lingo/core/panel';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createEmbedPlayer, type EmbedPlayer } from '../shared/embed-player';
import type { DesktopBridge } from '../shared/ipc';
import { embedUrl, startFromInput, videoIdFromInput, watchUrl } from '../shared/youtube';
import {
  createAppDictionary,
  createAppPronunciation,
  noTranslator,
} from './adapters';
import { createMediaRecorder } from './recorder';
import { isRecent, rememberVideo, RECENT_KEY, type RecentVideo } from './recent';
import { t } from './strings';

const bridge = (window as unknown as { shadowLingo?: DesktopBridge }).shadowLingo;

/** Ads in the embed, as the main process reads them (read only). */
function createBridgeAds(): AdsAdapter | null {
  if (!bridge) return null;
  let showing = false;
  const listeners = new Set<(s: boolean) => void>();
  bridge.onAd((s) => {
    showing = s;
    for (const l of listeners) l(s);
  });
  return {
    isShowing: () => showing,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export interface AppServices {
  storage: StorageAdapter;
  vocab: VocabStore;
  translationCache: TranslationCache;
  pos: PosAdapter | null;
}

function useDarkMode(): boolean {
  const query = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [dark, setDark] = useState(query.matches);
  useEffect(() => {
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
  }, [query]);
  return dark;
}

function LinkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

function Logo() {
  return (
    <svg width="24" height="24" viewBox="0 0 120 120" aria-hidden="true">
      <path
        d="M34 22 H86 A16 16 0 0 1 102 38 V62 A16 16 0 0 1 86 78 H52 L36 92 V78 H34 A16 16 0 0 1 18 62 V38 A16 16 0 0 1 34 22 Z"
        transform="translate(8 8)"
        className="fill-chip-off"
      />
      <path
        d="M34 22 H86 A16 16 0 0 1 102 38 V62 A16 16 0 0 1 86 78 H52 L36 92 V78 H34 A16 16 0 0 1 18 62 V38 A16 16 0 0 1 34 22 Z"
        fill="#F5B544"
      />
      <path
        d="M44 48 Q60 62 76 48"
        fill="none"
        stroke="#15171C"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface OpenVideo {
  id: string;
  start: number;
}

export function App({ services }: { services: AppServices }) {
  const dark = useDarkMode();
  const [input, setInput] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [video, setVideo] = useState<OpenVideo | null>(null);
  const [recent, setRecent] = useState<RecentVideo[]>([]);

  useEffect(() => {
    void services.storage.get<unknown>(RECENT_KEY).then((raw) => {
      setRecent(Array.isArray(raw) ? raw.filter(isRecent) : []);
    });
  }, [services.storage]);

  const open = (id: string, start = 0) => {
    setInvalid(false);
    setVideo({ id, start });
    setRecent((list) => {
      const next = rememberVideo(list, { id });
      void services.storage.set(RECENT_KEY, next);
      return next;
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = videoIdFromInput(input);
    if (!id) {
      setInvalid(true);
      return;
    }
    open(id, startFromInput(input));
  };

  const updateRecent = (patch: Partial<RecentVideo> & { id: string }) =>
    setRecent((list) => {
      const next = list.map((r) => (r.id === patch.id ? { ...r, ...patch } : r));
      void services.storage.set(RECENT_KEY, next);
      return next;
    });

  return (
    <div
      className={
        'sl-root flex h-screen flex-col overflow-hidden font-sans text-fg ' +
        (dark ? 'dark bg-[#0f1115]' : 'bg-[#f9f9f9]')
      }
    >
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-bg px-5">
        <button
          type="button"
          onClick={() => setVideo(null)}
          className="flex items-center gap-2.5 rounded-lg"
          aria-label={t.home}
          data-testid="desk-home"
        >
          <Logo />
          <span className="text-[17px] font-bold tracking-[-0.3px] whitespace-nowrap">
            Shadow<span className="text-accent">Lingo</span>
          </span>
        </button>
        <form className="flex flex-1 justify-center gap-2" onSubmit={submit}>
          <label
            className={
              'flex h-10 max-w-[640px] flex-1 items-center gap-2.5 rounded-xl border px-3.5 text-subtle ' +
              (invalid ? 'border-danger' : 'border-chip-off') +
              (dark ? ' bg-[#0f1115]' : ' bg-white')
            }
          >
            <LinkIcon />
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setInvalid(false);
              }}
              placeholder={t.pastePlaceholder}
              aria-label={t.pasteLabel}
              aria-invalid={invalid}
              className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-fg outline-none placeholder:text-subtle"
              data-testid="desk-url"
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-xl bg-accent px-[18px] text-[14px] font-semibold whitespace-nowrap text-[#15171c] hover:brightness-105"
            data-testid="desk-open"
          >
            {t.open}
          </button>
        </form>
        <div className="w-[120px]" />
      </header>
      {invalid && (
        <p
          className="bg-bg pb-2 text-center text-xs text-danger"
          role="alert"
          data-testid="desk-invalid"
        >
          {t.invalidLink}
        </p>
      )}

      {video ? (
        <VideoView
          key={`${video.id}:${video.start}`}
          video={video}
          dark={dark}
          services={services}
          onInfo={(info) => updateRecent({ id: video.id, ...info })}
          learned={recent.find((r) => r.id === video.id)?.learned ?? 0}
        />
      ) : (
        <Home recent={recent} onOpen={(id) => open(id)} />
      )}
    </div>
  );
}

function Home({ recent, onOpen }: { recent: RecentVideo[]; onOpen(id: string): void }) {
  return (
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 overflow-y-auto p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-[24px] font-bold text-fg">{t.homeTitle}</h1>
        <p className="max-w-[520px] text-[14px] leading-normal text-secondary">{t.homeHint}</p>
      </div>
      {recent.length > 0 && (
        <section className="flex w-[560px] max-w-full flex-col gap-2" aria-label={t.recent}>
          <h2 className="text-xs font-semibold text-secondary">{t.recent}</h2>
          {recent.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpen(r.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-edge bg-card px-3 py-2.5 text-left hover:border-accent"
              data-testid="desk-recent"
            >
              <img
                src={`https://i.ytimg.com/vi/${encodeURIComponent(r.id)}/mqdefault.jpg`}
                alt=""
                className="h-[54px] w-24 flex-none rounded-lg bg-black object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-fg">
                  {r.title || r.id}
                </span>
                <span className="block truncate text-xs text-secondary">
                  {[r.channel, r.learned > 0 ? t.learned(r.learned) : t.justOpened]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </button>
          ))}
        </section>
      )}
      <p className="text-xs text-subtle">{t.localOnly}</p>
    </main>
  );
}

interface VideoViewProps {
  video: OpenVideo;
  dark: boolean;
  services: AppServices;
  onInfo(info: Partial<RecentVideo>): void;
  learned: number;
}

function VideoView({ video, dark, services, onInfo, learned }: VideoViewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [player, setPlayer] = useState<EmbedPlayer | null>(null);
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState('');
  const store = useMemo<PanelStore>(
    () => createPanelStore({ theme: dark ? 'dark' : 'light' }),
    [dark],
  );
  const pronunciation = useMemo(() => createAppPronunciation(), []);
  const dictionary = useMemo(() => createAppDictionary(), []);
  const recorder = useMemo(() => createMediaRecorder(), []);
  const ads = useMemo(() => createBridgeAds(), []);
  const src = useMemo(() => embedUrl(video.id, location.origin, video.start), [video]);
  // Latest callbacks for the effects below, without re-running them.
  const infoRef = useRef(onInfo);
  const learnedRef = useRef(learned);
  useEffect(() => {
    infoRef.current = onInfo;
    learnedRef.current = learned;
  });

  useEffect(() => syncPreferences(store, services.storage), [store, services.storage]);

  // Captions the embedded player loads (the main process filters and forwards them).
  useEffect(() => {
    const collector = new CaptionCollector();
    collector.setVideo(video.id);
    store.getState().setVideo(video.id);
    return bridge?.onCaption((c) => {
      const best = collector.add(c);
      if (best && best !== store.getState().track) store.getState().setTrack(best);
      store.getState().setHumanCues(collector.vietnameseCues());
    });
  }, [store, video.id]);

  // "đã học N câu": the furthest sentence reached in this video.
  useEffect(
    () =>
      store.subscribe((s) => {
        const n = s.activeIndex + 1;
        if (n > learnedRef.current) {
          learnedRef.current = n;
          infoRef.current({ learned: n });
        }
      }),
    [store],
  );

  const onLoad = () => {
    const frame = frameRef.current;
    if (!frame) return;
    const p = createEmbedPlayer(() => frame.contentWindow, window);
    p.connect();
    p.onInfo((info) => {
      if (info.title) {
        setTitle(info.title);
        infoRef.current({ title: info.title });
      }
      if (info.author) {
        setChannel(info.author);
        infoRef.current({ channel: info.author });
      }
    });
    setPlayer((old) => {
      old?.dispose();
      return p;
    });
  };
  useEffect(() => () => player?.dispose(), [player]);

  return (
    <main className="flex min-h-0 flex-1 gap-6 px-6 py-5">
      <section className="flex min-w-0 flex-1 flex-col gap-3" aria-label={t.videoLabel}>
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe
            ref={frameRef}
            src={src}
            title={title || t.videoLabel}
            className="size-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={onLoad}
            data-testid="desk-embed"
          />
        </div>
        {title && <h1 className="text-[18px] font-semibold text-fg">{title}</h1>}
        <div className="flex items-center gap-3 text-[13px] text-secondary">
          {channel && <span>{channel}</span>}
          <a
            href={watchUrl(video.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-link no-underline hover:underline"
            data-testid="desk-watch"
          >
            {t.openOnYouTube} <ExternalIcon />
          </a>
        </div>
      </section>
      <div className="w-[472px] flex-none" data-testid="desk-panel">
        <Panel
          store={store}
          player={player}
          pronunciation={pronunciation}
          pos={services.pos}
          recorder={recorder}
          translation={noTranslator}
          translationCache={services.translationCache}
          dictionary={dictionary}
          vocab={services.vocab}
          getVideoTitle={() => player?.getTitle() || title}
          ads={ads}
        />
      </div>
    </main>
  );
}
