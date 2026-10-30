/**
 * 결손 분석(설계 명세 4.8).
 *
 * 학생의 기록을 학기와 교과군 두 축으로 펼쳐 "어떤 방법을 썼고 무엇이 비어 있는지"를 세고,
 * 교사가 학생에게 바로 쓸 수 있는 제안 문장을 만든다.
 *
 * - buildGaps(recs, links, S) → GapReport
 *   semMatrix        방법 × 학기(6칸). 칸 = 그 학기에 그 방법을 쓴 기록 수. 학기 없는 기록(창체)은 그 학년의 두 칸에 모두 센다.
 *                    total은 그 방법을 쓴 기록 수(학기 없는 기록도 한 번만 센다). 17개 방법을 수준 내림차순으로 모두 넣으므로
 *                    화면에서는 total이 0인 줄을 숨기면 된다.
 *   laneMatrix       교과군 × 방법. 기록이 있는 교과군만. total은 그 교과군의 기록 수.
 *   skillMatrix      과학 탐구 과정 기능 × 학기. '과학 관련 기록'(아래 isScienceRec)만 센다.
 *                    과학 관련 기록이 하나도 없으면 전체 기록으로 대신 계산하고 그 사실을 trend에 적는다.
 *   skillLaneMatrix  교과군 × 기능(같은 기록 집합).
 *   slots            기록이 있는 학기만. 기록 수, 방법별 기록 수, 수준별 사용 횟수(기록·방법 쌍), 3단계 방법이 든 기록 비율,
 *                    평균 깊이, 아직 안 쓴 3단계 방법.
 *   lanes            기록이 있는 교과군만. 기대 방법은 dict/subjects.ts의 LANE[lane].expected. missing = expected 중 한 번도 안 쓴 것.
 *   trend            학기 흐름 문장(학기별 3단계 비율과 평균 깊이, 앞뒤 학기 변화).
 *                    화면 문장에서는 탐구 깊이(1~4단계)와 헷갈리지 않게 방법 수준을 '수준 3 방법'으로 부른다.
 *                    학기 구분 없는 기록(창체)만 있는 칸은 '○학년 (학년 전체)'로 부르고, 같은 기록이 앞 칸에도 들어 있으면
 *                    (예: 2학년 1학기 세특 + 2학년 창체 → 2-2 칸) 자기 자신과 비교하는 변화 문장을 만들지 않는다.
 *   suggestions      제안 문장. 'd' 방향, 'g' 점검.
 *                      1) 교과군 결손: 기록 2건 이상인 교과군에서 기대 방법이 한 번도 안 나옴.
 *                         창체 줄(진로·동아리·자율·자치)은 진로 희망 분야와 맞는 방법만 결손으로 본다.
 *                         진로 희망을 모르면 네 방법이 모두 없을 때만 점검 문장을 낸다.
 *                      2) 학기 결손: 기록 2건 이상인데 3단계 방법이 하나도 없는 학기.
 *                      3) 과학 탐구 기능 결손: 과학 관련 기록 2건 이상인데 한 번도 안 나온 기능.
 *                      4) 방법 편중: 전체 방법 사용 6번 이상, 한 방법이 30%를 넘고 그 방법이 3단계가 아님.
 *
 * 숫자(기록 수, 비율)는 문장 안에 넣되 과장하지 않는다. 모든 문장은 교사가 학생에게 그대로 말해도 되는 표현으로 쓴다.
 * 이 파일은 DOM에 의존하지 않는다.
 */
import type {
  GapReport, LaneGap, LaneKey, Link, MatrixRow, MethodKey, Rec, SkillKey, SlotIndex, SlotStat, StudentRecord, Suggestion,
} from '../types';
import { SLOTS } from '../types';
import { METHOD, METHODS, METHOD_KEYS } from '../dict/methods';
import { LANE, LANES } from '../dict/subjects';
import { SKILL, SKILL_KEYS } from '../dict/skills';
import { FIELDS, FIELD_KEYS } from '../dict/fields';
import { semLabel, slotIdx } from './records';
import { jo, nos } from './text';

/* ───────────────────────── 과학 관련 기록 ───────────────────────── */

/** 동아리 이름에 이 낱말이 들어가면 과학 동아리로 본다. 교사가 고쳐 쓸 수 있다. */
const SCI_CLUB = /과학|생명|화학|물리|지구|탐구/;

/**
 * 과학 탐구 과정 기능 표의 대상이 되는 기록.
 * 과학 교과군 기록, 그리고 동아리 기록 가운데 영역 이름('동아리활동 (생명과학탐구반)')에 과학 계열 낱말이 든 것.
 */
export function isScienceRec(r: Rec): boolean {
  if (r.lane === '과학') return true;
  if (r.kind === '창체' && r.lane === '동아리' && SCI_CLUB.test(r.subj ?? '')) return true;
  return false;
}

/* ───────────────────────── 진로 희망 → 분야 ───────────────────────── */

/**
 * 진로 희망 문구('생명과학 연구원', '간호사')가 어느 관심 분야인지 dict/fields.ts의 낱말로 판정한다.
 * 문구가 짧아서 fieldsOf(2개 이상 낱말)를 쓸 수 없으므로, 공백을 뺀 문구 안에 분야 낱말이 들어 있는지만 본다.
 * 가장 긴 낱말이 맞은 분야를 먼저 두고, 3글자 이상 낱말이 맞은 분야를 하나 더 둘 수 있다(최대 2개).
 */
export function hopeFields(text: string): string[] {
  const t = nos(text ?? '');
  if (!t) return [];
  const scored: { k: string; len: number; n: number }[] = [];
  for (const k of FIELD_KEYS) {
    let len = 0;
    let n = 0;
    for (const w of FIELDS[k]) {
      if (w.length >= 2 && t.includes(w)) {
        n++;
        if (w.length > len) len = w.length;
      }
    }
    if (n) scored.push({ k, len, n });
  }
  scored.sort((a, b) => b.len - a.len || b.n - a.n);
  const out = scored.slice(0, 1).map((x) => x.k);
  if (scored[1] && scored[1].len >= 3) out.push(scored[1].k);
  return out;
}

/**
 * 관심 분야 → 창체(동아리·진로·자율·자치)에서 기대할 만한 방법.
 * 창체 줄의 기대 방법(설계·제작, 설문·면담, 현장 탐방, 실험·측정) 가운데 그 분야 진로와 맞는 것만 결손으로 본다.
 * 교사가 보고 고칠 수 있도록 분야 이름(dict/fields.ts의 키)으로 적는다.
 */
export const FIELD_CC_METHODS: Record<string, MethodKey[]> = {
  '의학·의료': ['experiment', 'survey'],
  '간호·보건': ['survey', 'experiment'],
  '약학·제약': ['experiment'],
  '생명과학·바이오': ['experiment'],
  '화학·화학공학': ['experiment'],
  '물리·천문': ['experiment', 'making'],
  '지구·환경·기후': ['experiment', 'fieldtrip'],
  '수학·통계': ['survey'],
  '컴퓨터·AI·데이터': ['making', 'survey'],
  '전기·전자·반도체': ['making', 'experiment'],
  '기계·로봇·항공': ['making', 'experiment'],
  '건축·토목·도시': ['making', 'fieldtrip'],
  '신소재·에너지': ['experiment', 'making'],
  '농림·수산·식품': ['experiment', 'fieldtrip'],
  '경제·경영': ['survey', 'fieldtrip'],
  '법·정치·행정': ['survey', 'fieldtrip'],
  '사회·복지': ['survey', 'fieldtrip'],
  '심리·상담': ['survey'],
  '교육': ['survey', 'fieldtrip'],
  '언어·문학': ['survey', 'fieldtrip'],
  '철학·윤리': ['survey'],
  '역사·지리': ['fieldtrip', 'survey'],
  '예술·디자인': ['making', 'fieldtrip'],
  '체육·스포츠': ['experiment', 'survey'],
  '미디어·콘텐츠': ['making', 'survey'],
};

/* ───────────────────────── 제안 문구 ───────────────────────── */

/** 방법이 비어 있을 때 교사가 학생에게 안내할 말. 교사가 고쳐 쓸 수 있다. */
export const METHOD_TIP: Record<MethodKey, string> = {
  experiment: '변인을 하나 정해 직접 측정하고 결과를 표로 남기는 탐구를 넣어 보도록 안내해 보세요.',
  survey: '학급이나 학교 친구들에게 짧은 설문이나 면담을 해서 직접 자료를 모아 보게 해 보세요.',
  data: '공공 데이터나 실험 결과를 표와 그래프로 정리해 경향을 읽어 내는 과정을 넣어 보게 하세요.',
  modeling: '현상을 식이나 그래프로 나타내고 예측과 실제를 비교해 보는 활동을 권해 보세요.',
  coding: '간단한 프로그램이나 시뮬레이션으로 결과를 확인해 보는 과제를 권해 보세요.',
  making: '생각한 해결책을 간단한 시제품이나 모형으로 만들어 보게 하세요.',
  proof: '공식을 외우는 데서 그치지 않고 왜 성립하는지 직접 유도해 보는 과제를 권해 보세요.',
  literature: '논문이나 보고서 같은 자료를 두 개 이상 찾아 출처를 밝히며 정리해 보게 하세요.',
  fieldtrip: '관련 기관이나 현장을 찾아가 보고 느낀 점을 기록으로 남기게 해 보세요.',
  reading: '관련 책 한 권을 읽고 탐구 질문과 이어 보게 하세요.',
  critique: '서로 다른 두 글이나 입장을 나란히 놓고 비교해 평가하는 글을 쓰게 해 보세요.',
  proposal: '조사한 내용에서 그치지 않고 해결 방안을 제안하고 근거를 붙여 보게 하세요.',
  analysis: '배운 개념으로 눈앞의 현상을 설명해 보는 활동을 권해 보세요.',
  understanding: '핵심 개념을 자기 말로 정리하는 활동을 권해 보세요.',
  performance: '직접 만들거나 연주하고 그 과정을 기록으로 남기게 해 보세요.',
  discussion: '탐구 결과를 발표하고 질문에 답해 보는 자리를 마련해 주세요.',
  writing: '탐구 과정을 보고서 형식으로 써 보게 하세요.',
};

/** 과학 탐구 과정 기능이 비어 있을 때의 안내. '과학 관련 기록 N건에서 ' 뒤에 이어 붙인다. 교사가 고쳐 쓸 수 있다. */
export const SKILL_TIP: Record<SkillKey, string> = {
  problem: '탐구를 시작한 질문이나 가설이 적힌 문장이 보이지 않습니다. 보고서 첫머리에 무엇이 궁금했는지를 한 문장으로 쓰게 해 보세요.',
  design: '변인을 정하고 통제한 흔적이 보이지 않습니다. 실험 전에 바꿀 조건과 같게 둘 조건을 표로 정리하게 해 보세요.',
  collect: '직접 측정하거나 관찰해 자료를 모은 문장이 보이지 않습니다. 작은 측정이라도 반복해서 기록지에 남기게 해 보세요.',
  transform: '자료를 표나 그래프로 바꾼 문장이 보이지 않습니다. 측정값의 평균을 내고 그래프로 그려 보게 하세요.',
  interpret: '자료에서 경향이나 관계를 읽어 낸 문장이 보이지 않습니다. 그래프를 보고 무엇이 변하면 무엇이 변하는지 말로 설명하게 해 보세요.',
  conclude: '실험 결과에서 결론을 내리고 한계를 적는 문장이 보이지 않습니다. 보고서 결론 부분을 학생이 직접 쓰게 해 보세요.',
  model: '모형이나 모식도로 현상을 설명한 문장이 보이지 않습니다. 눈에 보이지 않는 과정을 그림이나 비유 모형으로 나타내 보게 하세요.',
  communicate: '근거를 들어 주장하거나 발표한 문장이 보이지 않습니다. 탐구 결과를 친구들 앞에서 발표하고 질문을 받는 자리를 만들어 주세요.',
};

/* ───────────────────────── 작은 도구 ───────────────────────── */

const LV3: MethodKey[] = METHODS.filter((m) => m.lv === 3).map((m) => m.key);

const pct = (x: number): number => Math.round(x * 100);
const f1 = (x: number): string => (Number.isFinite(x) ? x.toFixed(1) : '0.0');

/** 방법 목록을 사전 순서(수준 내림차순)로 정렬 */
function sortMethods(keys: Iterable<MethodKey>): MethodKey[] {
  return [...new Set(keys)].sort((a, b) => METHOD_KEYS.indexOf(a) - METHOD_KEYS.indexOf(b));
}

/** 교과군 이름. 교과 줄은 '과학 교과', 창체 줄과 자율적 교육과정은 이름 그대로. */
function laneName(lane: LaneKey): string {
  const def = LANE[lane];
  const label = def?.label ?? lane;
  if (!def || def.cc || lane === '융합(자율과정)') return label;
  return `${label} 교과`;
}

/** 라벨 목록을 ', '로 잇고 마지막 낱말의 받침에 맞는 조사를 붙인다. */
function listJo(labels: string[], a: string, b: string): string {
  if (!labels.length) return '';
  const last = labels[labels.length - 1];
  return `${labels.join(', ')}${jo(last, a, b)}`;
}

/**
 * 결손 문장. 방법이 하나면 '○○ 기록 N건 가운데 A가 드러난 기록이 없습니다',
 * 둘 이상이면 '○○ 기록 N건에 A, B 가운데 어느 것도 드러나지 않습니다'로 적어
 * 'A와 B를 함께 쓴 기록이 없다'로 읽히지 않게 한다. tail은 '진로 희망 분야(…)와 이어지는 ' 같은 관형어(선택).
 */
function missingSentence(where: string, n: number, labels: string[], modifier: string = ''): string {
  if (labels.length >= 2) return `${where} 기록 ${n}건에 ${modifier}${labels.join(', ')} 가운데 어느 것도 드러나지 않습니다.`;
  return `${where} 기록 ${n}건 가운데 ${modifier}${listJo(labels, '이', '가')} 드러난 기록이 없습니다.`;
}

/** 기록에 3단계 방법이 하나라도 있는지 */
const hasLv3 = (r: Rec): boolean => r.methods.some((k) => METHOD[k]?.lv === 3);

/** 기록 묶음의 평균 깊이(없으면 0) */
function avgDepth(rs: Rec[]): number {
  if (!rs.length) return 0;
  return rs.reduce((a, r) => a + (r.depth || 1), 0) / rs.length;
}

/** 기록 묶음에서 3단계 방법이 든 기록 비율(없으면 0) */
function lv3Share(rs: Rec[]): number {
  if (!rs.length) return 0;
  return rs.filter(hasLv3).length / rs.length;
}

/* ───────────────────────── 방법 편중 ───────────────────────── */

export interface MethodBias { method: MethodKey; count: number; total: number; share: number }

/**
 * 방법 편중. 약한 기록(faint)을 뺀 기록에서 (기록, 방법) 쌍을 세어
 * 전체 6번 이상이고, 가장 많이 쓴 방법이 30%를 넘고, 그 방법이 3단계가 아니면 편중으로 본다.
 * insights.ts도 같은 판정을 쓰므로 여기서 한 번만 정의한다.
 */
export function methodBias(recs: Rec[]): MethodBias | null {
  const real = recs.filter((r) => !r.faint);
  const m = new Map<MethodKey, number>();
  for (const r of real) for (const k of r.methods) m.set(k, (m.get(k) ?? 0) + 1);
  let total = 0;
  for (const v of m.values()) total += v;
  if (total < 6) return null;
  const top = [...m.entries()].sort((a, b) => b[1] - a[1] || METHOD_KEYS.indexOf(a[0]) - METHOD_KEYS.indexOf(b[0]))[0];
  if (!top) return null;
  const share = top[1] / total;
  if (share <= 0.3 || (METHOD[top[0]]?.lv ?? 1) >= 3) return null;
  return { method: top[0], count: top[1], total, share };
}

/** 방법 편중 문장. gaps.suggestions와 insights에서 같은 문장을 써야 중복 제거가 된다. */
export function methodBiasText(b: MethodBias): string {
  return `탐구 방법이 ‘${METHOD[b.method].label}’에 많이 기대어 있습니다(방법 사용 ${b.total}번 가운데 ${b.count}번, ${pct(b.share)}%). 직접 자료를 만들거나 검증하는 방법을 더해 볼 만합니다.`;
}

/* ───────────────────────── 본체 ───────────────────────── */

export function buildGaps(recs: Rec[], links: Link[], S: StudentRecord): GapReport {
  const all = recs ?? [];
  const byId = new Map(all.map((r) => [r.id, r]));

  /* 학기 × 방법 */
  const semMatrix: MatrixRow<MethodKey>[] = METHODS.map((m) => {
    const cells = SLOTS.map(() => 0);
    let total = 0;
    for (const r of all) {
      if (!r.methods.includes(m.key)) continue;
      total++;
      for (const i of slotIdx(r)) cells[i]++;
    }
    return { key: m.key, cells, total };
  });

  /* 교과군 × 방법 */
  const laneMatrix: GapReport['laneMatrix'] = [];
  for (const l of LANES) {
    const rs = all.filter((r) => r.lane === l.key);
    if (!rs.length) continue;
    const cells: Partial<Record<MethodKey, number>> = {};
    for (const r of rs) for (const k of r.methods) cells[k] = (cells[k] ?? 0) + 1;
    laneMatrix.push({ lane: l.key, cells, total: rs.length });
  }

  /* 과학 탐구 과정 기능 표. 과학 관련 기록이 없으면 전체 기록으로 대신한다. */
  const sciRecs = all.filter(isScienceRec);
  const skillBase = sciRecs.length ? sciRecs : all;
  const skillFallback = !sciRecs.length && all.length > 0;
  const skillMatrix: MatrixRow<SkillKey>[] = SKILL_KEYS.map((k) => {
    const cells = SLOTS.map(() => 0);
    let total = 0;
    for (const r of skillBase) {
      if (!(r.skills ?? []).includes(k)) continue;
      total++;
      for (const i of slotIdx(r)) cells[i]++;
    }
    return { key: k, cells, total };
  });
  const skillLaneMatrix: GapReport['skillLaneMatrix'] = [];
  for (const l of LANES) {
    const rs = skillBase.filter((r) => r.lane === l.key);
    if (!rs.length) continue;
    const cells: Partial<Record<SkillKey, number>> = {};
    for (const r of rs) for (const k of r.skills ?? []) cells[k] = (cells[k] ?? 0) + 1;
    skillLaneMatrix.push({ lane: l.key, cells, total: rs.length });
  }

  /* 학기별 통계. 학기 없는 기록은 두 학기에 모두 들어간다. */
  const slots: SlotStat[] = [];
  SLOTS.forEach(([year, sem], i) => {
    const rs = all.filter((r) => slotIdx(r).includes(i as SlotIndex));
    if (!rs.length) return;
    const methodCounts: Partial<Record<MethodKey, number>> = {};
    const lvCounts: [number, number, number] = [0, 0, 0];
    for (const r of rs) {
      for (const k of r.methods) {
        methodCounts[k] = (methodCounts[k] ?? 0) + 1;
        const lv = METHOD[k]?.lv ?? 1;
        lvCounts[lv - 1]++;
      }
    }
    slots.push({
      slot: i as SlotIndex,
      year,
      sem,
      recIds: rs.map((r) => r.id),
      methodCounts,
      lvCounts,
      lv3Share: lv3Share(rs),
      avgDepth: avgDepth(rs),
      missingLv3: LV3.filter((k) => !methodCounts[k]),
    });
  });

  /* 교과군별 결손 */
  const lanes: LaneGap[] = [];
  for (const l of LANES) {
    const rs = all.filter((r) => r.lane === l.key);
    if (!rs.length) continue;
    const used = sortMethods(rs.flatMap((r) => r.methods));
    const expected = [...(LANE[l.key]?.expected ?? [])];
    lanes.push({
      lane: l.key,
      recCount: rs.length,
      used,
      expected,
      missing: expected.filter((k) => !used.includes(k)),
      lv3Share: lv3Share(rs),
      avgDepth: avgDepth(rs),
    });
  }

  /* 학기 흐름 문장 */
  const trend: string[] = [];
  if (!slots.length) {
    trend.push('분석할 기록이 없습니다.');
  } else {
    // 학기 구분 없는 기록(창체)만 있는 칸. 같은 기록이 이웃 칸에도 들어가므로 '○학년 (학년 전체)'로 부른다
    const yearOnly = (st: SlotStat): boolean => st.recIds.every((id) => byId.get(id)?.sem == null);
    const label = (st: SlotStat): string => (yearOnly(st) ? `${st.year}학년 (학년 전체)` : semLabel(st));
    // 앞 칸(a)에 든 기록만으로 채워진 뒤 칸(b): 2학년 1학기 세특 + 2학년 창체 → 2-2 칸. 비교하면 자기 자신과 비교하는 셈이다
    const sameRecs = (a: SlotStat, b: SlotStat): boolean => {
      const ids = new Set(a.recIds);
      return yearOnly(b) && b.recIds.every((id) => ids.has(id));
    };
    // 그 학기로 들어오는 연결(같은 시기 연결은 빼고)을 받은 기록 수. 같은 칸 안의 기록에서 온 연결(1-1 세특 → 1학년 창체)은
    // '앞 학기 탐구를 이어받은' 것이 아니므로 세지 않는다
    const inbound = (st: SlotStat): number => {
      const ids = new Set(st.recIds);
      const got = new Set<string>();
      for (const l of links ?? []) {
        if (l.rel === '동시' || !ids.has(l.to) || !byId.has(l.from) || ids.has(l.from)) continue;
        got.add(l.to);
      }
      return got.size;
    };
    const first = slots[0];
    const n0 = first.recIds.length;
    const k0 = Math.round(first.lv3Share * n0);
    const in0 = inbound(first);
    trend.push(
      `${label(first)}: 기록 ${n0}건, 수준 3 방법이 든 기록 ${k0}건(${pct(first.lv3Share)}%), 평균 깊이 ${f1(first.avgDepth)}` +
        (in0 ? `, 앞 탐구를 이어받은 기록 ${in0}건` : ''),
    );
    // 변화 문장을 만든 마지막 칸(학년 전체 칸으로 되풀이된 칸은 건너뛴다)
    let prev = first;
    for (let i = 1; i < slots.length; i++) {
      const b = slots[i];
      // 사이에 기록이 없는 학기가 있으면 그 사실을 적는다
      for (let s = slots[i - 1].slot + 1; s < b.slot; s++) {
        const [y, se] = SLOTS[s];
        trend.push(`${semLabel({ year: y, sem: se })}: 기록 없음`);
      }
      if (sameRecs(prev, b)) {
        // 앞 칸과 같은 학년 창체만 다시 들어 있는 칸: 변화 문장 대신 사실만 적는다
        trend.push(
          yearOnly(prev)
            ? `${semLabel(b)}: ${b.year}학년 (학년 전체) 기록이 이 학기에도 걸쳐 있습니다`
            : `${semLabel(b)}: 아직 학기별 기록이 없습니다(${b.year}학년 전체 창체 기록 ${b.recIds.length}건만 두 학기에 걸쳐 있음)`,
        );
        continue;
      }
      const a = prev;
      const ds = b.lv3Share - a.lv3Share;
      const dd = b.avgDepth - a.avgDepth;
      const shareDir = Math.abs(ds) < 0.1 ? '그대로' : ds > 0 ? '올라감' : '내려감';
      const depthDir = Math.abs(dd) < 0.15 ? '비슷함' : dd > 0 ? '깊어짐' : '얕아짐';
      const inb = inbound(b);
      const nb = b.recIds.length;
      trend.push(
        `${label(a)} → ${label(b)}: 수준 3 방법이 든 기록 비율 ${pct(a.lv3Share)}% → ${pct(b.lv3Share)}%(${shareDir}), ` +
          `평균 깊이 ${f1(a.avgDepth)} → ${f1(b.avgDepth)}(${depthDir})` +
          (inb ? `, 앞 탐구를 이어받은 기록 ${inb}건` : '') +
          (nb < 2 ? '. 기록이 1건이라 참고만 하세요' : ''),
      );
      prev = b;
    }
    if (slots.length >= 3) {
      const a = slots[0];
      // 끝 칸이 학기 구분 없는 기록만으로 채워졌으면(아직 오지 않은 학기) 그 앞 칸까지만 본다
      const last = slots[slots.length - 1];
      const b = yearOnly(last) && slots.length >= 2 ? slots[slots.length - 2] : last;
      if (b !== a) {
        const dd = b.avgDepth - a.avgDepth;
        const to = f1(b.avgDepth);
        const move =
          Math.abs(dd) < 0.15
            ? `${f1(a.avgDepth)}에서 ${to}${jo(to, '으로', '로')} 큰 변화가 없습니다`
            : `${f1(a.avgDepth)}에서 ${to}${jo(to, '으로', '로')} ${dd > 0 ? '올라갔습니다' : '내려갔습니다'}`;
        trend.push(`전체 흐름: ${label(a)}부터 ${label(b)}까지 평균 깊이가 ${move}.`);
      }
    }
  }
  if (skillFallback) {
    trend.push('과학 교과나 과학 동아리 기록이 없어 과학 탐구 과정 기능 표는 전체 기록으로 계산했습니다.');
  }

  /* 제안 */
  const suggestions: Suggestion[] = [];

  // 진로 희망 분야(모든 학년의 희망 문구를 합친다)
  const hopeF: string[] = [];
  for (const h of S?.hopes ?? []) for (const k of hopeFields(h.text)) if (!hopeF.includes(k)) hopeF.push(k);
  const hopeCc = sortMethods(hopeF.flatMap((k) => FIELD_CC_METHODS[k] ?? []));

  // 1) 교과군 결손
  for (const g of lanes) {
    if (g.recCount < 2 || !g.missing.length) continue;
    const def = LANE[g.lane];
    if (def?.cc) {
      if (hopeCc.length) {
        const miss = g.missing.filter((k) => hopeCc.includes(k));
        if (!miss.length) continue;
        const labels = miss.slice(0, 3).map((k) => METHOD[k].label);
        suggestions.push({
          tg: 'd',
          lane: g.lane,
          method: miss[0],
          text:
            `${missingSentence(laneName(g.lane), g.recCount, labels, `진로 희망 분야(${hopeF.slice(0, 2).join(', ')})와 이어지는 `)} ` +
            METHOD_TIP[miss[0]],
        });
      } else if (g.expected.length && g.missing.length === g.expected.length) {
        const labels = g.expected.map((k) => METHOD[k].label);
        suggestions.push({
          tg: 'g',
          lane: g.lane,
          method: g.expected[0],
          text:
            `${laneName(g.lane)} 기록 ${g.recCount}건에 ${labels.join(', ')} 가운데 어느 것도 드러나지 않습니다. ` +
            '직접 자료를 만들거나 현장에서 확인한 활동이 있었는지 살펴보세요.',
        });
      }
      continue;
    }
    const labels = g.missing.slice(0, 3).map((k) => METHOD[k].label);
    suggestions.push({
      tg: 'd',
      lane: g.lane,
      method: g.missing[0],
      text: `${missingSentence(laneName(g.lane), g.recCount, labels)} ${METHOD_TIP[g.missing[0]]}`,
    });
  }

  // 2) 학기 결손: 기록 2건 이상인데 3단계 방법이 하나도 없는 학기.
  //    학기 구분 없는 기록만 있는 2학기 칸은 같은 기록이 1학기 칸에서 이미 판정되므로 건너뛰고,
  //    1학기 칸도 그런 기록만 있으면 '○학년 (학년 전체)'로 부른다.
  for (const st of slots) {
    if (st.recIds.length < 2 || st.lvCounts[2] > 0) continue;
    const allYearOnly = st.recIds.every((id) => byId.get(id)?.sem == null);
    if (st.sem === 2 && allYearOnly) continue;
    const where = allYearOnly ? `${st.year}학년 (학년 전체)` : semLabel(st);
    suggestions.push({
      tg: 'g',
      slot: st.slot,
      text:
        `${where} 기록 ${st.recIds.length}건에 수준 3 방법(직접 자료를 만들거나 분석하는 방법)이 하나도 없습니다. ` +
        '이 학기 탐구가 조사와 정리에 머물렀는지 살펴보고, 다음 학기에는 측정이나 설문처럼 직접 자료를 만드는 활동을 하나 넣어 보도록 안내해 보세요.',
    });
  }

  // 3) 과학 탐구 기능 결손: 과학 관련 기록이 2건 이상일 때만
  if (sciRecs.length >= 2) {
    const missing = SKILL_KEYS.filter((k) => !sciRecs.some((r) => (r.skills ?? []).includes(k)));
    const n = sciRecs.length;
    if (missing.length && missing.length <= 3) {
      for (const k of missing) {
        suggestions.push({ tg: 'd', skill: k, lane: '과학', text: `과학 관련 기록 ${n}건에서 ${SKILL_TIP[k]}` });
      }
    } else if (missing.length > 3) {
      const labels = missing.map((k) => SKILL[k].label);
      suggestions.push({
        tg: 'd',
        skill: missing[0],
        lane: '과학',
        text:
          `과학 관련 기록 ${n}건에서 탐구 기능 8가지 가운데 ${listJo(labels, '이', '가')} 보이지 않습니다. ` +
          '탐구 보고서에 질문, 설계, 측정, 해석, 결론이 모두 들어가도록 틀을 잡아 주세요.',
      });
    }
  }

  // 4) 방법 편중
  const bias = methodBias(all);
  if (bias) suggestions.push({ tg: 'g', method: bias.method, text: methodBiasText(bias) });

  return { slots, lanes, semMatrix, laneMatrix, skillMatrix, skillLaneMatrix, trend, suggestions };
}
