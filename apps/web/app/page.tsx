import {
  DISCLAIMER,
  FAQ,
  FEATURES,
  HERO,
  PLATFORMS,
  PRIVACY,
  REASONS,
  RELEASES,
  REPO,
} from './content';

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
            <a href="#tinh-nang">Tính năng</a>
            <a href="#tai-ve">Tải về</a>
            <a href="#rieng-tu">Riêng tư</a>
            <a href="#cau-hoi">Câu hỏi</a>
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
              Tải về miễn phí
            </a>
            <a className="btn btn-line" href={REPO}>
              Xem trên GitHub
            </a>
          </div>
          <p className="small sub">{HERO.platforms}</p>
          <Clip src={HERO.media.src} alt={HERO.media.alt} eager />
        </section>

        <section className="wrap reasons" aria-label="Vì sao chọn ShadowLingo">
          {REASONS.map((r) => (
            <div className="card" key={r.title}>
              <h3>
                <span aria-hidden="true">{r.icon}</span> {r.title}
              </h3>
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
            <h2 className="center">Dùng ở đâu cũng được</h2>
            <p className="muted center">
              Cùng một khung luyện tập, trên trình duyệt, máy tính và điện thoại.
            </p>
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
              Tất cả ở <a href={RELEASES}>trang Releases trên GitHub</a>, kèm hướng dẫn cài.
            </p>
          </div>
        </section>

        <section className="wrap split" id="rieng-tu">
          <div>
            <h2>Miễn phí và riêng tư</h2>
            <p className="muted">Không quảng cáo, không tài khoản, không máy chủ.</p>
          </div>
          <ul className="muted">
            {PRIVACY.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section className="wrap faq" id="cau-hoi">
          <h2>Câu hỏi thường gặp</h2>
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
