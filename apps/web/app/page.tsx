import {
  DISCLAIMER,
  DONATE,
  DONATE_QR,
  DOWNLOAD,
  FAQ,
  FAQ_TITLE,
  FEATURES,
  HERO,
  NAV,
  PLATFORMS,
  PRIVACY,
  PRIVACY_POLICY,
  PRIVACY_TEXT,
  PRIVACY_TITLE,
  REASONS,
  RELEASES,
  REPO,
  type ReasonIcon,
} from './content';

/** Line icons in the accent colour (emoji would look different on every system). */
function Icon({ name }: { name: ReasonIcon }) {
  return (
    <svg
      className="icon"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'eye' && (
        <>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
      {name === 'target' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" />
        </>
      )}
      {name === 'heart' && (
        <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />
      )}
      {name === 'mic' && (
        <>
          <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </>
      )}
    </svg>
  );
}

/** Demo clips are 880×623; width and height keep the layout from jumping while they load. */
function Clip({ src, alt, eager = false }: { src: string; alt: string; eager?: boolean }) {
  return (
    <img
      className="shot"
      src={`/shadow-lingo/media/${src}`}
      alt={alt}
      width={880}
      height={623}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}

function Logo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <path
        d="M34 22 H86 A16 16 0 0 1 102 38 V62 A16 16 0 0 1 86 78 H52 L36 92 V78 H34 A16 16 0 0 1 18 62 V38 A16 16 0 0 1 34 22 Z"
        transform="translate(8 8)"
        className="logo-shadow"
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

export default function Home() {
  return (
    <>
      <header className="nav-bar">
        <div className="wrap nav">
          <a className="brand" href="#top" aria-label="ShadowLingo">
            <Logo size={32} />
            <span>
              Shadow<span className="accent">Lingo</span>
            </span>
          </a>
          <nav aria-label="Mục lục" className="links">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
          </nav>
          <a className="btn btn-line btn-small" href={REPO}>
            GitHub
          </a>
        </div>
      </header>

      <main id="top">
        <section className="wrap hero">
          <span className="tag">{HERO.tag}</span>
          <h1>{HERO.title}</h1>
          <p className="lead">{HERO.text}</p>
          <div className="actions">
            <a className="btn btn-main" href="#tai-ve">
              {HERO.primary}
            </a>
            <a className="btn btn-line" href={REPO}>
              {HERO.secondary}
            </a>
          </div>
          <p className="small sub">{HERO.platforms}</p>
          <Clip src={HERO.media.src} alt={HERO.media.alt} eager />
        </section>

        <section className="wrap reasons" aria-label="Vì sao chọn ShadowLingo">
          {REASONS.map((r) => (
            <div className="card" key={r.title}>
              <Icon name={r.icon} />
              <h3>{r.title}</h3>
              <p className="muted">{r.text}</p>
            </div>
          ))}
        </section>

        <section className="wrap features" id="tinh-nang" aria-label="Tính năng">
          {FEATURES.map((f, i) => (
            <div className={`feature${i % 2 ? ' flip' : ''}`} key={f.title}>
              <div className="feature-text">
                <h2>{f.title}</h2>
                <p className="muted">{f.text}</p>
              </div>
              <Clip src={f.src} alt={f.alt} />
            </div>
          ))}
        </section>

        <section className="band" id="tai-ve">
          <div className="wrap">
            <h2 className="center">{DOWNLOAD.title}</h2>
            <p className="muted center">{DOWNLOAD.text}</p>
            <div className="platforms">
              {PLATFORMS.map((p) => (
                <div className={`card${p.href ? '' : ' soon'}`} key={p.title}>
                  <h3>{p.title}</h3>
                  <p className="muted">{p.text}</p>
                  {p.href ? (
                    <a className="btn btn-main btn-small" href={p.href}>
                      {p.action}
                    </a>
                  ) : (
                    <span className="btn btn-line btn-small">{p.action}</span>
                  )}
                </div>
              ))}
            </div>
            <p className="small sub center">
              {DOWNLOAD.note} <a href={RELEASES}>{DOWNLOAD.noteLink}</a>
              {DOWNLOAD.noteEnd}
            </p>
          </div>
        </section>

        <section className="wrap split" id="rieng-tu">
          <div>
            <h2>{PRIVACY_TITLE}</h2>
            <p className="muted">{PRIVACY_TEXT}</p>
            <p>
              <a href={PRIVACY_POLICY.href}>{PRIVACY_POLICY.label}</a>
            </p>
          </div>
          <ul className="muted">
            {PRIVACY.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        {DONATE_QR && (
          <section className="band" id="ung-ho">
            <div className="wrap donate">
              <div className="donate-text">
                <Icon name="heart" />
                <h2>{DONATE.title}</h2>
                <p className="muted">{DONATE.text}</p>
                <ul className="muted">
                  {DONATE.points.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div className="card donate-card">
                {/* On a phone, open the full image to save it, then load it in the bank app. */}
                <a href={`/shadow-lingo/${DONATE_QR.file}`} title={DONATE.qrOpen}>
                  <img
                    className="qr"
                    src={`/shadow-lingo/${DONATE_QR.file}`}
                    alt={DONATE.qrAlt}
                    width="240"
                    height="240"
                  />
                </a>
                <p className="donate-bank">{DONATE_QR.bank}</p>
                {DONATE_QR.holder && <p className="sub">{DONATE_QR.holder}</p>}
                <p className="sub small">{DONATE.scanNote}</p>
              </div>
            </div>
          </section>
        )}

        <section className="wrap faq" id="cau-hoi">
          <h2>{FAQ_TITLE}</h2>
          {FAQ.map((f) => (
            <details className="card" key={f.q} open>
              <summary>{f.q}</summary>
              <p className="muted">{f.a}</p>
            </details>
          ))}
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-row sub small">
          <span>
            © 2026 ShadowLingo · <a href={`${REPO}/blob/master/LICENSE`}>GPL-3.0</a> ·{' '}
            <a href={REPO}>GitHub</a>
          </span>
          <span>{DISCLAIMER}</span>
        </div>
      </footer>
    </>
  );
}
