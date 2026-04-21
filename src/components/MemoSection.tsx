import { useCallback, useEffect, useRef, useState } from 'react';

/* ─── typing speed ─── */
const MS  = 30;
const MSS = 52;
const MSP = 170;
const MSF = 16;

type SegStyle = 'bold' | 'italic' | 'strike' | 'muted' | 'accent';
interface Seg        { text: string; style?: SegStyle; ms?: number }
interface TextBlock  { segs: Seg[]; indent?: boolean; pauseAfter?: number }
interface EmptyBlock { empty: true; pause?: number }
interface VisualBlock{ visual: 'session' | 'metrics'; pause?: number }
type Block = TextBlock | EmptyBlock | VisualBlock;

type Speaker = 'user' | 'point';
interface Turn { speaker?: Speaker; blocks: Block[]; pauseBefore?: number }

/* ─── conversation 1 — worry → Point helps ─── */
const CONVO1: Turn[] = [
  {
    speaker: 'user',
    blocks: [
      { segs: [{ text: 'big presentation next week', ms: MS }] },
      { empty: true, pause: 120 },
      { segs: [{ text: '...', ms: MSP }] },
      { empty: true, pause: 160 },
      { segs: [{ text: 'slides are done i guess', ms: MS }] },
      { segs: [{ text: '...', ms: MSP }] },
      { empty: true, pause: 240 },
      { segs: [{ text: 'but what if i freeze up there', ms: MSS }] },
      { empty: true, pause: 130 },
      { indent: true, segs: [{ text: 'voice shaking the whole time', ms: 52 }] },
      { indent: true, segs: [{ text: "can't hold eye contact", ms: MS }] },
      { indent: true, segs: [
        { text: 'Q&A is going to destroy me', ms: MS },
        { text: '...', ms: MSP },
      ]},
    ],
  },
  {
    speaker: 'point',
    blocks: [
      { segs: [{ text: "that's normal.", ms: MS }] },
      { segs: [{ text: "let's fix all three.", style: 'bold', ms: MS }] },
    ],
    pauseBefore: 700,
  },
  {
    speaker: 'user',
    blocks: [
      { empty: true, pause: 100 },
      { segs: [{ text: 'practiced alone but still not sure', ms: MS }] },
      { empty: true, pause: 190 },
      { segs: [{ text: '...', ms: MSP }] },
      { empty: true, pause: 300 },
      { segs: [{ text: 'tried Point though', style: 'bold', ms: 48 }] },
    ],
    pauseBefore: 380,
  },
  {
    speaker: 'point',
    blocks: [
      { indent: true, segs: [
        { text: 'shaky voice  ', ms: MSF },
        { text: 'terrifying', style: 'strike', ms: MSF },
        { text: '  →  caught live, fixed on the spot', style: 'accent', ms: MSF },
      ]},
      { indent: true, segs: [
        { text: 'eye contact  ', ms: MSF },
        { text: 'impossible', style: 'strike', ms: MSF },
        { text: '  →  camera feedback in real time', style: 'accent', ms: MSF },
      ]},
      { indent: true, segs: [
        { text: 'Q&A  ', ms: MSF },
        { text: 'dreading it', style: 'strike', ms: MSF },
        { text: '  →  rehearsed every hard question', style: 'accent', ms: MSF },
      ]},
      { empty: true, pause: 300 },
      { visual: 'session', pause: 1400 },
    ],
    pauseBefore: 750,
  },
  {
    speaker: 'user',
    blocks: [
      { empty: true, pause: 150 },
      { segs: [{ text: 'actually feel ready now  ✓', style: 'bold', ms: MSS }] },
    ],
    pauseBefore: 480,
  },
];

/* ─── conversation 2 — how it works ─── */
const CONVO2: Turn[] = [
  {
    speaker: 'user',
    blocks: [
      { segs: [{ text: 'how does this actually work?', ms: MS }] },
    ],
  },
  {
    speaker: 'point',
    blocks: [
      { segs: [{ text: 'step 1  —  drop in your slides', style: 'bold', ms: MS }] },
      { indent: true, segs: [{ text: 'Point reads them, preps quiz questions, knows your material', ms: MSF }] },
      { empty: true, pause: 120 },
      { segs: [{ text: 'step 2  —  pick a coaching style', style: 'bold', ms: MS }] },
      { indent: true, segs: [{ text: 'each coach has different energy, pace, and feedback tone', ms: MSF }] },
      { empty: true, pause: 120 },
      { segs: [{ text: 'step 3  —  just present', style: 'bold', ms: MS }] },
      { indent: true, segs: [{ text: 'your coach watches live  —  not in a report you never read', ms: MSF }] },
    ],
    pauseBefore: 700,
  },
];

/* ─── conversation 3 — what it tracks + CTA ─── */
const CONVO3: Turn[] = [
  {
    speaker: 'user',
    blocks: [
      { segs: [{ text: 'what does it track exactly?', ms: MS }] },
    ],
  },
  {
    speaker: 'point',
    blocks: [
      { segs: [{ text: '🎙  voice', style: 'bold', ms: MS }] },
      { indent: true, segs: [{ text: 'filler words, pace, off-topic moments  —  flagged as they happen', ms: MSF }] },
      { empty: true, pause: 90 },
      { segs: [{ text: '👁  body language', style: 'bold', ms: MS }] },
      { indent: true, segs: [{ text: 'eye contact and gesture intensity scored live through your camera', ms: MSF }] },
      { empty: true, pause: 90 },
      { segs: [{ text: '🤖  Q&A readiness', style: 'bold', ms: MS }] },
      { indent: true, segs: [{ text: 'practice the hard questions your audience will ask before they do', ms: MSF }] },
      { empty: true, pause: 320 },
      { visual: 'metrics', pause: 1400 },
    ],
    pauseBefore: 700,
  },
  {
    speaker: 'user',
    blocks: [
      { empty: true, pause: 170 },
      { segs: [{ text: "okay.  i'm in.", style: 'bold', ms: MSS }] },
    ],
    pauseBefore: 480,
  },
];

/* ─── MemoVisual — inline card ─────────────────── */
function MemoVisual({ type }: { type: 'session' | 'metrics' }) {
  if (type === 'session') {
    return (
      <div className="mvc mvc--session" aria-label="Point live coaching session">
        <div className="mvc-header">
          <span className="mvc-live-dot" aria-hidden="true" />
          <span className="mvc-live-tag">LIVE</span>
          <span className="mvc-header-title">Point Session</span>
        </div>
        <div className="mvc-body">
          <div className="mvc-cam">
            <div className="mvc-cam-silhouette" aria-hidden="true">
              <svg viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <circle cx="20" cy="14" r="9" fill="rgba(255,255,255,0.18)" />
                <path d="M4 46c0-8.837 7.163-16 16-16s16 7.163 16 16" fill="rgba(255,255,255,0.12)" />
              </svg>
            </div>
            <span className="mvc-cam-label">You</span>
          </div>
          <div className="mvc-metrics">
            <div className="mvc-metric-row">
              <span className="mvc-metric-icon">🎙</span>
              <div className="mvc-bar"><div className="mvc-bar-fill" style={{ '--mvc-w': '78%' } as React.CSSProperties} /></div>
              <span className="mvc-metric-pct">78%</span>
            </div>
            <div className="mvc-metric-row">
              <span className="mvc-metric-icon">👁</span>
              <div className="mvc-bar"><div className="mvc-bar-fill" style={{ '--mvc-w': '91%' } as React.CSSProperties} /></div>
              <span className="mvc-metric-pct">91%</span>
            </div>
            <div className="mvc-metric-row">
              <span className="mvc-metric-icon">🤖</span>
              <div className="mvc-bar"><div className="mvc-bar-fill" style={{ '--mvc-w': '74%' } as React.CSSProperties} /></div>
              <span className="mvc-metric-pct">74%</span>
            </div>
          </div>
        </div>
        <div className="mvc-caption">"Good pace — watch filler words near the close."</div>
      </div>
    );
  }

  return (
    <div className="mvc mvc--metrics" aria-label="Point session results">
      <div className="mvc-header">
        <span className="mvc-check" aria-hidden="true">✓</span>
        <span className="mvc-header-title">Session complete</span>
      </div>
      <div className="mvc-score-grid">
        <div className="mvc-score-item">
          <span className="mvc-score-icon">🎙</span>
          <div className="mvc-score-label">Voice clarity</div>
          <div className="mvc-score-bar">
            <div className="mvc-score-fill mvc-score-fill--voice" />
          </div>
          <div className="mvc-score-val">82%</div>
        </div>
        <div className="mvc-score-item">
          <span className="mvc-score-icon">👁</span>
          <div className="mvc-score-label">Eye contact</div>
          <div className="mvc-score-bar">
            <div className="mvc-score-fill mvc-score-fill--eye" />
          </div>
          <div className="mvc-score-val">91%</div>
        </div>
        <div className="mvc-score-item">
          <span className="mvc-score-icon">🤖</span>
          <div className="mvc-score-label">Q&A readiness</div>
          <div className="mvc-score-bar">
            <div className="mvc-score-fill mvc-score-fill--qa" />
          </div>
          <div className="mvc-score-val">74%</div>
        </div>
      </div>
      <div className="mvc-caption">↑ 23% better than your last session</div>
    </div>
  );
}

/* ─── MemoLine ─────────────────────────────────── */
function MemoLine({
  block, active, done, onDone,
}: {
  block: TextBlock;
  active: boolean;
  done: boolean;
  onDone: () => void;
}) {
  const [segIdx,    setSegIdx]    = useState(0);
  const [charIdx,   setCharIdx]   = useState(0);
  const [strikeSet, setStrikeSet] = useState<ReadonlySet<number>>(new Set());
  const onDoneRef     = useRef(onDone);
  const prevActiveRef = useRef(false);
  onDoneRef.current   = onDone;

  useEffect(() => {
    if (active && !prevActiveRef.current) {
      setSegIdx(0); setCharIdx(0); setStrikeSet(new Set());
    }
    prevActiveRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!active || done) return;
    if (segIdx >= block.segs.length) { onDoneRef.current(); return; }

    const seg = block.segs[segIdx];
    const txt = seg.text;
    if (charIdx >= txt.length) {
      if (seg.style === 'strike') setStrikeSet(p => new Set([...p, segIdx]));
      const t = setTimeout(() => { setSegIdx(s => s + 1); setCharIdx(0); }, 18);
      return () => clearTimeout(t);
    }
    const ch   = txt[charIdx];
    const base = seg.ms ?? 30;
    const jit  = 1 + (Math.random() - 0.5) * 0.25;
    const ms   = ch === '.' ? base * 3.0 : ch === ' ' ? Math.max(base * 0.18, 5) : base * jit;
    const t    = setTimeout(() => setCharIdx(c => c + 1), ms);
    return () => clearTimeout(t);
  }, [active, done, segIdx, charIdx, block.segs]);

  const visible = active || done;
  return (
    <div className={[
      'memo-line',
      block.indent ? 'memo-line--indent' : '',
      visible       ? 'memo-line--visible' : '',
    ].filter(Boolean).join(' ')}>
      {block.segs.map((seg, i) => {
        const isCur  = i === segIdx;
        const isDone = i < segIdx;
        const shown  = isDone ? seg.text : (isCur ? seg.text.slice(0, charIdx) : '');
        const struck = strikeSet.has(i);
        return (
          <span
            key={i}
            className={[
              seg.style ? `memo-seg--${seg.style}` : '',
              struck     ? 'memo-seg--struck'       : '',
            ].filter(Boolean).join(' ') || undefined}
          >
            {shown}
          </span>
        );
      })}
      {active && !done && segIdx < block.segs.length && (
        <span className="memo-cursor" aria-hidden="true" />
      )}
    </div>
  );
}

/* ─── TurnGroup ──────────────────────────────────── */
function TurnGroup({
  turn, active, done, onDone,
}: {
  turn: Turn;
  active: boolean;
  done: boolean;
  onDone: () => void;
}) {
  const [blockIdx, setBlockIdx] = useState(-1);
  const prevActiveRef = useRef(false);
  const onDoneRef     = useRef(onDone);
  onDoneRef.current   = onDone;

  useEffect(() => {
    if (active && !prevActiveRef.current) setBlockIdx(0);
    prevActiveRef.current = active;
  }, [active]);

  /* advance empty + visual blocks automatically */
  useEffect(() => {
    if (blockIdx < 0 || blockIdx >= turn.blocks.length) return;
    const b = turn.blocks[blockIdx];
    if ('empty' in b) {
      const t = setTimeout(() => setBlockIdx(p => p + 1), (b as EmptyBlock).pause ?? 140);
      return () => clearTimeout(t);
    }
    if ('visual' in b) {
      const t = setTimeout(() => setBlockIdx(p => p + 1), (b as VisualBlock).pause ?? 1200);
      return () => clearTimeout(t);
    }
  }, [blockIdx, turn.blocks]);

  const handleBlockDone = useCallback((idx: number) => {
    const b = turn.blocks[idx] as TextBlock;
    setTimeout(() => {
      const next = idx + 1;
      if (next >= turn.blocks.length) onDoneRef.current();
      setBlockIdx(next);
    }, b.pauseAfter ?? 55);
  }, [turn.blocks]);

  return (
    <>
      {turn.blocks.map((b, i) => {
        const isDone   = done || i < blockIdx;
        const isActive = !done && i === blockIdx;

        if ('empty' in b) {
          return isDone ? <div key={i} className="memo-empty-line" aria-hidden="true" /> : null;
        }
        if ('visual' in b) {
          return (isDone || isActive)
            ? <MemoVisual key={i} type={(b as VisualBlock).visual} />
            : null;
        }
        if (!isDone && !isActive) return null;
        return (
          <MemoLine
            key={i}
            block={b}
            active={isActive}
            done={isDone}
            onDone={() => handleBlockDone(i)}
          />
        );
      })}
    </>
  );
}

/* ─── ConvoSection ───────────────────────────────── */
function ConvoSection({
  turns,
  autoStart = false,
  showCta   = false,
  onStart,
}: {
  turns:      Turn[];
  autoStart?: boolean;
  showCta?:   boolean;
  onStart?:   () => void;
}) {
  const sectionRef              = useRef<HTMLDivElement>(null);
  const [turnIdx,  setTurnIdx]  = useState(-1);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (autoStart) { setTurnIdx(0); return; }
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTurnIdx(prev => prev < 0 ? 0 : prev);
          obs.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [autoStart]);

  const handleTurnDone = useCallback((idx: number) => {
    const next = idx + 1;
    if (next >= turns.length) {
      setTimeout(() => setTurnIdx(next), 320);
      return;
    }
    const nextTurn    = turns[next];
    const isPointNext = nextTurn.speaker === 'point';
    const delay       = nextTurn.pauseBefore ?? (isPointNext ? 750 : 320);

    if (isPointNext) {
      setTimeout(() => setIsTyping(true), 130);
      setTimeout(() => { setIsTyping(false); setTurnIdx(next); }, 130 + delay);
    } else {
      setTimeout(() => setTurnIdx(next), delay);
    }
  }, [turns]);

  const finished = turnIdx >= turns.length;

  return (
    <div ref={sectionRef} className="memo-convo-section">
      {turns.map((turn, i) => {
        if (turnIdx < 0) return null;
        if (i > turnIdx && !finished) return null;
        const isPoint = turn.speaker === 'point';
        return (
          <div
            key={i}
            className={['memo-turn', isPoint ? 'memo-turn--point' : ''].filter(Boolean).join(' ')}
          >
            {isPoint && (
              <div className="memo-turn-label">
                <span className="memo-turn-dot" aria-hidden="true" />
                Point
              </div>
            )}
            <TurnGroup
              turn={turn}
              active={!finished && i === turnIdx}
              done={finished || i < turnIdx}
              onDone={() => handleTurnDone(i)}
            />
          </div>
        );
      })}

      {isTyping && (
        <div className="memo-turn memo-turn--point" aria-live="polite">
          <div className="memo-turn-label" aria-hidden="true">
            <span className="memo-turn-dot" />
            Point
          </div>
          <div className="memo-typing-indicator" aria-label="Point is typing">
            <span /><span /><span />
          </div>
        </div>
      )}

      {showCta && finished && (
        <div className="memo-cta memo-cta--visible">
          <button type="button" className="notes-cta-btn" onClick={onStart}>
            Choose My Coach Style
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── MemoSection (exported) ──────────────────────── */
export function MemoSection({ started, onStart }: {
  started: boolean;
  onStart: () => void;
}) {
  return (
    <div className="memo-story">
      {started && <ConvoSection turns={CONVO1} autoStart />}

      <hr className="memo-divider" aria-hidden="true" />

      <ConvoSection turns={CONVO2} />

      <hr className="memo-divider" aria-hidden="true" />

      <ConvoSection turns={CONVO3} showCta onStart={onStart} />
    </div>
  );
}
