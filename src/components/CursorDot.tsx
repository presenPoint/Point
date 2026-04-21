import { useEffect, useState } from 'react';

/**
 * 커스텀 포인터 닷 — 마우스와 동기(지연 없음).
 * pointer: fine 미충족(터치) 환경에서는 렌더하지 않습니다.
 */
export function CursorDot() {
  const [pos, setPos] = useState({ x: -200, y: -200 });

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(window.matchMedia('(pointer: fine)').matches);
  }, []);

  useEffect(() => {
    if (!visible) return;

    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="cursor-dot-wrap"
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      aria-hidden="true"
    >
      <div className="cursor-dot-ring" />
      <div className="cursor-dot-core" />
    </div>
  );
}
