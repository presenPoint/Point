import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentSource } from '../hooks/useEditableContent';

type BlockMode = 'idle' | 'editing' | 'rewriting' | 'review';


export interface EditableBlockProps {
  content: string;
  onSave: (newText: string) => void;
  onRewrite?: (currentText: string) => Promise<string>;
  source?: ContentSource;
  label?: string;
  multiline?: boolean;
  /**
   * compact=true — chat-bubble mode.
   * Pencil icon in top-right corner. Editing uses contentEditable in-place
   * so the bubble never changes size.
   */
  compact?: boolean;
  className?: string;
}

const SOURCE_LABEL: Record<ContentSource, string> = {
  ai: 'AI',
  'user-edited': 'Edited',
  'ai-rewritten': 'AI rewritten',
};

export function EditableBlock({
  content,
  onSave,
  onRewrite,
  source = 'ai',
  label,
  multiline = true,
  compact = false,
  className = '',
}: EditableBlockProps) {
  const [mode, setMode] = useState<BlockMode>('idle');

  // Full-mode textarea draft
  const [draft, setDraft] = useState(content);
  const [proposed, setProposed] = useState('');
  const [rewriteError, setRewriteError] = useState('');

  // Full-mode floating bar state (document coords, position:absolute)
  const [fullBar, setFullBar] = useState<{ visible: boolean; top: number; centerX: number }>({
    visible: false, top: 0, centerX: 0,
  });

  // (compact selection underline removed)

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ceRef = useRef<HTMLDivElement>(null);
  const fullBarRef = useRef<HTMLDivElement>(null);

  // Sync textarea draft when content changes externally
  useEffect(() => {
    if (mode === 'idle') setDraft(content);
  }, [content, mode]);

  // Focus textarea (full mode) on edit entry
  useEffect(() => {
    if (mode === 'editing' && !compact && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [mode, compact]);

  // Initialize & focus contentEditable (compact mode) on edit entry
  useEffect(() => {
    if (mode !== 'editing' || !compact) return;
    const el = ceRef.current;
    if (!el) return;
    // Set plain text content
    el.textContent = content;
    el.focus();
    // Move cursor to end
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [mode, compact, content]);

  // ── Selection tracking ──────────────────────────────────────────────────────

  const updateSelection = useCallback(() => {
    if (compact || mode !== 'idle') return;
    const sel = window.getSelection();
    const container = containerRef.current;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !container) {
      setFullBar((p) => ({ ...p, visible: false }));
      return;
    }
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setFullBar((p) => ({ ...p, visible: false }));
      return;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0) { setFullBar((p) => ({ ...p, visible: false })); return; }
    setFullBar({
      visible: true,
      top: rect.top + window.scrollY - 44,
      centerX: rect.left + rect.width / 2 + window.scrollX,
    });
  }, [mode, compact]);

  useEffect(() => {
    document.addEventListener('selectionchange', updateSelection);
    return () => document.removeEventListener('selectionchange', updateSelection);
  }, [updateSelection]);

  // Dismiss full-mode bar on outside pointer-down
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        !fullBarRef.current?.contains(target) &&
        !containerRef.current?.contains(target)
      ) {
        setFullBar((p) => ({ ...p, visible: false }));
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const enterEdit = useCallback(() => {
    setDraft(content);
    setMode('editing');
    setFullBar((p) => ({ ...p, visible: false }));
  }, [content]);

  const cancelEdit = () => {
    setDraft(content);
    setMode('idle');
  };

  // Full-mode save
  const saveEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== content) onSave(trimmed);
    setMode('idle');
  };

  // Compact-mode save (reads from contentEditable)
  const saveCompact = useCallback(() => {
    const trimmed = (ceRef.current?.textContent ?? '').trim();
    if (trimmed && trimmed !== content) onSave(trimmed);
    setMode('idle');
  }, [content, onSave]);

  const handleKeyDownFull = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.key === 'Escape') { cancelEdit(); return; }
    if (!multiline && e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (multiline && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(); }
  };

  const handleKeyDownCompact = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveCompact(); return; }
    // Prevent hard Enter from inserting <br> / <div>
    if (e.key === 'Enter') { e.preventDefault(); }
  };

  // Paste as plain text only
  const handlePasteCompact = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  const triggerRewrite = async () => {
    if (!onRewrite) return;
    setRewriteError('');
    setMode('rewriting');
    setFullBar((p) => ({ ...p, visible: false }));
    try {
      const result = await onRewrite(content);
      setProposed(result.trim());
      setMode('review');
    } catch (err) {
      setRewriteError(err instanceof Error ? err.message : 'Rewrite failed');
      setMode('idle');
    }
  };

  const acceptRewrite = () => { onSave(proposed); setMode('idle'); };
  const rejectRewrite = () => { setProposed(''); setMode('idle'); };

  // ── Render ───────────────────────────────────────────────────────────────────

  const sourceCls = `eb-source--${source.replace('-', '')}`;

  return (
    <>
      {/* Full-mode floating bar (above selection, position:absolute) */}
      {!compact && fullBar.visible && mode === 'idle' && (
        <div
          ref={fullBarRef}
          className="eb-float-bar"
          style={{ top: fullBar.top, left: fullBar.centerX }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button type="button" className="eb-float-btn" onClick={enterEdit}>✎ Edit</button>
          {onRewrite && (
            <button type="button" className="eb-float-btn eb-float-btn--rewrite" onClick={() => void triggerRewrite()}>
              ✦ Rewrite
            </button>
          )}
        </div>
      )}

      {/* Main block */}
      <div
        ref={containerRef}
        className={`eb-block eb-block--${mode} ${sourceCls}${compact ? ' eb-block--compact' : ''} ${className}`}
        data-source={source}
      >
        {/* Source badge — full mode only */}
        {!compact && <span className={`eb-badge ${sourceCls}`}>{SOURCE_LABEL[source]}</span>}

        {/* ── COMPACT MODE ── */}
        {compact && (
          <>
            {/* Pencil icon — top-right corner, always in DOM for positioning */}
            {mode === 'idle' && (
              <button
                type="button"
                className="eb-pencil-btn"
                title={label ? `Edit ${label}` : 'Edit'}
                aria-label={label ? `Edit ${label}` : 'Edit question'}
                onClick={enterEdit}
              >
                ✎
              </button>
            )}

            {/* Idle: plain text display */}
            {mode === 'idle' && (
              <span className="eb-ce-text">
                {content}
                {source === 'user-edited' && (
                  <span className="eb-edited-badge">edited</span>
                )}
              </span>
            )}

            {/* Editing: contentEditable div — same font/size as idle, no layout shift */}
            {mode === 'editing' && (
              <>
                <div
                  ref={ceRef}
                  className="eb-ce-text eb-ce-text--editing"
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck
                  onKeyDown={handleKeyDownCompact}
                  onPaste={handlePasteCompact}
                  aria-label={label ? `Edit ${label}` : 'Edit question'}
                />
                <div className="eb-ce-actions">
                  <span className="eb-ce-hint">⌘↵ save · Esc cancel</span>
                  <button type="button" className="eb-btn eb-btn--cancel" onClick={cancelEdit}>Cancel</button>
                  <button type="button" className="eb-btn eb-btn--save" onClick={saveCompact}>Save</button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── FULL MODE ── */}
        {!compact && (
          <>
            {mode === 'idle' && (
              <div className="eb-text" aria-label={label ? `${label}: ${content}` : undefined}>
                {content}
              </div>
            )}

            {mode === 'editing' && (
              <div className="eb-edit-area">
                {label && <div className="eb-edit-label">Editing: {label}</div>}
                {multiline ? (
                  <textarea
                    ref={textareaRef}
                    className="eb-textarea"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDownFull}
                    rows={Math.max(3, draft.split('\n').length + 1)}
                  />
                ) : (
                  <input
                    className="eb-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDownFull}
                  />
                )}
                <div className="eb-edit-actions">
                  <span className="eb-edit-hint">{multiline ? '⌘↵ to save' : '↵ to save'} · Esc to cancel</span>
                  <button type="button" className="eb-btn eb-btn--cancel" onClick={cancelEdit}>Cancel</button>
                  <button type="button" className="eb-btn eb-btn--save" disabled={!draft.trim()} onClick={saveEdit}>Save</button>
                </div>
              </div>
            )}

            {mode === 'rewriting' && (
              <div className="eb-rewriting">
                <div className="eb-rewriting-spinner" aria-hidden />
                <span className="eb-rewriting-label">AI rewriting…</span>
                <div className="eb-text eb-text--dimmed">{content}</div>
              </div>
            )}

            {mode === 'review' && (
              <div className="eb-review">
                <div className="eb-review-col eb-review-col--old">
                  <div className="eb-review-tag">Original</div>
                  <p className="eb-review-text eb-review-text--old">{content}</p>
                </div>
                <div className="eb-review-arrow" aria-hidden>→</div>
                <div className="eb-review-col eb-review-col--new">
                  <div className="eb-review-tag eb-review-tag--new">AI suggestion</div>
                  <p className="eb-review-text eb-review-text--new">{proposed}</p>
                </div>
                <div className="eb-review-actions">
                  <button type="button" className="eb-btn eb-btn--cancel" onClick={rejectRewrite}>✕ Reject</button>
                  <button type="button" className="eb-btn eb-btn--accept" onClick={acceptRewrite}>✓ Accept</button>
                </div>
              </div>
            )}

            {rewriteError && <div className="eb-error">{rewriteError}</div>}

            {mode === 'idle' && (
              <div className="eb-hover-controls">
                <button type="button" className="eb-ctrl-btn" onClick={enterEdit}>✎ Edit</button>
                {onRewrite && (
                  <button type="button" className="eb-ctrl-btn eb-ctrl-btn--rewrite" onClick={() => void triggerRewrite()}>
                    ✦ Rewrite
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ── Section-level toolbar ────────────────────────────────────────────────────

interface EditableSectionToolbarProps {
  label: string;
  onEditAll: () => void;
  onRewriteAll?: () => void;
  rewritingAll?: boolean;
  hasEdits?: boolean;
  onRevertAll?: () => void;
}

export function EditableSectionToolbar({
  label,
  onEditAll,
  onRewriteAll,
  rewritingAll = false,
  hasEdits = false,
  onRevertAll,
}: EditableSectionToolbarProps) {
  return (
    <div className="eb-section-toolbar">
      <span className="eb-section-label">{label}</span>
      <div className="eb-section-actions">
        {hasEdits && onRevertAll && (
          <button type="button" className="eb-ctrl-btn eb-ctrl-btn--revert" onClick={onRevertAll}>
            ↩ Revert all
          </button>
        )}
        <button type="button" className="eb-ctrl-btn" onClick={onEditAll}>✎ Edit entire text</button>
        {onRewriteAll && (
          <button
            type="button"
            className="eb-ctrl-btn eb-ctrl-btn--rewrite"
            disabled={rewritingAll}
            onClick={onRewriteAll}
          >
            {rewritingAll ? '…' : '✦ Rewrite entire text'}
          </button>
        )}
      </div>
    </div>
  );
}
