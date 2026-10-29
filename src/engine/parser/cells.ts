/**
 * 글자·사각형 → 셀.
 *
 * NEIS 학생부 PDF는 표의 칸마다 사각형을 그리고 그 안에 글자를 찍는다.
 * 그래서 "어느 사각형 안에 어떤 글자가 들어 있나"만 알면 표를 읽을 수 있다.
 *
 * 규칙(참고 앱의 파서와 같다):
 *  - cellText: y 차이가 2.6 이내인 글자는 같은 줄. 줄은 위에서 아래(y 내림차순), 줄 안은 왼쪽부터(x 오름차순).
 *  - joinLines: 줄 끝이 조사·어미·문장부호(SPACE_END)면 띄어서 잇고, 다음 줄이 문장부호로 시작(NOSPACE_START)하면
 *    붙여 잇는다. 그 밖에는 붙인다(한글 낱말이 줄 끝에서 끊긴 경우가 대부분이라서).
 *  - buildCells: 가로·세로 3 넘는 사각형만 셀 후보. 다른 사각형을 2개 이상 품는 바깥 사각형은 뺀다.
 *    글자는 자기를 품는 가장 작은 셀에 넣는다(판정 y는 글자 y+2). 머리글·쪽수 영역(y<26, 또는 y<64이고 h<22)은 뺀다.
 *  - 격자 fallback(gridCellsFromLines): 표를 사각형이 아니라 선으로만 그린 PDF에서는 셀이 거의 안 나온다.
 *    이때 수평·수직 선분을 격자로 보고 가장 작은 닫힌 칸을 셀로 되살린다.
 */
import type { Cell, Page, Rect, TextItem } from '../types';
import type { Line } from '../pdf/extract';

/** 공백 정규화 */
export const norm = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim();
/** 공백 제거 */
export const nos = (s: string | null | undefined): string => (s || '').replace(/\s+/g, '');

/** 줄 끝이 이 글자면 다음 줄과 띄어서 잇는다(조사·어미·문장부호) */
export const SPACE_END = /[을를은는에며함음임됨여의와과로고게서도.,)』」’”·;:]$/;
/** 다음 줄이 이 글자로 시작하면 붙여 잇는다(문장부호) */
export const NOSPACE_START = /^[.,)』」’”·;:%]/;

/** 같은 줄로 볼 y 차이 */
const LINE_TOL = 2.6;

/**
 * 셀 안의 글자 → 줄 문자열 배열.
 * 입력 배열은 바꾸지 않는다.
 */
export function cellText(items: TextItem[]): string[] {
  const rows: { y: number; it: TextItem[] }[] = [];
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  for (const it of sorted) {
    let r = rows.find(r => Math.abs(r.y - it.y) < LINE_TOL);
    if (!r) { r = { y: it.y, it: [] }; rows.push(r); }
    r.it.push(it);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map(r => r.it.sort((a, b) => a.x - b.x).map(i => i.s).join('').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** 줄 배열 → 한 문자열 */
export function joinLines(lines: string[]): string {
  let out = '';
  for (const ln of lines) {
    if (!out) { out = ln; continue; }
    if (/\s$/.test(out) || NOSPACE_START.test(ln)) out += ln;
    else if (SPACE_END.test(out)) out += ' ' + ln;
    else out += ln;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** 머리글·쪽수 영역에 걸린 셀인지 */
export function isHeaderFooterCell(c: Rect): boolean {
  return c.y < 26 || (c.y < 64 && c.h < 22);
}

/* ───────────── 격자 fallback ───────────── */

interface Band { pos: number; iv: { a: number; b: number }[] }

/** 같은 위치(pos)로 모은 선분들을 구간으로 합친다 */
function bands(segs: { pos: number; a: number; b: number }[], tol: number): Band[] {
  const sorted = segs.slice().sort((p, q) => p.pos - q.pos);
  const out: Band[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.pos - s.pos) <= tol) last.iv.push({ a: s.a, b: s.b });
    else out.push({ pos: s.pos, iv: [{ a: s.a, b: s.b }] });
  }
  for (const b of out) {
    b.iv.sort((p, q) => p.a - q.a);
    const merged: { a: number; b: number }[] = [];
    for (const v of b.iv) {
      const m = merged[merged.length - 1];
      if (m && v.a <= m.b + tol * 1.5) m.b = Math.max(m.b, v.b);
      else merged.push({ a: v.a, b: v.b });
    }
    b.iv = merged;
  }
  return out;
}

const covers = (band: Band, a: number, b: number, tol: number) =>
  band.iv.some(v => v.a <= a + tol && v.b >= b - tol);

/**
 * 수평·수직 선분 격자에서 가장 작은 닫힌 칸을 찾아 사각형으로 돌려준다.
 * 병합된 칸(가운데 선이 없는 칸)도 네 변이 모두 이어져 있으면 하나의 칸으로 잡힌다.
 * @param tol 같은 선으로 볼 위치 오차
 */
export function gridCellsFromLines(lines: Line[], tol = 1): Rect[] {
  const hs: { pos: number; a: number; b: number }[] = [];
  const vs: { pos: number; a: number; b: number }[] = [];
  for (const l of lines) {
    if (Math.abs(l.y1 - l.y2) <= tol) hs.push({ pos: (l.y1 + l.y2) / 2, a: Math.min(l.x1, l.x2), b: Math.max(l.x1, l.x2) });
    else if (Math.abs(l.x1 - l.x2) <= tol) vs.push({ pos: (l.x1 + l.x2) / 2, a: Math.min(l.y1, l.y2), b: Math.max(l.y1, l.y2) });
  }
  const H = bands(hs, tol);                   // y 오름차순
  const V = bands(vs, tol);                   // x 오름차순
  const out: Rect[] = [];
  // 위에서 아래로: H를 y 내림차순으로 훑는다
  const Hd = H.slice().reverse();
  for (let yi = 0; yi < Hd.length; yi++) {
    const top = Hd[yi];
    for (let xi = 0; xi < V.length; xi++) {
      const left = V[xi];
      // 왼쪽 위 모서리에 수평선과 수직선이 모두 지나야 한다
      if (!covers(top, left.pos, left.pos, tol) || !covers(left, top.pos, top.pos, tol)) continue;
      let found = false;
      for (let xj = xi + 1; xj < V.length && !found; xj++) {
        const right = V[xj];
        if (!covers(top, left.pos, right.pos, tol)) break;          // 윗변이 끊김 → 더 오른쪽도 불가
        if (!covers(right, top.pos, top.pos, tol)) continue;        // 이 x에는 모서리에 닿는 수직선이 없음
        for (let yj = yi + 1; yj < Hd.length; yj++) {
          const bottom = Hd[yj];
          if (!covers(left, bottom.pos, top.pos, tol)) { found = true; break; } // 왼쪽 변이 끊김 → 이 모서리로는 칸 없음(found로 종료)
          if (!covers(right, bottom.pos, top.pos, tol)) break;                  // 오른쪽 변이 끊김 → 다음 xj
          if (covers(bottom, left.pos, right.pos, tol)) {
            out.push({ x: left.pos, y: bottom.pos, w: right.pos - left.pos, h: top.pos - bottom.pos });
            found = true; break;
          }
        }
      }
    }
  }
  return out.filter(r => r.w > 3 && r.h > 3);
}

/* ───────────── 셀 만들기 ───────────── */

/** 다른 사각형을 2개 이상 품는 바깥 사각형을 뺀다 */
function dropOuter(rects: Rect[]): Rect[] {
  const out: Rect[] = [];
  for (const r of rects) {
    let inside = 0;
    for (const o of rects) {
      if (o === r) continue;
      if (o.x >= r.x - 0.5 && o.y >= r.y - 0.5 && o.x + o.w <= r.x + r.w + 0.5 && o.y + o.h <= r.y + r.h + 0.5 && (o.w < r.w - 1 || o.h < r.h - 1)) inside++;
      if (inside >= 2) break;
    }
    if (inside < 2) out.push(r);
  }
  return out;
}

/**
 * 한 쪽의 글자와 사각형 → 셀 목록과 셀 밖 글자.
 * @param page 추출된 쪽(선분 lines가 있으면 격자 fallback에 쓴다)
 * @param pageIndex 셀의 page 값(0부터). 호출자가 나중에 채워도 된다.
 */
export function buildCells(page: Page & { lines?: Line[] }, pageIndex = 0): { cells: Cell[]; free: TextItem[] } {
  let rects = page.rects.filter(r => r.w > 3 && r.h > 3);
  let boxes = dropOuter(rects);
  // 격자 fallback: 사각형으로는 셀이 거의 안 나오는데 선분이 많으면 선 격자에서 칸을 되살린다
  if (boxes.length < 3 && page.lines && page.lines.length >= 6) {
    const grid = gridCellsFromLines(page.lines);
    if (grid.length >= 3) {
      const seen = new Set(rects.map(r => [r.x, r.y, r.w, r.h].map(v => Math.round(v * 2)).join(',')));
      for (const g of grid) {
        const key = [g.x, g.y, g.w, g.h].map(v => Math.round(v * 2)).join(',');
        if (!seen.has(key)) { seen.add(key); rects.push(g); }
      }
      boxes = dropOuter(rects);
    }
  }
  const cells: Cell[] = boxes.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h, items: [], lines: [], text: '', top: r.y + r.h, page: pageIndex }));
  const free: TextItem[] = [];
  for (const it of page.items) {
    if (!it.s) continue;
    const cy = it.y + 2;
    let best: Cell | null = null;
    for (const c of cells) {
      if (it.x + 0.6 >= c.x && it.x < c.x + c.w - 0.3 && cy >= c.y && cy <= c.y + c.h) {
        if (!best || c.w * c.h < best.w * best.h) best = c;
      }
    }
    (best ? best.items : free).push(it);
  }
  for (const c of cells) {
    c.lines = cellText(c.items);
    c.text = c.lines.join(' ');
  }
  return { cells: cells.filter(c => !isHeaderFooterCell(c)), free };
}
