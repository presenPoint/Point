import { useEffect, useRef } from 'react';
import { feedbackQueue, runSemanticAnalysis, calcWpm, onTranscriptChunk } from '../agents';
import { PoseTracker } from '../agents/agent3-live-nonverbal/poseTracker';
import { SEMANTIC_INTERVAL_MS, SILENCE_THRESHOLD_MS } from '../lib/speechUtils';
import { useSessionStore } from '../store/sessionStore';
import type { FillerEntry, TranscriptEntry } from '../types/session';

export function useLivePresenting() {
  const presentingStartRef = useRef(Date.now());
  const poseTrackerRef = useRef<PoseTracker | null>(null);

  useEffect(() => {
    presentingStartRef.current = Date.now();
    feedbackQueue.clearQueue();
    useSessionStore.getState().setLivePresentation({ wpm: 0, fillerCount: 0 });

    const bufferRef: TranscriptEntry[] = [];
    const fillerRef: FillerEntry[] = [];
    const lastWpmWarnRef = { current: 0 };
    const silenceTimerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };

    const transcriptForSemantic = (): string => {
      const since = Date.now() - SEMANTIC_INTERVAL_MS;
      return bufferRef
        .filter((e) => e.timestamp >= since)
        .map((e) => e.text)
        .join(' ');
    };

    const uiTick = window.setInterval(() => {
      const wpm = calcWpm(bufferRef);
      useSessionStore.getState().setLivePresentation({
        wpm,
        fillerCount: fillerRef.length,
      });
    }, 500);

    const semanticId = window.setInterval(() => {
      const text = transcriptForSemantic();
      const { session } = useSessionStore.getState();
      const summary = session.material.summary || session.material.raw_text.slice(0, 500);
      void runSemanticAnalysis(
        text,
        summary,
        session.speech_coaching.off_topic_log,
        ({ offTopic, ambiguousDelta }) => {
          useSessionStore.setState((st) => {
            const sc = st.session.speech_coaching;
            return {
              session: {
                ...st.session,
                speech_coaching: {
                  ...sc,
                  off_topic_log: offTopic ? [...sc.off_topic_log, offTopic] : sc.off_topic_log,
                  ambiguous_count: sc.ambiguous_count + (ambiguousDelta ?? 0),
                },
              },
            };
          });
        }
      );
    }, SEMANTIC_INTERVAL_MS);

    const wpmLogId = window.setInterval(() => {
      const wpm = calcWpm(bufferRef);
      const ts = Date.now();
      useSessionStore.setState((st) => ({
        session: {
          ...st.session,
          speech_coaching: {
            ...st.session.speech_coaching,
            wpm_log: [...st.session.speech_coaching.wpm_log, { timestamp: ts, wpm }],
          },
        },
      }));
    }, 30_000);

    const RecCtor =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : undefined;

    let recognition: SpeechRecognition | null = null;
    if (RecCtor) {
      recognition = new RecCtor();
      recognition.lang = 'ko-KR';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let text = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          text += event.results[i][0].transcript;
        }
        const t = text.trim();
        if (!t) return;
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          feedbackQueue.push({
            level: 'INFO',
            msg: '발표가 잠시 멈췄습니다',
            source: 'SPEECH_RULE',
            cooldown: 30_000,
          });
        }, SILENCE_THRESHOLD_MS);

        onTranscriptChunk(t, bufferRef, fillerRef, lastWpmWarnRef);
        const fillers = fillerRef.length;
        useSessionStore.setState((st) => ({
          session: {
            ...st.session,
            speech_coaching: {
              ...st.session.speech_coaching,
              filler_count: fillers,
              filler_timestamps: fillerRef.map((f) => f.timestamp),
            },
          },
        }));
      };
      recognition.onerror = () => {};
      try {
        recognition.start();
      } catch {
        /* noop */
      }
    }

    const tracker = new PoseTracker();
    poseTrackerRef.current = tracker;
    tracker.init().catch(() => {});

    return () => {
      clearInterval(uiTick);
      clearInterval(semanticId);
      clearInterval(wpmLogId);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognition?.stop();
      tracker.destroy();
      poseTrackerRef.current = null;
      const sec = Math.round((Date.now() - presentingStartRef.current) / 1000);
      useSessionStore.setState((st) => ({
        session: {
          ...st.session,
          speech_coaching: { ...st.session.speech_coaching, total_duration_sec: sec },
        },
        livePresentation: { wpm: 0, fillerCount: 0 },
      }));
    };
  }, []);

  const startPoseTracking = (video: HTMLVideoElement) => {
    const tracker = poseTrackerRef.current;
    if (!tracker) return;
    tracker.start(video, (frame) => {
      useSessionStore.setState((st) => {
        const nv = st.session.nonverbal_coaching;
        const { gaze, posture, gesture } = frame;

        const gazeWindow: boolean[] = [];
        for (const entry of nv.gaze_log.slice(-49)) gazeWindow.push(entry.is_gazing);
        gazeWindow.push(gaze.isGazing);
        const gaze_rate = gazeWindow.filter(Boolean).length / gazeWindow.length;

        const gesture_log = gesture.excess
          ? [...nv.gesture_log, { timestamp: posture.timestamp, type: 'excess' as const }].slice(-200)
          : nv.gesture_log;

        return {
          session: {
            ...st.session,
            nonverbal_coaching: {
              gaze_rate,
              gaze_log: [...nv.gaze_log, { timestamp: gaze.timestamp, is_gazing: gaze.isGazing }].slice(-500),
              posture_log: [
                ...nv.posture_log,
                { timestamp: posture.timestamp, angle: posture.angle, is_ok: posture.isStraight && !posture.isTooFar && !posture.isTooClose },
              ].slice(-500),
              gesture_log,
            },
          },
        };
      });

      if (!frame.gaze.isGazing) {
        feedbackQueue.push({ level: 'WARN', msg: '청중을 좀 더 바라보세요', source: 'NONVERBAL', cooldown: 30_000 });
      }
      if (!frame.posture.isStraight) {
        feedbackQueue.push({ level: 'WARN', msg: '자세를 바르게 해주세요', source: 'NONVERBAL', cooldown: 15_000 });
      }
      if (frame.gesture.excess) {
        feedbackQueue.push({ level: 'WARN', msg: '제스처가 너무 많아요', source: 'NONVERBAL', cooldown: 60_000 });
      }
    });
  };

  const stopPoseTracking = () => {
    poseTrackerRef.current?.stop();
  };

  return { presentingStartRef, startPoseTracking, stopPoseTracking };
}
