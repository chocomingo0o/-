/**
 * StudentRecord → Rec[] (분석 단위 만들기).
 *
 * - slotT     : 시간 좌표. (학년-1)*2 + (1학기 0, 2학기 1, 학기 없음 0.5)
 * - slotIdx   : 학기 칸 번호(0=1-1 … 5=3-2). 학기 없는 기록은 그 학년의 두 칸.
 * - semLabel  : '1학년 2학기' | '1학년 (학년 전체)'
 * - subjectStop: 과목명 불용어(낱말 뽑기에서 과목명을 빼기 위해)
 * - buildRecords: 세특 1건, 창체 1건이 각각 Rec 하나. 성적 칩과 교과군을 붙이고 분석 필드는 빈 값으로 둔다.
 *
 * 이 파일은 DOM에 의존하지 않는다.
 */
import type { Course, GradeChip, LaneKey, Rec, Sem, Seteuk, SlotIndex, StudentRecord, Year } from '../types';
import { baseSubject, laneOf, laneOfArea, subjectType } from '../dict/subjects';
import { nos } from './text';

/* ───────────────────────── 시간 좌표 ───────────────────────── */

/** (year-1)*2 + (sem===1 ? 0 : sem===2 ? 1 : 0.5). 학기 없는 기록은 두 학기 사이에 놓인다. */
export function slotT(year: Year, sem: Sem | null): number {
  return (year - 1) * 2 + (sem === 1 ? 0 : sem === 2 ? 1 : 0.5);
}

/** 학기 칸 번호. 학기가 없으면 그 학년의 두 칸 모두. */
export function slotIdx(r: { year: Year; sem: Sem | null }): SlotIndex[] {
  const base = (r.year - 1) * 2;
  if (r.sem === 1 || r.sem === 2) return [(base + r.sem - 1) as SlotIndex];
  return [base as SlotIndex, (base + 1) as SlotIndex];
}

/** '1학년 2학기', 학기가 없으면 '1학년 (학년 전체)' */
export function semLabel(r: { year: Year; sem: Sem | null }): string {
  return `${r.year}학년 ${r.sem ? `${r.sem}학기` : '(학년 전체)'}`;
}

/* ───────────────────────── 과목명 다루기 ───────────────────────── */

/** 자율적 교육과정 세특의 이름 */
const SELF_DIRECTED = /^자율적?\s*교육과정$/;

/** 과목명 비교용: 공백을 빼고 끝의 영문 I·II·III를 로마 숫자로 통일한다. */
function keyName(name: string): string {
  const k = nos(name);
  if (/III$/.test(k)) return k.replace(/III$/, 'Ⅲ');
  if (/II$/.test(k)) return k.replace(/II$/, 'Ⅱ');
  if (/I$/.test(k)) return k.replace(/I$/, 'Ⅰ');
  return k;
}

/**
 * 과목명 불용어. 성적표와 세특의 과목명(공백 제거)과 그 기본형(숫자·Ⅰ·Ⅱ 제거)을 모은다.
 * '통합과학1' → '통합과학1', '통합과학'. '물리학Ⅰ·화학Ⅰ'처럼 과목 여러 개를 이은 이름은 나눠서도 넣는다.
 * 단, '기술·가정', '사회·문화'처럼 가운뎃점이 이름의 일부인 과목은 조각('기술', '가정')을 넣지 않는다
 * (조각이 등록된 과목일 때만 나눈다). '(과목 미확인)' 같은 표시는 넣지 않는다.
 */
export function subjectStop(S: StudentRecord): Set<string> {
  const out = new Set<string>();
  const put = (k: string): void => {
    if (!k || /^\(/.test(k)) return;
    out.add(k);
    const b = baseSubject(k);
    if (b.length >= 2) out.add(b);
  };
  const add = (name: string): void => {
    const whole = nos(name ?? '');
    put(whole);
    if (/[·/,]/.test(whole)) {
      for (const part of whole.split(/[·/,]/)) {
        if (part.length >= 2 && subjectType(part) !== '기타') put(part);
      }
    }
  };
  for (const c of S.courses) add(c.name);
  for (const s of S.seteuk) for (const n of s.names) add(n);
  return out;
}

/* ───────────────────────── 기록 만들기 ───────────────────────── */

/** 분석 필드를 빈 값으로 채운 Rec. 분석(depth.ts, topic.ts …)이 뒤에서 채운다. */
function emptyRec(base: Pick<Rec, 'id' | 'kind' | 'subj' | 'lane' | 'year' | 'sem' | 'text' | 'grades'>): Rec {
  return {
    ...base,
    t: slotT(base.year, base.sem),
    sents: [],
    methods: [],
    methodCounts: {},
    depth: 1,
    faint: false,
    key: [],
    acts: [],
    fuCount: 0,
    connectCue: false,
    tf: new Map<string, number>(),
    ktf: new Set<string>(),
    fields: [],
    topic: '',
    topicKind: 'k',
    kw: [],
    summary: '',
    summaryFu: false,
    themes: [],
    skills: [],
    skillCounts: {},
  };
}

/** 세특 1건에 해당하는 성적표 줄들(같은 학년, 이름 일치). 이름 순서는 세특의 names 순서를 따른다. */
function coursesOf(S: StudentRecord, s: Seteuk): Course[] {
  const out: Course[] = [];
  for (const n of s.names) {
    const k = keyName(n);
    for (const c of S.courses) if (c.year === s.year && keyName(c.name) === k) out.push(c);
  }
  return out;
}

/**
 * 성적 칩. 과목·학기 기준으로 중복을 없애고 학기 순으로 늘어놓는다.
 * 성취도는 A~E 또는 P만 인정하고(그 외는 빈 값), 성취도도 등급도 없으면 칩을 만들지 않는다.
 * 세특에 학기가 있으면 그 학기 성적만 붙인다.
 */
function gradeChips(cs: Course[], sem: Sem | null): GradeChip[] {
  const seen = new Set<string>();
  const out: GradeChip[] = [];
  const list = cs.filter((c) => !sem || c.sem === sem).slice().sort((a, b) => (a.sem ?? 0) - (b.sem ?? 0));
  for (const c of list) {
    let ach = (c.ach || c.pass || '').replace(/\s/g, '').toUpperCase();
    if (!/^[A-EP]$/.test(ach)) ach = '';
    const rank = typeof c.rank === 'number' && Number.isFinite(c.rank) ? c.rank : null;
    if (!ach && rank === null) continue;
    const key = `${nos(c.name)}|${c.sem ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ sem: c.sem, ach, rank });
  }
  return out;
}

/** 창체 영역 이름에서 카드 제목을 만든다. 끝의 '(34시간)' 같은 시간 표시는 뗀다(hours 필드에 따로 있음). */
function areaTitle(area: string): string {
  const t = (area ?? '').replace(/\(\s*\d+\s*시간\s*\)\s*$/, '').trim();
  return t || '창체';
}

/**
 * 세특과 창체를 Rec으로 바꾼다.
 * - 본문이 12자 미만이면 기록으로 세지 않는다. 학년은 1~3만.
 * - 세특: 이름이 성적표와 맞으면 성적표의 표기(공백 포함)를 카드 이름으로 쓰고, 여러 과목이면 '·'로 잇는다.
 *   학기가 없으면 해당 과목 성적표의 학기가 하나뿐일 때 그 학기를 쓴다.
 *   교과군은 성적표의 교과(group)와 과목명으로 판정하고, 자율적 교육과정은 '융합(자율과정)'.
 * - 창체: 학기 없음(sem null), 교과군은 영역 이름으로 판정(동아리/진로/자율·자치).
 * - id는 세특 'S{번호}', 창체 'C{번호}'. 번호는 원래 배열의 위치라서 건너뛴 기록이 있으면 비는 번호가 생긴다.
 */
export function buildRecords(S: StudentRecord): Rec[] {
  const recs: Rec[] = [];
  const okYear = (y: number): y is Year => y === 1 || y === 2 || y === 3;

  S.seteuk.forEach((s, i) => {
    if (!s.text || s.text.trim().length < 12) return;
    if (!okYear(s.year)) return;
    const names = s.names.length ? s.names : ['(과목 미확인)'];
    const cs = coursesOf(S, s);
    const subj = names
      .map((n) => {
        const k = keyName(n);
        const c = S.courses.find((x) => keyName(x.name) === k);
        return c ? c.name : n;
      })
      .join('·');
    let sem: Sem | null = s.sem ?? null;
    if (!sem && cs.length) {
      const sems = [...new Set(cs.map((c) => c.sem))];
      if (sems.length === 1 && (sems[0] === 1 || sems[0] === 2)) sem = sems[0];
    }
    const lane: LaneKey = SELF_DIRECTED.test(nos(names[0])) ? '융합(자율과정)' : laneOf(cs[0]?.group, names[0]);
    recs.push(
      emptyRec({
        id: `S${i}`,
        kind: '세특',
        subj,
        lane,
        year: s.year,
        sem,
        text: s.text,
        grades: gradeChips(cs, sem),
      }),
    );
  });

  S.changche.forEach((c, i) => {
    if (!c.text || c.text.trim().length < 12) return;
    if (!okYear(c.year)) return;
    recs.push(
      emptyRec({
        id: `C${i}`,
        kind: '창체',
        subj: areaTitle(c.area),
        lane: laneOfArea(c.area ?? ''),
        year: c.year,
        sem: null,
        text: c.text,
        grades: [],
      }),
    );
  });

  return recs;
}
