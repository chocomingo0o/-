import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Analysis, LaneKey, Link, Rec, SlotIndex, StudentEntry, Year } from '../../engine/types';
import { lineage, slotIdx } from '../../engine/analyze';
import { LANES } from '../../engine/dict/subjects';
import { useApp } from '../../state/store';
import { cn } from '../../lib/utils';
import { Empty } from '../common';
import { RecordCard } from './RecordCard';
import { LinkLayer, type CardRect, type Emph } from './LinkLayer';
import { TreeToolbar } from './TreeToolbar';

const LANE_W = 128;
const COL_W = 232;
const PRINT_W = 1040;
const FIT_MIN = 0.6;
const FIT_MAX = 1;
/** 격자 행: 1 학년, 2 학기, 3 진로 희망, 4부터 교과군 */
const FIRST_LANE_ROW = 4;

interface Placed { r: Rec; col: number; span: number; row: number }
interface LaneRow { key: LaneKey; label: string; cc: boolean; rows: number; base: number; cards: Placed[] }
interface Layout { years: Year[]; cols: SlotIndex[]; lanes: LaneRow[]; totalRows: number; minW: number }

/**
 * 기록을 격자에 놓는다.
 * - 열: 기록이 있는 학년만(최소 1학년), 학년당 두 칸(1·2학기).
 * - 줄: 기록이 있는 교과군만, LANES 순서(창체 → 교과).
 * - 줄 안에서는 시간순으로 칸 점유 집합을 보며 비어 있는 첫 행에 놓는다. 학기 없는 기록은 두 칸을 차지한다.
 */
function buildLayout(recs: Rec[]): Layout {
  const ys = new Set<Year>([1]);
  for (const r of recs) ys.add(r.year);
  const years = [...ys].sort((a, b) => a - b);
  const cols: SlotIndex[] = years.flatMap((y) => [((y - 1) * 2) as SlotIndex, ((y - 1) * 2 + 1) as SlotIndex]);
  const colOf = new Map<SlotIndex, number>(cols.map((s, i) => [s, i]));
  const num = (id: string) => Number(id.replace(/\D/g, '')) || 0;

  const lanes: LaneRow[] = [];
  let base = FIRST_LANE_ROW;
  for (const def of LANES) {
    const rs = recs.filter((r) => r.lane === def.key).sort((a, b) => a.t - b.t || (a.kind === b.kind ? num(a.id) - num(b.id) : a.kind === '세특' ? -1 : 1));
    if (!rs.length) continue;
    const occ = new Set<string>();
    const cards: Placed[] = [];
    let rows = 1;
    for (const r of rs) {
      const slots = slotIdx(r);
      const col = colOf.get(slots[0]) ?? 0;
      const span = slots.length;
      let row = 0;
      for (;;) {
        let free = true;
        for (let c = col; c < col + span; c++) if (occ.has(`${row}:${c}`)) { free = false; break; }
        if (free) break;
        row++;
      }
      for (let c = col; c < col + span; c++) occ.add(`${row}:${c}`);
      rows = Math.max(rows, row + 1);
      cards.push({ r, col, span, row });
    }
    lanes.push({ key: def.key, label: def.label, cc: def.cc, rows, base, cards });
    base += rows;
  }
  return { years, cols, lanes, totalRows: base - 1, minW: LANE_W + cols.length * COL_W };
}

const sameRect = (a: CardRect | undefined, b: CardRect) => !!a && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
function sameRects(a: Record<string, CardRect>, b: Record<string, CardRect>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of kb) if (!sameRect(a[k], b[k])) return false;
  return true;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function TreeBoard({ an, student }: { an: Analysis; student: StudentEntry }) {
  const { state, dispatch } = useApp();
  const { sel, theme, linkFilter, whyMode, showFaint, zoom, wide } = state;

  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const refFns = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const roRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef(0);

  const [fitZ, setFitZ] = useState(1);
  const [rects, setRects] = useState<Record<string, CardRect>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [topPx, setTopPx] = useState(280);

  /* ── 자료 준비 ── */
  const visibleRecs = useMemo(() => (showFaint ? an.recs : an.recs.filter((r) => !r.faint)), [an.recs, showFaint]);
  const layout = useMemo(() => buildLayout(visibleRecs), [visibleRecs]);
  const recById = useMemo(() => new Map(an.recs.map((r) => [r.id, r])), [an.recs]);
  const faintCount = useMemo(() => an.recs.filter((r) => r.faint).length, [an.recs]);

  const faintLinks = useMemo(() => {
    const ok = new Set(visibleRecs.map((r) => r.id));
    return an.links.filter((l) => ok.has(l.from) && ok.has(l.to));
  }, [an.links, visibleRecs]);
  const links = useMemo(() => (linkFilter === 'all' ? faintLinks : faintLinks.filter((l) => l.rel === linkFilter)), [faintLinks, linkFilter]);
  const incomingOf = useMemo(() => {
    const m = new Map<string, Link[]>();
    for (const l of links) {
      const arr = m.get(l.to) ?? [];
      arr.push(l);
      m.set(l.to, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.rel === '동시' ? 1 : 0) - (b.rel === '동시' ? 1 : 0) || b.sc - a.sc);
    return m;
  }, [links]);

  /* ── 강조(계보, 관심 주제) ── */
  const lin = useMemo(() => (sel && recById.has(sel) ? lineage(an.links, sel) : null), [an.links, sel, recById]);
  const themeIds = useMemo(() => {
    if (!theme) return null;
    const th = an.themes.find((t) => t.name === theme);
    return th ? new Set(th.ids) : null;
  }, [an.themes, theme]);
  const inFocus = useCallback(
    (id: string) => {
      if (lin) return id === sel || lin.up.has(id) || lin.down.has(id);
      if (themeIds) return themeIds.has(id);
      return true;
    },
    [lin, sel, themeIds],
  );
  const emph = useCallback(
    (l: Link): Emph => {
      if (lin) return l.from === sel || l.to === sel || (inFocus(l.from) && inFocus(l.to)) ? 'hi' : 'lo';
      if (themeIds) return inFocus(l.from) && inFocus(l.to) ? 'hi' : 'lo';
      return 'mid';
    },
    [lin, sel, themeIds, inFocus],
  );

  /* ── 측정: 카드 위치(보드 좌표), 맞춤 배율, 보드 위쪽 위치 ── */
  const minW = layout.minW;
  const measure = useCallback(() => {
    const c = containerRef.current;
    const b = boardRef.current;
    const p = probeRef.current;
    if (!c || !b || !p) return;
    const cw = c.clientWidth;
    if (cw > 0) {
      const f = clamp(cw / minW, FIT_MIN, FIT_MAX);
      setFitZ((prev) => (Math.abs(prev - f) < 0.005 ? prev : f));
    }
    const top = Math.round(c.getBoundingClientRect().top + window.scrollY + 24);
    setTopPx((prev) => (Math.abs(prev - top) < 2 ? prev : top));

    const br = b.getBoundingClientRect();
    const scale = p.getBoundingClientRect().width / 100 || 1;
    const next: Record<string, CardRect> = {};
    for (const [id, el] of cardEls.current) {
      const r = el.getBoundingClientRect();
      next[id] = { x: (r.left - br.left) / scale, y: (r.top - br.top) / scale, w: r.width / scale, h: r.height / scale };
    }
    setRects((prev) => (sameRects(prev, next) ? prev : next));
    const w = br.width / scale;
    const h = br.height / scale;
    setSize((prev) => (Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5 ? prev : { w, h }));
  }, [minW]);
  const measureRef = useRef(measure);
  measureRef.current = measure;

  const schedule = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      measureRef.current();
    });
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver(() => schedule());
    roRef.current = ro;
    if (containerRef.current) ro.observe(containerRef.current);
    if (boardRef.current) ro.observe(boardRef.current);
    for (const el of cardEls.current.values()) ro.observe(el);
    window.addEventListener('resize', schedule);
    document.fonts?.ready.then(schedule).catch(() => undefined);
    return () => {
      ro.disconnect();
      roRef.current = null;
      window.removeEventListener('resize', schedule);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [schedule]);

  // 렌더마다 한 번 다시 잰다(rAF로 묶이고, 값이 같으면 상태를 바꾸지 않는다). 배율·이유 표시·옆 창 폭 변화도 여기서 따라간다.
  useLayoutEffect(() => {
    schedule();
  });

  const cardRef = useCallback(
    (id: string) => {
      let fn = refFns.current.get(id);
      if (!fn) {
        fn = (el) => {
          const old = cardEls.current.get(id);
          if (old && old !== el) roRef.current?.unobserve(old);
          if (el) {
            cardEls.current.set(id, el);
            roRef.current?.observe(el);
          } else {
            cardEls.current.delete(id);
          }
        };
        refFns.current.set(id, fn);
      }
      return fn;
    },
    [],
  );

  /* ── 동작 ── */
  const onCard = useCallback((id: string) => dispatch(sel === id ? { type: 'closeSide' } : { type: 'openRecord', id }), [dispatch, sel]);
  const onLabel = useCallback((l: Link) => dispatch({ type: 'openRecord', id: l.to }), [dispatch]);

  const z = zoom ?? fitZ;
  const pz = Math.min(1, PRINT_W / minW);
  const hopes = student.data.hopes || [];
  const recMemo = student.recMemo || {};
  const stickySemTop = 30; // 학년 머리글 높이

  if (!an.recs.length) {
    return (
      <section>
        <TreeToolbar an={an} links={faintLinks} zoomPct={Math.round(z * 100)} faintCount={faintCount} />
        <Empty>탐구가 드러난 기록이 없어 계보도를 그릴 수 없습니다. 세특이나 창의적 체험활동 특기사항이 있는 학생부인지 확인해 주세요.</Empty>
      </section>
    );
  }

  return (
    <section aria-label="탐구 계보도">
      <TreeToolbar an={an} links={faintLinks} zoomPct={Math.round(z * 100)} faintCount={faintCount} />
      <div
        ref={containerRef}
        className={cn('panel relative overflow-auto overscroll-x-contain print:max-h-none print:overflow-visible print:rounded-none print:border-0', wide ? 'rounded-none' : '')}
        style={{ maxHeight: `max(360px, calc(100vh - ${topPx}px))` }}
      >
        {!visibleRecs.length ? (
          <div className="p-6">
            <Empty>약한 기록을 숨기니 보여 줄 기록이 없습니다. 도구줄에서 ‘약한 기록’을 다시 켜 주세요.</Empty>
          </div>
        ) : (
          <div
            ref={boardRef}
            className="tree-board relative grid bg-surface text-[15px] [zoom:var(--z)] print:[zoom:var(--pz)]"
            style={
              {
                minWidth: minW,
                width: z >= 1 ? '100%' : minW,
                gridTemplateColumns: `${LANE_W}px repeat(${layout.cols.length}, minmax(${COL_W}px, 1fr))`,
                gridAutoRows: 'auto',
                '--z': String(z),
                '--pz': String(pz),
              } as React.CSSProperties
            }
          >
            {/* 배율 측정용 보이지 않는 자 */}
            <div ref={probeRef} aria-hidden className="pointer-events-none absolute left-0 top-0 h-0 w-[100px]" />

            {/* 머리글: 모서리, 학년, 학기 */}
            <div className="sticky left-0 top-0 z-[30] flex items-end border-b border-r border-hair bg-surface px-3 pb-1 text-[12px] text-muted" style={{ gridColumn: 1, gridRow: '1 / span 2' }}>
              교과군 · 학기
            </div>
            {layout.years.map((y, i) => (
              <div
                key={`y${y}`}
                className="sticky top-0 z-[20] flex h-[30px] items-center border-l border-hair-2 bg-surface px-3 text-[14px] font-bold"
                style={{ gridColumn: `${2 + i * 2} / span 2`, gridRow: 1 }}
              >
                {y}학년
              </div>
            ))}
            {layout.cols.map((s, ci) => (
              <div
                key={`s${s}`}
                className={cn('sticky z-[20] flex h-[26px] items-center border-b border-hair bg-surface px-3 text-[12.5px] text-ink-2', s % 2 === 0 ? 'border-l border-l-hair-2' : 'border-l border-l-hair')}
                style={{ gridColumn: 2 + ci, gridRow: 2, top: stickySemTop }}
              >
                {(s % 2) + 1}학기
              </div>
            ))}

            {/* 진로 희망 줄 */}
            <div className="sticky left-0 z-[10] border-b border-r border-hair bg-surface px-3 py-2 text-[13px] font-bold" style={{ gridColumn: 1, gridRow: 3 }}>
              진로 희망
            </div>
            {layout.years.map((y, i) => {
              const txt = hopes.filter((h) => h.year === y && h.text).map((h) => h.text).join(', ');
              return (
                <div key={`h${y}`} className="border-b border-l border-hair-2 border-b-hair px-3 py-2 text-[13px]" style={{ gridColumn: `${2 + i * 2} / span 2`, gridRow: 3 }}>
                  {txt ? <span className="text-ink">{txt}</span> : <span className="text-muted">기록 없음</span>}
                </div>
              );
            })}

            {/* 배경: 칸 세로선, 줄 가로선 */}
            {layout.cols.map((s, ci) => (
              <div
                key={`bg${s}`}
                aria-hidden
                className={cn('pointer-events-none z-0 border-l', s % 2 === 0 ? 'border-hair-2' : 'border-hair')}
                style={{ gridColumn: 2 + ci, gridRow: `${FIRST_LANE_ROW} / ${layout.totalRows + 1}` }}
              />
            ))}
            {layout.lanes.map((ln, i) => (
              <div
                key={`lb${ln.key}`}
                aria-hidden
                className={cn('pointer-events-none z-0 border-hair', i > 0 ? 'border-t' : '')}
                style={{ gridColumn: '1 / -1', gridRow: `${ln.base} / span ${ln.rows}` }}
              />
            ))}

            {/* 줄 이름 */}
            {layout.lanes.map((ln, i) => (
              <div
                key={`ln${ln.key}`}
                className={cn('sticky left-0 z-[10] border-r border-hair bg-surface px-3 py-2.5', i > 0 ? 'border-t' : '')}
                style={{ gridColumn: 1, gridRow: `${ln.base} / span ${ln.rows}` }}
              >
                <div className="text-[14px] font-bold leading-tight text-ink">{ln.label}</div>
                <div className="mt-0.5 text-[12px] text-muted">
                  {ln.cc ? '창체' : '교과'} · 기록 {ln.cards.length}
                </div>
              </div>
            ))}

            {/* 카드 */}
            {layout.lanes.flatMap((ln) =>
              ln.cards.map(({ r, col, span, row }) => (
                <RecordCard
                  key={r.id}
                  r={r}
                  recById={recById}
                  incoming={incomingOf.get(r.id) ?? []}
                  themes={an.themes}
                  activeTheme={theme}
                  selected={sel === r.id}
                  dim={!inFocus(r.id)}
                  whyMode={whyMode}
                  memo={recMemo[r.id]}
                  onClick={onCard}
                  cardRef={cardRef(r.id)}
                  style={{ gridColumn: `${2 + col} / span ${span}`, gridRow: ln.base + row }}
                />
              )),
            )}

            {/* 연결선 */}
            <LinkLayer links={links} rects={rects} width={size.w} height={size.h} emph={emph} onLabel={onLabel} />
          </div>
        )}
      </div>
    </section>
  );
}
