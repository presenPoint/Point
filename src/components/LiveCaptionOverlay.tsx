interface Props {
  finalText: string;
  interimText: string;
  visible: boolean;
}

export function LiveCaptionOverlay({ finalText, interimText, visible }: Props) {
  if (!finalText && !interimText) return null;
  return (
    <div className={`caption-overlay${visible ? ' caption-visible' : ''}`} aria-live="polite" aria-atomic="false">
      <span className="caption-final">{finalText}</span>
      {interimText && (
        <span className="caption-interim">{finalText ? ' ' : ''}{interimText}</span>
      )}
    </div>
  );
}
