import React from 'react';
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
  return (
    <header className="noprint sticky top-0 z-40 border-b border-hair bg-surface">
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
        <nav className="flex items-center gap-1" role="tablist" aria-label="화면">
          {TABS.map((t) => (
            <button
              key={t.v}
              role="tab"
              aria-selected={p.view === t.v}
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
          <IconBtn label="상담 노트" onClick={p.onNotes} on={p.side === 'note'}><NotebookPen className="h-4 w-4" /></IconBtn>
          <IconBtn label={p.blind ? '이름 보이기' : '이름 가리기'} onClick={p.onBlind}>{p.blind ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</IconBtn>
          <IconBtn label="작업 저장" onClick={p.onSave}><Save className="h-4 w-4" /></IconBtn>
          <IconBtn label="인쇄" onClick={p.onPrint}><Printer className="h-4 w-4" /></IconBtn>
          <IconBtn label="모두 지우기" onClick={p.onWipe}><Trash2 className="h-4 w-4" /></IconBtn>
          <IconBtn label="밝게/어둡게" onClick={p.onTheme} hideText><Contrast className="h-4 w-4" /></IconBtn>
        </div>
      </div>
    </header>
  );
}

function IconBtn({ label, onClick, children, on, hideText }: { label: string; onClick: () => void; children: React.ReactNode; on?: boolean; hideText?: boolean }) {
  return (
    <button
      type="button"
      className={cn('btn ghost sm', on && 'border-ink bg-plane')}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
    >
      {children}
      {!hideText ? <span className="hidden lg:inline">{label}</span> : null}
    </button>
  );
}
