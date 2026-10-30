import React, { useMemo } from 'react';
import type { Link } from '../../engine/types';
import { KIND_LABEL, KIND_VAR, KindChip } from '../common';

export interface CardRect { x: number; y: number; w: number; h: number }
/** hi: 계보·관심 주제에 든 선(진하게) / mid: 보통 / lo: 강조에서 벗어난 선(투명도 0.15) */
export type Emph = 'hi' | 'mid' | 'lo';

interface Pt { x: number; y: number }
/** dir: h 가로(다른 칸), v 세로(같은 칸). anchor: 라벨을 놓을 기준점 */
interface Geo { d: string; p0: Pt; p1: Pt; mid: Pt; anchor: Pt; dir: 'h' | 'v' }

const OPACITY: Record<Emph, number> = { hi: 1, mid: 0.85, lo: 0.15 };
const WIDTH: Record<Emph, number> = { hi: 2.4, mid: 1.6, lo: 1.4 };
const ORDER: Record<Emph, number> = { lo: 0, mid: 1, hi: 2 };

/** 3차 베지어의 t=0.5 지점 */
function bezMid(p0: Pt, c1: Pt, c2: Pt, p1: Pt): Pt {
  return { x: 0.125 * p0.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p1.x, y: 0.125 * p0.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p1.y };
}

/**
 * 두 카드 사이 곡선. 뒤 카드가 오른쪽에 있으면 가로(오른쪽 가장자리 → 왼쪽 가장자리) 3차 베지어,
 * 같은 칸(가로로 겹침)이면 위아래 가장자리를 잇는다.
 */
export function pathBetween(a: CardRect, b: CardRect): Geo {
  const gapR = b.x - (a.x + a.w);
  const gapL = a.x - (b.x + b.w);
  if (gapR >= 12 || gapL >= 12) {
    const fwd = gapR >= 12;
    const p0 = { x: fwd ? a.x + a.w : a.x, y: a.y + Math.min(a.h / 2, 44) };
    const p1 = { x: fwd ? b.x : b.x + b.w, y: b.y + Math.min(b.h / 2, 44) };
    const d = Math.max(36, Math.abs(p1.x - p0.x) * 0.45);
    const c1 = { x: p0.x + (fwd ? d : -d), y: p0.y };
    const c2 = { x: p1.x - (fwd ? d : -d), y: p1.y };
    const mid = bezMid(p0, c1, c2, p1);
    // 여러 칸을 건너는 선은 가운데 칸의 카드 뒤를 지나므로, 라벨은 시작 카드 바로 옆 칸 사이 틈에 둔다(이웃 칸이면 가운데와 같다)
    const anchor = { x: p0.x + (fwd ? 8 : -8), y: p0.y };
    return { d: `M${p0.x},${p0.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p1.x},${p1.y}`, p0, p1, mid, anchor, dir: 'h' };
  }
  // 세로: 겹치는 가로 구간의 가운데를 쓴다
  const lo = Math.max(a.x, b.x);
  const hi = Math.min(a.x + a.w, b.x + b.w);
  const cx = hi > lo ? (lo + hi) / 2 : (a.x + a.w / 2 + b.x + b.w / 2) / 2;
  const down = b.y >= a.y;
  const p0 = { x: cx, y: down ? a.y + a.h : a.y };
  const p1 = { x: cx, y: down ? b.y : b.y + b.h };
  const d = Math.max(20, Math.abs(p1.y - p0.y) * 0.5);
  const c1 = { x: p0.x, y: p0.y + (down ? d : -d) };
  const c2 = { x: p1.x, y: p1.y - (down ? d : -d) };
  // 세로 선은 다른 줄의 카드 뒤를 지나가므로 라벨은 시작 카드 바로 아래(위) 줄 사이 틈에 둔다
  const anchor = { x: p0.x, y: p0.y + (down ? 11 : -11) };
  return { d: `M${p0.x},${p0.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p1.x},${p1.y}`, p0, p1, mid: bezMid(p0, c1, c2, p1), anchor, dir: 'v' };
}

function dashOf(l: Link): string | undefined {
  if (l.rel === '동시') return '2 4';
  if (l.cross) return '9 5';
  return undefined;
}

interface Item { l: Link; geo: Geo; e: Emph; key: string }
interface Label extends Item { x: number; y: number; w: number }

/**
 * 라벨이 겹치면 밀어낸다(가까운 순서대로 간단히 처리).
 * 가로 선의 라벨은 위아래로, 세로 선의 라벨(줄 사이 틈에 있음)은 좌우로 민다.
 */
function placeLabels(items: Item[]): Label[] {
  const out: Label[] = [];
  const h = 20;
  const sorted = items.slice().sort((p, q) => p.geo.anchor.x - q.geo.anchor.x || p.geo.anchor.y - q.geo.anchor.y);
  for (const it of sorted) {
    const w = KIND_LABEL[it.l.rel].length * 11.5 + 14;
    let { x, y } = it.geo.anchor;
    for (let k = 0; k < 8; k++) {
      const hit = out.find((o) => Math.abs(o.x - x) < (o.w + w) / 2 + 4 && Math.abs(o.y - y) < h);
      if (!hit) break;
      // 아래, 위, 더 아래, 더 위 … (세로 선은 오른쪽, 왼쪽 …) 순서로 시도
      const n = Math.ceil((k + 1) / 2);
      const sign = k % 2 === 0 ? 1 : -1;
      if (it.geo.dir === 'h') y = it.geo.anchor.y + sign * n * (h + 2);
      else x = it.geo.anchor.x + sign * n * (w + 6);
    }
    out.push({ ...it, x, y, w });
  }
  return out;
}

export interface LinkLayerProps {
  links: Link[];
  rects: Record<string, CardRect>;
  width: number;
  height: number;
  emph: (l: Link) => Emph;
  onLabel: (l: Link) => void;
}

/**
 * 카드 사이 연결선(SVG)과 연결 종류 칩(HTML).
 * 좌표는 보드 안 CSS px(확대·축소 전) 기준이며 TreeBoard가 측정해 넘겨준다.
 */
export function LinkLayer({ links, rects, width, height, emph, onLabel }: LinkLayerProps) {
  const items = useMemo<Item[]>(() => {
    const arr: Item[] = [];
    for (const l of links) {
      const a = rects[l.from];
      const b = rects[l.to];
      if (!a || !b) continue;
      arr.push({ l, geo: pathBetween(a, b), e: emph(l), key: `${l.from}>${l.to}` });
    }
    arr.sort((p, q) => ORDER[p.e] - ORDER[q.e]);
    return arr;
  }, [links, rects, emph]);

  const labels = useMemo(() => placeLabels(items), [items]);

  if (!width || !height || !items.length) return null;

  return (
    <>
      {/* 선은 카드 뒤(z-0)에 그린다. 카드 글자를 가리지 않고, 흐려진 카드 뒤로는 비쳐 보인다. */}
      <svg className="pointer-events-none absolute left-0 top-0 z-0 overflow-visible" width={width} height={height} aria-hidden>
        {items.map(({ l, geo, e, key }) => {
          const color = KIND_VAR[l.rel];
          return (
            <g key={key} opacity={OPACITY[e]} className="transition-opacity duration-150">
              <path d={geo.d} fill="none" stroke={color} strokeWidth={WIDTH[e]} strokeDasharray={dashOf(l)} strokeLinecap="round" />
              <circle cx={geo.p0.x} cy={geo.p0.y} r={3} fill={color} stroke="var(--surface)" strokeWidth={1} />
              <circle cx={geo.p1.x} cy={geo.p1.y} r={3} fill={color} stroke="var(--surface)" strokeWidth={1} />
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute left-0 top-0 z-[3]" style={{ width, height }}>
        {labels.map(({ l, x, y, e, key }) => (
          <button
            key={key}
            type="button"
            title={l.sent}
            aria-label={`${KIND_LABEL[l.rel]} 연결, 이어진 기록 열기`}
            onClick={(ev) => {
              ev.stopPropagation();
              onLabel(l);
            }}
            className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded shadow-[0_0_0_2px_var(--surface)] transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100"
            style={{ left: x, top: y, opacity: OPACITY[e] }}
          >
            <KindChip kind={l.rel} />
          </button>
        ))}
      </div>
    </>
  );
}
