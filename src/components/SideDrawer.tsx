import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  open: boolean;
  kicker?: string;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  defaultWidth?: number;
}

/** 오른쪽 옆 창. 왼쪽 가장자리를 끌어 너비를 바꿀 수 있다. */
export function SideDrawer({ open, kicker, title, onClose, children, defaultWidth = 480 }: Props) {
  const [w, setW] = useState<number>(defaultWidth);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open && bodyRef.current) bodyRef.current.scrollTop = 0; }, [open, title]);
  if (!open) return null;
  const clamp = (v: number) => Math.max(340, Math.min(Math.max(360, window.innerWidth - 420), v));
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setW(clamp(window.innerWidth - ev.clientX));
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <aside
      className={cn('noprint fixed inset-y-0 right-0 z-50 flex flex-col border-l border-hair bg-surface shadow-[0_0_0_1px_var(--ring)] md:static md:z-auto md:shrink-0 md:shadow-none')}
      style={{ width: Math.min(w, typeof window !== 'undefined' ? window.innerWidth : w) }}
      aria-label={title || '옆 창'}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="창 너비 조절"
        tabIndex={0}
        className="absolute inset-y-0 left-0 hidden w-2 cursor-col-resize hover:bg-plane md:block"
        onPointerDown={onDown}
        onDoubleClick={() => setW(defaultWidth)}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') setW((v) => clamp(v + 40)); if (e.key === 'ArrowRight') setW((v) => clamp(v - 40)); }}
      />
      <header className="flex items-start justify-between gap-3 border-b border-hair px-4 py-3 pl-5">
        <div className="min-w-0">
          {kicker ? <div className="text-[12px] text-muted">{kicker}</div> : null}
          <h3 className="truncate text-[16px] font-bold">{title}</h3>
        </div>
        <button className="btn ghost sm" type="button" onClick={onClose} aria-label="닫기"><X className="h-4 w-4" /></button>
      </header>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pl-5">{children}</div>
    </aside>
  );
}
