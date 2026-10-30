import React, { useCallback, useEffect, useRef, useState } from 'react';
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

const W_MIN = 340;
const NARROW = '(max-width: 767px)'; // Tailwind md 미만

/**
 * 창 너비 상한. 본문(main)이 최소 420px은 남도록 하고, 1024px 미만(태블릿)에서는 화면 절반을 넘지 않게 한다.
 * 드래그로 바꿀 때뿐 아니라 처음 열릴 때와 창 크기가 바뀔 때도 같은 규칙을 쓴다.
 */
function clampWidth(v: number): number {
  const iw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const cap = iw < 1024 ? Math.max(W_MIN, Math.round(iw * 0.5)) : Math.max(360, iw - 420);
  return Math.max(W_MIN, Math.min(cap, v));
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(NARROW).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const h = () => setNarrow(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return narrow;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 오른쪽 옆 창. 왼쪽 가장자리를 끌어 너비를 바꿀 수 있다.
 * 폰 너비(md 미만)에서는 화면 위에 떠서 가로를 가득 채우므로 대화 상자(role=dialog)로 다루고 초점을 안에 가둔다.
 * 열릴 때 초점을 제목으로 옮기고, 닫히면 열었던 요소로 되돌린다.
 */
export function SideDrawer({ open, kicker, title, onClose, children, defaultWidth = 480 }: Props) {
  const [w, setW] = useState<number>(() => clampWidth(defaultWidth));
  const bodyRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const narrow = useNarrow();

  useEffect(() => { if (open && bodyRef.current) bodyRef.current.scrollTop = 0; }, [open, title]);
  useEffect(() => { setW(clampWidth(defaultWidth)); }, [defaultWidth]);
  useEffect(() => {
    const h = () => setW((v) => clampWidth(v));
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // 초점: 열릴 때 제목으로, 닫힐 때 열었던 요소로
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      const back = openerRef.current;
      const active = document.activeElement;
      if (back && back.isConnected && (!active || active === document.body || asideRef.current?.contains(active))) back.focus({ preventScroll: true });
    };
  }, [open]);

  const trapTab = useCallback((e: React.KeyboardEvent) => {
    if (!narrow || e.key !== 'Tab' || !asideRef.current) return;
    const els = [...asideRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [narrow]);

  if (!open) return null;
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setW(clampWidth(window.innerWidth - ev.clientX));
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const wMax = clampWidth(Number.MAX_SAFE_INTEGER);
  return (
    <aside
      ref={asideRef}
      role={narrow ? 'dialog' : undefined}
      aria-modal={narrow ? true : undefined}
      onKeyDown={trapTab}
      className={cn('noprint fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-hair bg-surface shadow-[0_0_0_1px_var(--ring)] md:sticky md:top-[var(--topbar-h,0px)] md:z-auto md:h-[calc(100vh-var(--topbar-h,0px))] md:w-[var(--dw)] md:shrink-0 md:self-start md:shadow-none')}
      style={{ '--dw': `${Math.min(w, typeof window !== 'undefined' ? window.innerWidth : w)}px` } as React.CSSProperties}
      aria-label={title || '옆 창'}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="창 너비 조절"
        aria-valuenow={Math.round(w)}
        aria-valuemin={W_MIN}
        aria-valuemax={wMax}
        aria-valuetext={`${Math.round(w)}px`}
        tabIndex={0}
        className="absolute inset-y-0 left-0 hidden w-2 cursor-col-resize hover:bg-plane md:block"
        onPointerDown={onDown}
        onDoubleClick={() => setW(clampWidth(defaultWidth))}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') setW((v) => clampWidth(v + 40)); if (e.key === 'ArrowRight') setW((v) => clampWidth(v - 40)); }}
      />
      <header className="flex items-start justify-between gap-3 border-b border-hair px-4 py-3 pl-5">
        <div className="min-w-0">
          {kicker ? <div className="text-[12px] text-muted">{kicker}</div> : null}
          <h3 ref={titleRef} tabIndex={-1} className="truncate text-[16px] font-bold outline-none">{title}</h3>
        </div>
        <button className="btn ghost sm" type="button" onClick={onClose} aria-label="닫기"><X className="h-4 w-4" /></button>
      </header>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pl-5">{children}</div>
    </aside>
  );
}
