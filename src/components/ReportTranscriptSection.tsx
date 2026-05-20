import { useEffect, useMemo, useState } from 'react';
import type { TranscriptEntry } from '../types/session';
import type { PersonaType } from '../store/sessionStore';
import { PERSONAS } from '../constants/personas';
import { transcriptPlain, transcriptWithTimestamps, downloadTextFile } from '../lib/transcriptScript';
import { hasOpenAI } from '../lib/openai';
import { suggestTranscriptPolish, type TranscriptPolishPair } from '../agents/transcriptPolishAgent';
import { primeFeedbackAudio } from '../lib/feedbackTts';
import { speakCoachQuestion, speakTranscriptSnippetNeutral, stopCoachQuestionSpeech } from '../lib/coachQuestionTts';
import { useT } from '../hooks/useT';
import { useEffectiveLocale } from '../hooks/useEffectiveLocale';

type Props = {
  transcriptLog: TranscriptEntry[];
  sessionStartedAt: string;
  sessionId: string;
  selectedPersona: PersonaType | null;
};

export function ReportTranscriptSection({
  transcriptLog,
  sessionStartedAt,
  sessionId,
  selectedPersona,
}: Props) {
  const t = useT();
  const locale = useEffectiveLocale();
  const [polishPairs, setPolishPairs] = useState<TranscriptPolishPair[] | null>(null);
  const [polishBusy, setPolishBusy] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);
  const [polishAudioKey, setPolishAudioKey] = useState<string | null>(null);

  useEffect(() => () => stopCoachQuestionSpeech(), []);

  const plain = useMemo(() => transcriptPlain(transcriptLog), [transcriptLog]);
  const stamped = useMemo(
    () => transcriptWithTimestamps(transcriptLog, sessionStartedAt),
    [transcriptLog, sessionStartedAt],
  );

  const shortId = sessionId.replace(/-/g, '').slice(0, 10);
  const canPolish = hasOpenAI() && plain.length >= 60;

  const onDownload = (withTs: boolean) => {
    const body = withTs ? stamped : plain;
    const suffix = withTs ? 'timed' : 'plain';
    downloadTextFile(`point-transcript-${suffix}-${shortId}.txt`, body);
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(stamped);
    } catch {
      await navigator.clipboard.writeText(plain);
    }
  };

  const onPolish = async () => {
    setPolishError(null);
    setPolishBusy(true);
    setPolishPairs(null);
    try {
      const persona = selectedPersona ? PERSONAS[selectedPersona] : null;
      const pairs = await suggestTranscriptPolish(plain, {
        coachName: persona?.name ?? 'Generic coach',
        personaSystemPrompt: persona?.systemPrompt,
        locale,
      });
      if (pairs === null) {
        setPolishError(t('report.transcript.polishErrorApi'));
      } else if (pairs.length === 0) {
        setPolishError(t('report.transcript.polishErrorShort'));
      } else {
        setPolishPairs(pairs);
      }
    } catch (e) {
      setPolishError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setPolishBusy(false);
    }
  };

  if (transcriptLog.length === 0) {
    return (
      <>
        <div className="report-section-title">{t('report.transcript.title')}</div>
        <div className="report-transcript-empty">{t('report.transcript.empty')}</div>
      </>
    );
  }

  const personaName = selectedPersona ? PERSONAS[selectedPersona].name : null;

  return (
    <>
      <div className="report-section-title">{t('report.transcript.title')}</div>
      <p className="report-transcript-lead">{t('report.transcript.lead')}</p>

      <div className="report-transcript-toolbar">
        <button type="button" className="btn-transcript" onClick={() => onDownload(false)}>
          {t('report.transcript.downloadPlain')}
        </button>
        <button type="button" className="btn-transcript" onClick={() => onDownload(true)}>
          {t('report.transcript.downloadTimed')}
        </button>
        <button type="button" className="btn-transcript btn-transcript-secondary" onClick={() => void onCopy()}>
          {t('report.transcript.copy')}
        </button>
      </div>

      <pre className="report-transcript-pre" tabIndex={0}>
        {stamped}
      </pre>

      <div className="report-transcript-polish">
        <h4 className="report-transcript-polish-title">{t('report.transcript.polishTitle')}</h4>
        <p className="report-transcript-polish-desc">
          {t('report.transcript.polishDesc')}
          {personaName ? t('report.transcript.polishDescPersona', { name: personaName }) : '.'}
          {t('report.transcript.polishDescAfter')}
        </p>
        <div className="report-transcript-polish-actions">
          <button
            type="button"
            className="btn-transcript btn-transcript-primary"
            disabled={!canPolish || polishBusy}
            onClick={() => void onPolish()}
          >
            {polishBusy ? t('report.transcript.polishGenerating') : t('report.transcript.polishGenerate')}
          </button>
        </div>
        {!hasOpenAI() && (
          <p className="report-transcript-polish-warn">{t('report.transcript.polishWarn')}</p>
        )}
        {polishError && <p className="report-transcript-polish-error">{polishError}</p>}
        {polishPairs && polishPairs.length > 0 && (
          <div className="report-polish-list">
            {polishPairs.map((row, i) => (
              <div key={i} className="report-polish-row">
                <div className="report-polish-audio">
                  <button
                    type="button"
                    className="btn-report-polish-audio"
                    disabled={!!polishAudioKey || !row.original.trim()}
                    onClick={() => {
                      primeFeedbackAudio();
                      setPolishAudioKey(`you:${i}`);
                      void speakTranscriptSnippetNeutral(row.original).finally(() => setPolishAudioKey(null));
                    }}
                  >
                    {polishAudioKey === `you:${i}`
                      ? t('report.transcript.polishPlaying')
                      : t('report.transcript.polishHearYou')}
                  </button>
                  <button
                    type="button"
                    className="btn-report-polish-audio btn-report-polish-audio--coach"
                    disabled={!!polishAudioKey || !row.improved.trim()}
                    onClick={() => {
                      primeFeedbackAudio();
                      setPolishAudioKey(`coach:${i}`);
                      void speakCoachQuestion(row.improved, selectedPersona).finally(() =>
                        setPolishAudioKey(null),
                      );
                    }}
                  >
                    {polishAudioKey === `coach:${i}`
                      ? t('report.transcript.polishPlaying')
                      : t('report.transcript.polishHearCoach')}
                  </button>
                </div>
                <div className="report-polish-label">{t('report.transcript.polishYouSaid')}</div>
                <p className="report-polish-original">{row.original}</p>
                <div className="report-polish-label report-polish-label-alt">
                  {t('report.transcript.polishTryInstead')}
                </div>
                <p className="report-polish-improved">{row.improved}</p>
                {row.note && <p className="report-polish-note">{row.note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
