import type { WordEmphasisEntry } from '../types/session';
import { emphasisTiersForPhrase, relativeIntensityPercent } from '../lib/liveCaptionEmphasis';
import { useT } from '../hooks/useT';

interface Props {
  log: WordEmphasisEntry[];
}

function PhraseLine({ entry }: { entry: WordEmphasisEntry }) {
  const maxRms = Math.max(...entry.words.map((w) => w.rms), 0.001);
  const tiers = emphasisTiersForPhrase(entry.words);
  return (
    <div className="wem-phrase">
      {entry.words.map((w, i) => {
        const level = tiers[i];
        const pct = relativeIntensityPercent(w.rms, maxRms);
        return (
          <span
            key={i}
            className={`wem-word wem-word--${level}`}
            title={`${pct}% vs loudest in phrase · ${level}`}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
}

export function WordEmphasisSection({ log }: Props) {
  const t = useT();
  if (log.length === 0) return null;

  return (
    <div className="wem-wrap">
      <div className="wem-legend">
        <span className="wem-swatch wem-swatch--high" />
        {t('report.wordEmphasis.high')}
        <span className="wem-swatch wem-swatch--mid" />
        {t('report.wordEmphasis.mid')}
        <span className="wem-swatch wem-swatch--low" />
        {t('report.wordEmphasis.low')}
        <span className="wem-tip">{t('report.wordEmphasis.tip')}</span>
      </div>
      <div className="wem-lines">
        {log.map((entry, i) => (
          <PhraseLine key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}
