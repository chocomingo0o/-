import React from 'react';
import type { GradeChip as GradeChipT, LinkKind } from '../../engine/types';
import { cn } from '../../lib/utils';

export const DEPTH_LABEL = ['', '정리·참여', '조사·분석', '분석·실험', '성찰·확장'] as const;

/** 탐구 깊이 막대 1~4칸 */
export function DepthBars({ d, className }: { d: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-end gap-[2px]', className)} title={`탐구 깊이 ${d}단계 · ${DEPTH_LABEL[d] ?? ''}`} aria-label={`탐구 깊이 ${d}단계`}>
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={cn('block w-[4px] rounded-[1px]', i <= d ? 'bg-ink' : 'bg-hair-2')} style={{ height: 4 + i * 3 }} />
      ))}
    </span>
  );
}

/** 성취도·등급 칩 */
export function GradeChips({ grades, className }: { grades: GradeChipT[]; className?: string }) {
  if (!grades?.length) return null;
  const multi = grades.length > 1;
  return (
    <div className={cn('flex flex-wrap gap-1 text-[12px] leading-none', className)}>
      {grades.map((g, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded border border-hair px-1.5 py-[3px] text-ink-2">
          {multi && g.sem ? <i className="not-italic text-muted">{g.sem}학기</i> : null}
          {g.ach ? <b className="font-semibold text-ink">{g.ach}</b> : null}
          {g.rank ? <b className="font-semibold text-ink">{g.rank}등급</b> : null}
        </span>
      ))}
    </div>
  );
}

export const KIND_LABEL: Record<LinkKind, string> = { 심화: '심화', 확장: '확장', 전환: '전환', 반복: '반복', 동시: '같은 시기' };
export const KIND_VAR: Record<LinkKind, string> = { 심화: 'var(--link-deep)', 확장: 'var(--link-cross)', 전환: 'var(--link-shift)', 반복: 'var(--link-rep)', 동시: 'var(--link-con)' };

/**
 * 연결 종류 칩. 글자색은 토큰으로 둔다: 어두운 모드에서는 심화 바탕(--black)이 밝아지므로 흰 글자를 고정하면 보이지 않는다.
 * 같은 시기(회색 바탕)는 밝은 모드·어두운 모드 모두 본문색(text-ink)이 더 잘 읽힌다.
 */
export function KindChip({ kind, className }: { kind: LinkKind; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-[1px] text-[11.5px] font-bold leading-[1.5]', kind === '동시' ? 'text-ink' : 'text-surface', className)} style={{ background: KIND_VAR[kind] }}>
      {KIND_LABEL[kind]}
    </span>
  );
}

export function MethodChip({ label, on, className }: { label: string; on?: boolean; className?: string }) {
  return (
    <em className={cn('inline-block rounded-full border px-2 py-[1px] text-[12px] not-italic font-medium leading-[1.5]', on ? 'border-ink bg-ink text-surface' : 'border-hair-2 text-ink-2', className)}>{label}</em>
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-block rounded-full border border-hair px-2 py-[1px] text-[12px] text-ink-2', className)}>{children}</span>;
}

export function SectionTitle({ children, sub, className }: { children: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-2', className)}>
      <h3 className="text-[15px] font-bold text-ink">{children}</h3>
      {sub ? <p className="mt-0.5 text-[13px] text-muted">{sub}</p> : null}
    </div>
  );
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div role="status" className="noprint fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-md bg-ink px-4 py-2 text-[13.5px] text-surface shadow-[0_2px_8px_var(--ring)]">
      {text}
    </div>
  );
}

export function Busy({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="noprint fixed inset-0 z-[70] flex items-center justify-center bg-black/20">
      <div className="flex items-center gap-3 rounded-lg border border-hair bg-surface px-5 py-4 text-[14px] shadow-[0_2px_8px_var(--ring)]">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-hair-2 border-t-ink" aria-hidden />
        <span>{text}</span>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-hair-2 p-6 text-center text-[13.5px] text-muted">{children}</div>;
}
