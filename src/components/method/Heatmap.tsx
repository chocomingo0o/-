import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * 범용 열 지도 표. 행·열 머리글과 칸 값(기록 수)을 받아 table 요소로 그린다.
 *
 * - 칸 배경: 값/최댓값에 따라 --seq-100 ~ --seq-700(연보라 한 색조). 0은 빈 칸.
 *   글자는 옅은 칸에서는 text-ink, 진한 칸(6단계 이상)에서는 text-surface(흰 바탕이면 흰 글자, 어두운 모드면 어두운 글자).
 * - 칸·행머리·열머리·합계를 누르면 onPick(row, col). 머리글은 '*'로 전달한다(행머리 → (row, '*'), 열머리 → ('*', col)).
 *   값이 0인 칸은 누를 수 없다(근거 문장이 없으므로).
 * - 선택한 칸은 안쪽 검정 테두리. 접근성: 누를 수 있는 칸은 role=button, tabIndex=0, Enter/Space.
 * - isGap(row, col)이 참인 0칸은 점선 테두리와 글자(gapText, 기본 '없음')로 결손을 표시하고,
 *   화면 읽기 프로그램에는 '기대 방법인데 아직 없음'을 함께 읽힌다(색과 점선에만 기대지 않음).
 * - 모서리 머리글은 대각선 칸: 오른쪽 위에 열 이름, 왼쪽 아래에 행 이름(corner = { row, col }).
 * - 열 머리글의 짧은 이름(1-1 등)은 title을 화면 읽기용 글자로 함께 두고, 표 상자가 넓으면(@2xl) 그 아래 작은 글자로도 보인다.
 * - 표가 넓으면 바깥 상자 안에서만 가로로 스크롤한다. 행머리는 왼쪽에 고정.
 *   스크롤 상자는 relative로 둔다(머리글의 sr-only 글자가 상자 밖 기준으로 놓여 페이지 전체가 가로로 늘어나지 않게).
 *   넘칠 때는 '옆으로 밀어 보세요' 안내와 오른쪽 가장자리 그림자를 보이고, 상자에 키보드 초점을 줄 수 있게 한다.
 */

export interface HeatCol { key: string; label: string; title?: string }
export interface HeatRow { key: string; label: React.ReactNode; text: string; title?: string; cells: number[]; total: number }
/** 선택. '*'는 머리글(행 전체 또는 열 전체). */
export interface HeatSel { row: string; col: string }

interface Props {
  caption: string;
  corner?: { row: string; col: string };
  cols: HeatCol[];
  rows: HeatRow[];
  totalLabel?: string;
  unit?: string;
  selected?: HeatSel | null;
  onPick?: (row: string, col: string) => void;
  isGap?: (row: string, col: string) => boolean;
  gapText?: string;
  /** 열 머리글 아래에 title(전체 이름)을 작은 글자로 보일지. 표 상자가 넉넉할 때만 보인다. */
  colSub?: boolean;
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
/** 모서리 칸의 대각선(왼쪽 위 → 오른쪽 아래) */
const CORNER_LINE: React.CSSProperties = { backgroundImage: 'linear-gradient(to top right, transparent calc(50% - 0.6px), var(--hair-2) 50%, transparent calc(50% + 0.6px))' };

/** 상자 안에서 표가 가로로 넘치는지, 오른쪽 끝까지 밀었는지 */
function useOverflow() {
  const ref = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState({ over: false, atEnd: true });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const over = el.scrollWidth - el.clientWidth > 1;
    const atEnd = !over || el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setSt((p) => (p.over === over && p.atEnd === atEnd ? p : { over, atEnd }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => ro?.disconnect();
  }, [measure]);
  return { ref, ...st, onScroll: measure };
}

export function Heatmap({ caption, corner, cols, rows, totalLabel = '합계', unit = '건', selected, onPick, isGap, gapText = '없음', colSub, className }: Props) {
  const max = rows.reduce((m, r) => Math.max(m, ...r.cells), 0);
  const isSel = (row: string, col: string) => !!selected && selected.row === row && selected.col === col;
  const ov = useOverflow();

  const colHead = (c: HeatCol) => (
    <>
      <span aria-hidden={c.title && c.title !== c.label ? true : undefined}>{c.label}</span>
      {c.title && c.title !== c.label ? (
        <>
          <span className="sr-only">{c.title}</span>
          {colSub ? <span aria-hidden className="hidden whitespace-nowrap text-[11px] font-normal text-muted @2xl:block">{c.title}</span> : null}
        </>
      ) : null}
    </>
  );

  return (
    <div className={cn('@container', className)}>
      {ov.over ? (
        <p className="mb-1.5 inline-flex items-center gap-1 text-[12px] text-muted">
          <MoveHorizontal className="h-3.5 w-3.5" aria-hidden /> 표가 화면보다 넓습니다. 옆으로 밀어 나머지 열을 보세요.
        </p>
      ) : null}
      <div className="relative">
        <div
          ref={ov.ref}
          onScroll={ov.onScroll}
          className="relative overflow-x-auto"
          tabIndex={ov.over ? 0 : undefined}
          role={ov.over ? 'region' : undefined}
          aria-label={ov.over ? `${caption}, 옆으로 밀어 볼 수 있음` : undefined}
        >
          <table className="w-full border-collapse text-[13px] leading-tight">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-[1] min-w-[76px] border border-hair bg-surface px-2 py-1 text-left align-bottom font-semibold text-ink-2" style={corner ? CORNER_LINE : undefined}>
                  {corner ? (
                    <>
                      <span className="sr-only">{`행은 ${corner.row}, 열은 ${corner.col}`}</span>
                      <span aria-hidden className="block text-right text-[11.5px] font-normal leading-tight text-muted">{corner.col}</span>
                      <span aria-hidden className="block leading-tight">{corner.row}</span>
                    </>
                  ) : null}
                </th>
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
                          className="block px-1.5 py-1.5 hover:bg-plane sm:px-2"
                          style={sel ? SEL_RING : undefined}
                          onClick={() => onPick('*', c.key)}
                          onKeyDown={keyHandler(() => onPick('*', c.key))}
                        >
                          {colHead(c)}
                        </span>
                      ) : (
                        <span className="block px-1.5 py-1.5 sm:px-2">{colHead(c)}</span>
                      )}
                    </th>
                  );
                })}
                <th scope="col" className="border border-hair bg-surface px-1.5 py-1.5 text-center font-semibold text-ink-2 sm:px-2">{totalLabel}</th>
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
                      const label = `${r.text}, ${c.title ?? c.label}: ${v}${unit}`;
                      const style: React.CSSProperties = {
                        ...(step ? { background: `var(--seq-${step * 100})` } : {}),
                        ...(sel ? SEL_RING : {}),
                        ...(gap ? { outline: '1px dashed var(--muted)', outlineOffset: -3 } : {}),
                      };
                      return (
                        <td key={c.key} className={cn('num border border-hair p-0 text-center', step >= 6 ? 'text-surface' : 'text-ink')} title={gap ? `${label} (기대 방법인데 아직 없음)` : label}>
                          {clickable ? (
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={label}
                              aria-pressed={sel}
                              data-row={r.key}
                              data-col={c.key}
                              className="block min-w-[32px] px-1.5 py-1.5 font-semibold sm:min-w-[40px] sm:px-2"
                              style={style}
                              onClick={() => onPick(r.key, c.key)}
                              onKeyDown={keyHandler(() => onPick(r.key, c.key))}
                            >
                              {v}
                            </span>
                          ) : (
                            <span className={cn('block min-w-[32px] px-1.5 py-1.5 sm:min-w-[40px] sm:px-2', gap ? 'text-[11px] text-muted' : 'font-semibold')} style={style}>
                              {v > 0 ? v : gap ? <>{gapText}<span className="sr-only">, 기대 방법인데 아직 없음</span></> : ''}
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
                          className="block px-1.5 py-1.5 hover:bg-plane sm:px-2"
                          style={rowSel ? SEL_RING : undefined}
                          onClick={() => onPick(r.key, '*')}
                          onKeyDown={keyHandler(() => onPick(r.key, '*'))}
                        >
                          {r.total}
                        </span>
                      </td>
                    ) : (
                      <td className="num border border-hair px-1.5 py-1.5 text-center font-semibold sm:px-2">{r.total}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {ov.over && !ov.atEnd ? (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-5" style={{ background: 'linear-gradient(to left, var(--scrim), transparent)' }} />
        ) : null}
      </div>
    </div>
  );
}

/** 표 아래 범례: 옅음 → 진함 = 기록 수 적음 → 많음. gap이면 결손 칸 표시도 함께 풀이한다. */
export function HeatLegend({ className, gap }: { className?: string; gap?: boolean }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-[12px] text-muted', className)} aria-hidden>
      <span>기록 수</span>
      <span>적음</span>
      <span className="inline-flex overflow-hidden rounded border border-hair">
        {[1, 2, 3, 4, 5, 6, 7].map((s) => <i key={s} className="block h-3 w-4" style={{ background: `var(--seq-${s * 100})` }} />)}
      </span>
      <span>많음</span>
      {gap ? (
        <span className="ml-2 inline-flex items-center gap-1">
          <i className="inline-block rounded px-1 text-[11px] not-italic leading-[1.4]" style={{ outline: '1px dashed var(--muted)', outlineOffset: -1 }}>없음</i> 기대 방법인데 아직 없음
        </span>
      ) : null}
    </div>
  );
}
