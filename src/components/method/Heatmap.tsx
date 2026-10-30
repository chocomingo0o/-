import React from 'react';
import { cn } from '../../lib/utils';

/**
 * 범용 열 지도 표. 행·열 머리글과 칸 값(기록 수)을 받아 table 요소로 그린다.
 *
 * - 칸 배경: 값/최댓값에 따라 --seq-100 ~ --seq-700(연보라 한 색조). 0은 빈 칸.
 *   글자는 옅은 칸에서는 text-ink, 진한 칸(6단계 이상)에서는 text-surface(흰 바탕이면 흰 글자, 어두운 모드면 어두운 글자).
 * - 칸·행머리·열머리·합계를 누르면 onPick(row, col). 머리글은 '*'로 전달한다(행머리 → (row, '*'), 열머리 → ('*', col)).
 *   값이 0인 칸은 누를 수 없다(근거 문장이 없으므로).
 * - 선택한 칸은 안쪽 검정 테두리. 접근성: 누를 수 있는 칸은 role=button, tabIndex=0, Enter/Space.
 * - isGap(row, col)이 참인 0칸은 점선 테두리와 작은 글자(gapText)로 결손을 표시한다.
 * - 표가 넓으면 바깥 상자 안에서만 가로로 스크롤한다. 행머리는 왼쪽에 고정.
 */

export interface HeatCol { key: string; label: string; title?: string }
export interface HeatRow { key: string; label: React.ReactNode; text: string; title?: string; cells: number[]; total: number }
/** 선택. '*'는 머리글(행 전체 또는 열 전체). */
export interface HeatSel { row: string; col: string }

interface Props {
  caption: string;
  corner?: string;
  cols: HeatCol[];
  rows: HeatRow[];
  totalLabel?: string;
  unit?: string;
  selected?: HeatSel | null;
  onPick?: (row: string, col: string) => void;
  isGap?: (row: string, col: string) => boolean;
  gapText?: string;
  className?: string;
}

/** 값 → 1~7 단계(0이면 0). 최댓값이 작아도 가장 큰 값이 7단계가 되도록 비율로 나눈다. */
export function heatStep(v: number, max: number): number {
  if (v <= 0 || max <= 0) return 0;
  return Math.max(1, Math.min(7, Math.ceil((v / max) * 7)));
}

function keyHandler(fn: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };
}

const SEL_RING: React.CSSProperties = { boxShadow: 'inset 0 0 0 2px var(--black)' };

export function Heatmap({ caption, corner = '', cols, rows, totalLabel = '합계', unit = '개 기록', selected, onPick, isGap, gapText = '없음', className }: Props) {
  const max = rows.reduce((m, r) => Math.max(m, ...r.cells), 0);
  const isSel = (row: string, col: string) => !!selected && selected.row === row && selected.col === col;

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[13px] leading-tight">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-[1] border border-hair bg-surface px-2 py-1.5 text-left font-semibold text-ink-2">{corner}</th>
            {cols.map((c) => {
              const act = !!onPick;
              const sel = isSel('*', c.key);
              return (
                <th key={c.key} scope="col" className="border border-hair bg-surface p-0 text-center font-semibold" title={c.title}>
                  {act ? (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`${c.title ?? c.label} 열 전체 보기`}
                      aria-pressed={sel}
                      data-col={c.key}
                      className="block px-2 py-1.5 hover:bg-plane"
                      style={sel ? SEL_RING : undefined}
                      onClick={() => onPick('*', c.key)}
                      onKeyDown={keyHandler(() => onPick('*', c.key))}
                    >
                      {c.label}
                    </span>
                  ) : (
                    <span className="block px-2 py-1.5">{c.label}</span>
                  )}
                </th>
              );
            })}
            <th scope="col" className="border border-hair bg-surface px-2 py-1.5 text-center font-semibold text-ink-2">{totalLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const rowSel = isSel(r.key, '*');
            const act = !!onPick;
            return (
              <tr key={r.key}>
                <th scope="row" className="sticky left-0 z-[1] whitespace-nowrap border border-hair bg-surface p-0 text-left font-semibold" title={r.title}>
                  {act ? (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`${r.text} 행 전체 보기`}
                      aria-pressed={rowSel}
                      data-row={r.key}
                      className="block px-2 py-1.5 hover:bg-plane"
                      style={rowSel ? SEL_RING : undefined}
                      onClick={() => onPick(r.key, '*')}
                      onKeyDown={keyHandler(() => onPick(r.key, '*'))}
                    >
                      {r.label}
                    </span>
                  ) : (
                    <span className="block px-2 py-1.5">{r.label}</span>
                  )}
                </th>
                {cols.map((c, i) => {
                  const v = r.cells[i] ?? 0;
                  const step = heatStep(v, max);
                  const gap = v === 0 && !!isGap && isGap(r.key, c.key);
                  const sel = isSel(r.key, c.key);
                  const clickable = act && v > 0;
                  const label = `${r.text} · ${c.title ?? c.label}: ${v}${unit}`;
                  const style: React.CSSProperties = {
                    ...(step ? { background: `var(--seq-${step * 100})` } : {}),
                    ...(sel ? SEL_RING : {}),
                    ...(gap ? { outline: '1px dashed var(--muted)', outlineOffset: -3 } : {}),
                  };
                  return (
                    <td key={c.key} className={cn('num border border-hair p-0 text-center', step >= 6 ? 'text-surface' : 'text-ink')} title={label}>
                      {clickable ? (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={label}
                          aria-pressed={sel}
                          data-row={r.key}
                          data-col={c.key}
                          className="block min-w-[40px] px-2 py-1.5 font-semibold"
                          style={style}
                          onClick={() => onPick(r.key, c.key)}
                          onKeyDown={keyHandler(() => onPick(r.key, c.key))}
                        >
                          {v}
                        </span>
                      ) : (
                        <span className={cn('block min-w-[40px] px-2 py-1.5', gap ? 'text-[11px] text-muted' : 'font-semibold')} style={style} aria-label={gap ? `${label} (기대 방법인데 아직 없음)` : label}>
                          {v > 0 ? v : gap ? gapText : ''}
                        </span>
                      )}
                    </td>
                  );
                })}
                {act ? (
                  <td className="num border border-hair p-0 text-center font-semibold">
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`${r.text} ${totalLabel} ${r.total}${unit}, 행 전체 보기`}
                      aria-pressed={rowSel}
                      className="block px-2 py-1.5 hover:bg-plane"
                      style={rowSel ? SEL_RING : undefined}
                      onClick={() => onPick(r.key, '*')}
                      onKeyDown={keyHandler(() => onPick(r.key, '*'))}
                    >
                      {r.total}
                    </span>
                  </td>
                ) : (
                  <td className="num border border-hair px-2 py-1.5 text-center font-semibold">{r.total}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 표 아래 범례: 옅음 → 진함 = 기록 수 적음 → 많음 */
export function HeatLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-[12px] text-muted', className)} aria-hidden>
      <span>기록 수</span>
      <span>적음</span>
      <span className="inline-flex overflow-hidden rounded border border-hair">
        {[1, 2, 3, 4, 5, 6, 7].map((s) => <i key={s} className="block h-3 w-4" style={{ background: `var(--seq-${s * 100})` }} />)}
      </span>
      <span>많음</span>
      <span className="ml-2 inline-flex items-center gap-1"><i className="inline-block h-3 w-4 rounded" style={{ outline: '1px dashed var(--muted)', outlineOffset: -1 }} /> 기대 방법인데 아직 없음</span>
    </div>
  );
}
