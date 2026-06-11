/**
 * ScriptUploadPanel — optional presentation script.
 *
 * Modes:
 *   1. Upload File  — .txt / .md / .pdf / .docx (drag & drop or click)
 *   2. Type / Paste — textarea for direct input
 *
 * After the script is loaded the panel triggers embedScript() automatically,
 * which chunks the text, generates OpenAI embeddings and stores them for RAG.
 *
 * Max file size: 2 MB (scripts rarely exceed a few hundred KB).
 */
import { useEffect, useRef, useState } from 'react';
import { extractTextFromDocx, extractTextFromPdf } from '../lib/extractDocumentText';
import { useSessionStore } from '../store/sessionStore';
import type { ScriptEmbeddingStatus } from '../types/session';
import { useT } from '../hooks/useT';
import type { MessageKey } from '../locales/messages';
import { generatePresentationScript } from '../lib/generatePresentationScript';

type InputMode = 'upload' | 'type' | 'generate';

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_EXTS   = ['.txt', '.md', '.pdf', '.docx'];
const ALLOWED_ACCEPT =
  '.txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function extractScriptText(file: File): Promise<string> {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (ext === '.txt' || ext === '.md') {
    return new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res(r.result as string);
      r.onerror = () => rej(new Error('read error'));
      r.readAsText(file, 'utf-8');
    });
  }
  const buf = await file.arrayBuffer();
  if (ext === '.pdf')  return extractTextFromPdf(buf);
  if (ext === '.docx') return extractTextFromDocx(buf);
  throw new Error('Unsupported format');
}

// ── Embedding status badge ──────────────────────────────────────────────────
function EmbedBadge({ status, chunkCount }: { status: ScriptEmbeddingStatus; chunkCount: number }) {
  const t = useT();
  if (status === 'idle') return null;
  if (status === 'processing') {
    return <span className="sup-embed-badge processing">⚙ {t('prepare.scriptPanel.embed.processing')}</span>;
  }
  if (status === 'error') {
    return <span className="sup-embed-badge error">⚠ {t('prepare.scriptPanel.embed.error')}</span>;
  }
  return (
    <span className="sup-embed-badge ready">
      ✦ {t('prepare.scriptPanel.embed.ready', { count: chunkCount })}
    </span>
  );
}

// ── Style analysis card ─────────────────────────────────────────────────────
function StyleCard() {
  const t = useT();
  const style = useSessionStore((s) => s.session.material.script_style);
  if (!style) return null;
  return (
    <div className="sup-style-card">
      <div className="sup-style-header">
        <span className="sup-style-title">{t('prepare.scriptPanel.styleTitle')}</span>
        <span className="sup-style-meta">
          {t('prepare.scriptPanel.styleMeta', {
            tone: style.tone,
            complexity: style.complexity,
            minutes: style.estimatedMinutes,
          })}
        </span>
      </div>
      {style.keyPhrases.length > 0 && (
        <div className="sup-style-phrases">
          {style.keyPhrases.map((p) => (
            <span key={p} className="sup-style-pill">{p}</span>
          ))}
        </div>
      )}
      {style.deliverySuggestions.length > 0 && (
        <ul className="sup-style-suggestions">
          {style.deliverySuggestions.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function ScriptUploadPanel() {
  const t = useT();
  const setScriptText  = useSessionStore((s) => s.setScriptText);
  const embedScript    = useSessionStore((s) => s.embedScript);
  const scriptText     = useSessionStore((s) => s.session.material.script_text);
  const embedStatus    = useSessionStore((s) => s.session.material.script_embedding_status);
  const chunkCount     = useSessionStore((s) => s.session.material.script_chunk_count);

  const [mode, setMode]       = useState<InputMode>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [preview, setPreview]   = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [draft, setDraft]       = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // AI Generate state
  const [genTopic, setGenTopic]     = useState('');
  const [genDuration, setGenDuration] = useState<3 | 5 | 10>(5);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError]     = useState<string | null>(null);

  const hasScript = scriptText.trim().length > 0;

  // Auto-trigger embedding whenever script text changes to non-empty
  useEffect(() => {
    if (hasScript && embedStatus === 'idle') {
      void embedScript();
    }
  }, [hasScript, embedStatus, embedScript]);

  // ── file handler ───────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    // File size guard
    if (file.size > MAX_FILE_BYTES) {
      setErrorKey('prepare.scriptPanel.error.tooLarge');
      return;
    }
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      setErrorKey('prepare.scriptPanel.error.unsupported');
      return;
    }
    setErrorKey(null);
    setLoading(true);
    try {
      const text = await extractScriptText(file);
      if (text.trim().length < 10) {
        setErrorKey('prepare.scriptPanel.error.emptyFile');
        return;
      }
      setScriptText(text);
      setFileName(file.name);
    } catch {
      setErrorKey('prepare.scriptPanel.error.readFail');
    } finally {
      setLoading(false);
    }
  };

  const onPick  = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  };
  const onDrop  = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  // ── type/paste confirm ────────────────────────────────────────────────────
  const confirmDraft = () => {
    if (draft.trim().length < 10) {
      setErrorKey('prepare.scriptPanel.error.tooShort');
      return;
    }
    setErrorKey(null);
    setScriptText(draft.trim());
    setFileName(null);
  };

  // ── remove ────────────────────────────────────────────────────────────────
  const remove = () => {
    setScriptText('');
    setFileName(null);
    setPreview(false);
    setErrorKey(null);
    setDraft('');
  };

  const switchMode = (m: InputMode) => {
    setMode(m);
    setErrorKey(null);
    setGenError(null);
  };

  const handleGenerate = async () => {
    if (!genTopic.trim()) { setGenError(t('prepare.scriptPanel.gen.topicRequired')); return; }
    setGenError(null);
    setGenLoading(true);
    try {
      const text = await generatePresentationScript(genTopic.trim(), genDuration);
      setScriptText(text);
      setFileName(null);
    } catch {
      setGenError(t('prepare.scriptPanel.gen.error'));
    } finally {
      setGenLoading(false);
    }
  };

  return (
    <div className="script-upload-panel">
      {/* Header */}
      <div className="sup-header">
        <span className="sup-title">📄 {t('prepare.scriptPanel.title')}</span>
        <span className="sup-badge">{t('prepare.scriptPanel.optional')}</span>
        {hasScript && <EmbedBadge status={embedStatus} chunkCount={chunkCount} />}
      </div>
      <p className="sup-desc">{t('prepare.scriptPanel.desc')}</p>

      {/* Mode tabs — only shown when no script loaded */}
      {!hasScript && (
        <div className="sup-mode-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'upload'}
            className={`sup-mode-tab${mode === 'upload' ? ' sup-tab-active' : ''}`}
            onClick={() => switchMode('upload')}>
            📁 {t('prepare.scriptPanel.tabUpload')}
          </button>
          <button type="button" role="tab" aria-selected={mode === 'type'}
            className={`sup-mode-tab${mode === 'type' ? ' sup-tab-active' : ''}`}
            onClick={() => switchMode('type')}>
            ✍️ {t('prepare.scriptPanel.tabType')}
          </button>
          <button type="button" role="tab" aria-selected={mode === 'generate'}
            className={`sup-mode-tab sup-mode-tab--ai${mode === 'generate' ? ' sup-tab-active' : ''}`}
            onClick={() => switchMode('generate')}>
            {t('prepare.scriptPanel.tabGenerate')}
          </button>
        </div>
      )}

      {/* ── Content area ───────────────────────────────────────────────────── */}
      {hasScript ? (
        <div className="sup-loaded">
          <div className="sup-file-row">
            <span className="sup-file-icon" aria-hidden="true">📝</span>
            <div className="sup-file-info">
              <span className="sup-file-name">{fileName ?? t('prepare.scriptPanel.entered')}</span>
              <span className="sup-file-chars">
                {t('prepare.scriptPanel.chars', { count: scriptText.length.toLocaleString() })}
              </span>
            </div>
            <div className="sup-file-actions">
              <button type="button" className="sup-btn-preview"
                onClick={() => setPreview((p) => !p)} aria-expanded={preview}>
                {preview ? t('prepare.scriptPanel.hide') : t('prepare.scriptPanel.preview')}
              </button>
              <button
                type="button"
                className="sup-btn-remove"
                onClick={remove}
                aria-label={t('prepare.scriptPanel.removeAria')}
              >
                ✕ {t('prepare.scriptPanel.remove')}
              </button>
            </div>
          </div>

          {preview && (
            <pre className="sup-preview-text" aria-label={t('prepare.scriptPanel.preview')}>
              {scriptText.slice(0, 600)}
              {scriptText.length > 600 && `\n\n${t('prepare.scriptPanel.truncated')}`}
            </pre>
          )}

          <StyleCard />

          <p className="sup-penalty-notice">⚠ {t('prepare.scriptPanel.penalty')}</p>
        </div>

      ) : mode === 'generate' ? (
        <div className="sup-gen-area">
          <p className="sup-gen-hint">{t('prepare.scriptPanel.gen.hint')}</p>
          <label className="sup-gen-label" htmlFor="sup-gen-topic">
            {t('prepare.scriptPanel.gen.topicLabel')}
          </label>
          <input
            id="sup-gen-topic"
            type="text"
            className="sup-gen-input"
            placeholder={t('prepare.scriptPanel.gen.topicPlaceholder')}
            value={genTopic}
            onChange={(e) => setGenTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleGenerate(); }}
            disabled={genLoading}
          />
          <div className="sup-gen-duration-row">
            <span className="sup-gen-label">{t('prepare.scriptPanel.gen.durationLabel')}</span>
            <div className="sup-gen-duration-btns">
              {([3, 5, 10] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`sup-gen-dur-btn${genDuration === d ? ' active' : ''}`}
                  onClick={() => setGenDuration(d)}
                  disabled={genLoading}
                >
                  {t(`prepare.scriptPanel.gen.duration${d}` as Parameters<typeof t>[0])}
                </button>
              ))}
            </div>
          </div>
          {genError && <p className="sup-error" role="alert">{genError}</p>}
          <button
            type="button"
            className="sup-btn-generate"
            disabled={genLoading || !genTopic.trim()}
            onClick={() => void handleGenerate()}
          >
            {genLoading
              ? t('prepare.scriptPanel.gen.generating')
              : t('prepare.scriptPanel.gen.cta')}
          </button>
        </div>

      ) : mode === 'upload' ? (
        <>
          <div
            className={`sup-dropzone${loading ? ' sup-loading' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => !loading && inputRef.current?.click()}
            role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
            aria-label={t('prepare.scriptPanel.uploadAria')}
          >
            {loading ? (
              <span className="sup-spinner" aria-hidden="true" />
            ) : (
              <>
                <span className="sup-drop-icon" aria-hidden="true">📁</span>
                <span className="sup-drop-hint">{t('prepare.scriptPanel.dropHint')}</span>
                <span className="sup-drop-formats">{t('prepare.scriptPanel.formats')}</span>
                <span className="sup-drop-limit">{t('prepare.scriptPanel.maxSize')}</span>
              </>
            )}
          </div>
          <input ref={inputRef} type="file" accept={ALLOWED_ACCEPT}
            className="fs-hidden-input" onChange={onPick} />
        </>

      ) : (
        <div className="sup-type-area">
          <textarea
            className="sup-textarea"
            placeholder={t('prepare.scriptPanel.typePlaceholder')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            aria-label={t('prepare.scriptPanel.typeAria')}
          />
          <div className="sup-type-footer">
            <span className="sup-type-count">
              {t('prepare.scriptPanel.chars', { count: draft.length.toLocaleString() })}
            </span>
            <button
              type="button" className="sup-btn-confirm"
              onClick={confirmDraft}
              disabled={draft.trim().length < 10}
            >
              {t('prepare.scriptPanel.save')}
            </button>
          </div>
        </div>
      )}

      {errorKey && <p className="sup-error" role="alert">{t(errorKey)}</p>}
    </div>
  );
}
