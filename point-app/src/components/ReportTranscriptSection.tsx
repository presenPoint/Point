import { useMemo, useState } from 'react';
import type { TranscriptEntry } from '../types/session';
import type { PersonaType } from '../store/sessionStore';
import { PERSONAS } from '../constants/personas';
import { transcriptPlain, transcriptWithTimestamps, downloadTextFile } from '../lib/transcriptScript';
import { hasOpenAI } from '../lib/openai';
import { suggestTranscriptPolish, type TranscriptPolishPair } from '../agents/transcriptPolishAgent';

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
  const [polishPairs, setPolishPairs] = useState<TranscriptPolishPair[] | null>(null);
  const [polishBusy, setPolishBusy] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);

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
      });
      if (pairs === null) {
        setPolishError('Could not generate suggestions. Check your API key.');
      } else if (pairs.length === 0) {
        setPolishError('Not enough transcript to analyze.');
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
        <div className="report-section-title">Speech transcript</div>
        <div className="report-transcript-empty">
          No speech transcript was captured this session. Use a supported browser with microphone access during the live
          presentation.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="report-section-title">Speech transcript</div>
      <p className="report-transcript-lead">
        Everything you said (as captured by live recognition). Download for notes or rehearsal.
      </p>

      <div className="report-transcript-toolbar">
        <button type="button" className="btn-transcript" onClick={() => onDownload(false)}>
          Download (.txt, plain)
        </button>
        <button type="button" className="btn-transcript" onClick={() => onDownload(true)}>
          Download (.txt, with timestamps)
        </button>
        <button type="button" className="btn-transcript btn-transcript-secondary" onClick={() => void onCopy()}>
          Copy to clipboard
        </button>
      </div>

      <pre className="report-transcript-pre" tabIndex={0}>
        {stamped}
      </pre>

      <div className="report-transcript-polish">
        <h4 className="report-transcript-polish-title">Say it this way</h4>
        <p className="report-transcript-polish-desc">
          AI picks a handful of lines from your script and suggests tighter, more speakable wording
          {selectedPersona ? (
            <>
              {' '}
              in the <strong>{PERSONAS[selectedPersona].name}</strong> style.
            </>
          ) : (
            '.'
          )}{' '}
          Uses your configured OpenAI API key.
        </p>
        <button
          type="button"
          className="btn-transcript btn-transcript-primary"
          disabled={!canPolish || polishBusy}
          onClick={() => void onPolish()}
        >
          {polishBusy ? 'Generating…' : 'Generate line suggestions'}
        </button>
        {!hasOpenAI() && (
          <p className="report-transcript-polish-warn">Set <code>VITE_OPENAI_API_KEY</code> to enable this.</p>
        )}
        {polishError && <p className="report-transcript-polish-error">{polishError}</p>}
        {polishPairs && polishPairs.length > 0 && (
          <div className="report-polish-list">
            {polishPairs.map((row, i) => (
              <div key={i} className="report-polish-row">
                <div className="report-polish-label">You said</div>
                <p className="report-polish-original">{row.original}</p>
                <div className="report-polish-label report-polish-label-alt">Try instead</div>
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
