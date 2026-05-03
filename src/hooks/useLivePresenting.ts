import { useEffect, useRef } from 'react';
import { feedbackQueue, runSemanticAnalysis, calcWpm, onTranscriptChunk, speechConfigFromPersona, getDefaultSpeechConfig } from '../agents';
import type { SpeechRuleConfig } from '../agents';
type CaptionResultRef = { current: ((e: SpeechRecognitionEvent) => void) | null };
import { PoseTracker, nonverbalConfigFromPersona, getDefaultNonverbalConfig } from '../agents/agent3-live-nonverbal/poseTracker';
import { PERSONAS } from '../constants/personas';
import { SEMANTIC_INTERVAL_MS, SILENCE_THRESHOLD_MS } from '../lib/speechUtils';
import { useSessionStore } from '../store/sessionStore';
import { buildPresentationTopicSummaryLine } from '../lib/presentationTopicContext';
import type { FillerEntry, TranscriptEntry } from '../types/session';

export function useLivePresenting(captionResultRef?: CaptionResultRef) {
  const presentingStartRef = useRef(Date.now());
  const poseTrackerRef = useRef<PoseTracker | null>(null);

  useEffect(() => {
    presentingStartRef.current = Date.now();
    feedbackQueue.clearQueue();
    useSessionStore.getState().setLivePresentation({ wpm: 0, fillerCount: 0 });

    const personaType = useSessionStore.getState().selectedPersona;
    const persona = personaType ? PERSONAS[personaType] : null;
    const speechConfig: SpeechRuleConfig = persona
      ? speechConfigFromPersona(persona.config)
      : getDefaultSpeechConfig();
    const personaPrompt = persona?.systemPrompt;

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
      const topicLine = buildPresentationTopicSummaryLine(session);
      const baseSummary = session.material.summary || session.material.raw_text.slice(0, 500);
      const summary = topicLine ? `${topicLine}\n\n${baseSummary}` : baseSummary;
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
        },
        personaPrompt,
        session.session_id,
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
      recognition.lang = navigator.language || 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        captionResultRef?.current?.(event);
        let text = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          text += event.results[i][0].transcript;
        }
        const t = text.trim();
        if (!t) return;
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          const log = useSessionStore.getState().session.speech_coaching.transcript_log;
          const tail = log
            .slice(-12)
            .map((e) => e.text.trim())
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 480);
          feedbackQueue.push({
            level: 'INFO',
            msg: 'Your presentation has paused',
            source: 'SPEECH_RULE',
            cooldown: 30_000,
            speechSnippet: tail || undefined,
          });
        }, SILENCE_THRESHOLD_MS);

        onTranscriptChunk(t, bufferRef, fillerRef, lastWpmWarnRef, speechConfig);
        const fillers = fillerRef.length;
        const ts = Date.now();
        useSessionStore.setState((st) => ({
          session: {
            ...st.session,
            speech_coaching: {
              ...st.session.speech_coaching,
              filler_count: fillers,
              filler_timestamps: fillerRef.map((f) => f.timestamp),
              transcript_log: [...st.session.speech_coaching.transcript_log, { text: t, timestamp: ts }].slice(-500),
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
        livePresentation: { wpm: 0, fillerCount: 0, volumeRms: 0 },
      }));
    };
  }, []);

  const startPoseTracking = (video: HTMLVideoElement) => {
    const tracker = poseTrackerRef.current;
    if (!tracker) return;
    const personaType = useSessionStore.getState().selectedPersona;
    const activePersona = personaType ? PERSONAS[personaType] : null;
    const nvCfg = activePersona
      ? nonverbalConfigFromPersona(activePersona.config.gazeSensitivity, activePersona.config.gestureIntensity)
      : getDefaultNonverbalConfig();
    const tone = activePersona?.config.feedbackTone ?? 'neutral';
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

        const dynamism_log = [
          ...nv.dynamism_log,
          { timestamp: posture.timestamp, level: frame.dynamism },
        ].slice(-500);

        return {
          session: {
            ...st.session,
            nonverbal_coaching: {
              gaze_rate,
              gaze_log: [...nv.gaze_log, { timestamp: gaze.timestamp, is_gazing: gaze.isGazing, direction: gaze.direction }].slice(-500),
              posture_log: [
                ...nv.posture_log,
                { timestamp: posture.timestamp, angle: posture.angle, is_ok: posture.isStraight && !posture.isTooFar && !posture.isTooClose },
              ].slice(-500),
              gesture_log,
              dynamism_log,
            },
          },
        };
      });

      const gazeMsg: Record<string, string> = {
        sharp: 'Eyes wandering — lock in on the audience',
        encouraging: 'Try connecting with the audience through eye contact',
        precise: 'Eye contact below threshold — redirect gaze forward',
        warm: 'Look at your audience — let them see you',
        empowering: 'Own the room with your eyes — look at them',
      };
      const postureMsg: Record<string, string> = {
        sharp: 'Your posture is leaking credibility — straighten up',
        encouraging: 'A small posture adjustment will boost your presence',
        precise: 'Posture deviation detected — correct alignment',
        warm: 'Stand tall — it helps you breathe and project confidence',
        empowering: 'Command the stage — shoulders back, chin up',
      };
      const gestureExcessMsg: Record<string, string> = {
        sharp: 'Too many gestures — each one should mean something',
        encouraging: 'Dial back the gestures — let each one land',
        precise: 'Gesture frequency exceeds optimal range — reduce',
        warm: 'You\'re gesturing a lot — try letting a few moments be still',
        empowering: 'Control is power — fewer gestures, bigger impact',
      };
      const stiffMsg: Record<string, string> = {
        sharp: 'You\'re frozen — movement is conviction',
        encouraging: 'Loosen up a bit — small movements show confidence',
        precise: 'Minimal body movement detected — add natural motion',
        warm: 'You seem stiff — try natural small movements',
        empowering: 'Break free — let your body match your energy',
      };
      const restlessMsg: Record<string, string> = {
        sharp: 'Stop fidgeting — stillness is strength',
        encouraging: 'Try to settle your body — channel that energy into words',
        precise: 'Excessive movement detected — stabilize',
        warm: 'Too much body movement — try to settle down',
        empowering: 'Rein it in — power needs control',
      };

      if (!frame.gaze.isGazing) {
        feedbackQueue.push({ level: 'WARN', msg: gazeMsg[tone] ?? 'Try to look at the audience more', source: 'NONVERBAL', cooldown: 30_000 });
      }
      if (!frame.posture.isStraight) {
        feedbackQueue.push({ level: 'WARN', msg: postureMsg[tone] ?? 'Please straighten your posture', source: 'NONVERBAL', cooldown: 15_000 });
      }
      if (frame.gesture.excess) {
        feedbackQueue.push({ level: 'WARN', msg: gestureExcessMsg[tone] ?? 'Too many gestures', source: 'NONVERBAL', cooldown: 60_000 });
      }
      if (frame.dynamism === 'stiff') {
        feedbackQueue.push({ level: 'WARN', msg: stiffMsg[tone] ?? 'You seem stiff — try natural small movements', source: 'NONVERBAL', cooldown: 20_000 });
      }
      if (frame.dynamism === 'restless') {
        feedbackQueue.push({ level: 'WARN', msg: restlessMsg[tone] ?? 'Too much body movement — try to settle down', source: 'NONVERBAL', cooldown: 20_000 });
      }
    }, nvCfg);
  };

  const stopPoseTracking = () => {
    poseTrackerRef.current?.stop();
  };

  return { presentingStartRef, startPoseTracking, stopPoseTracking };
}
