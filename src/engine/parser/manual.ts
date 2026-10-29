/**
 * 직접 입력 → StudentRecord.
 *
 * 교사가 세특 초안이나 창체 문장을 붙여 넣어 바로 분석할 수 있게 한다.
 *  - kind '세특': seteuk 한 건. 성취도나 등급이 있으면 courses에도 한 줄 넣어 카드에 성적 칩이 보이게 한다.
 *  - kind '창체': changche 한 건. subject를 영역 이름('동아리활동' 등)으로 쓴다. 창체에는 학기가 없으므로 sem은 쓰지 않는다.
 *  - group이 없으면 과목명으로 교과를 추정한다(간단 규칙, 모르면 ''). 교과군(lane) 판정은 분석 쪽 사전이 맡는다.
 */
import type { Course, ManualEntry, ManualInput, StudentRecord, Year } from '../types';
import { norm, nos } from './cells';
import { curriculumOf } from './parse';

/** 과목명 → 교과(성적표의 '교과' 칸에 해당). 순서가 중요하다(앞 규칙이 먼저). */
const GROUP_RULES: [string, RegExp][] = [
  ['수학', /수학|대수|미적분|기하|확률과\s*통계|실용\s*통계/],
  ['영어', /영어|영미/],
  ['제2외국어', /독일어|프랑스어|스페인어|중국어|일본어|러시아어|아랍어|베트남어/],
  ['한문', /한문/],
  ['국어', /국어|문학|화법|독서|작문|언어|매체|논술|고전\s*읽기/],
  ['기술·가정/정보', /정보|소프트웨어|프로그래밍|데이터|인공지능|공학|로봇|기술|가정|지식\s*재산|생활과학|아동|생애\s*설계/],
  ['과학', /과학|물리|화학|생명|지구|천문|우주|역학|전자기|양자|물질|세포|유전|생물|기후|환경|생태/],
  ['사회(역사/도덕 포함)', /사회|역사|한국사|세계사|지리|윤리|정치|법|경제|철학|심리|국제|동아시아|도덕|금융|여행|도시/],
  ['체육', /체육|스포츠|운동|건강/],
  ['예술', /음악|미술|연극|영화|사진|무용|디자인/],
  ['교양', /진로와\s*직업|보건|종교|논리|교육의\s*이해|교육학|인간과/],
];

/** 과목명으로 교과를 추정한다. 모르면 '' */
export function guessGroup(subject: string): string {
  const s = norm(subject);
  for (const [g, re] of GROUP_RULES) if (re.test(s)) return g;
  return '';
}

/** 직접 입력 → StudentRecord */
export function fromManual(input: ManualInput): StudentRecord {
  const S: StudentRecord = {
    meta: { source: 'manual', entry: null },
    courses: [],
    seteuk: [],
    changche: [],
    hopes: [],
    behavior: [],
    warnings: [],
    years: [],
  };
  if (input.name && norm(input.name)) S.meta.name = norm(input.name);
  for (const h of input.hopes || []) {
    if (h && norm(h.text)) S.hopes.push({ year: h.year, text: norm(h.text) });
  }
  const entries: ManualEntry[] = (input.entries || []).filter(e => e && norm(e.text));
  for (const e of entries) {
    const subject = norm(e.subject);
    const text = norm(e.text);
    if (e.kind === '창체') {
      S.changche.push({ year: e.year, area: subject || '창의적 체험활동', hours: null, text });
      continue;
    }
    // 세특
    S.seteuk.push({ year: e.year, sem: e.sem ?? null, names: [subject ? nos(subject) : '(과목 미확인)'], text });
    const ach = (e.ach || '').trim().toUpperCase();
    const rank = typeof e.rank === 'number' && Number.isFinite(e.rank) ? e.rank : null;
    if (subject && (ach || rank !== null)) {
      // 성적 칩을 위해 성적표 한 줄을 만든다. 등급이 있으면 일반 선택, 성취도만 있으면 진로 선택으로 본다.
      const course: Course = {
        year: e.year,
        sem: e.sem ?? 1,
        group: e.group ? norm(e.group) : guessGroup(subject),
        name: subject,
        credit: 0,
        raw: null, avg: null, sd: null,
        ach,
        dist: '',
        rank,
        n: null,
        note: '',
        kind: rank !== null ? 'main' : 'career',
        pass: ach === 'P' ? 'P' : '',
      };
      S.courses.push(course);
    }
  }
  if (!entries.length) S.warnings.push('입력된 기록이 없습니다. 세특이나 창체 문장을 한 건 이상 넣어 주세요.');
  const ys = new Set<Year>();
  for (const c of S.courses) ys.add(c.year);
  for (const s of S.seteuk) ys.add(s.year);
  for (const c of S.changche) ys.add(c.year);
  S.years = [...ys].sort((a, b) => a - b);
  S.meta.curriculum = curriculumOf(S);
  return S;
}
