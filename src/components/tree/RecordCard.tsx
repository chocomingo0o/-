import React from 'react';
import type { Link, Rec, Theme } from '../../engine/types';
import { METHOD } from '../../engine/dict/methods';
import { semLabel } from '../../engine/analyze';
import { cn } from '../../lib/utils';
import { DepthBars, GradeChips, KindChip, MethodChip } from '../common';

export type WhyMode = 'off' | 'brief' | 'full';

/**
 * 관심 주제 색. 엔진의 THEME_COLORS는 hex라 어두운 모드에서 보이지 않을 수 있어
 * 같은 순서의 토큰(CSS 변수)으로 바꿔 쓴다. 관심 주제 번호(an.themes 순서)로 고른다.
 */
const THEME_VARS = [
  'var(--note-lavender-ink)',
  'var(--note-mint-ink)',
  'var(--note-yellow-ink)',
  'var(--ink)',
  'var(--ink-2)',
  'var(--seq-600)',
];
export function themeVar(i: number): string {
  return THEME_VARS[((i % THEME_VARS.length) + THEME_VARS.length) % THEME_VARS.length];
}

/**
 * 카드 안 연결 이유 한 줄의 글자 부분. 종류 이름은 앞의 KindChip이 보여 주므로 여기에는 넣지 않는다.
 * 엔진의 why는 항목을 ' / '로 구분하므로(links.ts) 같은 구분자로 앞 기록을 붙인다.
 * 예) ← 1학년 통합과학1 / 카탈레이스 / 깊이 2→3
 */
export function briefWhy(l: Link, from: Rec): string {
  const why = l.why.trim();
  return `← ${from.year}학년 ${from.subj}${why ? ` / ${why}` : ''}`;
}

export interface RecordCardProps {
  r: Rec;
  recById: Map<string, Rec>;
  /** 이 기록으로 들어오는 연결(필터 적용 뒤) */
  incoming: Link[];
  themes: Theme[];
  activeTheme: string | null;
  selected: boolean;
  /** 계보·관심 주제 강조에서 벗어나 흐리게 */
  dim: boolean;
  whyMode: WhyMode;
  memo?: string;
  onClick: (id: string) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
  style?: React.CSSProperties;
}

export function RecordCard({ r, recById, incoming, themes, activeTheme, selected, dim, whyMode, memo, onClick, cardRef, style }: RecordCardProps) {
  const faint = r.faint;
  const memoText = (memo || '').trim();
  const sid = `rc-${r.id}`;
  const whyLimit = whyMode === 'full' ? 4 : 2;
  const shownWhy = whyMode === 'off' || faint ? [] : incoming.slice(0, whyLimit);
  const methods = r.methods.slice(0, 2);
  const themeIdx = new Map(themes.map((t, i) => [t.name, i]));

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      data-rec={r.id}
      aria-pressed={selected}
      aria-labelledby={`${sid}-s ${sid}-t`}
      style={style}
      onClick={() => onClick(r.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(r.id);
        }
      }}
      className={cn(
        'tree-card relative z-[1] mx-[8px] my-[10px] flex cursor-pointer flex-col gap-1.5 self-start rounded-[8px] border bg-surface px-3 py-2.5 text-left text-ink transition-[opacity,box-shadow] duration-150 hover:shadow-[0_1px_6px_var(--ring)]',
        faint ? 'border-dashed border-hair-2 py-2 text-[12.5px]' : 'border-hair-2',
        selected ? 'border-ink shadow-[inset_0_0_0_1px_var(--ink)] hover:shadow-[inset_0_0_0_1px_var(--ink)]' : '',
        // 흐린 카드도 키보드 초점이 오면 또렷하게(포커스 링이 함께 흐려지지 않도록)
        dim ? 'opacity-30 focus-visible:opacity-100' : faint ? 'opacity-70' : 'opacity-100',
      )}
    >
      {/* 머리: 과목, 세특/창체 태그, 깊이 막대 */}
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <b id={`${sid}-s`} className={cn('min-w-0 max-w-full truncate font-bold leading-tight text-ink', faint ? 'text-[13px]' : 'text-[15px]')} title={`${r.subj} · ${semLabel(r)}`}>
            {r.subj}
          </b>
          <span id={`${sid}-t`} className="sr-only">{semLabel(r)}</span>
          <span className="rounded border border-hair px-1 text-[12px] leading-[1.5] text-muted">{r.kind}</span>
        </div>
        <DepthBars d={r.depth} className="mt-[3px] shrink-0" />
      </div>

      {/* 표시: 메모, 추가 탐구, 성취도·등급 */}
      {memoText || r.fuCount > 0 || r.grades.length ? (
        <div className="flex flex-wrap items-center gap-1 text-[12px] leading-none">
          {memoText ? (
            <span className="inline-flex max-w-full items-center rounded bg-note-yellow/50 px-1.5 py-[3px] text-ink" title={memoText}>
              <span aria-hidden>✎ </span>
              <span className="sr-only">메모: </span>
              <span className="truncate">{memoText.length > 14 ? `${memoText.slice(0, 14)}…` : memoText}</span>
            </span>
          ) : null}
          {r.fuCount > 0 ? (
            <span className="inline-flex items-center rounded border border-hair px-1.5 py-[3px] text-ink-2" title={`앞 활동에서 이어진 추가 탐구 ${r.fuCount}회`}>
              ↳{r.fuCount} 추가 탐구
            </span>
          ) : null}
          <GradeChips grades={r.grades} />
        </div>
      ) : null}

      {/* 주제 */}
      {r.topic ? (
        <div className={cn('leading-snug', r.topicKind === 's' ? 'text-[13px] text-ink-2' : faint ? 'text-[13px] font-medium' : 'text-[14px] font-medium')}>
          {r.topicKind === 'k' ? <span className="mr-1 inline-block rounded bg-plane px-1 align-[1px] text-[12px] font-normal leading-[1.5] text-muted">핵심어</span> : null}
          {r.topicKind === 'b' ? `『${r.topic}』 읽기` : r.topic}
        </div>
      ) : null}

      {/* 요약 */}
      {!faint && r.summary ? (
        <p className="line-clamp-3 text-[13px] leading-snug text-ink-2">
          {r.summaryFu ? <span className="font-medium text-ink">↳ 추가 탐구 </span> : null}
          {r.summary}
        </p>
      ) : null}

      {/* 연결 이유 */}
      {shownWhy.length ? (
        <ul className="flex flex-col gap-1 border-t border-hair pt-1.5 text-[12.5px] leading-snug text-ink-2">
          {shownWhy.map((l) => {
            const from = recById.get(l.from);
            if (!from) return null;
            return (
              <li key={`${l.from}-${l.to}`} title={l.sent} className="flex items-start gap-1.5">
                <KindChip kind={l.rel} className="mt-[1px] shrink-0" />
                <span className="min-w-0">
                  <span className="block">{briefWhy(l, from)}</span>
                  {whyMode === 'full' ? (
                    <span className="block text-[12px] text-muted">
                      {l.head}
                      {l.detail ? ` / ${l.detail}` : ''}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
          {incoming.length > shownWhy.length ? <li className="pl-4 text-[12px] text-muted">외 {incoming.length - shownWhy.length}개 연결</li> : null}
        </ul>
      ) : null}

      {/* 방법 칩, 관심 주제 점 */}
      {methods.length || r.themes.length ? (
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {methods.map((k) => (
              <MethodChip key={k} label={METHOD[k].label} className={METHOD[k].lv >= 3 ? 'border-ink text-ink' : ''} />
            ))}
            {r.methods.length > methods.length ? (
              <span className="text-[12px] text-muted" title={r.methods.slice(2).map((k) => METHOD[k].label).join(', ')}>
                +{r.methods.length - methods.length}
              </span>
            ) : null}
          </div>
          {r.themes.length ? (
            <div role="img" className="flex shrink-0 items-center gap-1" aria-label={`관심 주제 ${r.themes.join(', ')}`}>
              {r.themes.map((name) => (
                <i
                  key={name}
                  title={`관심 주제 ${name}`}
                  className={cn('block h-[9px] w-[9px] rounded-full', activeTheme === name ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface' : 'ring-1 ring-hair-2')}
                  style={{ background: themeVar(themeIdx.get(name) ?? 3) }}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
