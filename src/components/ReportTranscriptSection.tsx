import { useEffect, useMemo, useState } from 'react';
import type { TranscriptEntry } from '../types/session';
import type { PersonaType } from '../store/sessionStore';
import { PERSONAS } from '../constants/personas';
import { transcriptPlain, downloadTextFile } from '../lib/transcriptScript';
import { hasOpenAI } from '../lib/openai';
import { suggestTranscriptPolish, type TranscriptPolishPair } from '../agents/transcriptPolishAgent';
import { primeFeedbackAudio } from '../lib/feedbackTts';
import { speakCoachQuestion, speakTranscriptSnippetNeutral, stopCoachQuestionSpeech } from '../lib/coachQuestionTts';
import { useT } from '../hooks/useT';
import { useEffectiveLocale } from '../hooks/useEffectiveLocale';
import { EditableBlock, EditableSectionToolbar } from './EditableBlock';
import { useEditableContent } from '../hooks/useEditableContent';

type Props = {
  transcriptLog: TranscriptEntry[];
  sessionStartedAt: string;
  sessionId: string;
  selectedPersona: PersonaType | null;
};

function tsLabel(sessionStartedAt: string, entryTimestamp: number): string {
  const base = new Date(sessionStartedAt).getTime();
  const diff = Math.max(0, Math.floor((entryTimestamp - base) / 1000));
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

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

  // Editing mode: 'view' | 'entries' (per-entry) | 'bulk' (one big textarea)
  const [editMode, setEditMode] = useState<'view' | 'entries' | 'bulk'>('view');
  const [bulkDraft, setBulkDraft] = useState('');

  // Per-entry edit state, keyed by array index
  const editableEntries = useEditableContent<number>('ai');

  useEffect(() => () => stopCoachQuestionSpeech(), []);

  const plain = useMemo(() => transcriptPlain(transcriptLog), [transcriptLog]);

  // Derive the current text for each entry (edited or original)
  const resolvedEntries = useMemo(
    () => transcriptLog.map((entry, i) => editableEntries.get(i, entry.text)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transcriptLog, editableEntries.get],
  );

  const hasAnyEdits = resolvedEntries.some((e) => e.source !== 'ai');

  const shortId = sessionId.replace(/-/g, '').slice(0, 10);
  const canPolish = hasOpenAI() && plain.length >= 60;

  // Edited plain text (for download/copy)
  const editedPlain = useMemo(
    () => resolvedEntries.map((e) => e.current).join(' '),
    [resolvedEntries],
  );
  const editedStamped = useMemo(
    () =>
      transcriptLog
        .map((entry, i) => {
          const ts = tsLabel(sessionStartedAt, entry.timestamp);
          return `[${ts}] ${resolvedEntries[i].current}`;
        })
        .join('\n'),
    [transcriptLog, sessionStartedAt, resolvedEntries],
  );

  const onDownload = (withTs: boolean) => {
    const body = withTs ? editedStamped : editedPlain;
    const suffix = withTs ? 'timed' : 'plain';
    downloadTextFile(`point-transcript-${suffix}-${shortId}.txt`, body);
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedStamped);
    } catch {
      await navigator.clipboard.writeText(editedPlain);
    }
  };

  const onPolish = async () => {
    setPolishError(null);
    setPolishBusy(true);
    setPolishPairs(null);
    try {
      const persona = selectedPersona ? PERSONAS[selectedPersona] : null;
      const pairs = await suggestTranscriptPolish(editedPlain, {
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

  const enterBulkEdit = () => {
    setBulkDraft(editedPlain);
    setEditMode('bulk');
  };

  const saveBulkEdit = () => {
    // Split by sentence boundaries and map back to entries as best we can
    const lines = bulkDraft.trim().split(/\n+/);
    lines.forEach((line, i) => {
      if (i < transcriptLog.length && line.trim() !== transcriptLog[i].text) {
        editableEntries.save(i, line.trim());
      }
    });
    setEditMode('view');
  };

  const revertAll = () => {
    transcriptLog.forEach((_, i) => editableEntries.revert(i, transcriptLog[i].text));
    setEditMode('view');
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
      <p className="report-transcript-lead">
        {t('report.transcript.lead')}
        {hasAnyEdits && ' Edits are reflected in downloads.'}
      </p>

      {/* ── Toolbar ── */}
      <EditableSectionToolbar
        label="Transcript"
        onEditAll={() => setEditMode(editMode === 'entries' ? 'view' : 'entries')}
        onRewriteAll={undefined}
        hasEdits={hasAnyEdits}
        onRevertAll={revertAll}
      />

      {/* ── Download / copy row ── */}
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
        <button
          type="button"
          className="btn-transcript btn-transcript-secondary"
          onClick={editMode === 'bulk' ? () => setEditMode('view') : enterBulkEdit}
        >
          {editMode === 'bulk' ? '✕ Cancel bulk edit' : '✎ Edit entire text'}
        </button>
      </div>

      {/* ── Bulk edit ── */}
      {editMode === 'bulk' && (
        <>
          <textarea
            className="eb-bulk-edit"
            value={bulkDraft}
            onChange={(e) => setBulkDraft(e.target.value)}
            placeholder="Full transcript text…"
          />
          <div className="eb-bulk-actions">
            <button
              type="button"
              className="eb-btn eb-btn--cancel"
              onClick={() => setEditMode('view')}
            >
              Cancel
            </button>
            <button
              type="button"
              className="eb-btn eb-btn--save"
              onClick={saveBulkEdit}
            >
              Save all changes
            </button>
          </div>
        </>
      )}

      {/* ── Per-entry editable list ── */}
      {editMode === 'entries' && (
        <div className="eb-transcript-list">
          {transcriptLog.map((entry, i) => {
            const e = resolvedEntries[i];
            return (
              <div key={entry.timestamp} className="eb-transcript-entry">
                <span className="eb-transcript-ts">{tsLabel(sessionStartedAt, entry.timestamp)}</span>
                <EditableBlock
                  content={e.current}
                  source={e.source}
                  label={`Entry ${i + 1}`}
                  multiline={false}
                  onSave={(t) => editableEntries.save(i, t)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Read-only view ── */}
      {editMode === 'view' && (
        <pre className="report-transcript-pre" tabIndex={0}>
          {editedStamped}
        </pre>
      )}

      {/* ── Polish suggestions ── */}
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
