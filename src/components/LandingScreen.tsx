import { useEffect, useRef, useState } from 'react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useT } from '../hooks/useT';

const HERO_TITLE = 'Point';

/** 타이핑 → RTL 선택(파란 선택 블록) → 한 번에 지움 → 반복 */
function HeroTitleLoop() {
  const [count, setCount]         = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [selectPct, setSelectPct] = useState(0);
  const [wiping, setWiping]       = useState(false);
  const [showCaret, setShowCaret] = useState(true);
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reducedMotion) {
      setCount(HERO_TITLE.length);
      setShowCaret(false);
      return;
    }
    let alive = true;

    const sleep = (ms: number) =>
      new Promise<void>(resolve => { window.setTimeout(resolve, ms); });

    const animateSelectRtl = () =>
      new Promise<void>(resolve => {
        const dur = 580;
        const t0  = performance.now();
        let raf = 0;
        const step = (now: number) => {
          if (!alive) {
            cancelAnimationFrame(raf);
            resolve();
            return;
          }
          const t = Math.min(1, (now - t0) / dur);
          setSelectPct(t);
          if (t < 1) raf = requestAnimationFrame(step);
          else resolve();
        };
        raf = requestAnimationFrame(step);
      });

    (async () => {
      while (alive) {
        setSelecting(false);
        setSelectPct(0);
        setWiping(false);
        setShowCaret(true);
        for (let c = 0; c <= HERO_TITLE.length && alive; c++) {
          setCount(c);
          await sleep(
            c === 0 ? 780 : c <= HERO_TITLE.length ? 135 + (c === 3 ? 55 : 0) : 0,
          );
          if (!alive) break;
        }
        /* 다 친 뒤 캐럿 잠깐 유지 후 사라짐 */
        if (alive) await sleep(520);
        if (alive) setShowCaret(false);
        await sleep(720);
        if (!alive) break;
        setSelecting(true);
        setSelectPct(0);
        await animateSelectRtl();
        if (!alive) break;
        setSelecting(false);
        setSelectPct(0);
        setWiping(true);
        await sleep(220);
        if (!alive) break;
        setWiping(false);
        setCount(0);
        await sleep(780);
      }
    })();

    return () => { alive = false; };
  }, [reducedMotion]);

  const nSel = selecting && selectPct > 0
    ? Math.ceil(selectPct * HERO_TITLE.length)
    : 0;

  /** 타이핑 중엔 이미 친 글자만 두어 캐럿이 글자 끝에 붙음(미입력 글자는 레이아웃에 포함 안 함) */
  const typingPhase = !selecting && !wiping;

  return (
    <h1 className="nv-hero-title" aria-label={HERO_TITLE}>
      <span className="nv-hero-title-track">
        {/* 전체 단어 폭 고정(글자 span 구조 동일) → 타이핑·선택 전환 시에도 폭 일치 */}
        <span className="nv-hero-title-sizer" aria-hidden="true">
          {HERO_TITLE.split('').map((ch, i) => (
            <span key={i} className="nv-hero-letter nv-hero-letter--on">{ch}</span>
          ))}
        </span>
        <span className="nv-hero-title-anim">
          {typingPhase ? (
            <>
              {HERO_TITLE.slice(0, count).split('').map((ch, i) => (
                <span
                  key={i}
                  className="nv-hero-letter nv-hero-letter--on"
                  aria-hidden="true"
                >
                  {ch}
                </span>
              ))}
              {showCaret && count <= HERO_TITLE.length && (
                <span className="nv-hero-title-caret" aria-hidden="true" />
              )}
            </>
          ) : (
            HERO_TITLE.split('').map((ch, i) => {
              const inSel = selecting
                && i < count
                && nSel > 0
                && i >= HERO_TITLE.length - nSel;
              return (
                <span
                  key={i}
                  className={[
                    'nv-hero-letter',
                    i < count ? 'nv-hero-letter--on' : '',
                    inSel ? 'nv-hero-letter--selected' : '',
                    wiping && i < count ? 'nv-hero-letter--wipe' : '',
                  ].filter(Boolean).join(' ')}
                  aria-hidden="true"
                >
                  {ch}
                </span>
              );
            })
          )}
        </span>
      </span>
    </h1>
  );
}

interface Props {
  onStart: () => void;
  userName?: string;
  userAvatar?: string;
  userId?: string;
  isAuthLoading?: boolean;
  onSignOut?: () => void;
  onShowDashboard?: () => void;
  onShowPricing?: () => void;
}

export function LandingScreen({ onStart, userName, userAvatar, userId, isAuthLoading, onSignOut, onShowDashboard, onShowPricing }: Props) {
  const t = useT();
  const pageRef = useRef<HTMLDivElement>(null);

  /* 스크롤 진입 시 .nv-block → .nv-visible */
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const blocks = page.querySelectorAll<HTMLElement>('.nv-block');
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) e.target.classList.add('nv-visible');
        });
      },
      { threshold: 0.06 },
    );
    blocks.forEach(b => obs.observe(b));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="nv-page" ref={pageRef}>

      {/* ── Nav ── */}
      <nav className="nv-nav" aria-label={t('nav.mainNavigation')}>
        <button
          type="button"
          className="nv-nav-mark"
          onClick={() => {
            pageRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          aria-label={t('nav.pointHome')}
        >
          <img
            className="nv-nav-mark-img"
            src={`${import.meta.env.BASE_URL}favicon.svg`}
            alt=""
            width={32}
            height={32}
            decoding="async"
          />
        </button>
        <div className="nv-nav-links">
          <LanguageSwitcher className="lang-switcher--nv" />
          {onShowPricing && (
            <button type="button" className="nv-nav-link" onClick={onShowPricing}>
              {t('nav.pricing')}
            </button>
          )}
          {userId && onShowDashboard && (
            <button type="button" className="nv-nav-link" onClick={onShowDashboard}>
              {t('nav.myProgress')}
            </button>
          )}
          <div className="nv-nav-auth">
            {!isAuthLoading && (
              onSignOut ? (
                <>
                  {userAvatar && (
                    <img
                      className="nv-nav-avatar"
                      src={userAvatar}
                      alt={userName ?? ''}
                      referrerPolicy="no-referrer"
                    />
                  )}
                  {userName && <span className="nv-nav-username">{userName}</span>}
                  <button type="button" className="nv-nav-signout" onClick={onSignOut}>
                    {t('nav.signOut')}
                  </button>
                </>
              ) : (
                <button type="button" className="nv-nav-cta" onClick={onStart}>
                  {t('nav.getStarted')}
                </button>
              )
            )}
          </div>
        </div>
      </nav>

      {/* ── Notebook paper (ruled + margin) ── */}
      <div className="nv-paper">
        <div className="nv-paper-margin" aria-hidden="true" />

        {/* ── Hero ── */}
        <section className="nv-hero nv-block nv-hero-wrap" aria-label={t('landing.heroAria')}>
          <p className="nv-scribble nv-scribble--hero" aria-hidden="true">
            {t('landing.scribbleHero')}
          </p>
          <HeroTitleLoop />
          <p className="nv-hero-tagline nv-hand">{t('landing.heroTagline')}</p>
          <p className="nv-hero-sub">{t('landing.heroSub')}</p>
          <button type="button" className="nv-hero-btn" onClick={onStart}>
            {t('landing.heroBtn')}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </section>

        {/* ── Content ── */}
        <div className="nv-content">
        <section className="nv-section nv-section--insight" aria-label={t('landing.sectionInsightAria')}>
          <div className="nv-block nv-block--rel">
            <p className="nv-scribble nv-scribble--side1" aria-hidden="true">
              {t('landing.scribbleInsight')}
            </p>
            <div className="nv-callout nv-callout--amber">
              <span className="nv-callout-icon" aria-hidden="true">💡</span>
              <p>{t('landing.insightCallout')}</p>
            </div>
          </div>
        </section>

        <section className="nv-section nv-section--pain" aria-label={t('landing.sectionPainAria')}>
          <div className="nv-block nv-block--rel">
            <p className="nv-scribble nv-scribble--side2" aria-hidden="true">
              {t('landing.scribblePain')}
            </p>
            <h2 className="nv-h2">
              <span className="nv-h2-text">{t('landing.h2SoundFamiliar')}</span>
            </h2>
            <ul className="nv-checklist" aria-label={t('landing.checklistPainAria')}>
              <li className="nv-check">{t('landing.check1')}</li>
              <li className="nv-check nv-check--annotated">
                <span className="nv-check-main">{t('landing.check2Main')}</span>
                <span className="nv-check-note nv-hand" aria-hidden="true">
                  {t('landing.check2Note')}
                </span>
              </li>
              <li className="nv-check">{t('landing.check3')}</li>
              <li className="nv-check">{t('landing.check4')}</li>
            </ul>
          </div>
        </section>

        <section className="nv-section nv-section--promise" aria-label={t('landing.sectionPromiseAria')}>
          <div className="nv-block nv-block--rel">
            <p className="nv-scribble nv-scribble--side3" aria-hidden="true">
              {t('landing.scribbleFix')}
            </p>
            <div className="nv-callout nv-callout--blue">
              <span className="nv-callout-icon" aria-hidden="true">✨</span>
              <div>
                <strong>{t('landing.promiseLead')}</strong>
                <p>{t('landing.promiseBody')}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="nv-section nv-section--flow" aria-label={t('landing.sectionFlowAria')}>
          <div className="nv-block nv-block--rel">
            <p className="nv-scribble nv-scribble--steps" aria-hidden="true">
              {t('landing.scribbleSteps')}
            </p>
            <h2 className="nv-h2">
              <span className="nv-h2-text">{t('landing.h2HowItWorks')}</span>
            </h2>
            <ol className="nv-steps" aria-label={t('landing.stepsAria')}>
              <li className="nv-step">
                <span className="nv-step-num" aria-hidden="true">01</span>
                <div>
                  <div className="nv-step-title">{t('landing.step01Title')}</div>
                  <div className="nv-step-desc">{t('landing.step01Desc')}</div>
                </div>
              </li>
              <li className="nv-step">
                <span className="nv-step-num" aria-hidden="true">02</span>
                <div>
                  <div className="nv-step-title">{t('landing.step02Title')}</div>
                  <div className="nv-step-desc">{t('landing.step02Desc')}</div>
                  <p className="nv-step-comment nv-hand" aria-hidden="true">
                    {t('landing.step02Scribble')}
                  </p>
                </div>
              </li>
              <li className="nv-step">
                <span className="nv-step-num" aria-hidden="true">03</span>
                <div>
                  <div className="nv-step-title">{t('landing.step03Title')}</div>
                  <div className="nv-step-desc">{t('landing.step03Desc')}</div>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="nv-section nv-section--tracks" aria-label={t('landing.sectionTracksAria')}>
          <div className="nv-block nv-block--rel">
            <p className="nv-scribble nv-scribble--tracks" aria-hidden="true">
              {t('landing.scribbleTracks')}
            </p>
            <h2 className="nv-h2 nv-h2--scribble">
              <span className="nv-h2-text">{t('landing.h2Tracks')}</span>
            </h2>
            <div className="nv-features">
              <div className="nv-feature-callout">
                <span className="nv-feature-icon" aria-hidden="true">🎤</span>
                <div>
                  <div className="nv-feature-title">{t('landing.featVoiceTitle')}</div>
                  <div className="nv-feature-desc">{t('landing.featVoiceDesc')}</div>
                </div>
              </div>
              <div className="nv-feature-callout">
                <span className="nv-feature-icon" aria-hidden="true">👀</span>
                <div>
                  <div className="nv-feature-title">{t('landing.featBodyTitle')}</div>
                  <div className="nv-feature-desc">{t('landing.featBodyDesc')}</div>
                </div>
              </div>
              <div className="nv-feature-callout">
                <span className="nv-feature-icon" aria-hidden="true">🤖</span>
                <div>
                  <div className="nv-feature-title">{t('landing.featQaTitle')}</div>
                  <div className="nv-feature-desc">{t('landing.featQaDesc')}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="nv-section nv-section--cta-band" aria-label={t('landing.sectionCtaAria')}>
          <div className="nv-cta-block nv-block nv-block--rel">
            <p className="nv-scribble nv-scribble--cta" aria-hidden="true">
              {t('landing.scribbleCta')}
            </p>
            <div className="nv-callout nv-callout--cta">
              <div className="nv-cta-inner">
                <h2 className="nv-cta-heading">
                  <span className="nv-marker nv-marker--strong">{t('landing.ctaHeading')}</span>
                </h2>
                <p className="nv-cta-sub">{t('landing.ctaSub')}</p>
                <button type="button" className="nv-cta-btn" onClick={onStart}>
                  {t('landing.ctaBtn')}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        </div>

        <footer className="nv-footer nv-footer--paper">
          {t('landing.footer')}
        </footer>
      </div>
    </div>
  );
}
