import type { WordEmphasisEntry } from '../types/session';

interface Props {
  log: WordEmphasisEntry[];
}

function emphasisLevel(rms: number, maxRms: number): 'high' | 'mid' | 'low' {
  if (maxRms === 0) return 'low';
  const rel = rms / maxRms;
  if (rel >= 0.65) return 'high';
  if (rel >= 0.35) return 'mid';
  return 'low';
}

function PhraseLine({ entry }: { entry: WordEmphasisEntry }) {
  const maxRms = Math.max(...entry.words.map((w) => w.rms), 0.001);
  return (
    <div className="wem-phrase">
      {entry.words.map((w, i) => {
        const level = emphasisLevel(w.rms, maxRms);
        const pct = maxRms > 0 ? Math.round((w.rms / maxRms) * 100) : 0;
        return (
          <span key={i} className={`wem-word wem-word--${level}`} title={`강도 ${pct}% (구간 최대 대비)`}>
            {w.word}
          </span>
        );
      })}
    </div>
  );
}

export function WordEmphasisSection({ log }: Props) {
  if (log.length === 0) return null;

  return (
    <div className="wem-wrap">
      <div className="wem-legend">
        <span className="wem-swatch wem-swatch--high" />높음
        <span className="wem-swatch wem-swatch--mid" />중간
        <span className="wem-swatch wem-swatch--low" />낮음
        <span className="wem-tip">단어에 마우스를 올리면 강도(%)</span>
      </div>
      <div className="wem-lines">
        {log.map((entry, i) => (
          <PhraseLine key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}
