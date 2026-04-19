import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  labelForTopicKey,
  normalizeTopicSearch,
  OTHER_TOPIC_KEY,
  PRESENTATION_TOPIC_CATEGORIES,
  subLabelForTopicKey,
  topicKey,
} from '../constants/presentationTopics';
import { useSessionStore } from '../store/sessionStore';

function useFocusTrap(active: boolean, rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active || !rootRef.current) return;
    const root = rootRef.current;
    const focusables = root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    first?.focus();
  }, [active, rootRef]);
}

export function PresentationTopicPanel() {
  const keys = useSessionStore((s) => s.session.presentation_topic_keys);
  const custom = useSessionStore((s) => s.session.presentation_topic_custom);
  const setPresentationTopics = useSessionStore((s) => s.setPresentationTopics);

  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draftKeys, setDraftKeys] = useState<string[]>([]);
  const [draftCustom, setDraftCustom] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  const openModal = useCallback(() => {
    setDraftKeys([...keys]);
    setDraftCustom(custom);
    setQuery('');
    setModalOpen(true);
  }, [keys, custom]);

  const commitAndClose = useCallback(() => {
    setPresentationTopics(draftKeys, draftCustom);
    setModalOpen(false);
    setQuery('');
  }, [draftKeys, draftCustom, setPresentationTopics]);

  const cancelModal = useCallback(() => {
    setModalOpen(false);
    setQuery('');
  }, []);

  useFocusTrap(modalOpen, dialogRef);

  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, cancelModal]);

  const qn = normalizeTopicSearch(query);

  const filteredCategories = useMemo(() => {
    if (!qn) return PRESENTATION_TOPIC_CATEGORIES;
    const mapped = PRESENTATION_TOPIC_CATEGORIES.map((cat) => ({
      ...cat,
      subs: cat.subs.filter(
        (s) =>
          normalizeTopicSearch(s.search).includes(qn) ||
          normalizeTopicSearch(s.label).includes(qn) ||
          normalizeTopicSearch(cat.label).includes(qn),
      ),
    })).filter((cat) => cat.subs.length > 0);
    if (mapped.length > 0) return mapped;
    const otherCat = PRESENTATION_TOPIC_CATEGORIES.find((c) => c.id === 'other');
    return otherCat ? [otherCat] : [];
  }, [qn]);

  const toggleDraftKey = (k: string) => {
    const has = draftKeys.includes(k);
    setDraftKeys(has ? draftKeys.filter((x) => x !== k) : [...draftKeys, k]);
  };

  const setDraftCustomText = (text: string) => {
    setDraftCustom(text);
  };

  const hasOtherDraft = draftKeys.includes(OTHER_TOPIC_KEY);

  const removeCommittedKey = (k: string) => {
    const nextKeys = keys.filter((x) => x !== k);
    const nextCustom = k === OTHER_TOPIC_KEY ? '' : custom;
    setPresentationTopics(nextKeys, nextCustom);
  };

  return (
    <div className="topic-panel topic-panel--inline">
      <div className="topic-inline-stack">
        <span className="input-label topic-inline-label">Presentation topic</span>
        <button type="button" className="topic-open-modal-btn" onClick={openModal}>
          Manage topics
        </button>
        <p className="topic-inline-hint">
          Open the picker to choose one or more themes. Your choices help AI interpret material, live speech, Q&amp;A,
          and the final report.
        </p>
        <div className="topic-selected-strip" role="list" aria-label="Selected presentation topics">
          {keys.length === 0 ? (
            <span className="topic-inline-empty">No topics selected yet.</span>
          ) : (
            keys.map((k) => {
              const full = labelForTopicKey(k) ?? k;
              const short = subLabelForTopicKey(k) ?? full;
              const customShort =
                k === OTHER_TOPIC_KEY && custom.trim()
                  ? custom.trim().length > 56
                    ? `${custom.trim().slice(0, 56)}…`
                    : custom.trim()
                  : '';
              const extra = customShort ? `: ${customShort}` : '';
              const tip = custom.trim() && k === OTHER_TOPIC_KEY ? `${full}: ${custom.trim()}` : full;
              return (
                <div key={k} className="topic-selected-pill" role="listitem" title={tip}>
                  <span className="topic-selected-pill-text">
                    <span className="topic-selected-pill-main">{short}</span>
                    {extra ? <span className="topic-selected-pill-extra">{extra}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="topic-selected-pill-remove"
                    aria-label={`Remove ${full}`}
                    onClick={() => removeCommittedKey(k)}
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="topic-modal-root" role="presentation">
          <button
            type="button"
            className="topic-modal-backdrop"
            aria-label="Close topic picker"
            onClick={cancelModal}
          />
          <div
            ref={dialogRef}
            className="topic-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="topic-modal-title"
          >
            <div className="topic-modal-header">
              <h2 id="topic-modal-title" className="topic-modal-title">
                Presentation topic
              </h2>
              <button type="button" className="topic-modal-icon-close" onClick={cancelModal} aria-label="Close">
                ×
              </button>
            </div>

            <div className="topic-modal-search-wrap">
              <label className="topic-modal-search-label" htmlFor="topic-search-modal">
                Search topics
              </label>
              <input
                id="topic-search-modal"
                type="search"
                className="topic-modal-search-input"
                placeholder="e.g. pitch, thesis, AI, ESG…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="topic-modal-body">
              {filteredCategories.map((cat) => (
                <section key={cat.id} className="topic-section" aria-labelledby={`topic-sec-${cat.id}`}>
                  <h3 id={`topic-sec-${cat.id}`} className="topic-section-title">
                    {cat.label}
                  </h3>
                  <div className="topic-section-chips" role="group" aria-label={cat.label}>
                    {cat.subs.map((sub) => {
                      const k = topicKey(cat.id, sub.id);
                      const selected = draftKeys.includes(k);
                      return (
                        <button
                          key={k}
                          type="button"
                          className={`topic-chip-light${selected ? ' is-selected' : ''}`}
                          aria-pressed={selected}
                          onClick={() => toggleDraftKey(k)}
                        >
                          {sub.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            {hasOtherDraft && (
              <div className="topic-modal-other">
                <label className="topic-modal-other-label" htmlFor="topic-custom-modal">
                  Describe your topic (required for best results)
                </label>
                <textarea
                  id="topic-custom-modal"
                  className="topic-modal-textarea"
                  rows={3}
                  placeholder="e.g. Local retail revitalization policy for small businesses…"
                  value={draftCustom}
                  onChange={(e) => setDraftCustomText(e.target.value)}
                />
              </div>
            )}

            <div className="topic-modal-footer">
              <button type="button" className="topic-modal-btn topic-modal-btn--ghost" onClick={cancelModal}>
                Cancel
              </button>
              <button type="button" className="topic-modal-btn topic-modal-btn--primary" onClick={commitAndClose}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
