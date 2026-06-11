import { useCallback, useRef, useState } from 'react';

export type ContentSource = 'ai' | 'user-edited' | 'ai-rewritten';

export interface EditableEntry {
  current: string;
  original: string;
  source: ContentSource;
}

/** Manages a keyed map of editable blocks. `K` is typically number | string. */
export function useEditableContent<K extends string | number>(
  initialSource: ContentSource = 'ai',
) {
  const [entries, setEntries] = useState<Map<K, EditableEntry>>(new Map());
  const sourceRef = useRef(initialSource);

  const get = useCallback(
    (key: K, fallback: string): EditableEntry => {
      const e = entries.get(key);
      if (e) return e;
      return { current: fallback, original: fallback, source: sourceRef.current };
    },
    [entries],
  );

  const save = useCallback((key: K, newText: string, asAiRewrite = false) => {
    setEntries((prev) => {
      const next = new Map(prev);
      const existing = prev.get(key);
      next.set(key, {
        original: existing?.original ?? newText,
        current: newText,
        source: asAiRewrite ? 'ai-rewritten' : 'user-edited',
      });
      return next;
    });
  }, []);

  const revert = useCallback((key: K, originalFallback: string) => {
    setEntries((prev) => {
      const next = new Map(prev);
      const original = prev.get(key)?.original ?? originalFallback;
      next.set(key, { current: original, original, source: sourceRef.current });
      return next;
    });
  }, []);

  return { get, save, revert };
}
