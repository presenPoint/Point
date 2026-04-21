import { useEffect, useState } from 'react';

const LETTERS = 'Point'.split('');
const TYPE_DELAYS = [700, 280, 240, 210, 200];

interface Props { onStart: () => void }

export function TypingHero({ onStart }: Props) {
  const [typed,      setTyped]      = useState(0);
  const [cursorOn,   setCursorOn]   = useState(true);
  const [cursorGone, setCursorGone] = useState(false);

  useEffect(() => {
    if (typed >= LETTERS.length) return;
    const t = setTimeout(() => setTyped(p => p + 1), TYPE_DELAYS[typed] ?? 220);
    return () => clearTimeout(t);
  }, [typed]);

  useEffect(() => {
    const id = setInterval(() => setCursorOn(p => !p), 530);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typed < LETTERS.length) return;
    const t = setTimeout(() => setCursorGone(true), 3500);
    return () => clearTimeout(t);
  }, [typed]);

  const done = typed >= LETTERS.length;

  return (
    <section className="typing-hero" aria-label="Hero">
      <div className="typing-hero-glow" aria-hidden="true" />

      <div className="th-word" role="heading" aria-level={1} aria-label="Point">
        {LETTERS.map((letter, i) => (
          <span
            key={i}
            className={i < typed ? 'th-letter th-letter--shown' : 'th-letter th-letter--hidden'}
            aria-hidden="true"
          >
            {letter}
          </span>
        ))}

        {!cursorGone && (
          <span
            className={['th-cursor', cursorOn ? '' : 'th-cursor--off'].join(' ')}
            aria-hidden="true"
          />
        )}
      </div>

      <div className={['th-below', done ? 'th-below--visible' : ''].join(' ')}>
        <p className="th-sub">
          AI coaches you live — voice, body language, and Q&amp;A —<br />
          while you present. Not after.
        </p>
        <button type="button" className="landing-btn-primary" onClick={onStart}>
          Choose My Coach Style
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}
