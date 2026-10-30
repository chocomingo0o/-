import React, { useLayoutEffect, useRef } from 'react';
import { BookOpen, Contrast, EyeOff, Eye, FilePlus2, Printer, Save, Trash2, NotebookPen } from 'lucide-react';
import { cn, blindName } from '../lib/utils';
import type { StudentEntry } from '../engine/types';
import type { View, Side } from '../state/store';

interface Props {
  students: StudentEntry[];
  cur: number;
  view: View;
  side: Side;
  blind: boolean;
  /** 지금 어두운 모드인지(테마 버튼 라벨에 상태를 담기 위해) */
  dark: boolean;
  onSelect: (i: number) => void;
  onView: (v: View) => void;
  onAddFiles: () => void;
  onDict: () => void;
  onNotes: () => void;
  onBlind: () => void;
  onSave: () => void;
  onPrint: () => void;
  onWipe: () => void;
  onTheme: () => void;
}

const TABS: { v: View; label: string }[] = [
  { v: 'tree', label: '탐구 계보도' },
  { v: 'method', label: '탐구 방법' },
  { v: 'note', label: '상담 노트' },
];

export function TopBar(p: Props) {
  // 상단 바 높이를 --topbar-h로 알려 옆 창(SideDrawer)이 그 아래에 붙어 화면 높이에 맞게 한다.
  // 폭이 좁으면 버튼 줄이 접혀 높이가 바뀌므로 ResizeObserver로 따라가고, 넓게 보기로 바가 사라지면 0으로 되돌린다.
  const headRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--topbar-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.setProperty('--topbar-h', '0px'); };
  }, []);
  return (
    <header ref={headRef} className="noprint sticky top-0 z-40 border-b border-hair bg-surface">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <div className="flex items-center gap-2 text-[15px] font-bold">
          <span className="inline-block h-3.5 w-3.5 rounded-[4px] bg-ink" /> 탐구분석지도
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <span className="sr-only">학생 선택</span>
          <select
            className="rounded-md border border-hair-2 bg-surface px-2 py-1 text-[13.5px] text-ink"
            value={p.cur}
            onChange={(e) => p.onSelect(+e.target.value)}
            aria-label="학생 선택"
          >
            {p.students.map((s, i) => (
              <option key={s.id} value={i}>
                {p.blind ? blindName(s.data.meta.name || '') : (s.data.meta.name || '이름 없음')}{s.data.meta.sample ? ' (예시)' : ''}
              </option>
            ))}
          </select>
        </label>
        {/* 화면 전환은 탭 패턴(tabpanel·방향키)을 다 갖추지 않으므로 aria-current를 쓴 단순 버튼으로 둔다 */}
        <nav className="flex items-center gap-1" aria-label="화면">
          {TABS.map((t) => (
            <button
              key={t.v}
              aria-current={p.view === t.v ? 'page' : undefined}
              className={cn('rounded-md px-3 py-1.5 text-[13.5px] font-semibold transition-colors', p.view === t.v ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-plane')}
              onClick={() => p.onView(t.v)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <IconBtn label="PDF 더 올리기" onClick={p.onAddFiles}><FilePlus2 className="h-4 w-4" /></IconBtn>
          <IconBtn label="표현 사전" onClick={p.onDict} on={p.side === 'dict'}><BookOpen className="h-4 w-4" /></IconBtn>
          <IconBtn label="상담 노트" onClick={p.onNotes} on={p.side === 'note'} disabled={p.view === 'note'} title={p.view === 'note' ? '상담 노트 화면을 보고 있습니다' : undefined}><NotebookPen className="h-4 w-4" /></IconBtn>
          <IconBtn label={p.blind ? '이름 보이기' : '이름 가리기'} onClick={p.onBlind}>{p.blind ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</IconBtn>
          <IconBtn label="작업 저장" onClick={p.onSave}><Save className="h-4 w-4" /></IconBtn>
          <IconBtn label="인쇄" onClick={p.onPrint}><Printer className="h-4 w-4" /></IconBtn>
          <IconBtn label="모두 지우기" onClick={p.onWipe}><Trash2 className="h-4 w-4" /></IconBtn>
          <IconBtn label={p.dark ? '밝게 보기' : '어둡게 보기'} onClick={p.onTheme} hideText><Contrast className="h-4 w-4" /></IconBtn>
        </div>
      </div>
    </header>
  );
}

function IconBtn({ label, onClick, children, on, hideText, disabled, title }: { label: string; onClick: () => void; children: React.ReactNode; on?: boolean; hideText?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      className={cn('btn ghost sm', on && 'border-ink bg-plane')}
      onClick={onClick}
      title={title ?? label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
    >
      {children}
      {!hideText ? <span className="hidden lg:inline">{label}</span> : null}
    </button>
  );
}
