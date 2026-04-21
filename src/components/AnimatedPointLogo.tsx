import type React from 'react';

/**
 * "Point" wordmark — seesaw animation.
 * The center letter ('i', index 2) is the pivot.
 * Letters to the left go down first; letters to the right go up first.
 * --sa (seesaw amplitude) controls each letter's Y offset in CSS.
 */
export function AnimatedPointLogo() {
  const letters = 'Point'.split('');
  const center = (letters.length - 1) / 2; // 2.0
  const maxAmp = 7; // px — half the total swing per side

  return (
    <span className="geo-point-logo">
      {letters.map((letter, i) => {
        const amp = Math.round((center - i) * maxAmp);
        return (
          <span
            key={`${letter}-${i}`}
            className="geo-char"
            style={{ '--sa': `${amp}px` } as React.CSSProperties}
            aria-hidden
          >
            {letter}
          </span>
        );
      })}
    </span>
  );
}
