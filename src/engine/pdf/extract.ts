/**
 * pdf.js 문서 → Page[] 추출기.
 *
 * 브라우저와 Node(vitest) 양쪽에서 쓰기 위해 pdf.js 모듈을 인자로 받는다.
 *   브라우저: import * as pdfjs from 'pdfjs-dist' (+ worker 설정) 후 extractPages(data, pdfjs)
 *   Node:     const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
 *
 * 쪽마다 두 가지를 모은다.
 *   1) 글자(items): getTextContent()의 각 item → {s: 문자열, x, y: 시작 위치, w: 너비}
 *      좌표는 PDF 사용자 좌표(원점 왼쪽 아래, y는 위로 증가)다.
 *   2) 사각형(rects): getOperatorList()의 경로(constructPath)에서 축에 평행한 닫힌 네모를 찾는다.
 *      NEIS 학생부의 표 칸은 이 사각형으로 그려지므로, 이것이 셀 인식의 바탕이 된다.
 *      형광펜처럼 유채색으로 채운 사각형은 표 칸이 아니므로 뺀다.
 *   3) 선분(lines, 선택): 두께 3 이하의 가느다란 사각형과 moveTo-lineTo 선분.
 *      표를 선으로만 그린 PDF를 위해 보존한다(parser/cells.ts의 격자 fallback이 쓴다).
 *
 * pdf.js 판별 호환:
 *   - v5/v6: argsArray[i] = [paintOp, [Float32Array pathData], Float32Array minMax]
 *       pathData 인코딩(DrawOPS): 0 x y = moveTo, 1 x y = lineTo,
 *       2 x1 y1 x2 y2 x3 y3 = curveTo, 3 x1 y1 x2 y2 = quadraticCurveTo, 4 = closePath
 *       PDF의 're'(사각형) 연산도 moveTo + lineTo×3 + closePath 로 풀려서 온다.
 *   - v2~v4: argsArray[i] = [ops: number[], args: number[]] 이고 ops 안에 OPS.rectangle 등이 들어 있으며,
 *       칠하기 연산은 fnArray[i+1]에 따로 온다.
 *
 * 좌표 변환: 경로 좌표는 그 시점의 변환 행렬(CTM) 기준이다. 예를 들어 pdf-lib는 사각형을 그릴 때
 * transform(1,0,0,1,x,y)로 옮긴 뒤 (0,0)에서 그린다. 그래서 save/restore/transform/
 * paintFormXObjectBegin/End를 따라가며 CTM을 유지하고, 점마다 CTM을 적용해 쪽 좌표로 바꾼다.
 */
import type { Page, Rect, TextItem } from '../types';

/** pdf.js 모듈에서 실제로 쓰는 부분만 추린 타입 */
export interface PdfJsLike {
  getDocument(src: any): { promise: Promise<any>; destroy?: () => Promise<void> | void };
  OPS: Record<string, number>;
}

/** 선분(쪽 좌표) */
export interface Line { x1: number; y1: number; x2: number; y2: number }

/** Page에 선분을 덧붙인 타입. types.ts의 Page는 바꾸지 않는다. */
export type ExtractedPage = Page & { lines?: Line[] };

/** 변환 행렬 [a, b, c, d, e, f] (PDF 규약) */
type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m을 먼저 적용하고 그 다음 ctm을 적용하는 합성 행렬 (PDF의 cm 연산 의미) */
function compose(m: Matrix, ctm: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m;
  const [a2, b2, c2, d2, e2, f2] = ctm;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

function applyM(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** 두께가 이 값 이하인 사각형은 표 칸이 아니라 선으로 본다 */
const THIN = 3;

/** 숫자가 거의 같은지(좌표 비교용) */
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

/**
 * 경로 한 덩어리(subpath)의 점 목록을 해석한다.
 * - 축에 평행한 네 변으로 닫힌 4점(또는 시작점으로 되돌아오는 5점) → 사각형
 * - 두 점 → 선분
 * - 그 외(곡선 포함, 비스듬한 변) → 무시
 */
interface Subpath { pts: [number, number][]; closed: boolean; curved: boolean }

function rectOf(sp: Subpath): Rect | null {
  if (sp.curved) return null;
  // 연속 중복점 제거(moveTo를 두 번 찍는 생성기가 있다)
  const pts: [number, number][] = [];
  for (const p of sp.pts) {
    const last = pts[pts.length - 1];
    if (!last || !near(last[0], p[0]) || !near(last[1], p[1])) pts.push(p);
  }
  let closed = sp.closed;
  if (pts.length === 5 && near(pts[0][0], pts[4][0]) && near(pts[0][1], pts[4][1])) { pts.pop(); closed = true; }
  if (pts.length !== 4 || !closed) return null;
  // 변마다 x 또는 y가 같아야 하고, 수평·수직이 번갈아 나와야 한다
  for (let i = 0; i < 4; i++) {
    const p = pts[i], q = pts[(i + 1) % 4];
    const horiz = near(p[1], q[1]), vert = near(p[0], q[0]);
    if (!horiz && !vert) return null;
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  if (w <= 0 && h <= 0) return null;
  return { x, y, w, h };
}

function lineOf(sp: Subpath): Line | null {
  if (sp.curved) return null;
  const pts: [number, number][] = [];
  for (const p of sp.pts) {
    const last = pts[pts.length - 1];
    if (!last || !near(last[0], p[0]) || !near(last[1], p[1])) pts.push(p);
  }
  if (pts.length !== 2) return null;
  return { x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1] };
}

/** 가느다란 사각형 → 가운데를 지나는 선분 */
function thinRectToLine(r: Rect): Line {
  if (r.w >= r.h) { const y = r.y + r.h / 2; return { x1: r.x, y1: y, x2: r.x + r.w, y2: y }; }
  const x = r.x + r.w / 2; return { x1: x, y1: r.y, x2: x, y2: r.y + r.h };
}

/** v5/v6 pathData(Float32Array) → subpath 목록 (CTM 적용) */
function subpathsFromDrawOps(data: ArrayLike<number>, ctm: Matrix): Subpath[] {
  const out: Subpath[] = [];
  let cur: Subpath | null = null;
  const start = (x: number, y: number): Subpath => { const sp: Subpath = { pts: [applyM(ctm, x, y)], closed: false, curved: false }; out.push(sp); return sp; };
  for (let i = 0; i < data.length;) {
    const op = data[i++];
    switch (op) {
      case 0: cur = start(data[i], data[i + 1]); i += 2; break;                 // moveTo
      case 1: if (!cur) cur = start(data[i], data[i + 1]); else cur.pts.push(applyM(ctm, data[i], data[i + 1])); i += 2; break; // lineTo
      case 2: if (cur) { cur.curved = true; cur.pts.push(applyM(ctm, data[i + 4], data[i + 5])); } i += 6; break;         // curveTo
      case 3: if (cur) { cur.curved = true; cur.pts.push(applyM(ctm, data[i + 2], data[i + 3])); } i += 4; break;         // quadraticCurveTo
      case 4: if (cur) cur.closed = true; break;                                  // closePath
      default: return out; // 모르는 코드가 나오면 더 읽지 않는다
    }
  }
  return out;
}

/** v2~v4 형식(ops 코드 배열 + 좌표 배열) → subpath 목록 (CTM 적용) */
function subpathsFromLegacyOps(ops: ArrayLike<number>, args: ArrayLike<number>, OPS: Record<string, number>, ctm: Matrix): Subpath[] {
  const out: Subpath[] = [];
  let cur: Subpath | null = null;
  let k = 0;
  const start = (x: number, y: number): Subpath => { const sp: Subpath = { pts: [applyM(ctm, x, y)], closed: false, curved: false }; out.push(sp); return sp; };
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o === OPS.rectangle) {
      let x = args[k], y = args[k + 1], w = args[k + 2], h = args[k + 3]; k += 4;
      if (w < 0) { x += w; w = -w; }
      if (h < 0) { y += h; h = -h; }
      // 사각형은 네 꼭짓점으로 풀어서 같은 경로로 처리한다
      out.push({ pts: [applyM(ctm, x, y), applyM(ctm, x, y + h), applyM(ctm, x + w, y + h), applyM(ctm, x + w, y)], closed: true, curved: false });
      cur = null;
    } else if (o === OPS.moveTo) { cur = start(args[k], args[k + 1]); k += 2; }
    else if (o === OPS.lineTo) { if (!cur) cur = start(args[k], args[k + 1]); else cur.pts.push(applyM(ctm, args[k], args[k + 1])); k += 2; }
    else if (o === OPS.curveTo) { if (cur) { cur.curved = true; cur.pts.push(applyM(ctm, args[k + 4], args[k + 5])); } k += 6; }
    else if (o === OPS.curveTo2 || o === OPS.curveTo3) { if (cur) { cur.curved = true; cur.pts.push(applyM(ctm, args[k + 2], args[k + 3])); } k += 4; }
    else if (o === OPS.closePath) { if (cur) cur.closed = true; }
  }
  return out;
}

/** 채움 색이 유채색인지 (형광펜 판별). 무채색이면 false */
function rgbColored(a: any[]): boolean {
  let v: number[];
  if (typeof a[0] === 'string') {
    // v4 이후: '#rrggbb'
    const s = a[0].replace('#', '');
    v = [0, 2, 4].map(j => parseInt(s.slice(j, j + 2), 16));
    if (v.some(n => Number.isNaN(n))) return false;
  } else {
    v = [a[0], a[1], a[2]].map(n => (typeof n === 'number' ? n : 0));
    // 0~1 실수(소수점 포함)로 오면 0~255로 맞춘다. 정수면 구버전의 0~255로 본다.
    if (v.every(n => n <= 1) && v.some(n => !Number.isInteger(n))) v = v.map(n => n * 255);
  }
  return Math.max(...v) - Math.min(...v) > 40;
}

function cmykColored(a: any[]): boolean {
  const v = [a[0], a[1], a[2]].map(n => (typeof n === 'number' ? n : 0));
  return Math.max(...v) - Math.min(...v) > 0.15;
}

/**
 * 한 쪽의 연산 목록에서 사각형과 선분을 모은다.
 * @param ol getOperatorList() 결과 {fnArray, argsArray}
 */
export function rectsFromOperatorList(ol: { fnArray: ArrayLike<number>; argsArray: ArrayLike<any> }, OPS: Record<string, number>): { rects: Rect[]; lines: Line[] } {
  const rects: Rect[] = [];
  const lines: Line[] = [];
  const seenR = new Set<string>();
  const seenL = new Set<string>();
  const FILL_OPS = new Set([OPS.fill, OPS.eoFill].filter(n => typeof n === 'number'));
  const CLOSE_OPS = new Set([OPS.closeStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].filter(n => typeof n === 'number'));

  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  let colored = false; // 직전 채움 색이 유채색인지

  const pushRect = (r: Rect) => {
    const key = [r.x, r.y, r.w, r.h].map(v => Math.round(v * 2)).join(',');
    if (seenR.has(key)) return;
    seenR.add(key); rects.push(r);
  };
  const pushLine = (l: Line) => {
    // 방향에 관계없이 같은 선분이면 같은 키
    const a = [l.x1, l.y1], b = [l.x2, l.y2];
    const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
    const key = [...p, ...q].map(v => Math.round(v * 2)).join(',');
    if (seenL.has(key)) return;
    seenL.add(key); lines.push({ x1: p[0], y1: p[1], x2: q[0], y2: q[1] });
  };

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const a = ol.argsArray[i];
    if (fn === OPS.save) { stack.push(ctm); continue; }
    if (fn === OPS.restore) { ctm = stack.pop() ?? IDENTITY; continue; }
    if (fn === OPS.transform) { if (a && a.length >= 6) ctm = compose([a[0], a[1], a[2], a[3], a[4], a[5]], ctm); continue; }
    if (fn === OPS.paintFormXObjectBegin) {
      // 폼 XObject: 상태를 저장하고 폼 행렬을 적용한다(pdf.js canvas와 같은 순서)
      stack.push(ctm);
      const m = a && a[0];
      if (m && m.length >= 6) ctm = compose([m[0], m[1], m[2], m[3], m[4], m[5]], ctm);
      continue;
    }
    if (fn === OPS.paintFormXObjectEnd) { ctm = stack.pop() ?? IDENTITY; continue; }
    if (fn === OPS.setFillRGBColor) { colored = rgbColored(a || []); continue; }
    if (fn === OPS.setFillGray) { colored = false; continue; }
    if (fn === OPS.setFillCMYKColor) { colored = cmykColored(a || []); continue; }
    if (fn !== OPS.constructPath || !a) continue;

    let paintOp: number;
    let subs: Subpath[];
    if (typeof a[0] === 'number') {
      // v5/v6: [paintOp, [Float32Array] | Float32Array, minMax]
      paintOp = a[0];
      const raw = a[1];
      const data: ArrayLike<number> | undefined = raw && typeof raw.length === 'number' && typeof raw[0] !== 'number' ? raw[0] : raw;
      if (!data) continue;
      subs = subpathsFromDrawOps(data, ctm);
    } else {
      // v2~v4: [ops[], args[]] + 다음 연산이 칠하기
      paintOp = ol.fnArray[i + 1];
      subs = subpathsFromLegacyOps(a[0] || [], a[1] || [], OPS, ctm);
    }
    // 유채색 채움(형광펜)은 표 칸이 아니다
    if (colored && FILL_OPS.has(paintOp)) continue;
    const implicitClose = CLOSE_OPS.has(paintOp);
    for (let s = 0; s < subs.length; s++) {
      const sp = subs[s];
      if (implicitClose && s === subs.length - 1) sp.closed = true;
      const r = rectOf(sp);
      if (r) {
        if (Math.min(r.w, r.h) <= THIN) pushLine(thinRectToLine(r)); else pushRect(r);
        continue;
      }
      const l = lineOf(sp);
      if (l) pushLine(l);
    }
  }
  return { rects, lines };
}

/**
 * PDF 바이트 → 쪽 목록.
 * @param data PDF 파일 내용
 * @param pdfjs pdf.js 모듈(getDocument, OPS)
 * @param onProgress 쪽마다 (page, total) 알림. 주면 쪽 사이에 이벤트 루프에 양보한다(화면 갱신용).
 */
export async function extractPages(
  data: Uint8Array,
  pdfjs: PdfJsLike,
  onProgress?: (page: number, total: number) => void,
): Promise<ExtractedPage[]> {
  const task = pdfjs.getDocument({ data, verbosity: 0, isEvalSupported: false, disableFontFace: true });
  const doc = await task.promise;
  const pages: ExtractedPage[] = [];
  try {
    const total: number = doc.numPages;
    for (let p = 1; p <= total; p++) {
      if (onProgress) {
        onProgress(p, total);
        await new Promise<void>(r => setTimeout(r, 0));
      }
      const pg = await doc.getPage(p);
      const ol = await pg.getOperatorList();
      const tc = await pg.getTextContent();
      const { rects, lines } = rectsFromOperatorList(ol, pdfjs.OPS);
      const items: TextItem[] = [];
      for (const it of tc.items as any[]) {
        // 표시 문자열이 없는 항목(marked content 등)과 빈 문자열은 뺀다. 공백만 있는 항목은 낱말 사이를 지키므로 남긴다.
        if (typeof it.str !== 'string' || it.str === '') continue;
        const tr = it.transform || [1, 0, 0, 1, 0, 0];
        items.push({ s: it.str, x: tr[4], y: tr[5], w: typeof it.width === 'number' ? it.width : 0 });
      }
      pages.push({ items, rects, lines });
      if (typeof pg.cleanup === 'function') pg.cleanup();
    }
  } finally {
    // 작업 메모리 정리(워커 종료). 실패해도 결과에는 영향 없음.
    try { await task.destroy?.(); } catch { /* 무시 */ }
  }
  return pages;
}
