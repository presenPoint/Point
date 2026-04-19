const C = 2 * Math.PI * 30;

export function ScoreRing({
  value,
  colorVar,
}: {
  value: number;
  colorVar: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const offset = C * (1 - v / 100);
  return (
    <div className="circle-wrap">
      <svg viewBox="0 0 72 72" width="72" height="72">
        <circle className="circle-bg" cx="36" cy="36" r="30" fill="none" strokeDasharray={C} strokeDashoffset={0} />
        <circle
          className="circle-fg"
          cx="36"
          cy="36"
          r="30"
          fill="none"
          stroke={colorVar}
          strokeDasharray={C}
          style={{ strokeDashoffset: offset }}
        />
      </svg>
      <div className="circle-val">{Math.round(v)}<span className="circle-max">/100</span></div>
    </div>
  );
}
