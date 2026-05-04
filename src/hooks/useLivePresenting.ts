import { useEffect, useRef } from 'react';
import {
  bufferWithInterim,
  calcInstantWpmFromHistory,
  evaluateWpmWarningsForRate,
  feedbackQueue,
  getDefaultSpeechConfig,
  onInterimSpeechTick,
  onTranscriptChunk,
  runSemanticAnalysis,
  speechConfigFromPersona,
} from '../agents';
import type { SpeechRuleConfig } from '../agents';
type CaptionResultRef = { current: ((e: SpeechRecognitionEvent) => void) | null };
import { PoseTracker, nonverbalConfigFromPersona, getDefaultNonverbalConfig } from '../agents/agent3-live-nonverbal/poseTracker';
import { PERSONAS } from '../constants/personas';
import { countSyllables, recentTranscriptPlain, SEMANTIC_INTERVAL_MS, SILENCE_THRESHOLD_MS } from '../lib/speechUtils';
import { useSessionStore } from '../store/sessionStore';
import { buildPresentationTopicSummaryLine } from '../lib/presentationTopicContext';
import { buildWordVolumeProfile } from '../lib/liveCaptionEmphasis';
import type { FillerEntry, TranscriptEntry } from '../types/session';

export function useLivePresenting(captionResultRef?: CaptionResultRef) {
  const presentingStartRef = useRef(Date.now());
  const poseTrackerRef = useRef<PoseTracker | null>(null);

  useEffect(() => {
    let dead = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
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
    /** interim 텍스트 누적(델타 필러용) */
    const prevInterimRef = { current: '' };
    /** 현재 interim 발화의 WPM 앵커 시각 */
    const interimStartRef = { current: null as number | null };
    /** 확정(final) 구간만 누적한 음절 수 — interim은 별도 더함 */
    const cumulativeSyllablesRef = { current: 0 };
    const wpmHistRef: { t: number; s: number }[] = [];

    const recordWpmSample = (): number => {
      const s = cumulativeSyllablesRef.current + countSyllables(prevInterimRef.current);
      const t = Date.now();
      wpmHistRef.push({ t, s });
      while (wpmHistRef.length > 1 && t - wpmHistRef[0].t > 3500) wpmHistRef.shift();
      return calcInstantWpmFromHistory(wpmHistRef);
    };

    const transcriptForSemantic = (): string => {
      const since = Date.now() - SEMANTIC_INTERVAL_MS;
      return bufferRef
        .filter((e) => e.timestamp >= since)
        .map((e) => e.text)
        .join(' ');
    };

    const uiTick = window.setInterval(() => {
      const instantWpm = recordWpmSample();
      const snap = () =>
        recentTranscriptPlain(
          bufferWithInterim(bufferRef, prevInterimRef.current, interimStartRef.current),
          25_000,
          520,
        ) || undefined;
      evaluateWpmWarningsForRate(instantWpm, lastWpmWarnRef, speechConfig, snap);
      useSessionStore.getState().setLivePresentation({
        wpm: instantWpm,
        fillerCount: fillerRef.length,
      });
    }, 120);

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
      const wpm = recordWpmSample();
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

    /** 권한 거부 등 복구 불가 오류 발생 시 true — onend에서 재시작하지 않음 */
    let recognitionBlocked = false;

    function normalizeLang(raw: string): string {
      if (raw === 'ko' || raw.startsWith('ko-')) return 'ko-KR';
      if (raw === 'en' || raw.startsWith('en-')) return 'en-US';
      return raw;
    }

    let recognition: SpeechRecognition | null = null;
    const scheduleRecognitionRestart = () => {
      if (dead || recognitionBlocked || !recognition) return;
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        restartTimer = null;
        if (dead || recognitionBlocked || !recognition) return;
        try {
          recognition.start();
        } catch {
          /* already running */
        }
      }, 180);
    };

    if (RecCtor) {
      recognition = new RecCtor();
      const rawLang =
        (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'ko-KR';
      recognition.lang = normalizeLang(rawLang);
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        captionResultRef?.current?.(event);
        let text = '';
        let finalText = '';
        let hasFinal = false;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const part = event.results[i][0].transcript;
          text += part;
          if (event.results[i].isFinal) {
            finalText += part;
            hasFinal = true;
          }
        }
        const t = text.trim();
        let latestInterim = '';
        for (let i = 0; i < event.results.length; i++) {
          if (!event.results[i].isFinal) {
            latestInterim += event.results[i][0].transcript;
          }
        }
        latestInterim = latestInterim.trim();
        const finalT = finalText.trim();
        if (!t && !latestInterim && !(hasFinal && finalT)) return;

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

        if (latestInterim) {
          if (interimStartRef.current == null) interimStartRef.current = Date.now();
        } else {
          interimStartRef.current = null;
          prevInterimRef.current = '';
        }

        const prev = prevInterimRef.current;
        const suffix = latestInterim.startsWith(prev) ? latestInterim.slice(prev.length) : latestInterim;
        const snapInterim = () =>
          recentTranscriptPlain(
            bufferWithInterim(bufferRef, latestInterim, interimStartRef.current),
            25_000,
            520,
          ) || undefined;
        onInterimSpeechTick(suffix, fillerRef, speechConfig, snapInterim);

        if (hasFinal && finalT) {
          onTranscriptChunk(finalT, bufferRef, fillerRef, speechConfig, () =>
            recentTranscriptPlain(bufferRef, 25_000, 520) || undefined,
          );
          cumulativeSyllablesRef.current += countSyllables(finalT);
          prevInterimRef.current = latestInterim;
          interimStartRef.current = latestInterim ? Date.now() : null;
        } else {
          prevInterimRef.current = latestInterim;
        }

        const fillers = fillerRef.length;
        const ts = Date.now();
        useSessionStore.setState((st) => ({
          session: {
            ...st.session,
            speech_coaching: {
              ...st.session.speech_coaching,
              filler_count: fillers,
              filler_timestamps: fillerRef.map((f) => f.timestamp),
              ...(hasFinal && finalT
                ? {
                    transcript_log: [
                      ...st.session.speech_coaching.transcript_log,
                      { text: finalT, timestamp: ts },
                    ].slice(-500),
                  }
                : {}),
            },
          },
        }));

        const instantWpm = recordWpmSample();
        const snapPost = () =>
          recentTranscriptPlain(
            bufferWithInterim(bufferRef, prevInterimRef.current, interimStartRef.current),
            25_000,
            520,
          ) || undefined;
        evaluateWpmWarningsForRate(instantWpm, lastWpmWarnRef, speechConfig, snapPost);
        useSessionStore.getState().setLivePresentation({
          wpm: instantWpm,
          fillerCount: fillers,
        });

        // Word-level emphasis: correlate volume window with words in this phrase
        if (hasFinal && finalT) {
          const samples = useSessionStore.getState().session.speech_coaching.volume_samples;
          const wordEmphases = buildWordVolumeProfile(finalT, samples, ts);
          if (wordEmphases.length > 0 && wordEmphases.some((w) => w.rms > 0)) {
            useSessionStore.setState((st) => ({
              session: {
                ...st.session,
                speech_coaching: {
                  ...st.session.speech_coaching,
                  word_emphasis_log: [
                    ...st.session.speech_coaching.word_emphasis_log,
                    { timestamp: ts, phrase: finalT, words: wordEmphases },
                  ].slice(-300),
                },
              },
            }));
          }
        }

        useSessionStore.getState().setLivePresentation({ interimText: latestInterim });
      };
      recognition.onerror = (ev: Event) => {
        const code = (ev as unknown as { error?: string }).error ?? '';
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          recognitionBlocked = true;
          const msg =
            code === 'service-not-allowed'
              ? 'Speech recognition is unavailable (HTTPS required or blocked by browser policy).'
              : 'Microphone permission denied. Enable mic access in browser settings to get coaching.';
          useSessionStore.getState().setLivePresentation({ recognitionError: msg, interimText: '' });
          return;
        }
        if (code === 'aborted' || code === 'no-speech') return;
        scheduleRecognitionRestart();
      };
      recognition.onend = () => {
        if (dead) return;
        scheduleRecognitionRestart();
      };
      try {
        recognition.start();
      } catch {
        /* noop */
      }
    }

    // Monotone delivery check — runs every 30 s
    let lastMonotoneWarn = 0;
    const monotoneId = window.setInterval(() => {
      const samples = useSessionStore.getState().session.speech_coaching.volume_samples;
      if (samples.length < 20) return; // not enough data yet
      const recent = samples.slice(-30);
      const mean = recent.reduce((a, s) => a + s.rms, 0) / recent.length;
      if (mean < 0.06) return; // user not really speaking
      const variance = recent.reduce((a, s) => a + (s.rms - mean) ** 2, 0) / recent.length;
      const now = Date.now();
      if (variance < 0.003 && now - lastMonotoneWarn > 90_000) {
        lastMonotoneWarn = now;
        feedbackQueue.push({
          level: 'INFO',
          msg: 'Your delivery sounds flat — vary your volume to stress key words',
          source: 'SPEECH_RULE',
          cooldown: 90_000,
        });
      }
    }, 30_000);

    const tracker = new PoseTracker();
    poseTrackerRef.current = tracker;
    tracker.init().catch(() => {});

    return () => {
      dead = true;
      if (restartTimer) clearTimeout(restartTimer);
      clearInterval(uiTick);
      clearInterval(semanticId);
      clearInterval(wpmLogId);
      clearInterval(monotoneId);
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
        livePresentation: { wpm: 0, fillerCount: 0, volumeRms: 0, interimText: '', recognitionError: '' },
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
