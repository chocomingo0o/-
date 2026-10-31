/**
 * 글자·사각형 → 셀.
 *
 * NEIS 학생부 PDF는 표의 칸마다 사각형을 그리고 그 안에 글자를 찍는다.
 * 그래서 "어느 사각형 안에 어떤 글자가 들어 있나"만 알면 표를 읽을 수 있다.
 *
 * 규칙(참고 앱의 파서와 같다):
 *  - cellText: y 차이가 2.6 이내인 글자는 같은 줄. 줄은 위에서 아래(y 내림차순), 줄 안은 왼쪽부터(x 오름차순).
 *  - joinLines: NEIS는 글자 단위로 줄을 바꾸고, 줄이 바뀌는 자리의 띄어쓰기를 지운다(실제 출력본에서 줄 앞뒤 공백 0건).
 *    그래서 줄 경계마다 띄어 쓸지 붙일지를 추정한다. 같은 문서 안에서 줄 가운데 온전히 쓰인 낱말 목록
 *    (buildJoinLexicon)이 있으면 그것을 먼저 근거로 쓰고, 없으면 조사와 어미 규칙만 쓴다. 판단 순서는 decideJoin 주석 참고.
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

/** (옛 규칙, 호환용) 줄 끝이 이 글자면 다음 줄과 띄어서 잇는다(조사·어미·문장부호) */
export const SPACE_END = /[을를은는에며함음임됨여의와과로고게서도.,)』」’”·;:]$/;
/** 다음 줄이 이 글자로 시작하면 붙여 잇는다(문장부호) */
export const NOSPACE_START = /^[.,)』」’”·;:%]/;

/**
 * 줄 경계 판단용 낱말 사전.
 * whole: 줄 가운데에서 온전히 쓰인 낱말(앞뒤 문장부호를 뗀 꼴)과 횟수. 줄의 첫 낱말과 끝 낱말은 잘린 조각일 수 있어 넣지 않는다.
 * inner: 그 낱말들을 공백으로 이은 문자열. 붙여 쓴 꼴('교과서')이 다른 곳에 있는지 찾을 때 쓴다.
 */
export interface JoinLexicon { whole: Map<string, number>; inner: string }

const EDGE_PUNCT = /^[\s'"‘’“”『』「」()[\]{}<>〈〉《》.,;:!?·…~-]+|[\s'"‘’“”『』「」()[\]{}<>〈〉《》.,;:!?·…~-]+$/g;
const clean = (w: string): string => w.replace(EDGE_PUNCT, '');

/** 문서의 모든 줄에서 낱말 사전을 만든다 */
export function buildJoinLexicon(lines: string[]): JoinLexicon {
  const whole = new Map<string, number>();
  const parts: string[] = [];
  for (const ln of lines) {
    const toks = ln.trim().split(/\s+/);
    for (let i = 1; i < toks.length - 1; i++) {
      const w = clean(toks[i]);
      if (!w) continue;
      whole.set(w, (whole.get(w) ?? 0) + 1);
      parts.push(w);
    }
  }
  return { whole, inner: ' ' + parts.join(' ') + ' ' };
}

/** 줄 첫 낱말이 이것뿐이면 앞 낱말에 붙는 조사나 어미 조각이다(예: '보고서|를', '보여|줌.', '겸손하|게'). '이', '등', '일'처럼 홀로 쓰이는 말은 뺐다. */
const BOUND_TOKEN = new RegExp('^(?:' + [
  '을', '를', '은', '는', '가', '의', '에', '에서', '에게', '에서의', '에서는', '에서도', '에는', '에도', '께', '께서',
  '와', '과', '와의', '과의', '로', '으로', '로서', '으로서', '로써', '으로써', '로는', '으로는', '로도', '으로도',
  '도', '만', '까지', '부터', '처럼', '보다', '이나', '나', '이며', '며', '이고', '고', '라', '이라', '라는', '이라는', '라고', '이라고', '란', '이란',
  '하고', '하여', '하며', '하는', '하던', '한', '할', '함', '해', '해서', '했', '했고', '했으며', '했던', '했다', '했음', '한다',
  '하였', '하였고', '하였으며', '하였음', '하였다', '하였던', '하게', '하지', '하기', '하면', '하면서', '함으로써', '함을', '함과',
  '되어', '되는', '된', '됨', '될', '되었', '되었고', '되었으며', '되었음', '됐', '됨을',
  '임', '임을', '음', '음을', '줌', '움', '게', '기', '지', '면', '면서', '서', '서는', '서도', '서의', '적', '적인', '적으로', '성', '화', '들', '들의', '들을', '들이', '씩',
  '이다', '다', '요', '여', '으며', '이면서', '인', '던', '시켜', '시킴', '시키는', '시키고', '시킬', '시킨', '시키며',
  '다는', '다고', '한다는', '한다고', '화하여', '화하는', '화한', '화하고', '화된', '화되는', '화되어', '써',
].join('|') + ')$');

/** 띄어쓰기 앞에 오는 꼴(어절 끝): 이 꼴로 끝나는 두 글자 이상 낱말 뒤는 띄운다. '서', '도'처럼 낱말 안에도 흔한 글자는 넣지 않았다. */
const WORD_END = /(?:함|음|임|됨|줌|움|며|하고|되고|이고|않고|있고|없고|하여|하며|해서|에서|면서|으며|지만|는데|어서|아서|여서|하게|하면|으면|다면|라면|적인|적으로|하는|되는|하던|있는|없는|않은|같은|다른|많은|높은|낮은|새로운|위한|대한|관한|통한|따른|의한|대해|위해|통해|따라|동안|함께|또한|특히|을|를|은|는|이|가|의|에|와|과|으로|에게|까지|부터|처럼|보다|던|으나|이나|었으나|였으나|지만|에서도|에도|로도|까지도|도록|하기도|되기도|[가-힣]{2}고)$/;
/** 세 글자 이상 낱말이 '로'(주제로, 스스로), '적'(공학적, 자발적), 연결형 '해'(활용해, 비유해)로 끝나면 어절 끝으로 본다. '분해, 이해'처럼 '해'로 끝나는 명사는 뺀다. */
const LONG_WORD_END = /[가-힣]{2}(?:로|적)$|[가-힣]{2}해$/;
const HAE_NOUN = /(?:분해|용해|융해|이해|피해|방해|오해|견해|손해|화해|재해|공해|폐해|난해|저해|가해|조해)$/;
/** 홀로 쓰이는 관형사와 수사: 이 낱말 자체로 끝나면 띄운다 */
const DETERMINER = /^(?:두|세|네|한|여러|모든|각|각각|같은|이런|그런|저런|어떤|첫|새|온갖|다섯|여섯|일곱|여덟|아홉|열|스무|몇|및|또|더|잘|약|총|매|후)$/;
/** 마지막 글자가 받침 ㄴ, ㄹ로 끝나는 두 글자 이상 낱말(관형형 '나눈, 적신, 할' 또는 '시간, 기술' 같은 온전한 명사)은 대개 어절 끝이다 */
function endsWithNL(w: string): boolean {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return false;
  const jong = c % 28;
  return jong === 4 || jong === 8;
}
/** 숫자와 단위로 끝나는 말('1학기', '3회') 뒤는 띄운다 */
const NUM_UNIT_END = /\d(?:학기|학년|회|명|개|번|가지|권|차|시간|주|일|년|월|%|쪽|곳)$/;
const PUNCT_END = /[.,;:)\]』」’”…!?]$/;
/** '이'는 관형사('이 실험')이기도 하고 명사 뒤 조사('과정이')이기도 하다. 앞 낱말이 연결 어미로 끝나면 관형사로 본다. */
const CONNECTIVE_END = /(?:며|고|서|여|어|아|면|는데|지만|나|해|도록|게)$/;
/** 다음 줄 첫 낱말이 홀로 쓰이는 의존 명사나 접속 부사면('수업|후', '수업|중', '실험|등', '실험|및') 두 글자 이상 낱말 뒤에서 띄운다. 한 글자 뒤는 '이후, 집중'처럼 한 낱말이기 쉬워 붙인다. */
const STANDALONE_B = /^(?:후|중|등|및)[,.]?$/;

/**
 * 줄 경계에서 띄울지(true) 붙일지(false) 정한다.
 * a = 앞 줄의 끝 낱말, b = 다음 줄의 첫 낱말.
 *  0) 날짜('2024.|03.28.')와 동아리 시간('…탐구부)|(34시간)')은 붙이고, 기간 표시 '-', '~' 앞뒤는 띄운다
 *  1) 다음 줄이 문장부호로 시작 → 붙임
 *  2) a가 조사(을, 를, 에서, 에게, 으로)로 끝나고 b가 '하는, 함, 한'처럼 '하다'의 꼴이면 → 띄움
 *     b가 조사나 어미 조각(BOUND_TOKEN), 또는 연결 어미로 끝나지 않는 낱말 뒤의 '이' → 붙임
 *     b가 홀로 쓰이는 '후, 중, 등, 및'이고 a가 두 글자 이상 → 띄움
 *  3) a가 문장부호로 끝남 → 띄움
 *  4) 사전의 어떤 낱말 안에 a+(b의 첫 글자)가 들어 있음 → 붙임(예: '교과|서에' ← 문서의 '교과서')
 *  5) 사전에 a와 b가 모두 온전한 낱말로 있음, 또는 b만 있고 붙인 꼴은 없음 → 띄움(예: '뛰어난|이해력을')
 *  6) 영어 소문자 뒤에 대문자로 시작하는 낱말 → 띄움('The|Brain')
 *  7) a가 홀로 쓰이는 관형사나 수사(두, 여러, 모든…), 숫자+단위, 어절 끝 꼴(WORD_END, LONG_WORD_END),
 *     받침 ㄴ, ㄹ로 끝나는 두 글자 이상 낱말 → 띄움
 *  8) 그 밖 → 붙임(낱말 가운데에서 끊긴 경우)
 */
export function decideJoin(prevLine: string, nextLine: string, lex?: JoinLexicon): boolean {
  const next = nextLine.trimStart();
  const aRaw = prevLine.trimEnd().split(/\s+/).pop() ?? '';
  const bRaw = next.split(/\s+/)[0] ?? '';
  if (/\d\.$/.test(aRaw) && /^\d/.test(bRaw)) return false;
  if (/^\(\d{1,3}\s*시간\)/.test(next)) return false;
  if (/^[-~]$/.test(aRaw) || /^[-~]$/.test(bRaw)) return true;
  if (NOSPACE_START.test(next)) return false;
  const a = clean(aRaw);
  const b = clean(bRaw);
  // '한'은 '~한'의 조각이기도 하고 '한 번, 한 달'의 관형사이기도 하다. 뒤에 세는 말이 오면 관형사로 본다.
  const second = next.split(/\s+/)[1] ?? '';
  const isCounted = b === '한' && /^(?:번|달|명|가지|권|개|사람|학기|해|차례|걸음|편|단계|시간|주|번째|곳|문장|쪽)/.test(second);
  // 조사로 끝난 낱말 뒤의 '하는, 함, 한 …'은 앞 낱말에 붙는 어미가 아니라 따로 쓰는 동사다('사이에서|하는', '정리를|함')
  if (a.length >= 2 && /(?:을|를|에서|에게|으로)$/.test(a) && /^(?:하|한|할|함|해|했)/.test(b)) return true;
  if (b && BOUND_TOKEN.test(b) && !isCounted) return false;
  if (b === '이' && bRaw === '이' && a && !PUNCT_END.test(aRaw) && !CONNECTIVE_END.test(a)) return false;
  if (STANDALONE_B.test(bRaw) && a.length >= 2) return true;
  if (PUNCT_END.test(aRaw)) return true;
  if (!a || !b) return false;
  if (lex) {
    const aWhole = lex.whole.get(a) ?? 0;
    const bWhole = lex.whole.get(b) ?? 0;
    // 4) 앞 조각에 다음 줄 첫 글자를 붙인 꼴이 다른 낱말 안에 있으면 한 낱말이 잘린 것(예: '지수함|수나' ← '지수함수')
    const joinedHit = lex.inner.includes(a + b[0]);
    if (joinedHit && !(aWhole >= 2 && bWhole >= 1)) return false;
    // 5) 앞뒤가 모두 다른 곳에서 온전한 낱말로 쓰였으면 띄운다
    if (aWhole >= 1 && (bWhole >= 1 || (b.length >= 2 && lex.inner.includes(' ' + b.slice(0, 2))))) return true;
    if (bWhole >= 1 && a.length >= 2 && !joinedHit) return true;
  }
  if (/[a-z]$/.test(a) && /^[A-Z]/.test(b)) return true;
  if (DETERMINER.test(a)) return true;
  if (NUM_UNIT_END.test(a)) return true;
  if (a.length >= 2 && (WORD_END.test(a) || endsWithNL(a))) return true;
  if (LONG_WORD_END.test(a) && !HAE_NOUN.test(a)) return true;
  return false;
}

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

/** 줄 배열 → 한 문자열. lex(같은 문서의 낱말 사전)가 있으면 줄 경계 판단이 더 정확해진다. */
export function joinLines(lines: string[], lex?: JoinLexicon): string {
  let out = '';
  for (const raw of lines) {
    const ln = raw.replace(/\s+/g, ' ');
    if (!ln.trim()) continue;
    if (!out) { out = ln.trim(); continue; }
    if (/\s$/.test(out) || /^\s/.test(ln)) { out = out.trimEnd() + ' ' + ln.trim(); continue; }
    out += (decideJoin(out, ln, lex) ? ' ' : '') + ln.trim();
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
