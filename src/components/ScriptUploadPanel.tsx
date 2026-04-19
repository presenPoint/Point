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

type InputMode = 'upload' | 'type';

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
  if (status === 'idle')       return null;
  if (status === 'processing') return <span className="sup-embed-badge processing">⚙ Indexing…</span>;
  if (status === 'error')      return <span className="sup-embed-badge error">⚠ Index failed</span>;
  return (
    <span className="sup-embed-badge ready" title={`${chunkCount} chunks indexed for RAG`}>
      ✦ RAG ready · {chunkCount} chunks
    </span>
  );
}

// ── Style analysis card ─────────────────────────────────────────────────────
function StyleCard() {
  const style = useSessionStore((s) => s.session.material.script_style);
  if (!style) return null;
  return (
    <div className="sup-style-card">
      <div className="sup-style-header">
        <span className="sup-style-title">Script Style Analysis</span>
        <span className="sup-style-meta">
          {style.tone} · {style.complexity} complexity · ~{style.estimatedMinutes} min
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
  const setScriptText  = useSessionStore((s) => s.setScriptText);
  const embedScript    = useSessionStore((s) => s.embedScript);
  const scriptText     = useSessionStore((s) => s.session.material.script_text);
  const embedStatus    = useSessionStore((s) => s.session.material.script_embedding_status);
  const chunkCount     = useSessionStore((s) => s.session.material.script_chunk_count);

  const [mode, setMode]       = useState<InputMode>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [preview, setPreview]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [draft, setDraft]       = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
      setError(`File too large (max 2 MB). Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
      return;
    }
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      setError(`Only ${ALLOWED_EXTS.join(', ')} files are supported.`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const text = await extractScriptText(file);
      if (text.trim().length < 10) {
        setError('The file appears to have no readable text. Please check the file and try again.');
        return;
      }
      setScriptText(text);
      setFileName(file.name);
    } catch {
      setError('Could not read the file. Please try again.');
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
      setError('Please enter at least a few sentences of script text.');
      return;
    }
    setError(null);
    setScriptText(draft.trim());
    setFileName(null);
  };

  // ── remove ────────────────────────────────────────────────────────────────
  const remove = () => {
    setScriptText('');
    setFileName(null);
    setPreview(false);
    setError(null);
    setDraft('');
  };

  const switchMode = (m: InputMode) => { setMode(m); setError(null); };

  return (
    <div className="script-upload-panel">
      {/* Header */}
      <div className="sup-header">
        <span className="sup-title">📄 Presentation Script</span>
        <span className="sup-badge">Optional</span>
        {hasScript && <EmbedBadge status={embedStatus} chunkCount={chunkCount} />}
      </div>
      <p className="sup-desc">
        Add your script or speaker notes — AI will use it for smarter on-topic detection,
        script-aligned Q&A, and coverage tracking. Opening it as an overlay too often will
        deduct points after the first 2 views.
      </p>

      {/* Mode tabs — only shown when no script loaded */}
      {!hasScript && (
        <div className="sup-mode-tabs" role="tablist">
          <button
            type="button" role="tab"
            aria-selected={mode === 'upload'}
            className={`sup-mode-tab${mode === 'upload' ? ' sup-tab-active' : ''}`}
            onClick={() => switchMode('upload')}
          >
            📁 Upload File
          </button>
          <button
            type="button" role="tab"
            aria-selected={mode === 'type'}
            className={`sup-mode-tab${mode === 'type' ? ' sup-tab-active' : ''}`}
            onClick={() => switchMode('type')}
          >
            ✍️ Type / Paste
          </button>
        </div>
      )}

      {/* ── Content area ───────────────────────────────────────────────────── */}
      {hasScript ? (
        <div className="sup-loaded">
          <div className="sup-file-row">
            <span className="sup-file-icon" aria-hidden="true">📝</span>
            <div className="sup-file-info">
              <span className="sup-file-name">{fileName ?? 'Script entered'}</span>
              <span className="sup-file-chars">{scriptText.length.toLocaleString()} characters</span>
            </div>
            <div className="sup-file-actions">
              <button type="button" className="sup-btn-preview"
                onClick={() => setPreview((p) => !p)} aria-expanded={preview}>
                {preview ? 'Hide' : 'Preview'}
              </button>
              <button type="button" className="sup-btn-remove"
                onClick={remove} aria-label="Remove script">
                ✕ Remove
              </button>
            </div>
          </div>

          {preview && (
            <pre className="sup-preview-text" aria-label="Script preview">
              {scriptText.slice(0, 600)}
              {scriptText.length > 600 && '\n\n… (truncated)'}
            </pre>
          )}

          <StyleCard />

          <p className="sup-penalty-notice">
            ⚠ Opening the script overlay during your presentation will deduct points
            after the first 2 views.
          </p>
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
            aria-label="Upload script file"
          >
            {loading ? (
              <span className="sup-spinner" aria-hidden="true" />
            ) : (
              <>
                <span className="sup-drop-icon" aria-hidden="true">📁</span>
                <span className="sup-drop-hint">Click or drag a file here</span>
                <span className="sup-drop-formats">.txt · .md · .pdf · .docx</span>
                <span className="sup-drop-limit">Max 2 MB</span>
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
            placeholder="Paste or type your script here…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            aria-label="Script text input"
          />
          <div className="sup-type-footer">
            <span className="sup-type-count">
              {draft.length.toLocaleString()} characters
            </span>
            <button
              type="button" className="sup-btn-confirm"
              onClick={confirmDraft}
              disabled={draft.trim().length < 10}
            >
              Save Script ✓
            </button>
          </div>
        </div>
      )}

      {error && <p className="sup-error" role="alert">{error}</p>}
    </div>
  );
}
