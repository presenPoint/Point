import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { feedbackQueue } from '../agents';
import { useLivePresenting } from '../hooks/useLivePresenting';
import { useVolumeAnalyzer } from '../hooks/useVolumeAnalyzer';
import { cancelFeedbackSpeech, enqueueFeedback, onSpeakingChange, primeFeedbackAudio } from '../lib/feedbackTts';
import { stopCoachQuestionSpeech } from '../lib/coachQuestionTts';
import { navigateBack } from '../lib/appNavigation';
import { flushLiveTranscriptNow, restartLiveSpeechRecognition } from '../lib/liveTranscriptFlush';
import { saveTranscriptToBlob } from '../lib/transcriptStorage';
import { PERSONAS } from '../constants/personas';
import { getDefaultPaceRange, getPersonaPaceRange, isPaceInRange } from '../lib/speechRate';
import { useEffectiveLocale } from '../hooks/useEffectiveLocale';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useSessionStore } from '../store/sessionStore';
import { useToastStore } from '../store/toastStore';
import type { FeedbackItem, FeedbackLevel } from '../types/session';
import { AnimatedPointLogo } from './AnimatedPointLogo';
import { useT } from '../hooks/useT';
import type { MessageKey } from '../locales/messages';

function formatMmSs(sec: number): string {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function levelToFeedClass(level: FeedbackLevel): string {
  if (level === 'CRITICAL') return 'type-alert';
  if (level === 'WARN') return 'type-warn';
  return 'type-info';
}

function sourceToCat(source: FeedbackItem['source']): { cls: string; labelKey: MessageKey } {
  if (source === 'SPEECH_RULE' || source === 'SPEECH_SEMANTIC') return { cls: 'cat-voice', labelKey: 'live.feedVoice' };
  return { cls: 'cat-gaze', labelKey: 'live.feedNonverbal' };
}

const LIVE_PRIVACY_STORAGE_KEY = 'point_live_privacy_ok_v1';

/** Multipliers give each bar a different peak height for a natural wave look */
const BAR_MULTS = [0.55, 0.85, 1.0, 0.9, 0.7, 0.5];

function LiveWaveBars({
  stream,
  onSample,
}: {
  stream: MediaStream | null;
  onSample: (rms: number) => void;
}) {
  const rms = useVolumeAnalyzer(stream);
  const rmsRef = useRef(rms);
  rmsRef.current = rms;

  // push 1-second samples without recreating the interval
  const onSampleRef = useRef(onSample);
  onSampleRef.current = onSample;
  useEffect(() => {
    const id = setInterval(() => onSampleRef.current(rmsRef.current), 200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="wave-bars">
      {BAR_MULTS.map((m, i) => (
        <div
          key={i}
          className="wave-bar wave-bar--live"
          style={{ height: `${Math.max(4, Math.round(rms * 58 * m))}px` }}
        />
      ))}
    </div>
  );
}

export function LiveSessionScreen() {
  const t = useT();
  const captionResultRef = useRef<((e: SpeechRecognitionEvent) => void) | null>(null);

  const { presentingStartRef, startPoseTracking, stopPoseTracking } = useLivePresenting(captionResultRef);
  const transition = useSessionStore((s) => s.transition);
  const setEndedReason = useSessionStore((s) => s.setEndedReason);
  const session = useSessionStore((s) => s.session);
  const live = useSessionStore((s) => s.livePresentation);
  const maxDurationSec = session.max_duration_sec;

  const [sec, setSec] = useState(0);
  const [feed, setFeed] = useState<FeedbackItem[]>([]);
  const [coachVisual, setCoachVisual] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voiceFeedbackRef = useRef(false);
  const [alertUi, setAlertUi] = useState<{
    msg: string;
    typeLabelKey: MessageKey;
    color: string;
  } | null>(null);
  const lastAlertId = useRef<string | null>(null);
  const alertT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [camOn, setCamOn] = useState(false);
  const [prompterOpen, setPrompterOpen] = useState(false);
  const [prompterAutoScroll, setPrompterAutoScroll] = useState(true);
  const prompterRef = useRef<HTMLDivElement>(null);

  const [privacyModalOpen, setPrivacyModalOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return !sessionStorage.getItem(LIVE_PRIVACY_STORAGE_KEY);
    } catch {
      return true;
    }
  });

  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    stopPoseTracking();
    const v = videoRef.current;
    const stream =
      (v?.srcObject instanceof MediaStream ? v.srcObject : null) ?? mediaStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
    }
    if (v) {
      v.srcObject = null;
      v.onloadeddata = null;
    }
    mediaStreamRef.current = null;
    setMediaStream(null);
    setCamOn(false);
  }, [stopPoseTracking]);

  const handleVolumeSample = useCallback((rms: number) => {
    const ts = Date.now();
    useSessionStore.setState((st) => ({
      session: {
        ...st.session,
        speech_coaching: {
          ...st.session.speech_coaching,
          volume_samples: [
            ...st.session.speech_coaching.volume_samples,
            { timestamp: ts, rms },
          ].slice(-18000),
        },
      },
    }));
    useSessionStore.getState().setLivePresentation({ volumeRms: rms });
  }, []);

  const acknowledgePrivacy = () => {
    try {
      sessionStorage.setItem(LIVE_PRIVACY_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setPrivacyModalOpen(false);
    restartLiveSpeechRecognition();
    void startCamera();
  };

  // 개인정보 동의가 이미 완료된 경우 마운트 시 바로 카메라 시작
  useEffect(() => {
    if (!privacyModalOpen) {
      void startCamera();
    }
    // startCamera는 ref 기반이 아니라 직접 함수이므로 eslint-disable 처리
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      setSec(Math.round((Date.now() - presentingStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [presentingStartRef]);

  /* ── 시간 제한 감시 (Free 5분, Pro 60분) ── */
  const warned30sRef = useRef(false);
  const timeLimitEndedRef = useRef(false);
  const showToast = useToastStore((st) => st.showToast);
  const endSessionRef = useRef<(reason: 'user' | 'time_limit') => void>(() => {});

  useEffect(() => {
    if (maxDurationSec == null) return;
    const remaining = maxDurationSec - sec;
    if (remaining <= 30 && remaining > 0 && !warned30sRef.current) {
      warned30sRef.current = true;
      showToast(t('live.toast.planSecondsLeft', { remaining }));
    }
    if (remaining <= 0 && !timeLimitEndedRef.current) {
      timeLimitEndedRef.current = true;
      showToast(t('live.toast.timeLimitEnd'));
      endSessionRef.current('time_limit');
    }
  }, [sec, maxDurationSec, showToast, t]);

  useEffect(() => onSpeakingChange(setIsSpeaking), []);

  useEffect(() => () => stopCoachQuestionSpeech(), []);

  useEffect(() => {
    voiceFeedbackRef.current = !coachVisual;
  }, [coachVisual]);

  useEffect(() => {
    if (coachVisual) cancelFeedbackSpeech();
  }, [coachVisual]);

  useEffect(() => {
    const sync = () => {
      setFeed([...feedbackQueue.getFeedHistory()]);
      const items = feedbackQueue.getDisplayItems();
      const top = items[0];
      if (top && top.id !== lastAlertId.current) {
        lastAlertId.current = top.id;
        const color =
          top.level === 'CRITICAL' ? 'var(--red)' : top.level === 'WARN' ? 'var(--amber)' : 'var(--cyan)';
        const typeLabelKey: MessageKey =
          top.source === 'NONVERBAL'
            ? 'live.alert.nonverbal'
            : top.level === 'CRITICAL'
              ? 'live.alert.alert'
              : 'live.alert.voiceCoach';
        setAlertUi({ msg: top.msg, typeLabelKey, color });
        if (alertT.current) clearTimeout(alertT.current);
        alertT.current = setTimeout(() => setAlertUi(null), 3500);
        if (voiceFeedbackRef.current) {
          enqueueFeedback(top.msg, {
            level: top.level,
            preempt: top.level === 'CRITICAL',
          });
        }
      }
    };
    sync();
    const unsub = feedbackQueue.subscribe(sync);
    return () => {
      unsub();
      if (alertT.current) clearTimeout(alertT.current);
      cancelFeedbackSpeech();
    };
  }, []);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [feed]);

  // unmount 정리 — stopCamera는 ref로 잡아서 effect 자체는 한 번만 등록.
  // 직접 [stopCamera]를 deps로 두면 매 렌더마다 cleanup이 실행돼 srcObject가
  // 즉시 null로 초기화되는 버그가 있었음 (stopPoseTracking이 useLivePresenting
  // 내부에서 매 렌더 새 함수로 생성되기 때문).
  const stopCameraRef = useRef(stopCamera);
  stopCameraRef.current = stopCamera;
  useEffect(() => () => stopCameraRef.current(), []);

  const locale = useEffectiveLocale();
  const selectedPersona = useSessionStore((s) => s.selectedPersona);
  const scriptText = useSessionStore((s) => s.session.material.script_text);
  const paceRange = useMemo(() => {
    const p = selectedPersona ? PERSONAS[selectedPersona] : null;
    return p ? getPersonaPaceRange(p.config, locale) : getDefaultPaceRange(locale);
  }, [selectedPersona, locale]);
  const paceUnitLabel = paceRange.unit === 'spm' ? t('live.paceUnitSpm') : t('live.paceUnitWpm');

  const interimText = live.interimText ?? '';
  const recognitionError = live.recognitionError ?? '';
  const wpm = live.wpm;
  const fillers = session.speech_coaching.filler_count || live.fillerCount;
  const gazePct = Math.round(session.nonverbal_coaching.gaze_rate * 100);
  const postureLogs = session.nonverbal_coaching.posture_log;
  const posturePct =
    postureLogs.length === 0
      ? 70
      : Math.round((postureLogs.filter((p) => p.is_ok).length / postureLogs.length) * 100);

  const wpmOk = isPaceInRange(wpm, paceRange);
  const wpmCard = wpm === 0 ? 'metric-card' : wpmOk ? 'metric-card good' : 'metric-card warn';
  const fillerCard =
    fillers >= 12 ? 'metric-card alert' : fillers >= 6 ? 'metric-card warn' : 'metric-card good';
  const gazeCard = gazePct >= 65 ? 'metric-card good' : gazePct >= 45 ? 'metric-card warn' : 'metric-card alert';
  const postureCard =
    posturePct >= 70 ? 'metric-card good' : posturePct >= 50 ? 'metric-card warn' : 'metric-card alert';

  const dynamismLog = session.nonverbal_coaching.dynamism_log;
  const lastDynamism = dynamismLog.length > 0 ? dynamismLog[dynamismLog.length - 1].level : 'natural';
  const dynamismLabel = useMemo(() => {
    if (lastDynamism === 'stiff') return t('live.moveStiff');
    if (lastDynamism === 'restless') return t('live.moveRestless');
    return t('live.moveNatural');
  }, [lastDynamism, t]);
  const dynamismOk = lastDynamism === 'natural';

  const paceMid = (paceRange.min + paceRange.max) / 2;
  const wpmProg = Math.min(100, wpm === 0 ? 8 : (wpm / paceMid) * 100);
  const fillerProg = Math.min(100, fillers * 8);
  const gazeProg = gazePct;
  const postureProg = posturePct;

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      useToastStore.getState().showToast(t('live.toast.camUnsupported'));
      return;
    }

    const requestStream = async (): Promise<MediaStream | null> => {
      // 1차: video + audio 동시 요청
      try {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        // fall through to video-only fallback
      }

      // 2차: 마이크 권한 거부/없음/사용 중일 수 있으므로 video-only로 폴백
      // (마이크가 차단돼 있으면 video+audio 요청이 NotAllowedError를 즉시 던지므로
      //  반드시 video-only 재시도가 필요함)
      try {
        const videoOnly = await navigator.mediaDevices.getUserMedia({ video: true });
        useToastStore.getState().showToast(t('live.toast.camMicMissing'));
        return videoOnly;
      } catch (err2) {
        const n2 = (err2 as DOMException | undefined)?.name ?? '';
        if (n2 === 'NotAllowedError' || n2 === 'SecurityError') {
          useToastStore.getState().showToast(t('live.toast.camDenied'));
        } else if (n2 === 'NotFoundError' || n2 === 'OverconstrainedError') {
          useToastStore.getState().showToast(t('live.toast.camMissing'));
        } else if (n2 === 'NotReadableError') {
          useToastStore.getState().showToast(t('live.toast.camBusy'));
        } else {
          useToastStore.getState().showToast(t('live.toast.camFailed'));
        }
        return null;
      }
    };

    const stream = await requestStream();
    if (!stream) {
      mediaStreamRef.current = null;
      setMediaStream(null);
      setCamOn(false);
      return;
    }

    const v = videoRef.current;
    if (!v) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    v.srcObject = stream;

    let readyFired = false;
    const handleReady = () => {
      if (readyFired) return;
      readyFired = true;
      void v.play().catch(() => undefined);
      startPoseTracking(v);
    };
    v.onloadeddata = handleReady;
    // 안전망: 이미 readyState>=2 (HAVE_CURRENT_DATA) 면 loadeddata 이벤트가 안 올 수 있으니 즉시 실행
    if (v.readyState >= 2) handleReady();

    setCamOn(true);
    mediaStreamRef.current = stream;
    setMediaStream(stream);
    if (stream.getAudioTracks().length > 0) restartLiveSpeechRecognition();
  };

  const leavePresentation = () => {
    stopCamera();
    flushLiveTranscriptNow();
    cancelFeedbackSpeech();
    useSessionStore.getState().setEndedReason('abandoned');
    navigateBack();
  };

  const endSession = (reason: 'user' | 'time_limit' = 'user') => {
    stopCamera();
    flushLiveTranscriptNow();
    const s = Math.round((Date.now() - presentingStartRef.current) / 1000);
    useSessionStore.setState((st) => ({
      session: {
        ...st.session,
        speech_coaching: { ...st.session.speech_coaching, total_duration_sec: s },
      },
    }));
    setEndedReason(reason);

    const { session_id, user_id, speech_coaching } = useSessionStore.getState().session;
    void saveTranscriptToBlob(
      session_id,
      user_id,
      speech_coaching.transcript_log,
      s,
    );

    transition('POST_QA');
  };

  endSessionRef.current = endSession;

  const tickerItems = useMemo(
    () => [
      t('live.tickerSpeech', {
        wpm: wpm || '—',
        unit: paceUnitLabel,
        min: paceRange.min,
        max: paceRange.max,
      }),
      t('live.tickerEye', { pct: gazePct }),
      t('live.tickerFillers', { n: fillers }),
      t('live.tickerPosture', { pts: posturePct }),
    ],
    [wpm, gazePct, fillers, posturePct, paceRange, paceUnitLabel, t],
  );

  return (
    <div id="screen-live" className="point-screen">
      {privacyModalOpen && (
        <div className="live-privacy-overlay" role="dialog" aria-modal="true" aria-labelledby="live-privacy-title">
          <div className="live-privacy-card">
            <h2 id="live-privacy-title" className="live-privacy-title">
              {t('live.privacy.title')}
            </h2>
            <ul className="live-privacy-list">
              <li>{t('live.privacy.b1')}</li>
              <li>{t('live.privacy.b2')}</li>
              <li>{t('live.privacy.b3')}</li>
            </ul>
            <button type="button" className="btn-primary live-privacy-ok" onClick={acknowledgePrivacy}>
              {t('live.privacy.gotIt')}
            </button>
          </div>
        </div>
      )}

      <div className={`coaching-alert${alertUi ? ' visible' : ''}`}>
        {alertUi && (
          <>
            <div className="ca-header">
              <span className="ca-icon">⚡</span>
              <span className="ca-type" style={{ color: alertUi.color }}>
                {t(alertUi.typeLabelKey)}
              </span>
            </div>
            <div className="ca-text">{alertUi.msg}</div>
          </>
        )}
      </div>

      <div className="live-shell">
        <div className="live-topbar">
          <div className="live-topbar-start">
            <button
              type="button"
              className="live-back-btn"
              onClick={leavePresentation}
              aria-label={t('live.backAria')}
            >
              {t('nav.back')}
            </button>
            <div className="live-logo">
              <AnimatedPointLogo
                onHomeClick={leavePresentation}
                ariaLabel={t('live.logoHome')}
              />
            </div>
          </div>
          <div className="rec-indicator">
            <div className="rec-dot" />
            <div className="rec-text">{t('live.sessionBadge')}</div>
          </div>
          <div className="live-timer">
            {formatMmSs(sec)}
            {maxDurationSec != null && (
              <span
                className={[
                  'live-timer-remaining',
                  maxDurationSec - sec <= 30 ? 'live-timer-remaining--warn' : '',
                ].filter(Boolean).join(' ')}
              >
                {' / '}{formatMmSs(Math.max(0, maxDurationSec - sec))} {t('live.timerLeft')}
              </span>
            )}
          </div>
          <div className="live-actions">
            <LanguageSwitcher className="lang-switcher--topnav lang-switcher--live" />
            {scriptText.trim().length > 0 && (
              <button
                type="button"
                className={`live-prompter-toggle${prompterOpen ? ' active' : ''}`}
                onClick={() => setPrompterOpen((o) => !o)}
                aria-pressed={prompterOpen}
              >
                {t('live.prompter.toggle')}
              </button>
            )}
            <button type="button" className="btn-end" onClick={() => endSession('user')}>
              {t('live.endSession')}
            </button>
          </div>
        </div>

        <div className="live-main">
          <div className="camera-area">
            <div className="camera-area-stack">
              {/* 청중 영상: 항상 메인 화면으로 표시 */}
              <video
                className="camera-feed"
                src="/audience-stage.mp4"
                autoPlay
                muted
                loop
                playsInline
              />
              {/* selfcam PIP: 카메라 켜지면 하단 우측에 자동 표시.
                  video element는 항상 DOM에 존재해야 MediaPipe 프레임 공급이 가능. */}
              <video
                ref={videoRef}
                className={`camera-feed--pip-audience${camOn ? '' : ' hidden'}`}
                autoPlay
                muted
                playsInline
              />
            </div>
            <div className="scan-line" />
            <div className="corner-tl" />
            <div className="corner-tr" />
            <div className="corner-bl" />
            <div className="corner-br" />
            <div className="tracking-dot tracking-dot-left" />
            <div className="tracking-dot tracking-dot-right" />

            <div className="cam-overlays">
              <div className="cam-metric">
                <div className="cm-label">{t('live.metricSpeechRate')}</div>
                <div className={`cm-value ${wpmOk || wpm === 0 ? 'good' : 'warn'}`}>
                  {wpm || '—'}{' '}
                  <span className="cm-unit">{paceUnitLabel}</span>
                </div>
              </div>
              <div className="cam-metric">
                <div className="cm-label">{t('live.metricVoice')}</div>
                <LiveWaveBars stream={mediaStream} onSample={handleVolumeSample} />
              </div>
              <div className="cam-metric">
                <div className="cm-label">{t('live.metricGaze')}</div>
                <div className={`cm-value ${gazePct >= 55 ? 'good' : 'warn'}`}>
                  {gazePct >= 55 ? t('live.gazeFront') : t('live.gazeOff')}
                </div>
              </div>
              <div className="cam-metric">
                <div className="cm-label">{t('live.metricPosture')}</div>
                <div className={`cm-value ${posturePct >= 60 ? 'good' : 'warn'}`}>
                  {posturePct >= 60 ? t('live.postureStable') : t('live.postureWarn')}
                </div>
              </div>
              <div className="cam-metric">
                <div className="cm-label">{t('live.metricMovement')}</div>
                <div className={`cm-value ${dynamismOk ? 'good' : 'warn'}`}>
                  {dynamismLabel}
                </div>
              </div>
            </div>

          </div>

          <div className="coaching-panel">
            <div className="cp-header">
              <div className="cp-title">{t('live.coachingTitle')}</div>
              <div className="cp-mode-toggle">
                <button
                  type="button"
                  className={`mode-btn${coachVisual ? ' active' : ''}`}
                  title={t('live.modeVisualTitle')}
                  onClick={() => setCoachVisual(true)}
                >
                  {t('live.modeVisual')}
                </button>
                <button
                  type="button"
                  className={`mode-btn${!coachVisual ? ' active' : ''}${!coachVisual && isSpeaking ? ' speaking' : ''}`}
                  title={t('live.modeVoiceTitle')}
                  onClick={() => {
                    primeFeedbackAudio();
                    setCoachVisual(false);
                  }}
                >
                  {t('live.modeVoice')}{!coachVisual && isSpeaking && <span className="speaking-dot" aria-label={t('live.voicePlaying')} />}
                </button>
              </div>
            </div>

            <div className={`live-caption-bar${recognitionError ? ' live-caption-bar--error' : ''}`} aria-live="polite" aria-label={t('live.captionAria')}>
              <span className={`lcb-dot${recognitionError ? ' lcb-dot--error' : ''}`} />
              <span className={`lcb-badge${recognitionError ? ' lcb-badge--error' : ''}`}>
                {recognitionError ? t('live.micError') : t('live.listening')}
              </span>
              {recognitionError ? (
                <span className="lcb-text lcb-text--error">{recognitionError}</span>
              ) : interimText ? (
                <span className="lcb-text">
                  {interimText}
                  <span className="lcb-cursor" aria-hidden="true" />
                </span>
              ) : (
                <span className="lcb-text lcb-text--idle">{t('live.listeningIdle')}</span>
              )}
            </div>

            <div className="metrics-grid">
              <div className={wpmCard}>
                <div className="mc-label">{t('live.metricSpeechRateCard')}</div>
                <div className="mc-val">{wpm || '—'}</div>
                <div className="mc-sub">
                  {t('live.metricSpeechSub', {
                    unit: paceUnitLabel,
                    min: paceRange.min,
                    max: paceRange.max,
                  })}
                </div>
                <div className="prog-bar">
                  <div
                    className="prog-fill"
                    style={{
                      width: `${wpmProg}%`,
                      background: wpmOk || wpm === 0 ? 'var(--green)' : 'var(--amber)',
                    }}
                  />
                </div>
              </div>
              <div className={fillerCard}>
                <div className="mc-label">{t('live.metricFillers')}</div>
                <div className="mc-val">{fillers}</div>
                <div className="mc-sub">{t('live.metricFillersSub')}</div>
                <div className="prog-bar">
                  <div
                    className="prog-fill"
                    style={{
                      width: `${fillerProg}%`,
                      background: fillers >= 10 ? 'var(--red)' : 'var(--amber)',
                    }}
                  />
                </div>
              </div>
              <div className={gazeCard}>
                <div className="mc-label">{t('live.metricEye')}</div>
                <div className="mc-val">{gazePct}</div>
                <div className="mc-sub">{t('live.metricEyeSub')}</div>
                <div className="prog-bar">
                  <div
                    className="prog-fill"
                    style={{ width: `${gazeProg}%`, background: 'var(--green)' }}
                  />
                </div>
              </div>
              <div className={postureCard}>
                <div className="mc-label">{t('live.metricPostureCard')}</div>
                <div className="mc-val">{posturePct}</div>
                <div className="mc-sub">{t('live.metricPostureSub')}</div>
                <div className="prog-bar">
                  <div
                    className="prog-fill"
                    style={{ width: `${postureProg}%`, background: 'var(--amber)' }}
                  />
                </div>
              </div>
            </div>

            <div className="feedback-feed" ref={feedRef}>
              <div className="fb-item type-info">
                <div className="fb-header">
                  <span className="fb-cat cat-content">{t('live.feedContent')}</span>
                  <span className="fb-time">{formatMmSs(0)}</span>
                </div>
                <div className="fb-text">{t('live.feedStarted')}</div>
              </div>
              {feed.map((item) => {
                const { cls, labelKey } = sourceToCat(item.source);
                const msgTime = new Date(item.createdAt);
                const time = `${String(msgTime.getMinutes()).padStart(2, '0')}:${String(msgTime.getSeconds()).padStart(2, '0')}`;
                return (
                  <div key={item.id} className={`fb-item ${levelToFeedClass(item.level)}`}>
                    <div className="fb-header">
                      <span className={`fb-cat ${cls}`}>{t(labelKey)}</span>
                      <span className="fb-time">{time}</span>
                    </div>
                    <div className="fb-text">{item.msg}</div>
                    {item.speechSnippet ? (
                      <details className="fb-speech-snippet">
                        <summary className="fb-speech-snippet-summary">{t('live.speechSnippetSummary')}</summary>
                        <p className="fb-speech-snippet-body">{item.speechSnippet}</p>
                      </details>
                    ) : null}
                    <div className="fb-actions">
                      <button
                        type="button"
                        className="btn-sm fb-hear-coach-btn"
                        aria-label={t('live.playMentorAria')}
                        onClick={() => {
                          primeFeedbackAudio();
                          enqueueFeedback(item.msg, { level: item.level, preempt: true });
                        }}
                      >
                        {t('live.playMentorVoice')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="nonverbal-panel" aria-label={t('live.nvSummaryAria')}>
              <div className="nv-title">{t('live.nvTitle')}</div>
              <div className="nv-row">
                <span className="nv-label">{t('live.nvEye')}</span>
                <div className="nv-bar-wrap">
                  <div className="nv-bar-fill nv-fill-green" style={{ width: `${gazePct}%` }} />
                </div>
                <span className="nv-score nv-score-green">{gazePct}</span>
              </div>
              <div className="nv-row">
                <span className="nv-label">{t('live.nvPosture')}</span>
                <div className="nv-bar-wrap">
                  <div className="nv-bar-fill nv-fill-amber" style={{ width: `${posturePct}%` }} />
                </div>
                <span className="nv-score nv-score-amber">{posturePct}</span>
              </div>
              <div className="nv-row">
                <span className="nv-label">{t('live.nvGestures')}</span>
                <div className="nv-bar-wrap">
                  <div
                    className="nv-bar-fill nv-fill-violet"
                    style={{ width: `${Math.min(100, session.nonverbal_coaching.gesture_log.length * 5)}%` }}
                  />
                </div>
                <span className="nv-score nv-score-violet">
                  {session.nonverbal_coaching.gesture_log.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Teleprompter panel ── */}
        {prompterOpen && (
          <div
            className="live-prompter"
            role="region"
            aria-label={t('live.prompter.aria')}
          >
            <div className="live-prompter-bar">
              <button
                type="button"
                className={`live-prompter-autoscroll${prompterAutoScroll ? ' active' : ''}`}
                onClick={() => setPrompterAutoScroll((a) => !a)}
              >
                {t('live.prompter.autoScroll')}
              </button>
              <button
                type="button"
                className="live-prompter-close"
                onClick={() => setPrompterOpen(false)}
                aria-label={t('live.prompter.close')}
              >
                ✕
              </button>
            </div>
            <div
              ref={prompterRef}
              className="live-prompter-scroll"
              onMouseEnter={() => setPrompterAutoScroll(false)}
              onMouseLeave={() => setPrompterAutoScroll(true)}
            >
              {scriptText.trim() ? (
                <p className="live-prompter-text">{scriptText}</p>
              ) : (
                <p className="live-prompter-empty">{t('live.prompter.noScript')}</p>
              )}
            </div>
          </div>
        )}

        <div className="live-ticker">
          <div className="ticker-label">{t('live.tickerLabel')}</div>
          <div className="ticker-track">
            <div className="ticker-inner">
              {[...tickerItems, ...tickerItems].map((text, i) => (
                <span key={i} className="ticker-item">
                  <span className="t-accent">{text}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
