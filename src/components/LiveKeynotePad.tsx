import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../hooks/useT';

type PadMode = 'type' | 'draw';

type StoredPad = {
  text: string;
  drawing: string;
};

const STORAGE_PREFIX = 'point_live_keynote_';

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`;
}

function readStored(sessionId: string): StoredPad {
  if (typeof window === 'undefined') return { text: '', drawing: '' };
  try {
    const raw = sessionStorage.getItem(storageKey(sessionId));
    if (!raw) return { text: '', drawing: '' };
    const parsed = JSON.parse(raw) as Partial<StoredPad>;
    return {
      text: typeof parsed.text === 'string' ? parsed.text : '',
      drawing: typeof parsed.drawing === 'string' ? parsed.drawing : '',
    };
  } catch {
    return { text: '', drawing: '' };
  }
}

function writeStored(sessionId: string, data: StoredPad): void {
  try {
    sessionStorage.setItem(storageKey(sessionId), JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export function LiveKeynotePad({ sessionId }: { sessionId: string }) {
  const t = useT();
  const [mode, setMode] = useState<PadMode>('type');
  const [text, setText] = useState(() => readStored(sessionId).text);
  const bodyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const storedDrawingRef = useRef(readStored(sessionId).drawing);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback((patch: Partial<StoredPad>) => {
    const stored = readStored(sessionId);
    const next: StoredPad = {
      text: patch.text ?? stored.text,
      drawing: patch.drawing ?? stored.drawing,
    };
    if (patch.drawing !== undefined) storedDrawingRef.current = patch.drawing;
    writeStored(sessionId, next);
  }, [sessionId]);

  const setupCanvasContext = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2a2620';
    ctx.lineWidth = 2;
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = bodyRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w <= 0 || h <= 0) return;

    const snapshot = document.createElement('canvas');
    if (canvas.width > 0 && canvas.height > 0) {
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      snapshot.getContext('2d')?.drawImage(canvas, 0, 0);
    }

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    setupCanvasContext(ctx);

    if (snapshot.width > 0) {
      ctx.drawImage(snapshot, 0, 0, w, h);
    } else if (storedDrawingRef.current) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
      };
      img.src = storedDrawingRef.current;
    }
  }, [setupCanvasContext]);

  useEffect(() => {
    const stored = readStored(sessionId);
    setText(stored.text);
    storedDrawingRef.current = stored.drawing;
    resizeCanvas();
  }, [sessionId, resizeCanvas]);

  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(container);
    return () => ro.disconnect();
  }, [resizeCanvas]);

  const saveDrawing = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const data = canvas.toDataURL('image/png');
    storedDrawingRef.current = data;
    persist({ drawing: data });
  }, [persist]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'draw') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
    canvas.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || mode !== 'draw') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const last = lastPointRef.current;
    if (!canvas || !ctx || !last) return;
    const pt = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPointRef.current = pt;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    saveDrawing();
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persist({ text: value });
    }, 280);
  };

  const handleClear = () => {
    if (mode === 'type') {
      setText('');
      persist({ text: '' });
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    storedDrawingRef.current = '';
    persist({ drawing: '' });
  };

  useEffect(
    () => () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    },
    [],
  );

  return (
    <div className="live-keynote-pad" aria-label={t('live.keynote.aria')}>
      <div className="live-keynote-toolbar">
        <span className="live-keynote-label">{t('live.keynote.label')}</span>
        <div className="live-keynote-mode">
          <button
            type="button"
            className={`live-keynote-mode-btn${mode === 'type' ? ' active' : ''}`}
            onClick={() => setMode('type')}
            aria-pressed={mode === 'type'}
          >
            {t('live.keynote.type')}
          </button>
          <button
            type="button"
            className={`live-keynote-mode-btn${mode === 'draw' ? ' active' : ''}`}
            onClick={() => setMode('draw')}
            aria-pressed={mode === 'draw'}
          >
            {t('live.keynote.draw')}
          </button>
        </div>
        <button type="button" className="live-keynote-clear" onClick={handleClear}>
          {t('live.keynote.clear')}
        </button>
      </div>
      <div className="live-keynote-body" ref={bodyRef}>
        <textarea
          className={`live-keynote-textarea${mode === 'type' ? '' : ' live-keynote-textarea--hidden'}`}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={t('live.keynote.placeholder')}
          spellCheck
          aria-hidden={mode !== 'type'}
          tabIndex={mode === 'type' ? 0 : -1}
        />
        <canvas
          ref={canvasRef}
          className={`live-keynote-canvas${mode === 'draw' ? '' : ' live-keynote-canvas--hidden'}`}
          aria-hidden={mode !== 'draw'}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
    </div>
  );
}
