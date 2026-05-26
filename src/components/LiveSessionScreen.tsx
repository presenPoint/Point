import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { feedbackQueue } from '../agents';
import { useLivePresenting } from '../hooks/useLivePresenting';
import { useVolumeAnalyzer } from '../hooks/useVolumeAnalyzer';
import { cancelFeedbackSpeech, enqueueFeedback, onSpeakingChange, primeFeedbackAudio } from '../lib/feedbackTts';
import { stopCoachQuestionSpeech } from '../lib/coachQuestionTts';
import { buildReplaySubtitles } from '../lib/replaySubtitles';
import { navigateBack } from '../lib/appNavigation';
import { flushLiveTranscriptNow, restartLiveSpeechRecognition } from '../lib/liveTranscriptFlush';
import type { ReplaySubtitleCue } from '../lib/replaySubtitles';
import { saveTranscriptToBlob } from '../lib/transcriptStorage';
import { PERSONAS } from '../constants/personas';
import { getDefaultPaceRange, getPersonaPaceRange, isPaceInRange } from '../lib/speechRate';
import { useEffectiveLocale } from '../hooks/useEffectiveLocale';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useSessionStore } from '../store/sessionStore';
import { useToastStore } from '../store/toastStore';
import type { FeedbackItem, FeedbackLevel } from '../types/session';
import { AnimatedPointLogo } from './AnimatedPointLogo';
import { PracticeReplayPlayer } from './PracticeReplayPlayer';
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

function pickPracticeRecordMime(): string | undefined {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

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
  const audienceVideoRef = useRef<HTMLVideoElement>(null);
  /** `public/mpfff.mp4` — 없거나 로드 실패 시 실루엣 무대로 폴백 */
  const [audienceVideoFailed, setAudienceVideoFailed] = useState(false);
  const [camOn, setCamOn] = useState(false);
  /** 발표자 시점: 관객을 보며 연습(기본) — 카메라는 뒤에서 추적만. Self는 내 화면 확인용. */
  const [stageView, setStageView] = useState<'audience' | 'self'>('audience');

  const [privacyModalOpen, setPrivacyModalOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return !sessionStorage.getItem(LIVE_PRIVACY_STORAGE_KEY);
    } catch {
      return true;
    }
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  /** 녹화 시작 시각(epoch ms) — 재생 자막 타임라인 기준 */
  const recordingStartedAtRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [replayUrl, setReplayUrl] = useState<string | null>(null);
  const replayUrlRef = useRef<string | null>(null);
  const [replayCues, setReplayCues] = useState<ReplaySubtitleCue[]>([]);

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

  const stopReplay = () => {
    if (replayUrlRef.current) {
      URL.revokeObjectURL(replayUrlRef.current);
      replayUrlRef.current = null;
    }
    setReplayUrl(null);
    setReplayCues([]);
  };

  const acknowledgePrivacy = () => {
    try {
      sessionStorage.setItem(LIVE_PRIVACY_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setPrivacyModalOpen(false);
    restartLiveSpeechRecognition();
  };

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

  useEffect(() => {
    const v = audienceVideoRef.current;
    if (!v || audienceVideoFailed) return;
    const tryPlay = () => void v.play().catch(() => setAudienceVideoFailed(true));
    v.addEventListener('canplay', tryPlay, { once: true });
    return () => v.removeEventListener('canplay', tryPlay);
  }, [audienceVideoFailed, stageView]);

  useEffect(
    () => () => {
      stopCamera();
      if (replayUrlRef.current) {
        URL.revokeObjectURL(replayUrlRef.current);
        replayUrlRef.current = null;
      }
      const r = recorderRef.current;
      if (r && r.state === 'recording') {
        try {
          r.stop();
        } catch {
          /* ignore */
        }
      }
      recorderRef.current = null;
    },
    [stopCamera],
  );

  const locale = useEffectiveLocale();
  const selectedPersona = useSessionStore((s) => s.selectedPersona);
  const paceRange = useMemo(() => {
    const p = selectedPersona ? PERSONAS[selectedPersona] : null;
    return p ? getPersonaPaceRange(p.config, locale) : getDefaultPaceRange(locale);
  }, [selectedPersona, locale]);
  const paceUnitLabel = paceRange.unit === 'spm' ? t('live.paceUnitSpm') : t('live.paceUnitWpm');

  const interimText = live.interimText ?? '';
  const recognitionError = live.recognitionError ?? '';
  /** 마이크 권한 거부/장치 없음 등 — 회복 가드 카드를 띄울 조건 */
  const micBlocked = useMemo(() => {
    const e = recognitionError.toLowerCase();
    return (
      e.includes('permission') ||
      e.includes('denied') ||
      e.includes('not-allowed') ||
      e.includes('권한') ||
      e.includes('마이크')
    );
  }, [recognitionError]);
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
    /** 카메라+마이크 동시 요청은 마이크가 거부됐을 때 통째로 실패함 → 단계적으로 시도 */
    const requestStream = async (constraints: MediaStreamConstraints) =>
      navigator.mediaDevices.getUserMedia(constraints);

    let stream: MediaStream | null = null;
    let lastError: unknown = null;
    try {
      stream = await requestStream({ video: true, audio: true });
    } catch (e) {
      lastError = e;
      // 마이크가 거부됐을 가능성 — 비디오만 다시 시도
      try {
        stream = await requestStream({ video: true, audio: false });
      } catch (e2) {
        lastError = e2;
      }
    }

    if (!stream) {
      console.warn('[live] startCamera failed', lastError);
      const err = lastError as DOMException | undefined;
      const name = err?.name ?? '';
      const msgKey: MessageKey =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'live.toast.camDenied'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'live.toast.camNotFound'
            : name === 'NotReadableError'
              ? 'live.toast.camBusy'
              : 'live.toast.camStartFail';
      useToastStore.getState().showToast(t(msgKey));
      mediaStreamRef.current = null;
      setMediaStream(null);
      setCamOn(false);
      return;
    }

    const v = videoRef.current;
    if (v) {
      v.srcObject = stream;
      v.onloadeddata = () => startPoseTracking(v);
      setCamOn(true);
    }
    mediaStreamRef.current = stream;
    setMediaStream(stream);
    if (stream.getAudioTracks().length > 0) restartLiveSpeechRecognition();
  };

  /** 마이크만 요청 — 카메라 켜지 않고 권한 회복 시도 */
  const requestMicOnly = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
      restartLiveSpeechRecognition();
      useSessionStore.getState().setLivePresentation({ recognitionError: '' });
      useToastStore.getState().showToast(t('live.toast.micReady'));
    } catch {
      useToastStore.getState().showToast(t('live.toast.micRetry'));
    }
  };

  /** 라이브 전사: 최근 발화 한 줄 — 메인 영역에 크게 표시 */
  const recentTranscriptLine = useMemo(() => {
    const log = session.speech_coaching.transcript_log;
    if (log.length === 0) return '';
    return log[log.length - 1]?.text ?? '';
  }, [session.speech_coaching.transcript_log]);
  const scriptText = session.material.script_text.trim();

  const startPracticeRecording = () => {
    const v = videoRef.current;
    const stream = v?.srcObject;
    if (!stream || !(stream instanceof MediaStream)) {
      useToastStore.getState().showToast(t('live.toast.recordNeedCam'));
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      useToastStore.getState().showToast(t('live.toast.recordUnsupported'));
      return;
    }
    const mime = pickPracticeRecordMime();
    if (!mime) {
      useToastStore.getState().showToast(t('live.toast.recordNoFormat'));
      return;
    }
    try {
      stopReplay();
      recordChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        setRecording(false);
        recorderRef.current = null;
        const endMs = Date.now();
        const startMs = recordingStartedAtRef.current;
        const { word_emphasis_log, transcript_log } = useSessionStore.getState().session.speech_coaching;
        const cues = buildReplaySubtitles(startMs, endMs, word_emphasis_log, transcript_log);
        setReplayCues(cues);

        const blob = new Blob(recordChunksRef.current, { type: mime.split(';')[0] });
        recordChunksRef.current = [];
        if (blob.size < 256) {
          useToastStore.getState().showToast(t('live.toast.recordTooShort'));
          setReplayCues([]);
          return;
        }
        const url = URL.createObjectURL(blob);
        replayUrlRef.current = url;
        setReplayUrl(url);
        useToastStore.getState().showToast(t('live.toast.recordReady'));
      };
      rec.start(1000);
      setRecording(true);
    } catch {
      useToastStore.getState().showToast(t('live.toast.recordStartFail'));
    }
  };

  const stopPracticeRecording = () => {
    const r = recorderRef.current;
    if (r && r.state === 'recording') {
      try {
        r.stop();
      } catch {
        setRecording(false);
      }
    }
  };

  const leavePresentation = () => {
    if (recording) stopPracticeRecording();
    stopReplay();
    stopCamera();
    flushLiveTranscriptNow();
    cancelFeedbackSpeech();
    useSessionStore.getState().setEndedReason('abandoned');
    navigateBack();
  };

  const endSession = (reason: 'user' | 'time_limit' = 'user') => {
    if (recording) stopPracticeRecording();
    stopReplay();
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
            {camOn && (
              <button
                type="button"
                className={`btn-record${recording ? ' btn-record--active' : ''}`}
                onClick={() => (recording ? stopPracticeRecording() : startPracticeRecording())}
                disabled={!camOn}
                title={t('live.recordTitle')}
              >
                {recording ? t('live.recordStop') : t('live.recordStart')}
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
              <video
                ref={videoRef}
                className={`camera-feed${!camOn ? ' hidden' : ''}${camOn && stageView === 'audience' ? ' camera-feed--pip-audience' : ''}`}
                autoPlay
                muted
                playsInline
              />
              {stageView === 'audience' && (
                <div
                  className={`audience-stage${audienceVideoFailed ? ' audience-stage--fallback' : ''}`}
                  aria-hidden="true"
                >
                  {!audienceVideoFailed && (
                    <video
                      ref={audienceVideoRef}
                      className="audience-stage-video"
                      src={`${import.meta.env.BASE_URL}mpfff.mp4`}
                      autoPlay
                      loop
                      muted
                      playsInline
                      onError={() => setAudienceVideoFailed(true)}
                    />
                  )}
                  <div className="audience-stage-vignette" />
                  {audienceVideoFailed && (
                    <div className="audience-row">
                      {Array.from({ length: 7 }, (_, i) => (
                        <div key={i} className={`audience-silhouette audience-silhouette--${i}`} />
                      ))}
                    </div>
                  )}
                  <div className="audience-stage-caption">
                    <span className="audience-stage-title">{t('live.audienceTitle')}</span>
                    <span className="audience-stage-sub">
                      {camOn ? t('live.audienceSubCamOn') : t('live.audienceSubCamOff')}
                    </span>
                  </div>
                </div>
              )}
              {!camOn && (
                <div
                  className={`cam-placeholder live-voicestage${stageView === 'audience' ? ' cam-placeholder--over-audience' : ''}`}
                >
                  {micBlocked ? (
                    <div className="live-mic-guard" role="alert">
                      <div className="lmg-icon" aria-hidden="true">🎤</div>
                      <div className="lmg-title">{t('live.micGuard.title')}</div>
                      <p className="lmg-lead">{t('live.micGuard.lead')}</p>
                      <ol className="lmg-steps">
                        <li>{t('live.micGuard.s1')}</li>
                        <li>{t('live.micGuard.s2')}</li>
                        <li>{t('live.micGuard.s3')}</li>
                      </ol>
                      <div className="lmg-actions">
                        <button type="button" className="btn-primary" onClick={() => void requestMicOnly()}>
                          {t('live.micGuard.retry')}
                        </button>
                        <button type="button" className="btn-sm" onClick={() => window.location.reload()}>
                          {t('live.micGuard.reload')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="live-voicestage-body">
                      <div className="lvs-header">
                        <span className="lvs-mic-dot" />
                        <span className="lvs-mic-label">{t('live.voiceStage.listening')}</span>
                        <button type="button" className="btn-sm lvs-cam-btn" onClick={startCamera}>
                          {t('live.turnOnCamera')} →
                        </button>
                      </div>

                      {scriptText ? (
                        <div className="lvs-teleprompter">
                          <div className="lvs-tp-label">{t('live.voiceStage.scriptLabel')}</div>
                          <div className="lvs-tp-text">{scriptText.slice(0, 800)}{scriptText.length > 800 ? '…' : ''}</div>
                        </div>
                      ) : (
                        <div className="lvs-transcript">
                          {recentTranscriptLine ? (
                            <p className="lvs-tx-recent">{recentTranscriptLine}</p>
                          ) : null}
                          {interimText ? (
                            <p className="lvs-tx-interim">
                              {interimText}
                              <span className="lvs-tx-cursor" aria-hidden="true" />
                            </p>
                          ) : !recentTranscriptLine ? (
                            <p className="lvs-tx-empty">{t('live.voiceStage.idle')}</p>
                          ) : null}
                        </div>
                      )}

                      <div className="lvs-stats">
                        <div className="lvs-stat">
                          <div className="lvs-stat-val">{wpm || '—'}</div>
                          <div className="lvs-stat-lbl">{paceUnitLabel}</div>
                        </div>
                        <div className="lvs-stat lvs-stat--sep">
                          <div className="lvs-stat-val">{fillers}</div>
                          <div className="lvs-stat-lbl">{t('live.metricFillers')}</div>
                        </div>
                        <div className="lvs-stat lvs-stat--sep">
                          <div className="lvs-stat-val">{formatMmSs(sec)}</div>
                          <div className="lvs-stat-lbl">{t('live.voiceStage.elapsed')}</div>
                        </div>
                      </div>

                      <LiveWaveBars stream={mediaStream} onSample={handleVolumeSample} />

                      <p className="lvs-foot-hint">{t('live.camPlaceholder')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            {camOn && (
              <div className="cam-perspective-toggle" role="group" aria-label={t('live.stageToggleAria')}>
                <button
                  type="button"
                  className={`cam-perspective-btn${stageView === 'audience' ? ' active' : ''}`}
                  onClick={() => setStageView('audience')}
                >
                  {t('live.stageAudience')}
                </button>
                <button
                  type="button"
                  className={`cam-perspective-btn${stageView === 'self' ? ' active' : ''}`}
                  onClick={() => setStageView('self')}
                >
                  {t('live.stageSelf')}
                </button>
              </div>
            )}
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

            {replayUrl && (
              <div className="live-replay-panel" role="region" aria-label={t('live.replayAria')}>
                <div className="live-replay-head">
                  <span className="live-replay-label">{t('live.replayLabel')}</span>
                  <button type="button" className="btn-sm live-replay-close" onClick={stopReplay}>
                    {t('live.replayClose')}
                  </button>
                </div>
                <PracticeReplayPlayer src={replayUrl} cues={replayCues} />
                <p className="live-replay-hint">
                  {t('live.replayHint')}
                </p>
              </div>
            )}
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
