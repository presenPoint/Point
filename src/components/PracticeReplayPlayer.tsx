import { useEffect, useMemo, useRef, useState } from 'react';
import { emphasisTierForWord, relativeIntensityPercent } from '../lib/liveCaptionEmphasis';
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
              const tier = emphasisTierForWord(w.rms, maxRms);
              const pct = relativeIntensityPercent(w.rms, maxRms);
              return (
                <span key={i} className={`prs-word prs-word--${tier}`} title={`강도 ${pct}%`}>
                  {w.word}
                  {i < active.words.length - 1 ? '\u00a0' : ''}
                </span>
              );
            })}
          </div>
        ) : cues.length === 0 ? (
          <div className="practice-replay-sub-empty">이 녹화 구간에 표시할 전사가 없습니다.</div>
        ) : null}
      </div>
      {cues.length > 0 && (
        <div className="practice-replay-legend" aria-hidden="true">
          <span className="prs-dot prs-dot--high" />
          <span>높음</span>
          <span className="prs-dot prs-dot--mid" />
          <span>중간</span>
          <span className="prs-dot prs-dot--low" />
          <span>낮음</span>
        </div>
      )}
    </div>
  );
}
