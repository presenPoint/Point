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
          <span key={i} className={`wem-word wem-word--${level}`} title={`Intensity ${pct}% (vs loudest word in phrase)`}>
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
        <span className="wem-swatch wem-swatch--high" />
        High
        <span className="wem-swatch wem-swatch--mid" />
        Mid
        <span className="wem-swatch wem-swatch--low" />
        Low
        <span className="wem-tip">Hover a word for intensity (%)</span>
      </div>
      <div className="wem-lines">
        {log.map((entry, i) => (
          <PhraseLine key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}
