import { useEffect, useMemo, useRef, useState } from 'react';
import { emphasisTiersForPhrase, relativeIntensityPercent } from '../lib/liveCaptionEmphasis';
import type { ReplaySubtitleCue } from '../lib/replaySubtitles';

interface Props {
  src: string;
  cues: ReplaySubtitleCue[];
}

export function PracticeReplayPlayer({ src, cues }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);

  const active = useMemo(() => cues.find((c) => t >= c.startSec && t < c.endSec), [cues, t]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setT(v.currentTime);
    const onSeek = () => setT(v.currentTime);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('seeked', onSeek);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('seeked', onSeek);
    };
  }, [src]);

  const maxRms = active ? Math.max(...active.words.map((w) => w.rms), 0) : 0;
  const tiers =
    active && active.hasVolume && maxRms > 0 ? emphasisTiersForPhrase(active.words) : [];

  return (
    <div className="practice-replay-wrap">
      <video ref={videoRef} className="live-replay-video" src={src} controls playsInline />
      <div className="practice-replay-subtitles" aria-live="polite">
        {active && active.words.length > 0 ? (
          <div className="practice-replay-sub-line">
            {active.words.map((w, i) => {
              if (!active.hasVolume || maxRms <= 0) {
                return (
                  <span key={i} className="prs-word prs-word--plain">
                    {w.word}
                    {i < active.words.length - 1 ? '\u00a0' : ''}
                  </span>
                );
              }
              const tier = tiers[i] ?? 'mid';
              const pct = relativeIntensityPercent(w.rms, maxRms);
              return (
                <span key={i} className={`prs-word prs-word--${tier}`} title={`Intensity ${pct}%`}>
                  {w.word}
                  {i < active.words.length - 1 ? '\u00a0' : ''}
                </span>
              );
            })}
          </div>
        ) : cues.length === 0 ? (
          <div className="practice-replay-sub-empty">No transcript cues for this recording window.</div>
        ) : null}
      </div>
      {cues.length > 0 && (
        <div className="practice-replay-legend" aria-hidden="true">
          <span className="prs-dot prs-dot--high" />
          <span>High</span>
          <span className="prs-dot prs-dot--mid" />
          <span>Mid</span>
          <span className="prs-dot prs-dot--low" />
          <span>Low</span>
        </div>
      )}
    </div>
  );
}
