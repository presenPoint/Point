import { useEffect, useMemo, useRef, useState } from 'react';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useSessionStore } from '../store/sessionStore';
import { useLocaleStore } from '../store/localeStore';
import type { ActionableFeedback, QaDifficultyLevel } from '../types/session';
import { speakCoachQuestion, stopCoachQuestionSpeech } from '../lib/coachQuestionTts';
import { primeFeedbackAudio } from '../lib/feedbackTts';
import { downloadReportPdfFromElement } from '../lib/reportPdf';
import { ScoreRing } from './ScoreRing';
import { ReportPentagonCard } from './ReportPentagonCard';
import { ReportTranscriptSection } from './ReportTranscriptSection';
import { VolumeTimelineChart } from './VolumeTimelineChart';
import { WordEmphasisSection } from './WordEmphasisSection';

import { AnimatedPointLogo } from './AnimatedPointLogo';
import { useT } from '../hooks/useT';

function QaTopBar({
  sessionDone,
  onExportPdf,
  pdfExporting,
}: {
  sessionDone: boolean;
  onExportPdf?: () => void | Promise<void>;
  pdfExporting?: boolean;
}) {
  const t = useT();
  const resetSession = useSessionStore((s) => s.resetSession);
  const setAppStarted = useSessionStore((s) => s.setAppStarted);

  return (
    <div className="topbar">
      <div className="topbar-logo">
        <AnimatedPointLogo onHomeClick={() => setAppStarted(false)} ariaLabel={t('nav.pointHome')} />
      </div>
      <div className="topbar-steps">
        <div className="step-dot done">✓</div>
        <div className="step-line" />
        <div className="step-dot done">✓</div>
        <div className="step-line" />
        <div className="step-dot done">✓</div>
        <div className="step-line" />
        <div className={sessionDone ? 'step-dot done' : 'step-dot active'}>
          {sessionDone ? '✓' : '4'}
        </div>
      </div>
      <div className="topbar-right">
        {sessionDone && onExportPdf && (
          <button
            type="button"
            className="btn-sm qa-pdf-export-btn"
            disabled={pdfExporting}
            onClick={() => void onExportPdf()}
          >
            {pdfExporting ? t('qa.topbar.pdfPreparing') : t('qa.topbar.pdfDownload')}
          </button>
        )}
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            resetSession();
            setAppStarted(false);
          }}
        >
          {t('qa.topbar.newPresentation')}
        </button>
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Parse report time markers (e.g. 0m28s, 1:05) to seconds for chart overlays */
function parseMarkerTimeToSec(time: string): number | null {
  const t = time.trim();
  let m = t.match(/^(\d+)\s*m\s*(\d+)\s*s$/i);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = t.match(/^(\d+)\s*:\s*(\d{1,2})$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = t.match(/^(\d+)\s*min\s*(\d+)\s*sec$/i);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return null;
}

export function QaReportScreen() {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const session = useSessionStore((s) => s.session);
  const qaDifficulty = useSessionStore((s) => s.qaDifficulty);
  const setQaDifficulty = useSessionStore((s) => s.setQaDifficulty);
  const selectedPersona = useSessionStore((s) => s.selectedPersona);
  const qaCurrentQuestion = useSessionStore((s) => s.qaCurrentQuestion);
  const busy = useSessionStore((s) => s.busy);
  const startQa = useSessionStore((s) => s.startQa);
  const submitQaAnswer = useSessionStore((s) => s.submitQaAnswer);
  const skipQaAndRunReport = useSessionStore((s) => s.skipQaAndRunReport);
  const { transcript, listening, transcribing, error: sttError, start: startSTT, stop: stopSTT, reset: resetSTT } = useSpeechToText();
  const [textFallback, setTextFallback] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');
  const [pdfExporting, setPdfExporting] = useState(false);
  const qaInit = useRef(false);
  const reportPdfRootRef = useRef<HTMLDivElement>(null);

  const done = session.status === 'DONE';
  const reporting = session.status === 'REPORT';
  /** Step 2: Q&A 채점 중이거나 최종 보고서 생성 중 */
  const showGenerating =
    session.status === 'REPORT' || (session.status === 'POST_QA' && busy === 'Grading Q&A…');
  const showQaPass =
    !done && session.status === 'POST_QA' && !session.qa_skipped && !showGenerating;

  const reportSubLine = done
    ? t('qa.report.totalDuration', {
        duration: formatDuration(session.speech_coaching.total_duration_sec),
        when: new Date(session.report.generated_at || Date.now()).toLocaleString(
          locale === 'ko' ? 'ko-KR' : 'en-US',
        ),
      })
    : '';

  const volumeCoachingMarkers = useMemo(() => {
    const improvements = session.report?.improvements ?? [];
    const list: { sec: number; label: string }[] = [];
    for (const raw of improvements) {
      if (typeof raw === 'string') continue;
      const item = raw as ActionableFeedback;
      const markers = item.time_markers;
      if (!markers?.length) continue;
      for (const tm of markers) {
        const sec = parseMarkerTimeToSec(tm.time);
        if (sec == null) continue;
        list.push({ sec, label: `${item.label} · ${tm.time} — ${tm.event}` });
      }
    }
    return list;
  }, [session.report?.improvements]);

  useEffect(() => {
    qaInit.current = false;
  }, [session.session_id]);

  useEffect(() => {
    if (done || reporting || session.qa_skipped) return;
    if (qaInit.current) return;
    qaInit.current = true;
    void startQa();
  }, [startQa, done, reporting, session.qa_skipped, session.session_id]);

  useEffect(() => {
    return () => stopCoachQuestionSpeech();
  }, []);

  useEffect(() => {
    if (done || showGenerating || busy || !qaCurrentQuestion?.trim()) {
      if (!qaCurrentQuestion?.trim() && !busy) stopCoachQuestionSpeech();
      return undefined;
    }
    const t = window.setTimeout(() => void speakCoachQuestion(qaCurrentQuestion, selectedPersona), 500);
    return () => {
      window.clearTimeout(t);
      stopCoachQuestionSpeech();
    };
  }, [qaCurrentQuestion, selectedPersona, busy, done, showGenerating]);

  const onSend = () => {
    const text = textFallback ? textAnswer.trim() : transcript.trim();
    if (!text || busy || !qaCurrentQuestion) return;
    if (listening) stopSTT();
    void submitQaAnswer(text).then(() => {
      resetSTT();
      setTextAnswer('');
    });
  };

  const toggleMic = () => {
    if (listening) stopSTT();
    else void startSTT();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleExportPdf = async () => {
    setPdfExporting(true);
    try {
      await downloadReportPdfFromElement(reportPdfRootRef.current, session.session_id);
    } catch (err) {
      console.error('[Point] PDF export failed', err);
      window.alert(err instanceof Error ? err.message : t('qa.pdfError'));
    } finally {
      setPdfExporting(false);
    }
  };

  const wizardStep = done ? 3 : showGenerating ? 2 : 1;

  const wizardStepName = done
    ? t('qa.wizard.report')
    : showGenerating
      ? t('qa.wizard.building')
      : t('qa.wizard.audienceQa');

  const generatingTitle =
    busy === 'Grading Q&A…' ? t('qa.generating.grading') : t('qa.generating.report');

  const reportScoresAndBody = (
    <>
      <div className="score-row">
                  <div className="score-circle">
                    <ScoreRing value={session.report.speech_score} colorVar="var(--cyan)" />
                    <div className="circle-label">
                      {t('report.score.verbal1')}
                      <br />
                      {t('report.score.verbal2')}
                    </div>
                  </div>
                  <div className="score-circle">
                    <ScoreRing value={session.report.nonverbal_score} colorVar="var(--violet)" />
                    <div className="circle-label">
                      {t('report.score.nonverbal1')}
                      <br />
                      {t('report.score.nonverbal2')}
                    </div>
                  </div>
                  <div className="score-circle">
                    {session.qa_skipped ? (
                      <div className="score-ring-skipped" aria-label={t('report.score.skippedAria')}>
                        <span className="score-ring-skipped-label">—</span>
                        <span className="score-ring-skipped-sub">{t('report.score.skippedLabel')}</span>
                      </div>
                    ) : (
                      <ScoreRing value={session.report.qa_score} colorVar="var(--green)" />
                    )}
                    <div className="circle-label">
                      {t('report.score.qa1')}
                      <br />
                      {t('report.score.qa2')}
                    </div>
                  </div>
                  <div className="score-circle">
                    <ScoreRing value={session.report.composite_score} colorVar="var(--amber)" />
                    <div className="circle-label">
                      {t('report.score.overall1')}
                      <br />
                      {t('report.score.overall2')}
                    </div>
                  </div>
                </div>

                <ReportPentagonCard session={session} />

                <section className="report-session-signals" aria-label={t('report.session.detailTitle')}>
                  <div className="report-session-signals-head">
                    <div className="report-section-title">{t('report.session.detailTitle')}</div>
                    <p className="report-signals-lead">
                      {t('report.session.detailLead')}
                    </p>
                  </div>
                  <div
                    className={
                      session.speech_coaching.volume_samples.length >= 2 ||
                      session.speech_coaching.word_emphasis_log.length > 0
                        ? 'report-session-signals__grid'
                        : 'report-session-signals__grid report-session-signals__grid--transcript-only'
                    }
                  >
                    {(session.speech_coaching.volume_samples.length >= 2 ||
                      session.speech_coaching.word_emphasis_log.length > 0) && (
                      <div className="report-session-signals__col report-session-signals__col--charts">
                        {session.speech_coaching.volume_samples.length >= 2 && (
                          <div className="report-signal-block">
                            <div className="report-subhead">{t('report.session.voiceTimeline')}</div>
                            <p className="report-micro-lead">
                              {t('report.session.voiceTimelineLead')}
                            </p>
                            <VolumeTimelineChart
                              samples={session.speech_coaching.volume_samples}
                              sessionStartedAt={session.started_at}
                              totalDurationSec={session.speech_coaching.total_duration_sec}
                              coachingMarkers={volumeCoachingMarkers}
                            />
                          </div>
                        )}
                        {session.speech_coaching.word_emphasis_log.length > 0 && (
                          <div className="report-signal-block">
                            <div className="report-subhead">{t('report.session.wordEmphasis')}</div>
                            <p className="report-micro-lead">{t('report.session.wordEmphasisLead')}</p>
                            <WordEmphasisSection log={session.speech_coaching.word_emphasis_log} />
                          </div>
                        )}
                      </div>
                    )}
                    <div className="report-session-signals__col report-session-signals__col--transcript">
                      <ReportTranscriptSection
                        transcriptLog={session.speech_coaching.transcript_log}
                        sessionStartedAt={session.started_at}
                        sessionId={session.session_id}
                        selectedPersona={selectedPersona}
                      />
                    </div>
                  </div>
                </section>

                {selectedPersona && session.report.persona_style_coaching && (
                  <>
                    <div className="report-section-title">{t('report.rewrites.title')}</div>
                    <p className="report-corrections-lead report-corrections-lead--tight">
                      {session.material.script_text.trim().length >= 20
                        ? t('report.rewrites.leadScript')
                        : t('report.rewrites.leadTranscript')}
                    </p>
                    {(session.report.persona_style_coaching.phrase_rewrites?.length ?? 0) > 0 ? (
                      <div className="report-rewrite-list report-rewrite-list--featured">
                        {session.report.persona_style_coaching.phrase_rewrites!.map((rw, i) => (
                          <div key={i} className="report-rewrite-card">
                            <div className="report-rewrite-label">{t('report.rewrites.from')}</div>
                            <p className="report-rewrite-from">{rw.from_session}</p>
                            <div className="report-rewrite-label report-rewrite-label-alt">{t('report.rewrites.to')}</div>
                            <p className="report-rewrite-to">{rw.persona_aligned_example}</p>
                            {rw.why && (
                              <>
                                <div className="report-rewrite-label report-rewrite-label-why">{t('report.rewrites.why')}</div>
                                <p className="report-rewrite-why">{rw.why}</p>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="report-corrections-empty">
                        {t('report.rewrites.empty')}
                      </div>
                    )}
                  </>
                )}

                <div className="report-section-title">{t('report.wentWell')}</div>
                <div className="insight-list insight-list--tight">
                  {session.report.strengths.map((s, i) => (
                    <div key={i} className="insight-item positive insight-item--tight">
                      <div className="insight-icon" aria-hidden="true">
                        ✓
                      </div>
                      <div className="insight-content">
                        <div className="insight-desc insight-desc--clamp">{s}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {session.report.persona_style_coaching && (
                  <details className="report-persona-pack">
                    <summary className="report-persona-pack-summary">{t('report.personaPackSummary')}</summary>
                    <div className="report-persona-panel report-persona-panel--in-details">
                      <p className="report-persona-alignment">{session.report.persona_style_coaching.style_alignment}</p>
                      <h4 className="report-persona-sub">{t('report.personaTryNext')}</h4>
                      <ul className="report-persona-practices">
                        {session.report.persona_style_coaching.delivery_practices.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  </details>
                )}

                <div className="report-section-title">{t('report.focus.title')}</div>
                <p className="report-micro-lead report-micro-lead--below-title">
                  {t('report.focus.lead')}
                </p>
                <div className="insight-list insight-list--coaching">
                  {(session.report.improvements as (ActionableFeedback | string)[]).map((item, i) => {
                    if (typeof item === 'string') {
                      return (
                        <div key={i} className="insight-item negative insight-item--tight">
                          <div className="insight-icon" aria-hidden="true">
                            !
                          </div>
                          <div className="insight-content">
                            <div className="insight-desc insight-desc--clamp">{item}</div>
                          </div>
                        </div>
                      );
                    }
                    const markers = item.time_markers;
                    return (
                      <details key={i} className="coaching-details-card">
                        <summary className="coaching-details-summary">
                          <span className="coaching-number">{i + 1}</span>
                          <span className="coaching-label">{item.label}</span>
                          {markers && markers.length > 0 && (
                            <span className="coaching-details-ts">
                              {markers.map((m, mi) => (
                                <span key={mi} className="coaching-ts-badge coaching-ts-badge--inline">
                                  <span className="ts-time">{m.time}</span>
                                  <span className="ts-event">{m.event}</span>
                                </span>
                              ))}
                            </span>
                          )}
                        </summary>
                        <div className="coaching-details-body">
                          <div className="coaching-section coaching-section--compact">
                            <div className="coaching-tag tag-situation">{t('report.coaching.context')}</div>
                            <p className="coaching-text coaching-text--compact">{item.situation}</p>
                          </div>
                          <div className="coaching-section coaching-section--compact">
                            <div className="coaching-tag tag-stop">{t('report.coaching.stop')}</div>
                            <p className="coaching-text coaching-text--compact">{item.stop_doing}</p>
                          </div>
                          <div className="coaching-section coaching-section--compact">
                            <div className="coaching-tag tag-start">{t('report.coaching.start')}</div>
                            <p className="coaching-text coaching-text--compact">{item.start_doing}</p>
                          </div>
                          <div className="coaching-section coaching-section--compact">
                            <div className="coaching-tag tag-impact">{t('report.coaching.impact')}</div>
                            <p className="coaching-text coaching-text--compact coaching-impact">{item.expected_impact}</p>
                          </div>
                        </div>
                      </details>
                    );
                  })}
                </div>
    </>
  );

  return (
    <div id="screen-qa" className="point-screen">
      <div className="qa-shell qa-shell--wizard">
        <QaTopBar
          sessionDone={done}
          onExportPdf={handleExportPdf}
          pdfExporting={pdfExporting}
        />

        <div className="qa-wizard-stage-wrap">
          <div className="qa-wizard-top-meta" aria-live="polite">
            <span className="qa-wizard-pill">{t('qa.wizard.wrapUp')}</span>
            <span className="qa-wizard-stepcount">{t('qa.wizard.stepOf', { step: wizardStep })}</span>
            <span className="qa-wizard-stepname">{wizardStepName}</span>
          </div>

          {showGenerating ? (
            <div className="qa-wizard-stage qa-wizard-stage--center">
              <div className="qa-generating-card">
                <div className="quiz-grading-spinner" aria-hidden />
                <p className="qa-generating-title">{generatingTitle}</p>
                <p className="qa-generating-sub">{busy || t('qa.generating.wait')}</p>
              </div>
            </div>
          ) : done ? (
            <div className="qa-wizard-stage qa-wizard-stage--report">
              <div ref={reportPdfRootRef} className="report-side report-side--wizard-solo report-side--pdf-root">
                <h2>{t('qa.report.title')}</h2>
                <div className="report-sub">{reportSubLine}</div>
                {reportScoresAndBody}
              </div>
            </div>
          ) : (
            <div className="qa-wizard-stage qa-wizard-stage--qa">
              <div className="qa-chat-side qa-chat-side--wizard-solo">
                <div className="qa-wizard-qa-toolbar">
                  <div className="qa-pressure-toggle" role="group" aria-label={t('qa.pressure.aria')}>
                    <span className="qa-pressure-label">{t('qa.pressure.label')}</span>
                    {(['standard', 'firm', 'intense'] as QaDifficultyLevel[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`qa-pressure-btn${qaDifficulty === d ? ' qa-pressure-btn--active' : ''}`}
                        onClick={() => setQaDifficulty(d)}
                        disabled={!!busy}
                      >
                        {d === 'standard' ? t('qa.pressure.standard') : d === 'firm' ? t('qa.pressure.firm') : t('qa.pressure.intense')}
                      </button>
                    ))}
                  </div>
                  {showQaPass && (
                    <button
                      type="button"
                      className="btn-sm qa-skip-report-btn"
                      onClick={() => void skipQaAndRunReport()}
                    >
                      {t('qa.skipToReport')}
                    </button>
                  )}
                </div>
                <div className="qac-header">
                  <div className="qac-title">{t('qa.chat.title')}</div>
                  <div className="qac-sub">
                    {t('qa.chat.sub', {
                      done: session.qa.exchanges.length,
                      total: session.qa.planned_rounds ?? 5,
                    })}
                  </div>
                  <div className="qac-lead-row">
                    <p className="qac-lead">
                      {t('qa.chat.lead', { total: session.qa.planned_rounds ?? 5 })}
                    </p>
                    {qaCurrentQuestion && !busy && (
                      <button
                        type="button"
                        className="btn-sm qa-hear-question-btn"
                        onClick={() => {
                          primeFeedbackAudio();
                          void speakCoachQuestion(qaCurrentQuestion, selectedPersona);
                        }}
                      >
                        {t('qa.hearQuestion')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="chat-messages">
                  <div className="msg ai">
                    <div className="msg-bubble">
                      {t('qa.msg.opening')}
                    </div>
                    <div className="msg-meta">{t('qa.msg.metaAi')}</div>
                  </div>
                  {session.qa.exchanges.map((ex) => (
                    <div key={ex.turn}>
                      <div className="msg ai">
                        <div className="msg-bubble">{ex.question}</div>
                        <div className="msg-meta">{t('qa.msg.metaAiTurn', { turn: ex.turn })}</div>
                      </div>
                      <div className="msg user">
                        <div className="msg-bubble">{ex.answer}</div>
                        <div className="msg-meta">{t('qa.msg.metaYou')}</div>
                      </div>
                    </div>
                  ))}
                  {!showGenerating &&
                    !busy &&
                    qaCurrentQuestion &&
                    session.qa.exchanges.length < (session.qa.planned_rounds ?? 5) &&
                    session.qa.exchanges.at(-1)?.question !== qaCurrentQuestion && (
                      <div className="msg ai">
                        <div className="msg-bubble">{qaCurrentQuestion}</div>
                        <div className="msg-meta">{t('qa.msg.metaAi')}</div>
                      </div>
                    )}
                  {busy && !showGenerating && (
                    <div className="msg ai">
                      <div className="msg-bubble">
                        <div className="ai-typing">
                          <div className="typing-dot" />
                          <div className="typing-dot" />
                          <div className="typing-dot" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="chat-input-area voice-input-area">
                  {textFallback ? (
                    <>
                      <div className="text-input-row">
                        <textarea
                          className="chat-input"
                          placeholder={t('qa.input.placeholderText')}
                          rows={2}
                          value={textAnswer}
                          disabled={!qaCurrentQuestion || !!busy}
                          onChange={(e) => setTextAnswer(e.target.value)}
                          onKeyDown={onKeyDown}
                        />
                        <div className="text-input-side-actions">
                          {showQaPass && (
                            <button
                              type="button"
                              className="btn-sm qa-input-skip-btn"
                              title={t('qa.passTitle')}
                              onClick={() => void skipQaAndRunReport()}
                            >
                              {t('qa.pass')}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-send"
                            disabled={!textAnswer.trim() || !qaCurrentQuestion || !!busy}
                            onClick={onSend}
                            aria-label={t('qa.input.sendAria')}
                          >
                            {t('qa.input.send')}
                          </button>
                        </div>
                      </div>
                      <button type="button" className="voice-mode-toggle" onClick={() => setTextFallback(false)}>
                        {t('qa.input.switchVoice')}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="voice-transcript-box">
                        {transcript ? (
                          <span className="voice-transcript-text">{transcript}</span>
                        ) : (
                          <span className="voice-placeholder">
                            {listening
                              ? t('qa.input.recording')
                              : transcribing
                                ? t('qa.input.transcribing')
                                : t('qa.input.voicePlaceholder')}
                          </span>
                        )}
                        {listening && <span className="voice-pulse" />}
                        {transcribing && <span className="voice-spinner" />}
                      </div>
                      {sttError && (
                        <div className="voice-error">
                          {sttError}
                          <button type="button" className="voice-fallback-btn" onClick={() => setTextFallback(true)}>
                            {t('qa.input.switchText')}
                          </button>
                        </div>
                      )}
                      <div className="voice-actions">
                        <button
                          type="button"
                          className={`btn-mic${listening ? ' recording' : ''}`}
                          disabled={!qaCurrentQuestion || !!busy || transcribing}
                          onClick={toggleMic}
                          aria-label={listening ? t('qa.input.micStopAria') : t('qa.input.micVoiceAria')}
                        >
                          {listening ? '⏹' : transcribing ? '...' : '🎙'}
                        </button>
                        {showQaPass && (
                          <button
                            type="button"
                            className="btn-sm qa-input-skip-btn"
                            title={t('qa.passTitle')}
                            onClick={() => void skipQaAndRunReport()}
                          >
                            {t('qa.pass')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-send voice-send-btn"
                          disabled={!transcript.trim() || !qaCurrentQuestion || !!busy || transcribing}
                          onClick={onSend}
                          aria-label={t('qa.input.sendAria')}
                        >
                          {t('qa.input.send')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
