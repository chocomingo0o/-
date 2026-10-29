/**
 * 셀 스트림 → StudentRecord (섹션 인식, 성적표, 세특 분리, 창체, 희망분야, 행발).
 *
 * 흐름:
 *   pages → buildCells(쪽마다) → 셀을 쪽 → 위에서 아래(top 내림차순) → 왼쪽부터(x 오름차순)로 정렬 → 한 번 훑는다.
 *   훑는 동안 "지금 어느 섹션인가(sec)", "지금 몇 학년인가(year)", "성적표 머리글의 열 위치(gradeCols)",
 *   "창체 머리글의 열 위치(ccCols)"를 기억하면서 줄을 읽는다.
 *
 * 섹션 제목: '7. 교과학습발달상황'처럼 번호가 붙은 짧은 셀(2줄 이하, 30자 미만).
 *   번호 없는 제목(대입전형자료 조회 양식)은 왼쪽 끝(x<45) 한 줄 셀을 정확히 대조한다.
 *   제목이 사각형 밖의 맨글자로 찍힌 PDF를 위해, 셀 밖 글자 줄 가운데 제목·[1학년]·성명 꼴은 가상 셀로 만들어 넣는다.
 *
 * 교과학습발달상황:
 *   - '학기' 셀이 있는 줄이 성적표 머리글. 같은 줄 셀의 x,w를 열로 기억한다(HEAD 정규식으로 어느 열인지 판정).
 *   - 머리글 종류: 이수여부 열이 있으면 교양(liberal), 석차 열이 있으면 일반(main), 원점수 열만 있으면 진로(career), 그 밖은 체육·예술(art).
 *   - 과목 열과 x,w가 같은 셀(머리글보다 아래, 또는 다음 쪽) = 과목 한 줄. 같은 세로 구간의 다른 열 값을 읽는다.
 *   - 너비 400 넘는 셀 = 세특 본문 후보(pending). 성적표 과목명이 다 모인 뒤에 문단을 나눈다.
 *   - 세특 분리: 줄머리 '(1학기) 과목명: ' 꼴을 보고, 과목명이 성적표 과목명(공백 제거)과 맞으면 새 세특.
 *     '화법과 언어·독서와 작문: '처럼 ·로 이어진 여러 과목도 허용. '자율적 교육과정'은 별도 세특.
 *     맞는 과목이 없으면 직전 세특의 이어지는 줄로 본다. 직전 세특이 없으면 '(과목 미확인)' + 경고.
 *
 * 창의적 체험활동상황: '특기사항' 머리글과 같은 줄의 '영역', '시간', 왼쪽 '학년' 열을 기억한다.
 *   특기사항 열과 x가 같고 폭이 60% 이상인 셀 = 본문. 같은 학년·영역이 이어지면 합친다. '희망분야' 셀 → 오른쪽 값.
 *   봉사활동 실적 표('일자 또는 기간' 머리글)는 건너뛴다(분석에 쓰지 않음).
 *
 * 행동특성 및 종합의견: x>60, w>300 셀. 왼쪽 학년 셀로 학년 확정.
 *
 * 개인정보: 학적사항·수여기관의 학교명은 '○○고등학교'로 가린다.
 * 출결·학교폭력은 StudentRecord에 자리가 없어 읽지 않고 건너뛴다. 수상·독서는 선택 필드(awards, reading)에 넣는다.
 */
import type { Cell, Course, Page, Sem, Seteuk, StudentRecord, TextItem, Year } from '../types';
import type { Line } from '../pdf/extract';
import { buildCells, joinLines, norm, nos } from './cells';

/* ───────────── 섹션 ───────────── */
export type SectionKey = 'basic' | 'attend' | 'award' | 'cert' | 'violence' | 'changche' | 'course' | 'reading' | 'behavior';
export const SECTIONS: [SectionKey, RegExp][] = [
  ['basic', /인적.?학적사항/],
  ['attend', /출결상황/],
  ['award', /수상경력/],
  ['cert', /자격증/],
  ['violence', /학교폭력/],
  ['changche', /창의적\s*체험활동상황/],
  ['course', /교과학습발달상황/],
  ['reading', /독서활동상황/],
  ['behavior', /행동특성\s*및\s*종합의견/],
];

/* ───────────── 성적표 머리글 ───────────── */
export type HeadKey = 'sem' | 'group' | 'name' | 'credit' | 'raw' | 'ach' | 'dist' | 'rank' | 'n' | 'note' | 'pass';
/** 머리글 셀 글자(공백 제거) → 열 이름. 순서대로 먼저 맞는 것을 쓴다. */
export const HEAD: [HeadKey, RegExp][] = [
  ['sem', /^학기$/],
  ['group', /^교과$/],
  ['name', /^과목$/],
  ['credit', /^(학점|단위수|학점수|단위)$/],
  ['raw', /원점수/],
  ['ach', /^성취도(\(수강자수\))?$/],
  ['dist', /분포비율/],
  ['rank', /석차/],
  ['n', /수강자/],
  ['note', /^비고$/],
  ['pass', /이수여부/],
];

interface Col { x: number; w: number }
interface GradeCols { cols: Partial<Record<HeadKey, Col>>; top: number; page: number }
interface CcCols { area: Col | null; hour: Col | null; text: Col; year: Col }

/** 학교명 가리기: '대한고등학교' → '○○고등학교' */
export function maskSchool(s: string): string {
  return s.replace(/[가-힣A-Za-z0-9]+(중학교|고등학교)/g, (_m, k: string) => '○○' + k);
}

const asYear = (n: number | null | undefined): Year | null => (n === 1 || n === 2 || n === 3 ? n : null);
const asSem = (n: number | null | undefined): Sem | null => (n === 1 || n === 2 ? n : null);

/* ───────────── 세특 분리 ───────────── */
export interface PendingSeteuk { year: Year; lines: string[] }

/** 줄머리 '(1학기) 과목명: ' 꼴 */
export const SETEUK_PREFIX = /^(?:\((\d)학기\))?\s*([^:：]{1,60}?)\s*[:：]\s*/;

/**
 * 세특 줄머리의 과목 부분이 성적표 과목명(known, 공백 제거)으로 이루어져 있는지 확인하고 과목명 배열을 돌려준다.
 * '화법과 언어·독서와 작문' → ['화법과언어','독서와작문']. '기술·가정'처럼 과목명 자체에 ·가 있어도 된다.
 * 맞지 않으면 null.
 */
export function validPrefix(p: string, known: Set<string>): string[] | null {
  const parts = p.split('·').map(s => nos(s));
  const res: string[] = [];
  let buf = '';
  for (const part of parts) {
    const cand = buf ? buf + '·' + part : part;
    if (known.has(cand)) { res.push(cand); buf = ''; }
    else buf = cand;
  }
  if (buf !== '') return null;
  return res.length ? res : null;
}

/** 세특 본문 덩어리들을 과목별 세특으로 나눈다 */
export function splitSeteuk(pending: PendingSeteuk[], known: Set<string>): { seteuk: Seteuk[]; warnings: string[] } {
  const out: (Seteuk & { lines: string[] })[] = [];
  const warnings: string[] = [];
  let cur: (Seteuk & { lines: string[] }) | null = null;
  let warned = false;
  for (const blk of pending) {
    for (const ln of blk.lines) {
      if (/^자율적\s*교육과정/.test(ln)) {
        cur = { year: blk.year, sem: null, names: ['자율적교육과정'], text: '', lines: [ln.replace(/^자율적\s*교육과정\s*[:：]?\s*/, '')] };
        out.push(cur);
        continue;
      }
      const m = SETEUK_PREFIX.exec(ln);
      const names = m ? validPrefix(m[2], known) : null;
      if (m && names) {
        cur = { year: blk.year, sem: asSem(m[1] ? +m[1] : null), names, text: '', lines: [ln.slice(m[0].length)] };
        out.push(cur);
      } else if (cur) {
        cur.lines.push(ln);
      } else {
        cur = { year: blk.year, sem: null, names: ['(과목 미확인)'], text: '', lines: [ln] };
        out.push(cur);
        if (!warned) { warnings.push('과목명을 찾지 못한 세특 문단이 있습니다.'); warned = true; }
      }
    }
  }
  const seteuk: Seteuk[] = out.map(s => ({ year: s.year, sem: s.sem, names: s.names, text: joinLines(s.lines) })).filter(s => s.text);
  return { seteuk, warnings };
}

/* ───────────── 셀 스트림 만들기 ───────────── */

/** 셀 밖 글자 줄 가운데 이 꼴이면 가상 셀로 만든다(제목이 사각형 밖에 찍힌 PDF 대비) */
const VIRTUAL_RE: RegExp[] = [
  /^\d{1,2}\.\s*\S/,                       // '7. 교과학습발달상황'
  /^\[\d학년\]$/,                           // '[1학년]'
  /^<.+>$/,                                // '<진로 선택 과목>'
  /성명\s*:/,                               // '성명 : 홍길동'
  /\d{4}년.*(입학|졸업|전입|전출|편입|재입학)/, // 학적사항 한 줄
];

function virtualCells(free: TextItem[], pageIndex: number): Cell[] {
  const rows: { y: number; it: TextItem[] }[] = [];
  for (const it of free.slice().sort((a, b) => b.y - a.y || a.x - b.x)) {
    let r = rows.find(r => Math.abs(r.y - it.y) < 2.6);
    if (!r) { r = { y: it.y, it: [] }; rows.push(r); }
    r.it.push(it);
  }
  const out: Cell[] = [];
  for (const r of rows) {
    const it = r.it.sort((a, b) => a.x - b.x);
    const text = it.map(i => i.s).join('').replace(/\s+/g, ' ').trim();
    if (!text || !VIRTUAL_RE.some(re => re.test(text))) continue;
    const x = it[0].x;
    const right = Math.max(...it.map(i => i.x + (i.w || 0)));
    const w = Math.max(right - x, text.length * 5);
    out.push({ x, y: r.y - 2, w, h: 12, items: it, lines: [text], text, top: r.y + 10, page: pageIndex });
  }
  return out;
}

/** 쪽 목록 → 정렬된 셀 스트림 */
export function buildStream(pages: (Page & { lines?: Line[] })[]): Cell[] {
  const stream: Cell[] = [];
  pages.forEach((pg, pi) => {
    const { cells, free } = buildCells(pg, pi);
    for (const c of cells) { c.page = pi; stream.push(c); }
    for (const v of virtualCells(free, pi)) if (!(v.y < 26 || (v.y < 64 && v.h < 22))) stream.push(v);
  });
  stream.sort((a, b) => a.page - b.page || b.top - a.top || a.x - b.x);
  return stream;
}

/* ───────────── 본 파서 ───────────── */

/** 셀 스트림 → StudentRecord (정렬은 안에서 다시 한다) */
export function parseCells(input: Cell[]): StudentRecord {
  const stream = input.slice().sort((a, b) => a.page - b.page || b.top - a.top || a.x - b.x);
  const S: StudentRecord = {
    meta: { source: 'pdf', entry: null },
    courses: [], seteuk: [], changche: [], hopes: [], behavior: [],
    hakjeok: [], warnings: [], years: [],
  };
  const hakjeok = S.hakjeok as string[];
  // 쪽별 셀(같은 줄 찾기용)
  const byPage: Cell[][] = [];
  for (const c of stream) (byPage[c.page] ||= []).push(c);
  const onPage = (p: number) => byPage[p] || [];
  /** 세로 구간 cy를 지나고 x가 col과 같은 셀 */
  const atCol = (page: number, col: Col | null | undefined, cy: number): Cell | undefined =>
    col ? onPage(page).find(o => Math.abs(o.x - col.x) < 3 && o.y <= cy && o.y + o.h >= cy) : undefined;

  let sec: SectionKey | null = null;
  let year: Year = 1;
  let gradeCols: GradeCols | null = null;
  let gradeKind: Course['kind'] = 'main';
  let ccCols: CcCols | null = null;
  let volCols: { page: number; x: number } | null = null;
  let awCols: { name: Col; grade: Col | null; date: Col | null; org: Col | null; target: Col | null; page: number } | null = null;
  let lastBeh: { year: Year; text: string } | null = null;
  const known = new Set<string>();          // 성적표 과목명(공백 제거)
  const pending: PendingSeteuk[] = [];      // 세특 본문(과목 확인 뒤 처리)

  for (let i = 0; i < stream.length; i++) {
    const c = stream[i];
    const t = norm(c.text);
    // 섹션 제목(번호 있음)
    const hm = /^\d{1,2}\.\s*(.+)$/.exec(t);
    if (hm && c.lines.length <= 2 && t.length < 30) {
      const f = SECTIONS.find(([, re]) => re.test(hm[1]));
      if (f) { sec = f[0]; continue; }
    }
    // 번호 없는 제목(대입전형자료 조회 양식): 왼쪽 끝의 한 줄짜리 제목 셀을 정확히 대조
    if (!hm && c.lines.length === 1 && c.x < 45 && t.length < 20) {
      const f = SECTIONS.find(([, re]) => new RegExp('^' + re.source + '$').test(nos(t)));
      if (f && f[0] !== sec) { sec = f[0]; continue; }
    }
    const ym = /^\[(\d)학년\]$/.exec(nos(t));
    if (ym) { const y = asYear(+ym[1]); if (y) year = y; gradeCols = null; continue; }
    if (/^<.*>$/.test(nos(t))) {
      gradeKind = /교양/.test(t) ? 'liberal' : /체육|예술|과학탐구/.test(t) ? 'art' : 'main';
      gradeCols = null;
      continue;
    }

    if (sec === 'basic') {
      if (/^학적사항$/.test(t)) continue;
      if (/(입학|졸업|전입|전출|편입|재입학|휴학|복학)/.test(t) && /\d{4}년/.test(t)) hakjeok.push(...c.lines.map(maskSchool));
      if (/성명\s*:/.test(t)) {
        const m = /성명\s*:\s*([가-힣A-Za-z]+)/.exec(t);
        if (m) S.meta.name = m[1];
        else {
          // 이름이 오른쪽 다른 셀에 있는 양식
          const nx = onPage(c.page).filter(o => Math.abs(o.top - c.top) < 2 && o.x > c.x).sort((a, b) => a.x - b.x)[0];
          if (nx && /^[가-힣]{2,5}$/.test(nos(nx.text))) S.meta.name = nos(nx.text);
        }
      }
      continue;
    }
    if (sec === 'attend' || sec === 'cert' || sec === 'violence') continue; // 분석에 쓰지 않음(StudentRecord에 자리 없음)

    if (sec === 'award') {
      if (/수상명/.test(nos(t))) {
        const row = onPage(c.page).filter(o => Math.abs(o.top - c.top) < 1.5);
        const fx = (re: RegExp): Col | null => { const o = row.find(o => re.test(nos(o.text))); return o ? { x: o.x, w: o.w } : null; };
        awCols = { name: { x: c.x, w: c.w }, grade: fx(/등급/), date: fx(/수상연월일/), org: fx(/수여기관/), target: fx(/참가대상/), page: c.page };
        continue;
      }
      if (awCols && Math.abs(c.x - awCols.name.x) < 3 && t && !/해당\s*사항\s*없음/.test(t)) {
        const cy = c.y + c.h / 2;
        const at = (col: Col | null) => { const o = atCol(c.page, col, cy); return o ? joinLines(o.lines) : ''; };
        const left = onPage(c.page).filter(o => o.x < c.x - 1 && o.y <= cy && o.y + o.h >= cy && /^[1-3]$/.test(norm(o.text))).sort((a, b) => a.x - b.x);
        const awards = (S.awards ||= []);
        const prev = awards[awards.length - 1];
        const yr = left[0] ? asYear(+norm(left[0].text)) : (prev ? prev.year : null);
        const sm = left[1] ? asSem(+norm(left[1].text)) : (prev && prev.year === yr ? prev.sem : null);
        awards.push({
          year: yr, sem: sm,
          name: joinLines(c.lines).replace(/\(\s*/g, '(').replace(/\s*\)/g, ')'),
          grade: at(awCols.grade), date: at(awCols.date),
          org: at(awCols.org).replace(/[가-힣]+(고등학교)(장)?/g, '○○$1$2'),
          target: at(awCols.target),
        });
      }
      continue;
    }

    if (sec === 'reading') {
      if (c.x > 120 && c.w > 300 && t && !/독서활동상황/.test(nos(t))) {
        const cy = c.y + c.h / 2;
        const yc = onPage(c.page).find(o => o.x < 60 && o.y <= cy && o.y + o.h >= cy);
        const ac = onPage(c.page).find(o => o.x > 60 && o.x < c.x - 1 && o.y <= cy && o.y + o.h >= cy);
        const reading = (S.reading ||= []);
        const prev = reading[reading.length - 1];
        const yv = (yc && /^[1-3]$/.test(norm(yc.text)) ? asYear(+norm(yc.text)) : null) ?? (prev ? prev.year : 1);
        reading.push({ year: yv, area: ac ? norm(ac.text) : '', text: joinLines(c.lines) });
      }
      continue;
    }

    if (sec === 'changche') {
      if (/봉\s*사\s*활\s*동\s*실\s*적/.test(t)) { volCols = null; continue; }
      if (nos(t) === '특기사항') {
        // 창체 머리글: 같은 줄의 영역/시간 셀, 왼쪽의 학년 셀
        const row = onPage(c.page).filter(o => Math.abs(o.top - c.top) < 1);
        const fx = (re: RegExp): Col | null => { const o = row.find(o => re.test(nos(o.text))); return o ? { x: o.x, w: o.w } : null; };
        const yr = onPage(c.page).find(o => /^학년$/.test(nos(o.text)) && o.top >= c.top - 1 && o.y <= c.y + 1 && o.x < c.x);
        ccCols = { area: fx(/^영역$/), hour: fx(/^시간$/), text: { x: c.x, w: c.w }, year: yr ? { x: yr.x, w: yr.w } : { x: 30, w: 42 } };
        continue;
      }
      if (/일자또는기간/.test(nos(t))) { volCols = { page: c.page, x: c.x }; continue; }
      if (volCols && c.page === volCols.page) continue; // 봉사활동 실적 표는 읽지 않는다
      if (!ccCols) continue;
      // 특기사항 본문 셀
      if (Math.abs(c.x - ccCols.text.x) < 3 && c.w > ccCols.text.w * 0.6 && t) {
        const cy = c.y + c.h / 2;
        const pick = (col: Col | null) => { const o = atCol(c.page, col, cy); return o ? norm(o.text) : null; };
        const area = pick(ccCols.area) || '';
        const hour = pick(ccCols.hour) || '';
        const ys = pick(ccCols.year);
        const last = S.changche[S.changche.length - 1];
        const yr: Year = (ys && /^[1-3]$/.test(ys) ? asYear(+ys) : null) ?? (last ? last.year : year);
        if (last && last.year === yr && last.area === area) last.text = joinLines([last.text, ...c.lines]);
        else S.changche.push({ year: yr, area, hours: +hour || null, text: joinLines(c.lines) });
        continue;
      }
      if (/^희망분야$/.test(nos(t))) {
        const val = onPage(c.page).find(o => Math.abs(o.top - c.top) < 1 && o.x > c.x + 5);
        const cy = c.y + c.h / 2;
        const yo = atCol(c.page, ccCols.year, cy);
        const last = S.changche[S.changche.length - 1];
        const yv: Year = (yo && /^[1-3]$/.test(norm(yo.text)) ? asYear(+norm(yo.text)) : null) ?? (last ? last.year : year);
        const text = val ? norm(val.text) : '';
        if (text) S.hopes.push({ year: yv, text });
        continue;
      }
      continue;
    }

    if (sec === 'course') {
      if (/^학기$/.test(nos(t))) {
        // 성적표 머리글: 같은 줄 셀의 열 위치
        const row = onPage(c.page).filter(o => Math.abs(o.top - c.top) < 1.5);
        const cols: Partial<Record<HeadKey, Col>> = {};
        for (const o of row) {
          const k = nos(o.text);
          for (const [key, re] of HEAD) {
            if (re.test(k) && !cols[key]) { cols[key] = { x: o.x, w: o.w }; break; }
          }
        }
        gradeCols = { cols, top: c.y, page: c.page };
        gradeKind = cols.pass ? 'liberal' : cols.rank ? 'main' : cols.raw ? 'career' : 'art';
        continue;
      }
      if (/^과목세부능력및특기사항$/.test(nos(t))) continue;
      if (/세부능력\s*및\s*특기사항/.test(t) && c.lines.length <= 1) { gradeCols = null; continue; }
      if (/해당 학년의 자료가 없습니다/.test(t)) continue;
      if (/^※/.test(t)) continue;
      const nameCol = gradeCols?.cols.name;
      if (gradeCols && nameCol && Math.abs(c.x - nameCol.x) < 3 && Math.abs(c.w - nameCol.w) < 4 && t && nos(t) !== '과목'
        && (c.y < gradeCols.top - 0.5 || c.page > gradeCols.page)) {
        const cy = c.y + c.h / 2;
        const g = (k: HeadKey): string => { const o = atCol(c.page, gradeCols!.cols[k], cy); return o ? norm(o.text) : ''; };
        // 낱글자로 떨어진 과목명 붙이기: '수 학' → '수학', 'A B' → 'AB'
        const fixName = (s: string) => s.replace(/([가-힣])\s(?=[가-힣]$)/, '$1').replace(/([A-Za-z])\s(?=[A-Za-z])/g, '$1').trim();
        const raw = g('raw');
        let rv: number | null = null, avg: number | null = null, sd: number | null = null;
        const rm = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(?:\((\d+(?:\.\d+)?)\))?/.exec(raw);
        if (rm) { rv = +rm[1]; avg = +rm[2]; sd = rm[3] ? +rm[3] : null; }
        let ach = g('ach'), n = g('n');
        const an = /^([A-EP])\s*\((\d+)\)/.exec(ach);
        if (an) { ach = an[1]; n = n || an[2]; }
        const rank = g('rank');
        const semv = g('sem');
        const dist = g('dist').replace(/\)\s*(?=[A-E]\()/g, ') ');
        const grp = g('group').replace(/\s+/g, '');
        const name = fixName(t);
        const pass = g('pass');
        S.courses.push({
          year,
          sem: /^[12]$/.test(semv) ? asSem(+semv) : null,
          group: grp,
          name,
          credit: +g('credit') || 0,
          raw: rv, avg, sd,
          ach: ach || pass,
          dist,
          rank: /^\d$/.test(rank) ? +rank : null,
          n: +n || null,
          note: g('note'),
          kind: gradeKind,
          pass,
        });
        known.add(nos(name));
        continue;
      }
      // 세특 본문 셀(넓은 셀)
      if (c.w > 400 && c.lines.length && !/^이수학점/.test(t) && !/^이수단위/.test(t)) { pending.push({ year, lines: c.lines }); continue; }
      continue;
    }

    if (sec === 'behavior') {
      if (/^학년$/.test(nos(t)) || /^행동특성및종합의견$/.test(nos(t))) continue;
      if (c.x > 60 && c.w > 300 && t) {
        const cy = c.y + c.h / 2;
        const yc = onPage(c.page).find(o => o.x < c.x && o.y <= cy && o.y + o.h >= cy);
        const yv = yc && /^[1-3]$/.test(norm(yc.text)) ? asYear(+norm(yc.text)) : null;
        if (yv && (!lastBeh || lastBeh.year !== yv)) { lastBeh = { year: yv, text: joinLines(c.lines) }; S.behavior.push(lastBeh); }
        else if (lastBeh) lastBeh.text = joinLines([lastBeh.text, ...c.lines]);
      }
      continue;
    }
  }

  // 학기 보정: 같은 학년에서 학기 값이 비어 있으면 앞 줄 값을 상속(없으면 1)
  let ps: Sem | null = null, py: Year | null = null;
  for (const c of S.courses) {
    if (c.year !== py) { ps = null; py = c.year; }
    if (c.sem) ps = c.sem; else c.sem = ps || 1;
  }
  // 세특 분리
  const sp = splitSeteuk(pending, known);
  S.seteuk = sp.seteuk;
  S.warnings.push(...sp.warnings);
  for (const c of S.courses) {
    if (!S.seteuk.some(s => s.year === c.year && s.names.includes(nos(c.name)))) c.noSeteuk = true;
  }
  // 학년 목록
  S.years = [...new Set<Year>([...S.courses.map(c => c.year), ...S.changche.map(c => c.year), ...S.seteuk.map(s => s.year)])].sort((a, b) => a - b);
  // 입학 연도, 등급제
  const ent = hakjeok.map(h => /(\d{4})년\s*\d+월\s*\d+일.*제1학년\s*입학/.exec(h)).find(Boolean);
  S.meta.entry = ent ? +ent[1] : null;
  const maxRank = Math.max(0, ...S.courses.map(c => c.rank || 0));
  S.meta.scale = S.meta.entry && S.meta.entry >= 2025 ? 5 : maxRank > 5 ? 9 : S.meta.entry ? 9 : 5;
  S.meta.curriculum = curriculumOf(S);
  if (!S.courses.length) S.warnings.push('교과 성적표를 찾지 못했습니다. NEIS에서 출력한 학교생활기록부 PDF인지 확인해 주세요.');
  if (!hakjeok.length) delete S.hakjeok;
  return S;
}

/** 쪽 목록 → StudentRecord */
export function parseStudent(pages: (Page & { lines?: Line[] })[]): StudentRecord {
  return parseCells(buildStream(pages));
}

/** 교육과정 판정: 입학 2025년 이후 또는 2022 개정 과목명(공통국어1 등)이면 2022 */
export function curriculumOf(S: StudentRecord): 2015 | 2022 {
  if (S.meta.entry) return S.meta.entry >= 2025 ? 2022 : 2015;
  if (S.courses.some(c => /^(공통국어|공통수학|공통영어|통합사회|통합과학|한국사|과학탐구실험)[12]$/.test(nos(c.name)))) return 2022;
  if (S.seteuk.some(s => s.names.some(n => /^(공통국어|공통수학|공통영어|통합사회|통합과학|한국사|과학탐구실험)[12]$/.test(n)))) return 2022;
  return 2015;
}
