import { useEffect, useRef, useState } from 'react';
import { PointWordmark } from './PointWordmark';

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
}

export function LandingScreen({ onStart }: Props) {
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
      <nav className="nv-nav" aria-label="Main navigation">
        <PointWordmark
          className="nv-nav-logo"
          ariaLabel="Point — top of page"
          onHomeClick={() => {
            pageRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
        <button type="button" className="nv-nav-cta" onClick={onStart}>
          Get started
        </button>
      </nav>

      {/* ── Notebook paper (ruled + margin) ── */}
      <div className="nv-paper">
        <div className="nv-paper-margin" aria-hidden="true" />

        {/* ── Hero ── */}
        <section className="nv-hero nv-block nv-hero-wrap" aria-label="Hero">
          <p className="nv-scribble nv-scribble--hero" aria-hidden="true">
            nervous? same.
          </p>
          <HeroTitleLoop />
          <p className="nv-hero-tagline nv-hand">Your AI presentation coach</p>
          <p className="nv-hero-sub">
            Live feedback on{' '}
            <span className="nv-marker">voice, eye contact, and Q&A</span>
            {' '}— while you present.
          </p>
          <button type="button" className="nv-hero-btn" onClick={onStart}>
            Start with Point
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </section>

        {/* ── Content ── */}
        <div className="nv-content">

        <section className="nv-section nv-section--insight" aria-label="Why practice alone falls short">
          <div className="nv-block nv-block--rel">
            <p className="nv-scribble nv-scribble--side1" aria-hidden="true">
              ugh relatable
            </p>
            <div className="nv-callout nv-callout--amber">
              <span className="nv-callout-icon" aria-hidden="true">💡</span>
              <p>
                Most people practice presentations <span className="nv-hl">alone</span>. No real feedback. No pressure.{' '}
                <span className="nv-hl">No growth</span>.
              </p>
            </div>
          </div>
        </section>

        <section className="nv-section nv-section--pain" aria-label="Common struggles">
          <div className="nv-block nv-block--rel">
            <p className="nv-scribble nv-scribble--side2" aria-hidden="true">
              check these ↓
            </p>
            <h2 className="nv-h2">
              <span className="nv-h2-text">Sound familiar?</span>
            </h2>
            <ul className="nv-checklist" aria-label="Common presentation problems">
              <li className="nv-check">Slides are done — but you still feel unprepared</li>
              <li className="nv-check nv-check--annotated">
                <span className="nv-check-main">
                  Voice gets <span className="nv-hl">shaky</span> when it actually matters
                </span>
                <span className="nv-check-note nv-hand" aria-hidden="true">me every time</span>
              </li>
              <li className="nv-check">Can&apos;t hold eye contact under pressure</li>
              <li className="nv-check">
                Q&amp;A sessions feel like an <span className="nv-hl">ambush</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="nv-section nv-section--promise" aria-label="What Point does">
          <div className="nv-block nv-block--rel">
            <p className="nv-scribble nv-scribble--side3" aria-hidden="true">
              the fix →
            </p>
            <div className="nv-callout nv-callout--blue">
              <span className="nv-callout-icon" aria-hidden="true">✨</span>
              <div>
                <strong>
                  Point watches you present — <span className="nv-hl">live</span>.
                </strong>
                <p>
                  Voice, eye contact, and Q&amp;A coaching in{' '}
                  <span className="nv-hl">real time</span>.
                  Not in a report you forget to read.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="nv-section nv-section--flow" aria-label="How it works">
          <div className="nv-block nv-block--rel">
            <p className="nv-scribble nv-scribble--steps" aria-hidden="true">
              3 steps. that’s it.
            </p>
            <h2 className="nv-h2">
              <span className="nv-h2-text">How it works</span>
            </h2>
            <ol className="nv-steps" aria-label="Steps">
              <li className="nv-step">
                <span className="nv-step-num" aria-hidden="true">01</span>
                <div>
                  <div className="nv-step-title">Drop in your slides</div>
                  <div className="nv-step-desc">
                    Point reads them, preps quiz questions, <span className="nv-hl">knows your material</span>
                  </div>
                </div>
              </li>
              <li className="nv-step">
                <span className="nv-step-num" aria-hidden="true">02</span>
                <div>
                  <div className="nv-step-title">Pick a coaching style</div>
                  <div className="nv-step-desc">
                    Different energy, pace, and feedback tone for every presenter
                  </div>
                  <p className="nv-step-comment nv-hand" aria-hidden="true">
                    pick your vibe →
                  </p>
                </div>
              </li>
              <li className="nv-step">
                <span className="nv-step-num" aria-hidden="true">03</span>
                <div>
                  <div className="nv-step-title">Just present</div>
                  <div className="nv-step-desc">
                    Your coach watches live — feedback lands exactly{' '}
                    <span className="nv-hl">when you need it</span>
                  </div>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="nv-section nv-section--tracks" aria-label="What Point tracks">
          <div className="nv-block nv-block--rel">
            <p className="nv-scribble nv-scribble--tracks" aria-hidden="true">
              all scored live
            </p>
            <h2 className="nv-h2 nv-h2--scribble">
              <span className="nv-h2-text">What it tracks</span>
            </h2>
            <div className="nv-features">
              <div className="nv-feature-callout">
                <span className="nv-feature-icon" aria-hidden="true">🎤</span>
                <div>
                  <div className="nv-feature-title">Voice</div>
                  <div className="nv-feature-desc">
                    Filler words, pace, off-topic moments — flagged{' '}
                    <span className="nv-hl">as they happen</span>
                  </div>
                </div>
              </div>
              <div className="nv-feature-callout">
                <span className="nv-feature-icon" aria-hidden="true">👀</span>
                <div>
                  <div className="nv-feature-title">Body language</div>
                  <div className="nv-feature-desc">
                    Eye contact and gesture intensity scored live through your camera
                  </div>
                </div>
              </div>
              <div className="nv-feature-callout">
                <span className="nv-feature-icon" aria-hidden="true">🤖</span>
                <div>
                  <div className="nv-feature-title">Q&A readiness</div>
                  <div className="nv-feature-desc">
                    Practice the <span className="nv-hl">hard questions</span> your audience will ask — before they do
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="nv-section nv-section--cta-band" aria-label="Get started">
          <div className="nv-cta-block nv-block nv-block--rel">
            <p className="nv-scribble nv-scribble--cta" aria-hidden="true">
              do it!!
            </p>
            <div className="nv-callout nv-callout--cta">
              <div className="nv-cta-inner">
                <h2 className="nv-cta-heading">
                  Ready to stop{' '}
                  <span className="nv-marker nv-marker--strong">practicing alone?</span>
                </h2>
                <p className="nv-cta-sub">
                  Choose your coach style and start your <span className="nv-hl">first session</span>.
                </p>
                <button type="button" className="nv-cta-btn" onClick={onStart}>
                  Start with Point
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
          © 2026 Point · AI Presentation Coach
        </footer>
      </div>
    </div>
  );
}
