import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_CHARS = 180;
const FADE_MS = 2000;

export function useLiveCaption() {
  const [enabled, setEnabled] = useState(true);
  const enabledRef = useRef(true);

  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [visible, setVisible] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      setInterimText('');
      setVisible(false);
    }
  }, [enabled]);

  const onCaptionResult = useCallback((event: SpeechRecognitionEvent) => {
    if (!enabledRef.current) return;

    let finalDelta = '';
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) finalDelta += r[0].transcript;
      else interim += r[0].transcript;
    }

    if (finalDelta) {
      setFinalText((prev) => {
        const joined = prev ? `${prev} ${finalDelta.trim()}` : finalDelta.trim();
        if (joined.length <= MAX_CHARS) return joined;
        const trimmed = joined.slice(-MAX_CHARS);
        const sp = trimmed.indexOf(' ');
        return sp > 0 ? trimmed.slice(sp + 1) : trimmed;
      });
    }
    setInterimText(interim.trim());
    setVisible(true);

    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      setInterimText('');
      setVisible(false);
    }, FADE_MS);
  }, []);

  const reset = useCallback(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    setFinalText('');
    setInterimText('');
    setVisible(false);
  }, []);

  useEffect(() => () => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
  }, []);

  return {
    captionEnabled: enabled,
    setCaptionEnabled: setEnabled,
    captionFinal: finalText,
    captionInterim: interimText,
    captionVisible: visible,
    onCaptionResult,
    resetCaption: reset,
  };
}
