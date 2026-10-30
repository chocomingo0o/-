/**
 * 분석 엔진 입구.
 *
 * - analyze(S, userDict)              : 학생부(StudentRecord) 하나를 끝까지 분석해 Analysis를 돌려준다.
 * - highlightSegments(r, an, userDict): 기록 상세 창에서 원문에 형광펜을 칠할 구간(방법 표현, 관심 주제 낱말, 과학 탐구 기능).
 *
 * 분석 순서(설계 명세 7장). 아래 모듈은 모두 DOM에 의존하지 않으므로 Node(vitest)에서 그대로 돌아간다.
 *   buildRecords   세특 1건, 창체 1건 → Rec 하나(12자 미만은 제외)
 *   buildCtx       사전(방법·기능·관심 분야·성찰·후속·연결·평가 패턴)을 한 번 컴파일
 *   analyzeRecord  기록마다 문장 점수, 방법, 깊이, 핵심 문장, 활동 흐름, 낱말 빈도, 관심 분야, 탐구 기능
 *   buildStats     낱말 통계(df, kdf, idf, cw)
 *   keywordFn      기록 핵심어 함수
 *   assignTopics   주제, 핵심어, 요약(주제가 핵심어 외로 잡히면 약한 기록 표시 해제)
 *   buildThemes    여러 기록에 걸친 관심 주제(r.themes도 채움)
 *   buildLinks     기록 사이 연결과 연결 이유
 *   buildGaps      결손 분석(학기·교과군 × 방법, 과학 탐구 기능, 제안)
 *   buildInsights  상담 포인트
 *
 * 화면(React)은 이 파일에서 analyze와 아래 re-export만 가져다 쓰면 된다.
 */
import type { Analysis, Rec, StudentRecord, UserDict } from '../types';
import { METHOD } from '../dict/methods';
import { SKILL } from '../dict/skills';
import { buildRecords, semLabel, slotIdx } from './records';
import { analyzeRecord, buildCtx, DEPTH_TXT } from './depth';
import { buildStats, buildThemes, keywordFn } from './themes';
import { assignTopics } from './topic';
import { buildLinks, LINK_KINDS, lineage } from './links';
import { buildGaps } from './gaps';
import { buildInsights } from './insights';
import { compileMethods, compileSkills, methodHits, methodMarks, skillMarks } from './methods';
import type { CompiledMethod, CompiledSkill } from './methods';
import { sentences, summarize } from './text';

/* ───────────────────────── 분석 ───────────────────────── */

/**
 * 학생부 하나를 분석한다. 입력(S)은 바꾸지 않는다.
 * userDict는 교사가 표현 사전 화면에서 추가한 평문 표현(방법 키 → 표현 목록). 없으면 기본 사전만 쓴다.
 */
export function analyze(S: StudentRecord, userDict?: UserDict): Analysis {
  const recs = buildRecords(S);
  const ctx = buildCtx(S, userDict);
  for (const r of recs) analyzeRecord(r, ctx);

  const stats = buildStats(recs);
  const kw = keywordFn(stats);
  assignTopics(recs, kw);
  const themes = buildThemes(recs, stats);
  const links = buildLinks(recs, stats, themes, S);
  const gaps = buildGaps(recs, links, S);
  const insights = buildInsights(recs, links, themes, gaps, S);

  return { recs, links, themes, gaps, insights, mode: 'rule' };
}

/* ───────────────────────── 원문 형광펜 ───────────────────────── */

export type HighlightKind = 'method' | 'theme' | 'skill';

export interface HighlightSegment {
  a: number;            // 원문 시작 위치
  b: number;            // 원문 끝 위치(미포함)
  kind: HighlightKind;  // method 방법 표현(노랑) | theme 관심 주제 낱말(민트) | skill 과학 탐구 기능(연보라)
  label: string;        // 방법·기능 이름, 관심 주제 이름. 교사가 추가한 표현은 ' (추가한 표현)'을 붙인다
}

/** 같은 자리에서 시작하고 길이도 같을 때의 우선순위. 방법 > 관심 주제 > 기능. */
const KIND_ORDER: Record<HighlightKind, number> = { method: 0, theme: 1, skill: 2 };

/**
 * 컴파일한 사전은 사전(userDict)의 내용이 같으면 다시 만들지 않는다.
 * 기록 상세 창이 열릴 때마다 호출되므로 17개 정규식을 매번 새로 만들지 않기 위한 것이다.
 * 캐시 키는 객체 동일성이 아니라 내용(JSON 문자열)이다. 화면이 같은 객체를 제자리에서 고쳐도(표현 추가)
 * analyze()와 형광펜이 같은 사전을 보게 된다. userDict가 없을 때(기본 사전)는 한 벌만 둔다.
 */
let baseMethods: CompiledMethod[] | null = null;
let userCache: { key: string; cm: CompiledMethod[] } | null = null;
let baseSkills: CompiledSkill[] | null = null;

function methodsFor(userDict?: UserDict): CompiledMethod[] {
  if (!userDict) {
    if (!baseMethods) baseMethods = compileMethods();
    return baseMethods;
  }
  let key: string;
  try {
    key = JSON.stringify(userDict);
  } catch {
    return compileMethods(userDict);
  }
  if (!userCache || userCache.key !== key) userCache = { key, cm: compileMethods(userDict) };
  return userCache.cm;
}

function skillsFor(): CompiledSkill[] {
  if (!baseSkills) baseSkills = compileSkills();
  return baseSkills;
}

/**
 * 원문에 칠할 구간. 세 가지를 모은 뒤 겹침을 없애고 원문 순으로 돌려준다.
 *  1) 방법 표현: methodMarks(제외 표현 구간은 이미 지워져 있음). 교사 추가 표현은 라벨에 ' (추가한 표현)'.
 *  2) 관심 주제 낱말: 이 기록이 속한 관심 주제(an.themes)의 낱말(2자 이상)을 원문에서 그대로 찾는다.
 *     낱말 뽑기(tokens)는 조사를 뗀 꼴을 돌려주므로 원문에는 '효소를'처럼 조사가 붙어 있어도 indexOf로 찾힌다.
 *  3) 과학 탐구 기능: skillMarks.
 * 겹침 제거: 시작 위치가 앞선 것을 먼저, 같으면 긴 것을 먼저, 그래도 같으면 방법 > 관심 주제 > 기능 순으로 두고
 * 앞 구간이 끝나기 전에 시작하는 구간은 버린다(한 글자가 두 색을 가질 수 없다).
 */
export function highlightSegments(r: Rec, an: Analysis, userDict?: UserDict): HighlightSegment[] {
  const text = r.text ?? '';
  if (!text) return [];
  const marks: HighlightSegment[] = [];

  // 1) 방법 표현
  for (const m of methodMarks(text, methodsFor(userDict))) {
    const label = METHOD[m.key].label + (m.user ? ' (추가한 표현)' : '');
    marks.push({ a: m.a, b: m.b, kind: 'method', label });
  }

  // 2) 관심 주제 낱말
  const mine = new Set(r.themes ?? []);
  for (const th of an.themes ?? []) {
    if (!mine.has(th.name)) continue;
    for (const w of th.words ?? []) {
      if (!w || w.length < 2) continue;
      let i = text.indexOf(w);
      while (i >= 0) {
        marks.push({ a: i, b: i + w.length, kind: 'theme', label: th.name });
        i = text.indexOf(w, i + w.length);
      }
    }
  }

  // 3) 과학 탐구 기능
  for (const m of skillMarks(text, skillsFor())) {
    marks.push({ a: m.a, b: m.b, kind: 'skill', label: SKILL[m.key].label });
  }

  // 겹침 제거
  marks.sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a) || KIND_ORDER[x.kind] - KIND_ORDER[y.kind]);
  const out: HighlightSegment[] = [];
  let end = -1;
  for (const m of marks) {
    if (m.a < end) continue;
    if (m.b <= m.a) continue;
    out.push(m);
    end = m.b;
  }
  return out;
}

/* ───────────────────────── 재export ───────────────────────── */

export { DEPTH_TXT, LINK_KINDS, lineage, semLabel, slotIdx, compileMethods, methodHits, sentences, summarize };
