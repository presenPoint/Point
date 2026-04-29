/**
 * Static “Point” wordmark (no motion, no decorative dot).
 * Optional home action: scroll / coach picker / landing per caller.
 */
interface PointWordmarkProps {
  onHomeClick?: () => void;
  /** Merged onto the outer button or span */
  className?: string;
  /** e.g. "Point — Home" when used as a control */
  ariaLabel?: string;
}

export function PointWordmark({ onHomeClick, className, ariaLabel = 'Point — Home' }: PointWordmarkProps) {
  const mark = (
    <span className="point-wordmark" lang="en">
      Point
    </span>
  );

  if (onHomeClick) {
    return (
      <button
        type="button"
        className={['point-wordmark-link', className].filter(Boolean).join(' ')}
        onClick={onHomeClick}
        aria-label={ariaLabel}
      >
        {mark}
      </button>
    );
  }

  return <span className={className}>{mark}</span>;
}
