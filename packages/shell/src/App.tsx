import {
  CaptionCollector,
  type AdsAdapter,
  type PosAdapter,
  type StorageAdapter,
  type TranslationCache,
  type VocabStore,
  type TranslationAdapter,
} from '@shadow-lingo/core';
import {
  createPanelStore,
  isThemeMode,
  Panel,
  resolveTheme,
  syncPreferences,
  ThemeMenu,
  vi,
  type PanelStore,
  type ThemeMode,
} from '@shadow-lingo/core/panel';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { getBridge } from './bridge';
import { createEmbedPlayer, YOUTUBE_ORIGIN, type EmbedPlayer } from './embed-player';
import {
  embedUrl,
  startFromInput,
  videoFromSharedText,
  videoIdFromInput,
  watchUrl,
} from './youtube';
import { createAppDictionary, createAppPronunciation } from './adapters';
import { createOfflineTranslator } from './translate/adapter';
import { createMediaRecorder } from './recorder';
import { isRecent, rememberVideo, RECENT_KEY, type RecentVideo } from './recent';
import { t } from './strings';
import { createAppOcr, createTesseract, type Recognize } from './ocr';

/** One translation worker for the whole app; the model loads when first needed. */
let sharedTranslator: TranslationAdapter | null = null;
function appTranslator(): TranslationAdapter {
  sharedTranslator ??= createOfflineTranslator({
    base: document.baseURI,
    createWorker: () =>
      new Worker(new URL('./translate/worker.ts', import.meta.url), { type: 'module' }),
  });
  return sharedTranslator;
}

/** Ads in the embed, as the main process reads them (read only). */
function createBridgeAds(): AdsAdapter | null {
  const bridge = getBridge();
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

let tesseract: Recognize | null = null;
/** One OCR engine for the whole app, loaded the first time a video is read. */
function appTesseract(): Recognize {
  tesseract ??= createTesseract(document.baseURI);
  return tesseract;
}

export interface AppServices {
  storage: StorageAdapter;
  vocab: VocabStore;
  translationCache: TranslationCache;
  pos: PosAdapter | null;
}

const THEME_KEY = 'shadowlingo:themeMode';

function savedThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return isThemeMode(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** The system theme, unless the learner picked light or dark (kept on this device). */
function useTheme() {
  const query = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [systemDark, setSystemDark] = useState(query.matches);
  const [mode, setModeState] = useState<ThemeMode>(savedThemeMode);
  useEffect(() => {
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
  }, [query]);
  const setMode = (next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Not critical: the choice just will not be remembered.
    }
  };
  const dark = resolveTheme(mode, systemDark ? 'dark' : 'light') === 'dark';
  return { dark, mode, setMode };
}

function useMedia(query: string): boolean {
  const mq = useMemo(() => window.matchMedia(query), [query]);
  const [match, setMatch] = useState(mq.matches);
  useEffect(() => {
    const on = (e: MediaQueryListEvent) => setMatch(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [mq]);
  return match;
}

/** Layouts of the UI spec: phone < 768 px (small < 360), tablet 768-1023, wide >= 1024. */
function useLayout() {
  const phone = useMedia('(max-width: 767px)');
  const small = useMedia('(max-width: 359px)');
  const wide = useMedia('(min-width: 1024px)');
  return { phone, small, wide };
}

function BackIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function Wordmark({ size }: { size: number }) {
  return (
    <span className="font-bold tracking-[-0.3px] whitespace-nowrap" style={{ fontSize: size }}>
      Shadow<span className="text-accent">Lingo</span>
    </span>
  );
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
  const { dark, mode: themeMode, setMode: setThemeMode } = useTheme();
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

  useEffect(() => {
    getBridge()?.setDark?.(dark);
  }, [dark]);

  // Links shared from other apps (Android: Share in the YouTube app).
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(
    () =>
      getBridge()?.onShared?.((text) => {
        const shared = videoFromSharedText(text);
        if (shared) openRef.current(shared.id, shared.start);
      }),
    [],
  );

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

  const { phone, small, wide } = useLayout();
  const [badgeTarget, setBadgeTarget] = useState<HTMLElement | null>(null);
  const theme = (
    <ThemeMenu
      mode={themeMode}
      onChange={setThemeMode}
      autoLabel={vi.themeFollowSystem}
      variant={phone ? 'touch' : 'bar'}
      placement={phone && video ? 'sheet' : 'below'}
    />
  );
  const field = (
    <label
      className={
        'flex items-center gap-2.5 rounded-xl border px-3.5 text-subtle ' +
        (phone ? 'h-12 ' : 'h-10 max-w-[640px] flex-1 ') +
        (invalid ? 'border-danger' : 'border-chip-off') +
        (phone ? ' bg-bg' : dark ? ' bg-[#0f1115]' : ' bg-white')
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
        placeholder={phone ? t.pastePlaceholderShort : t.pastePlaceholder}
        aria-label={t.pasteLabel}
        aria-invalid={invalid}
        className={
          'min-w-0 flex-1 border-none bg-transparent text-fg outline-none placeholder:text-subtle ' +
          (phone ? 'text-[15px]' : 'text-[14px]')
        }
        data-testid="desk-url"
      />
    </label>
  );
  const openButton = (
    <button
      type="submit"
      className={
        'rounded-xl bg-accent font-semibold whitespace-nowrap text-[#15171c] hover:brightness-105 ' +
        (phone ? 'h-12 text-[15px]' : 'h-10 px-[18px] text-[14px]')
      }
      data-testid="desk-open"
    >
      {t.open}
    </button>
  );
  const invalidNote = invalid && (
    <p
      className={phone ? 'text-xs text-danger' : 'bg-bg pb-2 text-center text-xs text-danger'}
      role="alert"
      data-testid="desk-invalid"
    >
      {t.invalidLink}
    </p>
  );

  return (
    <div
      className={
        'sl-root flex h-dvh flex-col overflow-hidden font-sans text-fg ' +
        (dark ? 'dark ' : '') +
        (phone && video ? 'bg-bg' : dark ? 'bg-[#0f1115]' : 'bg-[#f9f9f9]')
      }
    >
      {phone ? (
        <header
          className={
            'flex h-14 shrink-0 items-center gap-2 border-b border-line bg-bg ' +
            (video ? 'px-1' : 'pr-1 pl-4')
          }
        >
          {video && (
            <button
              type="button"
              onClick={() => setVideo(null)}
              className="flex size-11 items-center justify-center rounded-xl text-secondary hover:bg-surface hover:text-fg"
              aria-label={t.home}
              title={t.home}
              data-testid="desk-home"
            >
              <BackIcon />
            </button>
          )}
          <Logo />
          {!(video && small) && <Wordmark size={video ? 16 : 17} />}
          <div className="ml-auto flex min-w-0 items-center" ref={setBadgeTarget} />
          {theme}
        </header>
      ) : (
        <>
          <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-bg px-5">
            <button
              type="button"
              onClick={() => setVideo(null)}
              className="flex items-center gap-2.5 rounded-lg"
              aria-label={t.home}
              data-testid="desk-home"
            >
              <Logo />
              <Wordmark size={17} />
            </button>
            <form className="flex flex-1 justify-center gap-2" onSubmit={submit}>
              {field}
              {openButton}
            </form>
            <div className={'flex justify-end ' + (wide ? 'w-[120px]' : '')}>{theme}</div>
          </header>
          {invalidNote}
        </>
      )}

      {video ? (
        <VideoView
          key={`${video.id}:${video.start}`}
          video={video}
          dark={dark}
          services={services}
          layout={wide ? 'wide' : phone ? (small ? 'small' : 'phone') : 'tablet'}
          badgeTarget={phone ? badgeTarget : null}
          onInfo={(info) => updateRecent({ id: video.id, ...info })}
          onOpenVideo={(id, ms) => open(id, Math.floor(ms / 1000))}
          learned={recent.find((r) => r.id === video.id)?.learned ?? 0}
        />
      ) : phone ? (
        <PhoneHome
          recent={recent}
          onOpen={(id) => open(id)}
          onSubmit={submit}
          field={field}
          openButton={openButton}
          invalidNote={invalidNote}
          canShare={getBridge()?.sharesFromApps === true}
        />
      ) : (
        <Home recent={recent} onOpen={(id) => open(id)} />
      )}
    </div>
  );
}

function RecentList({ recent, onOpen }: { recent: RecentVideo[]; onOpen(id: string): void }) {
  return (
    <section className="flex w-full flex-col gap-2" aria-label={t.recent}>
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
  );
}

interface PhoneHomeProps {
  recent: RecentVideo[];
  onOpen(id: string): void;
  onSubmit(e: FormEvent): void;
  field: ReactNode;
  openButton: ReactNode;
  invalidNote: ReactNode;
  /** The platform receives links from the share sheet (Android). */
  canShare: boolean;
}

/** Phone home (UI spec: MobileEmptyDark/Light). */
function PhoneHome({
  recent,
  onOpen,
  onSubmit,
  field,
  openButton,
  invalidNote,
  canShare,
}: PhoneHomeProps) {
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pt-7 pb-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-[20px] font-bold text-fg">{t.homeTitle}</h1>
        <p className="text-[14px] leading-normal text-secondary">{t.homeHint}</p>
      </div>
      <form className="flex flex-col gap-2.5" onSubmit={onSubmit}>
        {field}
        {invalidNote}
        {openButton}
        {canShare && (
          <p className="text-[13px] leading-normal text-secondary" data-testid="desk-share-hint">
            {t.shareHintBefore}
            <b>{t.shareHintShare}</b>
            {t.shareHintMiddle}
            <b>ShadowLingo</b>
            {t.shareHintAfter}
          </p>
        )}
      </form>
      {recent.length > 0 && <RecentList recent={recent} onOpen={onOpen} />}
      <p className="mt-auto text-center text-xs text-subtle">{t.localOnly}</p>
    </main>
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
        <div className="w-[560px] max-w-full">
          <RecentList recent={recent} onOpen={onOpen} />
        </div>
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
  /** A saved word from another video: open that video at the sentence. */
  onOpenVideo(videoId: string, startMs: number): void;
  learned: number;
  layout: 'wide' | 'tablet' | 'phone' | 'small';
  /** Phone top bar spot for the panel's source badge. */
  badgeTarget: HTMLElement | null;
}

function VideoView({
  video,
  dark,
  services,
  onInfo,
  onOpenVideo,
  learned,
  layout,
  badgeTarget,
}: VideoViewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [player, setPlayer] = useState<EmbedPlayer | null>(null);
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState('');
  // One store per video: a theme change only recolours the panel, it keeps the captions.
  const [store] = useState<PanelStore>(() => createPanelStore({ theme: dark ? 'dark' : 'light' }));
  useEffect(() => {
    store.getState().setTheme(dark ? 'dark' : 'light');
  }, [store, dark]);
  const pronunciation = useMemo(() => createAppPronunciation(), []);
  const dictionary = useMemo(() => createAppDictionary(), []);
  const recorder = useMemo(() => createMediaRecorder(), []);
  const ads = useMemo(() => createBridgeAds(), []);
  // "Đọc chữ trên hình", where the platform can hand over the player's picture (desktop).
  const ocr = useMemo(() => {
    const bridge = getBridge();
    if (!bridge?.captureFrame) return null;
    return createAppOcr({
      doc: document,
      capture: (rect, maxWidth) => bridge.captureFrame?.(rect, maxWidth) ?? Promise.resolve(null),
      recognize: appTesseract(),
    });
  }, []);
  const src = useMemo(() => embedUrl(video.id, location.origin, video.start), [video]);
  // Latest callbacks for the effects below, without re-running them.
  const infoRef = useRef(onInfo);
  const learnedRef = useRef(learned);
  useEffect(() => {
    infoRef.current = onInfo;
    learnedRef.current = learned;
  });

  useEffect(() => syncPreferences(store, services.storage), [store, services.storage]);

  // The window title names the video (taskbar, window switcher).
  useEffect(() => {
    document.title = title ? `${title} – ShadowLingo` : 'ShadowLingo';
    return () => {
      document.title = 'ShadowLingo';
    };
  }, [title]);

  // Captions the embedded player loads (the main process filters and forwards them).
  useEffect(() => {
    const collector = new CaptionCollector();
    collector.setVideo(video.id);
    store.getState().setVideo(video.id);
    return getBridge()?.onCaption((c) => {
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
    ocr?.setPlayer(frame);
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

  // iOS: the platform shows the embed itself over this slot and relays its messages.
  const native = getBridge()?.nativePlayer;
  const slotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const slot = slotRef.current;
    if (!native || !slot) return;
    const rectOf = () => {
      const r = slot.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    };
    native.show(video.id, video.start, rectOf());
    const listeners = new Set<(e: MessageEvent) => void>();
    const stopMessages = native.onMessage((data) => {
      const e = { origin: YOUTUBE_ORIGIN, data } as MessageEvent;
      for (const l of listeners) l(e);
    });
    const p = createEmbedPlayer(() => ({ postMessage: (m: string) => native.post(m) }), {
      addEventListener: (_type, l) => listeners.add(l),
      removeEventListener: (_type, l) => listeners.delete(l),
    });
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
    setPlayer(p);
    const follow = () => native.move(rectOf());
    const resize = new ResizeObserver(follow);
    resize.observe(slot);
    window.addEventListener('resize', follow);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', follow);
      stopMessages();
      p.dispose();
      native.hide();
    };
  }, [native, video.id, video.start]);

  const onPhone = layout === 'phone' || layout === 'small';
  const frame = native ? (
    <div ref={slotRef} className="size-full bg-black" data-testid="desk-embed-slot" />
  ) : (
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
  );
  const watchLink = (
    <a
      href={watchUrl(video.id)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex shrink-0 items-center gap-1 text-link no-underline hover:underline"
      data-testid="desk-watch"
    >
      {t.openOnYouTube} <ExternalIcon />
    </a>
  );
  const panel = (
    <Panel
      store={store}
      player={player}
      pronunciation={pronunciation}
      pos={services.pos}
      recorder={recorder}
      translation={appTranslator()}
      translationCache={services.translationCache}
      dictionary={dictionary}
      vocab={services.vocab}
      getVideoTitle={() => player?.getTitle() || title}
      ads={ads}
      ocr={ocr}
      ocrStorage={services.storage}
      windowControls={false}
      translatorUnsupportedNote={t.noMachineTranslation}
      openVideo={onOpenVideo}
      header={!onPhone}
      badgeTarget={onPhone ? badgeTarget : null}
      frameless={onPhone}
    />
  );

  if (onPhone) {
    // UI spec: MobileDark/Light, PhoneSmallDark/Light. YouTube's embeds need >= 200 px height.
    return (
      <main className="flex min-h-0 flex-1 flex-col">
        <section
          className="aspect-video min-h-[200px] w-full shrink-0 bg-black"
          aria-label={t.videoLabel}
        >
          {frame}
        </section>
        {layout === 'phone' && (
          <div className="flex shrink-0 flex-col gap-1 border-b border-line px-4 py-2.5">
            <h1 className="truncate text-[14px] font-semibold text-fg">{title || t.videoLabel}</h1>
            <div className="flex min-w-0 items-center gap-3 text-xs text-secondary">
              {channel && <span className="truncate">{channel}</span>}
              {watchLink}
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1" data-testid="desk-panel">
          {panel}
        </div>
      </main>
    );
  }

  const tablet = layout === 'tablet';
  return (
    <main className={'flex min-h-0 flex-1 px-6 py-5 ' + (tablet ? 'flex-col gap-4' : 'gap-6')}>
      <section
        className={'flex min-w-0 flex-col gap-3 ' + (tablet ? 'shrink-0' : 'flex-1')}
        aria-label={t.videoLabel}
      >
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">{frame}</div>
        {title && <h1 className="text-[18px] font-semibold text-fg">{title}</h1>}
        <div className="flex items-center gap-3 text-[13px] text-secondary">
          {channel && <span>{channel}</span>}
          {watchLink}
        </div>
      </section>
      <div
        className={tablet ? 'min-h-0 w-full flex-1' : 'w-[472px] flex-none'}
        data-testid="desk-panel"
      >
        {panel}
      </div>
    </main>
  );
}
