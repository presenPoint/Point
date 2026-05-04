import { useEffect, useRef, useState } from 'react';

/**
 * Measures real-time microphone amplitude (RMS) via Web Audio API.
 * Uses the provided MediaStream if given; falls back to a fresh audio-only stream.
 * Returns a normalised RMS value in [0, 1].
 */
export function useVolumeAnalyzer(externalStream: MediaStream | null): number {
  const [rms, setRms] = useState(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let dead = false;

    const setup = async () => {
      const ACtorRaw =
        typeof window !== 'undefined'
          ? (window.AudioContext ?? (window as unknown as Record<string, unknown>).webkitAudioContext)
          : undefined;
      const ACtor = ACtorRaw as typeof AudioContext | undefined;
      if (!ACtor) return;

      let stream: MediaStream;
      let ownStream = false;

      if (externalStream) {
        stream = externalStream;
      } else {
        if (!navigator.mediaDevices?.getUserMedia) return;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          ownStream = true;
        } catch {
          return;
        }
      }

      if (dead) {
        if (ownStream) stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const ac = new ACtor();
      const source = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);

      const data = new Float32Array(analyser.frequencyBinCount);
      let rafId = 0;

      const tick = () => {
        if (dead) return;
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += v * v;
        // multiply by 5 to give visible range; clamp to [0,1]
        setRms(Math.min(Math.sqrt(sum / data.length) * 5, 1));
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      cleanupRef.current = () => {
        dead = true;
        cancelAnimationFrame(rafId);
        source.disconnect();
        void ac.close();
        if (ownStream) stream.getTracks().forEach((t) => t.stop());
      };
    };

    void setup();

    return () => {
      dead = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
    // Re-init only when the external stream reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalStream]);

  return rms;
}
