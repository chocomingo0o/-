import React from 'react';
import { Maximize2, Minimize2, Minus, Plus } from 'lucide-react';
import type { Analysis, Link, LinkKind } from '../../engine/types';
import { DEPTH_TXT, LINK_KINDS } from '../../engine/analyze';
import { useApp } from '../../state/store';
import { cn } from '../../lib/utils';
import { DepthBars, KIND_LABEL, KIND_VAR, KindChip } from '../common';
import { themeVar } from './RecordCard';

const KINDS: LinkKind[] = ['심화', '확장', '전환', '반복', '동시'];
const WHY: { k: 'off' | 'brief' | 'full'; l: string }[] = [
  { k: 'off', l: '숨김' },
  { k: 'brief', l: '한 줄' },
  { k: 'full', l: '자세히' },
];
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.6;

/** 세그먼트 묶음(짧은 묶음용: 이유 표시, 확대·축소). 1px 틈(gap)이 구분선 구실을 한다. 줄을 바꾸지 않는다. */
const group = 'inline-flex shrink-0 gap-px overflow-hidden rounded-md border border-hair-2 bg-hair-2';
const seg = 'inline-flex items-center gap-1 bg-surface px-2.5 py-[5px] text-[13px] leading-[1.3] text-ink-2 hover:text-ink aria-pressed:bg-ink aria-pressed:text-surface disabled:opacity-40 focus-visible:z-10';
/** 칩 묶음(연결 종류처럼 긴 묶음용). 폰 너비에서 줄을 바꿔도 빈 자리에 회색 바탕이 드러나지 않도록 칩마다 테두리를 둔다. */
const chips = 'flex max-w-full flex-wrap gap-1';
const chip = 'inline-flex items-center gap-1 rounded-md border border-hair-2 bg-surface px-2.5 py-[4px] text-[13px] leading-[1.3] text-ink-2 hover:border-ink hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface disabled:opacity-40';

export interface TreeToolbarProps {
  an: Analysis;
  /** 약한 기록 숨김을 적용한 뒤의 연결(개수 표시용) */
  links: Link[];
  /** 지금 적용된 배율(%) */
  zoomPct: number;
  faintCount: number;
}

export function TreeToolbar({ an, links, zoomPct, faintCount }: TreeToolbarProps) {
  const { state, dispatch } = useApp();
  const { linkFilter, whyMode, showFaint, zoom, theme, wide } = state;
  const counts: Record<'all' | LinkKind, number> = { all: links.length, 심화: 0, 확장: 0, 전환: 0, 반복: 0, 동시: 0 };
  for (const l of links) counts[l.rel]++;
  const z = zoomPct / 100;
  const setZoom = (v: number | null) => dispatch({ type: 'setZoom', zoom: v === null ? null : Math.round(v * 100) / 100 });

  return (
    <div className="noprint mb-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* 연결 종류 */}
        <div role="group" aria-label="연결 종류" className={chips}>
          <button type="button" className={chip} aria-pressed={linkFilter === 'all'} onClick={() => dispatch({ type: 'setLinkFilter', filter: 'all' })}>
            모든 연결 <span className="num opacity-70">{counts.all}</span>
          </button>
          {KINDS.map((k) => (
            <button key={k} type="button" className={chip} aria-pressed={linkFilter === k} onClick={() => dispatch({ type: 'setLinkFilter', filter: k })} title={LINK_KINDS[k].desc}>
              <i aria-hidden className="block h-[3px] w-[12px] rounded-sm" style={{ background: KIND_VAR[k] }} />
              {KIND_LABEL[k]} <span className="num opacity-70">{counts[k]}</span>
            </button>
          ))}
        </div>

        {/* 이유 표시 */}
        <div role="group" aria-label="연결 이유 표시" className="inline-flex items-center gap-1.5 text-[13px]">
          <span className="text-muted">이유</span>
          <span className={group}>
            {WHY.map((w) => (
              <button key={w.k} type="button" className={seg} aria-pressed={whyMode === w.k} onClick={() => dispatch({ type: 'setWhyMode', mode: w.k })}>
                {w.l}
              </button>
            ))}
          </span>
        </div>

        {/* 약한 기록 */}
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-ink-2">
          <input type="checkbox" className="h-[14px] w-[14px] accent-[var(--black)]" checked={showFaint} onChange={() => dispatch({ type: 'toggleFaint' })} />
          약한 기록 <span className="num text-muted">{faintCount}</span>
        </label>

        {/* 확대·축소 */}
        <div role="group" aria-label="확대·축소" className={cn(group, 'items-center')}>
          <button type="button" className={cn(seg, 'px-2')} aria-label="축소" disabled={z <= ZOOM_MIN + 0.001} onClick={() => setZoom(Math.max(ZOOM_MIN, z - 0.1))}>
            <Minus size={14} aria-hidden />
          </button>
          <button type="button" className={cn(seg, 'num min-w-[72px] justify-center')} aria-pressed={zoom === null} title="보드가 화면 너비에 맞도록 맞춥니다" onClick={() => setZoom(null)}>
            {zoom === null ? `맞춤 ${zoomPct}%` : `${zoomPct}%`}
          </button>
          <button type="button" className={cn(seg, 'px-2')} aria-label="확대" disabled={z >= ZOOM_MAX - 0.001} onClick={() => setZoom(Math.min(ZOOM_MAX, z + 0.1))}>
            <Plus size={14} aria-hidden />
          </button>
        </div>

        <Legend />

        <button type="button" className="btn ghost sm" aria-pressed={wide} onClick={() => dispatch({ type: 'toggleWide' })} title={wide ? 'Esc 키로도 돌아갑니다' : '상단 바와 머리글을 숨기고 보드만 크게 봅니다'}>
          {wide ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
          {wide ? '넓게 보기 끝내기' : '넓게 보기'}
        </button>
      </div>

      {/* 관심 주제 칩 */}
      <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
        <span className="text-muted">관심 주제</span>
        {an.themes.length ? (
          <>
            <button
              type="button"
              aria-pressed={theme === null}
              onClick={() => dispatch({ type: 'setTheme', theme: null })}
              className="inline-flex items-center gap-1 rounded-full border border-hair-2 px-2.5 py-[2px] text-ink-2 hover:border-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface"
            >
              전체 보기
            </button>
            {an.themes.map((th, i) => (
              <button
                key={th.name}
                type="button"
                aria-pressed={theme === th.name}
                title={`${th.name} · 낱말 ${th.words.join(', ')} · 기록 ${th.ids.length}개`}
                onClick={() => dispatch({ type: 'setTheme', theme: theme === th.name ? null : th.name })}
                className="inline-flex items-center gap-1.5 rounded-full border border-hair-2 px-2.5 py-[2px] text-ink-2 hover:border-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface"
              >
                <i aria-hidden className="block h-[9px] w-[9px] rounded-full ring-1 ring-surface" style={{ background: themeVar(i) }} />
                {th.name}
                <span className="num opacity-70">{th.ids.length}</span>
              </button>
            ))}
          </>
        ) : (
          <span className="text-muted">여러 기록에 걸친 관심 주제가 아직 없습니다.</span>
        )}
      </div>
    </div>
  );
}

/** 범례 팝업 */
function Legend() {
  return (
    <details className="relative">
      <summary className="btn ghost sm cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">범례</summary>
      <div className="panel absolute left-0 z-30 mt-1 w-[min(340px,calc(100vw-32px))] p-3 text-[13px] leading-snug shadow-[0_2px_8px_var(--ring)] md:left-auto md:right-0">
        <h4 className="mb-1.5 text-[13px] font-bold">연결 종류</h4>
        <ul className="flex flex-col gap-1.5">
          {KINDS.map((k) => (
            <li key={k} className="flex items-center gap-2">
              <svg width="40" height="10" aria-hidden className="shrink-0">
                <line x1="2" y1="5" x2="38" y2="5" stroke={KIND_VAR[k]} strokeWidth="2" strokeLinecap="round" strokeDasharray={k === '동시' ? '2 4' : undefined} />
              </svg>
              <KindChip kind={k} />
              <span className="text-ink-2">{LINK_KINDS[k].desc}</span>
            </li>
          ))}
        </ul>
        <h4 className="mb-1 mt-3 text-[13px] font-bold">선 모양</h4>
        <ul className="flex flex-col gap-1 text-ink-2">
          <li className="flex items-center gap-2">
            <svg width="40" height="10" aria-hidden className="shrink-0"><line x1="2" y1="5" x2="38" y2="5" stroke="var(--ink)" strokeWidth="2" strokeDasharray="9 5" /></svg>
            긴 점선: 교과군을 건너간 연결
          </li>
          <li className="flex items-center gap-2">
            <svg width="40" height="10" aria-hidden className="shrink-0"><line x1="2" y1="5" x2="38" y2="5" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" /></svg>
            짧은 점선: 같은 시기에 함께 다룸
          </li>
          <li className="flex items-center gap-2">
            <svg width="40" height="10" aria-hidden className="shrink-0"><circle cx="6" cy="5" r="3" fill="var(--ink)" /><line x1="6" y1="5" x2="34" y2="5" stroke="var(--ink)" strokeWidth="2" /><circle cx="34" cy="5" r="3" fill="var(--ink)" /></svg>
            끝점 원: 앞 기록에서 뒤 기록으로
          </li>
        </ul>
        <h4 className="mb-1 mt-3 text-[13px] font-bold">탐구 깊이</h4>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-ink-2">
          {[1, 2, 3, 4].map((d) => (
            <li key={d} className="flex items-center gap-2">
              <DepthBars d={d} /> {d}단계 {DEPTH_TXT[d]}
            </li>
          ))}
        </ul>
        <h4 className="mb-1 mt-3 text-[13px] font-bold">카드 표시</h4>
        <ul className="flex flex-col gap-1 text-ink-2">
          <li>점선 테두리: 약한 기록(정리·참여 수준이고 2단계 이상 방법이 없음)</li>
          <li>✎ 메모: 기록 메모가 있음 · ↳ 추가 탐구: 앞 활동에서 이어진 탐구 횟수</li>
          <li>카드를 누르면 그 기록의 계보만 밝게 보이고 상세 창이 열립니다.</li>
        </ul>
        <p className="mt-3 border-t border-hair pt-2 text-[12.5px] text-muted">
          학년 칸은 기록이 있는 학년만 보입니다. 학기 표시가 없는 기록(창의적 체험활동, 학년 단위로 적힌 세특)은 두 학기에 걸쳐 놓았습니다.
          2022 개정 교육과정 학생부는 과목에 따라 학기 구분 없이 적힐 수 있습니다.
        </p>
      </div>
    </details>
  );
}
