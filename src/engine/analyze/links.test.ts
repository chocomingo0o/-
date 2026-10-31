import { describe, expect, it } from 'vitest';
import type { LaneKey, Link, MethodKey, Rec, Sem, Stats, StudentRecord, Theme, Year } from '../types';
import { commonWeight } from '../dict/stop';
import { sampleStudent } from '../../fixtures/sample';
import { buildRecords } from './records';
import { analyzeRecord, buildCtx } from './depth';
import { buildStats, buildThemes, keywordFn } from './themes';
import { assignTopics } from './topic';
import { LINK_KINDS, buildLinks, lineage } from './links';

/* ───────────────────────── 도구 ───────────────────────── */

interface RecSpec {
  id: string;
  kind?: '세특' | '창체';
  subj: string;
  lane: LaneKey;
  year: Year;
  sem: Sem | null;
  depth: 1 | 2 | 3 | 4;
  methods: MethodKey[];
  tf: Record<string, number>;
  ktf: string[];
  text?: string;
  fields?: string[];
  themes?: string[];
  connectCue?: boolean;
  faint?: boolean;
}

/** 손으로 만든 기록. 연결 계산에 쓰는 필드(tf, ktf, methods, depth, lane, t, text, fields, themes)만 채운다. */
function rec(s: RecSpec): Rec {
  const t = (s.year - 1) * 2 + (s.sem === 1 ? 0 : s.sem === 2 ? 1 : 0.5);
  return {
    id: s.id,
    kind: s.kind ?? '세특',
    subj: s.subj,
    lane: s.lane,
    year: s.year,
    sem: s.sem,
    t,
    text: s.text ?? '',
    grades: [],
    sents: [],
    methods: s.methods,
    methodCounts: {},
    depth: s.depth,
    faint: s.faint ?? false,
    key: [],
    acts: [],
    fuCount: 0,
    connectCue: s.connectCue ?? false,
    tf: new Map(Object.entries(s.tf)),
    ktf: new Set(s.ktf),
    fields: (s.fields ?? []).map((k) => ({ k, n: 2, u: 2, words: [] })),
    topic: '',
    topicKind: 'k',
    kw: [],
    summary: '',
    summaryFu: false,
    themes: s.themes ?? [],
    skills: [],
    skillCounts: {},
  };
}

/**
 * 낱말 통계. df, kdf는 기록에서 세고, N은 따로 준다.
 * 기록 서너 개만으로는 idf가 너무 작아 점수 문턱에 닿지 않으므로, 실제 학생부(기록 10~20건) 규모인 N=12로 둔다.
 * 이때 idf(df=2) = ln(13/2.5) ≈ 1.65, idf(df=3) ≈ 1.31, 드문 낱말 상한 max(3, 0.22N) = 3이다.
 */
function stats(recs: Rec[], N: number = 12): Stats {
  const df = new Map<string, number>();
  const kdf = new Map<string, number>();
  for (const r of recs) {
    r.tf.forEach((_, t) => df.set(t, (df.get(t) ?? 0) + 1));
    r.ktf.forEach((t) => kdf.set(t, (kdf.get(t) ?? 0) + 1));
  }
  return { N, df, kdf, idf: (t) => Math.log((N + 1) / ((df.get(t) ?? 0) + 0.5)), cw: commonWeight };
}

function student(hopes: { year: Year; text: string }[] = []): StudentRecord {
  return { meta: {}, courses: [], seteuk: [], changche: [], hopes, behavior: [], warnings: [], years: [] };
}

function theme(name: string, ids: string[]): Theme {
  return { name, words: [name], ids, color: '#7a55d6' };
}

const pair = (links: Link[], from: string, to: string): Link | undefined => links.find((l) => l.from === from && l.to === to);
const pairs = (links: Link[]): string[] => links.map((l) => `${l.from}>${l.to}`);

/* ───────────────────────── 기본 시나리오 ─────────────────────────
 * S0 통합과학1(1-1, 깊이 2, 문헌)      → S1 과학탐구실험1(1-2, 깊이 3, 실험+문헌) : 심화
 * S1                                   → S2 사회와 문화(2-1, 깊이 3, 설문)       : 확장(교과군 바뀜, 깊이 같음)
 * S1                                   → S3 공통수학2(1-2, 깊이 2, 증명)         : 동시(같은 학기, 다른 교과군)
 * 관심 주제 '카탈레이스'(S0,S1,S2), '거품'(S1,S2,S3)
 */
function baseScenario(): { recs: Rec[]; st: Stats; themes: Theme[]; S: StudentRecord } {
  const recs = [
    rec({
      id: 'S0', subj: '통합과학1', lane: '과학', year: 1, sem: 1, depth: 2, methods: ['literature'],
      tf: { 카탈레이스: 2, 과산화수소: 1, 감자: 1 }, ktf: ['카탈레이스', '과산화수소', '감자'], themes: ['카탈레이스'],
    }),
    rec({
      id: 'S1', subj: '과학탐구실험1', lane: '과학', year: 1, sem: 2, depth: 3, methods: ['experiment', 'literature'],
      tf: { 카탈레이스: 3, 과산화수소: 2, 감자: 1, 거품: 2, 지수함수: 1, 반응속도: 1 },
      ktf: ['카탈레이스', '과산화수소', '감자', '거품', '지수함수', '반응속도'], themes: ['카탈레이스', '거품'],
    }),
    rec({
      id: 'S2', subj: '사회와 문화', lane: '사회', year: 2, sem: 1, depth: 3, methods: ['survey'],
      tf: { 카탈레이스: 1, 과산화수소: 1, 거품: 1, 소독제: 2 }, ktf: ['카탈레이스', '거품', '소독제'],
      themes: ['카탈레이스', '거품'], connectCue: true,
    }),
    rec({
      id: 'S3', subj: '공통수학2', lane: '수학', year: 1, sem: 2, depth: 2, methods: ['proof'],
      tf: { 거품: 2, 지수함수: 2, 반응속도: 1, 등비수열: 1 }, ktf: ['거품', '지수함수', '반응속도'],
      themes: ['거품'], connectCue: true,
    }),
  ];
  const themes = [theme('카탈레이스', ['S0', 'S1', 'S2']), theme('거품', ['S1', 'S2', 'S3'])];
  return { recs, st: stats(recs), themes, S: student() };
}

/* ───────────────────────── LINK_KINDS ───────────────────────── */

describe('LINK_KINDS', () => {
  it('다섯 종류의 색, 클래스, 설명, 힌트를 가진다', () => {
    expect(Object.keys(LINK_KINDS).sort()).toEqual(['동시', '반복', '심화', '전환', '확장'].sort());
    expect(LINK_KINDS['심화']).toMatchObject({ color: '#111111', colorDark: '#f2f2f2', cls: 'deep' });
    expect(LINK_KINDS['확장']).toMatchObject({ color: '#7a55d6', colorDark: '#9579f2', cls: 'cross' });
    expect(LINK_KINDS['전환']).toMatchObject({ color: '#2f8f57', colorDark: '#3faa6b', cls: 'shift' });
    expect(LINK_KINDS['반복']).toMatchObject({ color: '#c48f0a', colorDark: '#d7a52a', cls: 'rep' });
    expect(LINK_KINDS['동시']).toMatchObject({ color: '#a3a3a3', colorDark: '#6f6f6f', cls: 'con' });
    for (const k of Object.values(LINK_KINDS)) {
      expect(k.desc.length).toBeGreaterThan(5);
      expect(k.hint.length).toBeGreaterThan(10);
      // 엠 대시 금지
      expect(k.desc + k.hint).not.toMatch(/—/);
    }
  });
});

/* ───────────────────────── (1) 드문 낱말 공유 ───────────────────────── */

describe('buildLinks: 드문 낱말을 핵심 문장에서 함께 쓰면 연결된다', () => {
  const { recs, st, themes, S } = baseScenario();
  const links = buildLinks(recs, st, themes, S);

  it('S0→S1, S1→S2, S1→S3 세 연결만 만든다', () => {
    expect(pairs(links).sort()).toEqual(['S0>S1', 'S1>S2', 'S1>S3'].sort());
  });
  it('공유 낱말은 최대 3개이고 관심 주제 이름이 먼저, 그다음 긴 낱말이 온다. 근거 첫 줄은 공통 낱말', () => {
    const l = pair(links, 'S0', 'S1')!;
    expect(l.words).toHaveLength(3);
    expect(l.words).toEqual(expect.arrayContaining(['카탈레이스', '과산화수소', '감자']));
    // 표시 순서는 점수(드문 순)와 따로 교사가 알아볼 낱말을 앞세운다: 관심 주제 이름(카탈레이스) > 3자 이상(과산화수소) > 그 외(감자)
    expect(l.words).toEqual(['카탈레이스', '과산화수소', '감자']);
    expect(l.lines[0]).toBe('공통 낱말: 카탈레이스, 과산화수소, 감자');
    expect(l.theme).toBe('카탈레이스');
    expect(l.sc).toBeGreaterThan(5);
    expect(l.cross).toBe(false);
    expect(l.ss).toBe(false);
    expect(l.cc).toBe(false);
    expect(l.cite).toBe(false);
    expect(l.hope).toBeNull();
  });
  it('뒤 기록이 1학년 1학기(S0)에서 2학년(S2)으로 바로 건너뛰는 연결은 낱말 1개 공유로는 만들지 않는다', () => {
    expect(pair(links, 'S0', 'S2')).toBeUndefined();
    expect(pair(links, 'S0', 'S3')).toBeUndefined();
    expect(pair(links, 'S3', 'S2')).toBeUndefined();
  });
  it('from은 항상 to보다 같거나 앞선 시기다', () => {
    const byId = new Map(recs.map((r) => [r.id, r]));
    for (const l of links) expect(byId.get(l.from)!.t).toBeLessThanOrEqual(byId.get(l.to)!.t);
  });
  it('약한 기록(faint)은 관심 주제에 속하지 않으면 연결에 끼지 않는다', () => {
    const sc = baseScenario();
    sc.recs[0].faint = true;
    sc.recs[0].themes = [];
    const ls = buildLinks(sc.recs, sc.st, [sc.themes[1]], sc.S);
    expect(pair(ls, 'S0', 'S1')).toBeUndefined();
    expect(pair(ls, 'S1', 'S2')).toBeDefined();
  });
  it('r.themes가 비어 있어도 Theme.ids로 공통 관심 주제를 찾는다', () => {
    const sc = baseScenario();
    for (const r of sc.recs) r.themes = [];
    const ls = buildLinks(sc.recs, sc.st, sc.themes, sc.S);
    expect(pair(ls, 'S0', 'S1')?.theme).toBe('카탈레이스');
  });
});

/* ───────────────────────── (2) 연결 종류 ───────────────────────── */

describe('buildLinks: 연결 종류', () => {
  const { recs, st, themes, S } = baseScenario();
  const links = buildLinks(recs, st, themes, S);

  it('깊이가 올라가면 심화', () => {
    const l = pair(links, 'S0', 'S1')!;
    expect(l.rel).toBe('심화');
    expect(l.newM).toEqual(['experiment']);
    // 대표 방법이 바뀌었으므로 화살표로 적고, 새로 쓴 방법이 대표 방법과 같으면 괄호에 되풀이하지 않는다
    expect(l.lines).toContain('방법: 문헌·자료 조사 → 실험·측정');
    expect(l.lines).toContain('탐구 깊이: 2단계(조사·분석) → 3단계(실험·자료 생산)');
    expect(l.sent).toBe(
      '1학년 통합과학1의 ‘카탈레이스, 과산화수소, 감자’ 같은 낱말이 1학년 과학탐구실험1에서 다시 나옵니다. '
        + '같은 교과군 안에서 이어졌고, 방법은 문헌·자료 조사에서 실험·측정으로 바뀌었고, 탐구 깊이는 2단계에서 3단계로 올라갔습니다.',
    );
    expect(l.head).toBe('‘카탈레이스, 과산화수소’');
    expect(l.detail).toBe('문헌·자료 조사 → 실험·측정 / 깊이 2→3');
    expect(l.why).toBe('카탈레이스 / 깊이 2→3');
  });

  it('교과군이 바뀌고 깊이가 같으면 확장(새 방법이 있어도 확장이 먼저)', () => {
    const l = pair(links, 'S1', 'S2')!;
    expect(l.rel).toBe('확장');
    expect(l.cross).toBe(true);
    expect(l.newM).toEqual(['survey']);
    expect(l.lines).toContain('교과군: 과학 → 사회');
    expect(l.lines).toContain('탐구 깊이: 3단계(실험·자료 생산) → 3단계(실험·자료 생산) (같은 수준)');
    // 뒤 기록의 대표 방법이 설문·면담이므로 화살표로 적고, 새로 쓴 방법이 그것과 같으면 괄호에 되풀이하지 않는다
    expect(l.lines).toContain('방법: 실험·측정 → 설문·면담');
    expect(l.sent).toContain('교과군이 과학에서 사회로 바뀌어 다른 관점으로 넓어졌고');
    expect(l.sent).toContain('방법은 실험·측정에서 설문·면담으로 바뀌었고');
    expect(l.sent).toContain('탐구 깊이는 3단계 그대로입니다.');
    expect(l.sent).not.toContain('3단계로 같습니다');
    expect(l.head).toMatch(/’ \/ 과학→사회$/);
    expect(l.why).toBe('카탈레이스 / 과학→사회');
  });

  it('같은 시기(같은 t)의 다른 교과군이면 동시', () => {
    const l = pair(links, 'S1', 'S3')!;
    expect(l.rel).toBe('동시');
    expect(l.theme).toBe('거품');
    // 관심 주제 이름(거품)이 공통 낱말 맨 앞에 온다
    expect(l.sent).toBe('1학년 같은 시기에 과학탐구실험1과 공통수학2에서 ‘거품, 지수함수, 반응속도’ 같은 낱말을 함께 다뤘습니다.');
    expect(l.detail).toBe('과학, 수학 함께 다룸');
    // 카드 한 줄에는 종류 이름('같은 시기', '동시')을 쓰지 않는다(카드가 종류 칩을 따로 붙인다). 교과군이 다르면 두 교과군을 적는다
    expect(l.why).toBe('거품 / 과학, 수학');
    expect(l.why).not.toMatch(/같은 시기|동시/);
    // 같은 시기 연결의 머리에는 방향 화살표를 쓰지 않고, 카드의 종류 칩과 겹치는 종류 이름('같은 시기')도 쓰지 않는다
    expect(l.head).toBe('‘거품, 지수함수’ / 과학, 수학');
    expect(l.head).not.toMatch(/같은 시기|동시/);
    // 같은 시기 쌍은 한 번만(배열에서 앞선 기록이 from)
    expect(pair(links, 'S3', 'S1')).toBeUndefined();
  });

  it('같은 교과군에서 깊이가 같고 2단계 이상 새 방법이 있으면 전환', () => {
    // 경제는 통합사회와 같은 교과군이지만 같은 과목 계열(subjectFamily)은 아니다
    const recs = [
      rec({
        id: 'A0', subj: '통합사회1', lane: '사회', year: 1, sem: 1, depth: 2, methods: ['literature', 'discussion'],
        tf: { 기후정의: 2, 해수면: 1, 배출량: 1 }, ktf: ['기후정의', '해수면', '배출량'],
      }),
      rec({
        id: 'A1', subj: '경제', lane: '사회', year: 2, sem: 1, depth: 2, methods: ['literature', 'proposal'],
        tf: { 기후정의: 1, 해수면: 2, 배출량: 1 }, ktf: ['기후정의', '해수면', '배출량'],
      }),
    ];
    const links = buildLinks(recs, stats(recs), [], student());
    expect(pairs(links)).toEqual(['A0>A1']);
    const l = links[0];
    expect(l.rel).toBe('전환');
    expect(l.ss).toBe(false);
    expect(l.newM).toEqual(['proposal']);
    expect(l.lines).toContain('방법: 문헌·자료 조사 그대로 (새로 더한 방법: 해결안 제안)');
    expect(l.sent).toContain('같은 교과군 안에서 이어졌고, 방법은 문헌·자료 조사를 이어 가면서 해결안 제안을 새로 더했고, 탐구 깊이는 2단계 그대로입니다.');
    expect(l.why).toMatch(/^(기후정의|해수면|배출량) \/ 해결안 제안 더함$/);
  });

  it('교과군, 깊이, 방법 수준이 모두 같으면 반복', () => {
    const recs = [
      rec({
        id: 'A0', subj: '통합사회1', lane: '사회', year: 1, sem: 1, depth: 2, methods: ['literature', 'discussion'],
        tf: { 기후정의: 2, 해수면: 1, 배출량: 1 }, ktf: ['기후정의', '해수면', '배출량'],
      }),
      rec({
        id: 'A1', subj: '경제', lane: '사회', year: 2, sem: 1, depth: 2, methods: ['literature'],
        tf: { 기후정의: 1, 해수면: 2, 배출량: 1 }, ktf: ['기후정의', '해수면', '배출량'],
      }),
    ];
    const links = buildLinks(recs, stats(recs), [], student());
    expect(pairs(links)).toEqual(['A0>A1']);
    const l = links[0];
    expect(l.rel).toBe('반복');
    expect(l.newM).toEqual([]);
    expect(l.lines).toContain('방법: 문헌·자료 조사 그대로');
    expect(l.sent).toContain('방법은 문헌·자료 조사 그대로였고');
    expect(l.sent).toContain('탐구 깊이는 2단계 그대로입니다.');
    // 카드 한 줄에는 종류 이름을 쓰지 않고 내용만 적는다('반복(깊이 2→2)' → '깊이 2→2')
    expect(l.why).toMatch(/^(기후정의|해수면|배출량) \/ 깊이 2→2$/);
    expect(l.why).not.toContain('반복');
  });

  it('깊이가 내려가도 교과군이 바뀌면 확장이고, 근거 줄과 한 줄에 얕아짐을 적는다', () => {
    const recs = [
      rec({
        id: 'B0', subj: '과학탐구실험1', lane: '과학', year: 1, sem: 1, depth: 3, methods: ['experiment'],
        tf: { 구리판: 2, 아연판: 2, 전극: 1 }, ktf: ['구리판', '아연판', '전극'],
      }),
      rec({
        id: 'B1', subj: '공통국어2', lane: '국어', year: 1, sem: 2, depth: 2, methods: ['literature'],
        tf: { 구리판: 1, 아연판: 1, 전극: 2 }, ktf: ['구리판', '아연판', '전극'], connectCue: true,
      }),
    ];
    const links = buildLinks(recs, stats(recs), [], student());
    expect(pairs(links)).toEqual(['B0>B1']);
    expect(links[0].rel).toBe('확장');
    expect(links[0].lines).toContain('탐구 깊이: 3단계(실험·자료 생산) → 2단계(조사·분석) (앞 탐구보다 얕아짐)');
    expect(links[0].sent).toContain('탐구 깊이는 3단계에서 2단계로 낮아졌습니다.');
    expect(links[0].why).toMatch(/ \/ 과학→국어 \/ 깊이↓$/);
  });

  it('같은 과목 계열(ss)은 낮은 문턱으로 이어지고 +3을 받는다', () => {
    const recs = [
      rec({
        id: 'C0', subj: '통합과학1', lane: '과학', year: 1, sem: 1, depth: 2, methods: ['literature'],
        tf: { 손세정제: 2, 포도상구균: 1 }, ktf: ['손세정제'],
      }),
      rec({
        id: 'C1', subj: '통합과학2', lane: '과학', year: 1, sem: 2, depth: 2, methods: ['literature'],
        tf: { 손세정제: 1, 포도상구균: 1 }, ktf: ['포도상구균'],
      }),
    ];
    // 낱말 2개(≈3.3) + 같은 교과군 1 = 4.3: 일반 문턱 5에는 못 미치지만 같은 과목 문턱 2.5는 넘는다
    const links = buildLinks(recs, stats(recs), [], student());
    expect(pairs(links)).toEqual(['C0>C1']);
    const l = links[0];
    expect(l.ss).toBe(true);
    expect(l.sc).toBeGreaterThan(7);
    expect(l.lines).toContain('같은 과목 계열의 후속 기록: 통합과학1 → 통합과학2');
    expect(l.head).toMatch(/ \/ 같은 과목$/);
    expect(l.why).toMatch(/^같은 과목 \/ /);
    expect(l.sent).toContain('같은 과목 안에서 이어졌고');
  });

  it('교과↔창체(cc)는 문턱 4로 이어진다', () => {
    const recs = [
      rec({
        id: 'D0', subj: '통합과학1', lane: '과학', year: 1, sem: 1, depth: 2, methods: ['literature'],
        tf: { 손세정제: 2, 포도상구균: 1, 배양접시: 1 }, ktf: ['손세정제', '포도상구균'],
      }),
      rec({
        id: 'D1', kind: '창체', subj: '동아리활동 (생명과학탐구반)', lane: '동아리', year: 1, sem: null, depth: 3, methods: ['experiment'],
        tf: { 손세정제: 1, 포도상구균: 2, 배양접시: 2 }, ktf: ['손세정제', '포도상구균', '배양접시'],
      }),
    ];
    // 낱말 3개 ≈ 4.9, 교과군이 달라 가산 없음: 일반 문턱 5에는 못 미치지만 교과↔창체 문턱 4는 넘는다
    const links = buildLinks(recs, stats(recs), [], student());
    expect(pairs(links)).toEqual(['D0>D1']);
    const l = links[0];
    expect(l.cc).toBe(true);
    expect(l.cross).toBe(true);
    expect(l.rel).toBe('심화');
    expect(l.lines).toContain('교과 탐구와 창의적 체험활동이 이어짐');
    expect(l.lines).toContain('교과군: 과학 → 동아리');
  });
});

/* ───────────────────────── (3) 직접 언급(cite) ───────────────────────── */

describe('buildLinks: 뒤 기록이 앞 과목을 직접 언급하면 공유 낱말이 적어도 연결된다', () => {
  function citeScenario(text2: string) {
    const recs = [
      rec({
        id: 'E0', subj: '통합과학1', lane: '과학', year: 1, sem: 1, depth: 2, methods: ['literature'],
        tf: { 내성균: 2, 항생제: 2 }, ktf: ['내성균'], text: '항생제 내성균이 생기는 원리를 조사함.',
      }),
      rec({
        id: 'E1', subj: '통합과학2', lane: '과학', year: 1, sem: 2, depth: 2, methods: ['literature'],
        tf: { 배양: 1 }, ktf: ['배양'], text: '미생물학 연구원의 강연을 듣고 세균 배양 과정을 조사함.',
      }),
      rec({
        id: 'E2', subj: '영어Ⅰ', lane: '영어', year: 2, sem: 1, depth: 2, methods: ['reading'],
        tf: { 항생제: 1, 내성균: 1 }, ktf: ['항생제'], text: text2,
      }),
    ];
    return { recs, st: stats(recs) };
  }

  it("'1학년 때 통합과학2에서'는 통합과학2(E1)만 가리키고 통합과학1(E0)은 가리키지 않는다", () => {
    const { recs, st } = citeScenario('영어 기사를 읽고 1학년 때 통합과학2에서 조사했던 항생제 내성균 자료와 비교함. 미생물학 연구원이 되고 싶다고 밝힘.');
    const S = student([{ year: 1, text: '미생물학 연구원' }]);
    const links = buildLinks(recs, st, [], S);
    expect(pairs(links)).toEqual(['E1>E2']);
    const l = links[0];
    expect(l.cite).toBe(true);
    // 공유 낱말이 없으면 과목 기본형을 낱말 자리에 둔다
    expect(l.words).toEqual(['통합과학']);
    expect(l.sc).toBeGreaterThanOrEqual(8);
    expect(l.lines).toContain('뒤 기록이 ‘1학년 통합과학2’를 직접 언급함');
    expect(l.head).toMatch(/^직접 언급 \/ /);
    expect(l.why).toMatch(/^직접 언급 \/ /);
    expect(l.sent).toContain('2학년 영어Ⅰ에서 1학년 통합과학2의 탐구를 직접 언급하며 이어 갔습니다.');
    // 진로 희망 낱말(미생물학)이 두 기록 본문에 모두 나옴
    expect(l.hope).toBe('미생물학');
    expect(l.lines).toContain('진로 희망 낱말 ‘미생물학’이 두 기록에 모두 나옴');
    // 공유 낱말 2개(내성균, 항생제)만으로는 E0→E2가 이어지지 않는다(핵심 문장 겹침 없음, 점수 부족)
    expect(pair(links, 'E0', 'E2')).toBeUndefined();
  });

  it('끝자리 숫자가 있는 과목명(과학탐구실험1)과 기본형(과학탐구실험) 둘 다 잡는다', () => {
    const mk = (text: string) => {
      const recs = [
        rec({
          id: 'F0', subj: '과학탐구실험1', lane: '과학', year: 1, sem: 1, depth: 3, methods: ['experiment'],
          tf: { 콜로니: 2 }, ktf: ['콜로니'], text: '콜로니 수를 셈.',
        }),
        rec({
          id: 'F1', subj: '생명과학', lane: '과학', year: 2, sem: 1, depth: 3, methods: ['experiment'],
          tf: { 한천: 1 }, ktf: ['한천'], text,
        }),
      ];
      return buildLinks(recs, stats(recs), [], student());
    };
    expect(pairs(mk('1학년 때 과학탐구실험1 시간에 수행했던 실험 결과를 다시 꺼내어 설명함.'))).toEqual(['F0>F1']);
    expect(pairs(mk('1학년 과학탐구실험에서 했던 실험을 떠올림.'))).toEqual(['F0>F1']);
    expect(pairs(mk('1학년 1학기 과학탐구실험1의 실험을 떠올림.'))).toEqual(['F0>F1']);
    // 다른 숫자가 붙으면 다른 과목
    expect(pairs(mk('1학년 때 과학탐구실험2에서 했던 실험을 떠올림.'))).toEqual([]);
    // 학년이 다르면 아니다
    expect(pairs(mk('2학년 과학탐구실험1에서 했던 실험을 떠올림.'))).toEqual([]);
    // 언급이 없으면 공유 낱말도 없으니 연결되지 않는다
    expect(pairs(mk('실험 결과를 설명함.'))).toEqual([]);
  });

  it('창체 언급은 앞 학년 접두어와 공유 낱말이 함께 있어야 직접 언급이 된다', () => {
    const mk = (tf2: Record<string, number>, text: string) => {
      const recs = [
        rec({
          id: 'G0', kind: '창체', subj: '동아리활동 (생명과학탐구반)', lane: '동아리', year: 1, sem: null, depth: 3, methods: ['experiment'],
          tf: { 콜로니: 2 }, ktf: ['콜로니'], text: '콜로니 수를 셈.',
        }),
        rec({ id: 'G1', subj: '생명과학', lane: '과학', year: 2, sem: 1, depth: 3, methods: ['experiment'], tf: tf2, ktf: Object.keys(tf2), text }),
      ];
      return buildLinks(recs, stats(recs), [], student());
    };
    // 창체는 과목명처럼 하나를 가리키지 못하므로, 공유 낱말이 없으면 언급만으로 잇지 않는다
    expect(mk({ 한천: 1 }, '1학년 때 동아리활동 (생명과학탐구반)에서 했던 실험을 떠올림.')).toEqual([]);
    // 공유 낱말(콜로니)이 있으면 직접 언급으로 잇는다
    const ok = mk({ 콜로니: 1 }, '1학년 동아리에서 진행한 콜로니 실험을 떠올림.');
    expect(pairs(ok)).toEqual(['G0>G1']);
    expect(ok[0].cite).toBe(true);
    expect(ok[0].lines).toContain('뒤 기록이 ‘1학년 동아리활동 (생명과학탐구반)’을 직접 언급함');
    // 학년이 다르면 그 창체가 아니다
    expect(mk({ 콜로니: 1 }, '2학년 동아리에서 진행한 콜로니 실험을 떠올림.').some((l) => l.cite)).toBe(false);
  });
});

/* ───────────────────────── (4) 흔한 낱말만 공유 ───────────────────────── */

describe('buildLinks: 흔한 낱말만 공유하면 연결되지 않는다', () => {
  it('여러 학생부에 두루 나오는 낱말(효소, 세포, 생태계)은 핵심 문장에 있어도 세지 않는다', () => {
    const recs = [
      rec({
        id: 'H0', subj: '통합과학1', lane: '과학', year: 1, sem: 1, depth: 2, methods: ['literature'],
        tf: { 효소: 3, 세포: 2, 생태계: 1 }, ktf: ['효소', '세포', '생태계'],
      }),
      rec({
        id: 'H1', subj: '생명과학', lane: '과학', year: 2, sem: 1, depth: 3, methods: ['experiment'],
        tf: { 효소: 2, 세포: 1, 생태계: 2 }, ktf: ['효소', '세포', '생태계'],
      }),
    ];
    expect(buildLinks(recs, stats(recs), [], student())).toEqual([]);
  });

  it('이 학생의 기록 대부분에 나오는 낱말(df가 max(3, 0.22N) 초과)은 세지 않는다', () => {
    const mk = (id: string, lane: LaneKey, year: Year, sem: Sem) =>
      rec({
        id, subj: `${lane}과목${id}`, lane, year, sem, depth: 2, methods: ['literature'],
        tf: { 손세정제: 2 }, ktf: ['손세정제'],
      });
    const recs = [mk('I0', '과학', 1, 1), mk('I1', '사회', 1, 1), mk('I2', '국어', 1, 2), mk('I3', '수학', 2, 1)];
    // '손세정제'는 네 기록 모두에 나와 df 4 > 3
    expect(buildLinks(recs, stats(recs), [], student())).toEqual([]);
  });

  it('공유 낱말이 하나도 없으면 연결되지 않는다', () => {
    const recs = [
      rec({ id: 'J0', subj: '통합과학1', lane: '과학', year: 1, sem: 1, depth: 2, methods: ['literature'], tf: { 콜로니: 2 }, ktf: ['콜로니'] }),
      rec({ id: 'J1', subj: '통합과학2', lane: '과학', year: 1, sem: 2, depth: 2, methods: ['literature'], tf: { 한천: 2 }, ktf: ['한천'] }),
    ];
    expect(buildLinks(recs, stats(recs), [], student())).toEqual([]);
  });
});

/* ───────────────────────── (5) 계보 전파 ───────────────────────── */

describe('lineage', () => {
  const { recs, st, themes, S } = baseScenario();
  const links = buildLinks(recs, st, themes, S);

  it('위로는 앞선 기록을, 아래로는 뒤이은 기록을 끝까지 따라가고 동시 연결은 세지 않는다', () => {
    const l1 = lineage(links, 'S1');
    expect([...l1.up]).toEqual(['S0']);
    expect([...l1.down]).toEqual(['S2']);
    expect(l1.down.has('S3')).toBe(false);

    const l2 = lineage(links, 'S2');
    expect([...l2.up].sort()).toEqual(['S0', 'S1']);
    expect(l2.down.size).toBe(0);

    const l0 = lineage(links, 'S0');
    expect(l0.up.size).toBe(0);
    expect([...l0.down].sort()).toEqual(['S1', 'S2']);

    const l3 = lineage(links, 'S3');
    expect(l3.up.size).toBe(0);
    expect(l3.down.size).toBe(0);
  });

  it('없는 기록이나 빈 연결에도 빈 집합을 돌려준다', () => {
    expect(lineage(links, '없음')).toEqual({ up: new Set(), down: new Set() });
    expect(lineage([], 'S1')).toEqual({ up: new Set(), down: new Set() });
  });

  it('순환이 있어도 멈춘다', () => {
    const loop: Link[] = [
      { ...links[0], from: 'X', to: 'Y', rel: '심화' },
      { ...links[0], from: 'Y', to: 'X', rel: '반복' },
    ];
    const l = lineage(loop, 'X');
    expect([...l.up]).toEqual(['Y']);
    expect([...l.down]).toEqual(['Y']);
  });
});

/* ───────────────────────── 예시 학생 전체 흐름 ───────────────────────── */

describe('예시 학생(sampleStudent)에서', () => {
  const S = sampleStudent();
  const recs = buildRecords(S);
  const ctx = buildCtx(S);
  for (const r of recs) analyzeRecord(r, ctx);
  const st = buildStats(recs);
  const themes = buildThemes(recs, st);
  assignTopics(recs, keywordFn(st));
  const links = buildLinks(recs, st, themes, S);
  const byId = new Map(recs.map((r) => [r.id, r]));

  it('연결이 만들어지고 모두 유효하다', () => {
    expect(links.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const l of links) {
      const a = byId.get(l.from)!;
      const b = byId.get(l.to)!;
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(a.id).not.toBe(b.id);
      if (l.rel === '동시') expect(a.t).toBe(b.t);
      else if (a.t > b.t) {
        // 같은 학년 창체를 언급한 1학기 세특: 창체 → 세특으로 뒤집었고 근거 줄에 그 까닭을 적는다
        expect(a.kind).toBe('창체');
        expect(a.year).toBe(b.year);
        expect(l.lines.some((x) => x.includes('순서로 놓음'))).toBe(true);
      } else if (a.t === b.t) {
        // 같은 학기라도 한쪽이 다른 쪽을 직접 언급하면 동시가 아니라 앞뒤가 정해진 연결이다
        expect(l.cite).toBe(true);
        expect(l.lines.some((x) => x.startsWith('같은 학기 기록이지만'))).toBe(true);
      }
      expect(LINK_KINDS[l.rel]).toBeDefined();
      expect(l.words.length).toBeGreaterThan(0);
      expect(l.words.length).toBeLessThanOrEqual(3);
      expect(l.lines[0]).toMatch(/^공통 낱말: /);
      expect(l.lines.some((x) => x.startsWith('방법: '))).toBe(true);
      expect(l.lines.some((x) => x.startsWith('탐구 깊이: '))).toBe(true);
      expect(l.sent.length).toBeGreaterThan(20);
      expect(l.sent).not.toMatch(/—/);
      expect(l.why.length).toBeGreaterThan(0);
      const k = `${l.from}>${l.to}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it('뒤 기록 하나에 앞선 연결은 최대 3개, 같은 시기 연결은 창체 2개·교과 1개까지다', () => {
    const cnt = new Map<string, { seq: number; con: number }>();
    for (const l of links) {
      const c = cnt.get(l.to) ?? { seq: 0, con: 0 };
      if (l.rel === '동시') c.con++;
      else c.seq++;
      cnt.set(l.to, c);
    }
    cnt.forEach((c, id) => {
      expect(c.seq).toBeLessThanOrEqual(3);
      expect(c.con).toBeLessThanOrEqual(byId.get(id)!.kind === '창체' ? 2 : 1);
    });
  });

  it('앞 과목(또는 앞 학년 창체)을 직접 언급한 기록은 그 기록과 cite로 이어진다', () => {
    const cites = links.filter((l) => l.cite);
    expect(cites.length).toBeGreaterThan(0);
    for (const l of cites) {
      const a = byId.get(l.from)!;
      const b = byId.get(l.to)!;
      expect(a.year).toBeLessThanOrEqual(b.year);
      // 창체 언급은 '1학년 동아리에서 진행한'처럼 앞 학년일 때만 직접 언급이다
      if (a.kind === '창체') expect(a.year).toBeLessThan(b.year);
      expect(l.lines.some((x) => x.includes('직접 언급함'))).toBe(true);
    }
    // 대수 세특의 '1학년 동아리에서 진행한 … 카탈레이스 반응 실험'은 1학년 동아리(생명과학탐구반)를 가리킨다
    const club = recs.find((r) => r.subj === '동아리활동(생명과학탐구반)')!;
    const alg = recs.find((r) => r.subj === '대수')!;
    expect(pair(links, club.id, alg.id)?.cite).toBe(true);
    // 2학년 생명과학 세특이 '1학년 때 과학탐구실험1 시간에 수행했던 ...'을 언급한다
    const bio = recs.find((r) => r.year === 2 && r.kind === '세특' && /생명과학/.test(r.subj));
    const exp1 = recs.find((r) => r.year === 1 && r.kind === '세특' && /과학탐구실험1/.test(r.subj));
    expect(bio).toBeDefined();
    expect(exp1).toBeDefined();
    const l = pair(links, exp1!.id, bio!.id);
    expect(l?.cite).toBe(true);
  });

  it('진로 희망 낱말을 공유한 연결은 hope와 근거 줄을 가진다', () => {
    const hoped = links.filter((l) => l.hope);
    for (const l of hoped) expect(l.lines.some((x) => x.startsWith(`진로 희망 낱말 ‘${l.hope}’`))).toBe(true);
  });

  it('계보는 연결을 따라 전파된다', () => {
    const seq = links.filter((l) => l.rel !== '동시');
    expect(seq.length).toBeGreaterThan(0);
    const l = seq[0];
    expect(lineage(links, l.to).up.has(l.from)).toBe(true);
    expect(lineage(links, l.from).down.has(l.to)).toBe(true);
  });
});

/* ───────────────────────── 리뷰 뒤 보강 ───────────────────────── */
describe('buildLinks: 기록이 적은 학생부(1학년 1학기만)에서도 이어진다', () => {
  it('같은 주제를 잇는 두 기록만 있어도(N=2) 연결이 생긴다', () => {
    const recs = [
      rec({
        id: 'S0', subj: '통합과학1', lane: '과학', year: 1, sem: 1, depth: 2, methods: ['literature', 'understanding'],
        tf: { 카탈레이스: 2, 과산화수소: 2, 기포: 1, 활성: 1 }, ktf: ['카탈레이스', '과산화수소', '기포'],
      }),
      rec({
        id: 'S1', subj: '과학탐구실험1', lane: '과학', year: 1, sem: 2, depth: 3, methods: ['experiment', 'data'],
        tf: { 카탈레이스: 3, 과산화수소: 1, 기포: 2, 활성: 2 }, ktf: ['카탈레이스', '과산화수소', '활성'],
      }),
    ];
    // buildStats가 Neff=max(N,8)로 idf를 재므로 N=2라도 문턱 5를 넘는다
    const links = buildLinks(recs, buildStats(recs), [], student());
    expect(pairs(links)).toEqual(['S0>S1']);
    expect(links[0].rel).toBe('심화');
  });
  it('교과군이 다른 1학년 1학기 두 기록도 핵심 낱말 네 개와 관심 주제를 나누면 같은 시기 연결이 된다', () => {
    const recs = [
      rec({
        id: 'S0', subj: '통합과학1', lane: '과학', year: 1, sem: 1, depth: 3, methods: ['experiment'],
        tf: { 카탈레이스: 2, 과산화수소: 2, 거품: 1, 활성: 2 }, ktf: ['카탈레이스', '과산화수소', '거품', '활성'],
      }),
      rec({
        id: 'S1', subj: '정보', lane: '정보·기술', year: 1, sem: 1, depth: 3, methods: ['coding', 'data'],
        tf: { 카탈레이스: 2, 거품: 1, 과산화수소: 1, 활성: 1 }, ktf: ['카탈레이스', '거품', '과산화수소', '활성'],
      }),
    ];
    const st = buildStats(recs);
    const themes = buildThemes(recs, st);
    expect(themes.length).toBeGreaterThan(0);
    // 같은 시기 연결 문턱 6: 드문 낱말 4개(각 ln(9/2.5) ≈ 1.28) + 공통 관심 주제 1.5
    const links = buildLinks(recs, st, themes, student());
    expect(pairs(links)).toEqual(['S0>S1']);
    expect(links[0].rel).toBe('동시');
  });
});

describe('buildLinks: 직접 언급은 과목명 뒤에 수업 맥락이 있어야 한다', () => {
  const mk = (text: string, subj: string, base: string) => {
    const recs = [
      rec({ id: 'A', subj, lane: '정보·기술', year: 1, sem: 1, depth: 3, methods: ['coding'], tf: { 데이터: 2 }, ktf: ['데이터'], text: '데이터를 다룸.' }),
      rec({ id: 'B', subj: base, lane: '과학', year: 2, sem: 1, depth: 3, methods: ['experiment'], tf: { 데이터: 1 }, ktf: [], text }),
    ];
    return buildLinks(recs, stats(recs), [], student());
  };
  it("'1학년의 정보를 바탕으로'는 과목 '정보'를 가리키지 않는다", () => {
    expect(mk('1학년의 정보를 바탕으로 데이터를 정리함.', '정보', '화학').some((l) => l.cite)).toBe(false);
  });
  it("'1학년 정보 시간에 배운'은 과목을 가리킨다", () => {
    const links = mk('1학년 정보 시간에 배운 파이썬으로 데이터를 정리함.', '정보', '화학');
    expect(links.some((l) => l.cite)).toBe(true);
  });
  it("'2학년 화학 반응의 세계 수업에서'는 과목 '화학'을 가리키지 않는다", () => {
    const recs = [
      rec({ id: 'A', subj: '화학', lane: '과학', year: 2, sem: 1, depth: 3, methods: ['experiment'], tf: { 촉매: 2 }, ktf: ['촉매'], text: '촉매를 다룸.' }),
      rec({ id: 'B', subj: '화학 반응의 세계', lane: '과학', year: 2, sem: 2, depth: 3, methods: ['experiment'], tf: { 촉매: 1 }, ktf: [], text: '2학년 화학 반응의 세계 수업에서 촉매를 조사함.' }),
    ];
    const links = buildLinks(recs, stats(recs), [], student());
    expect(links.some((l) => l.cite)).toBe(false);
  });
});

describe('linkReason 문장: 가운뎃점은 고유 라벨에만, 깊이가 같으면 그대로', () => {
  const { recs, st, themes, S } = baseScenario();
  const links = buildLinks(recs, st, themes, S);
  it("'N단계에서 N단계로 같습니다' 같은 비문이 없다", () => {
    for (const l of links) {
      expect(l.sent).not.toMatch(/단계에서 \d단계로 같습니다/);
      expect(l.sent).not.toMatch(/에서 .*(으로|로) 비슷한 수준에서/);
    }
  });
  it('낱말 나열은 쉼표, 항목 구분은 빗금이다', () => {
    for (const l of links) {
      expect(l.head).not.toMatch(/ · /);
      expect(l.why).not.toMatch(/ · /);
      expect(l.detail).not.toMatch(/ · /);
      expect(l.head).toMatch(/^(직접 언급 \/ )?‘[^’]+’/);
    }
  });
  it('대표 방법이 그대로인데 새 방법이 더해지면 바뀌었다고 하지 않는다', () => {
    const recs2 = [
      rec({ id: 'P0', subj: '통합과학1', lane: '과학', year: 1, sem: 1, depth: 3, methods: ['experiment'], tf: { 전극: 2, 전압: 2, 아연: 1 }, ktf: ['전극', '전압', '아연'] }),
      rec({ id: 'P1', subj: '통합과학2', lane: '과학', year: 1, sem: 2, depth: 3, methods: ['experiment', 'literature'], tf: { 전극: 2, 전압: 1, 아연: 1 }, ktf: ['전극', '전압', '아연'] }),
    ];
    const l = buildLinks(recs2, stats(recs2), [], student())[0];
    expect(l.rel).toBe('전환');
    expect(l.sent).toContain('방법은 실험·측정을 이어 가면서 문헌·자료 조사를 새로 더했고');
    expect(l.sent).not.toContain('바뀌었');
    expect(l.lines).toContain('방법: 실험·측정 그대로 (새로 더한 방법: 문헌·자료 조사)');
    expect(l.why).toMatch(/문헌·자료 조사 더함$/);
  });
  it('전환·반복의 설명은 깊이가 올라가지 않았다고만 말한다', () => {
    expect(LINK_KINDS['전환'].desc).not.toContain('비슷함');
    expect(LINK_KINDS['전환'].hint).not.toContain('그대로입니다');
    expect(LINK_KINDS['반복'].desc).toContain('깊이');
  });
});

/* ───────────────────────── 검수 뒤 보강: 과목 계열, 같은 학기 직접 언급, 창체 자리, 창체 선후 ───────────────────────── */
describe('buildLinks: 같은 과목 계열(subjectFamily)', () => {
  it("통합사회1 → 사회와 문화는 '같은 과목 계열'로 잇고, '같은 과목'이라고 하지 않는다", () => {
    const recs = [
      rec({
        id: 'K0', subj: '통합사회1', lane: '사회', year: 1, sem: 1, depth: 2, methods: ['literature'],
        tf: { 기후정의: 2, 해수면: 1 }, ktf: ['기후정의'],
      }),
      rec({
        id: 'K1', subj: '사회와 문화', lane: '사회', year: 2, sem: 1, depth: 2, methods: ['literature'],
        tf: { 기후정의: 1, 해수면: 1 }, ktf: ['해수면'],
      }),
    ];
    const links = buildLinks(recs, stats(recs), [], student());
    expect(pairs(links)).toEqual(['K0>K1']);
    const l = links[0];
    expect(l.ss).toBe(true);
    expect(l.lines).toContain('같은 과목 계열의 후속 기록: 통합사회1 → 사회와 문화');
    expect(l.sent).toContain('같은 과목 계열 안에서 이어졌고');
    expect(l.sent).not.toContain('같은 과목 안에서');
    expect(l.head).toMatch(/ \/ 같은 과목 계열$/);
    expect(l.why).toMatch(/^같은 계열 \/ /);
  });
});

describe('buildLinks: 같은 학기라도 직접 언급이 있으면 앞뒤가 정해진 연결이다', () => {
  it('뒤 기록(배열 뒤)이 앞 기록을 언급하면 앞 → 뒤, 종류는 깊이 규칙대로', () => {
    const recs = [
      rec({
        id: 'L0', subj: '통합과학1', lane: '과학', year: 1, sem: 1, depth: 3, methods: ['experiment'],
        tf: { 카탈레이스: 2, 간조각: 1 }, ktf: ['카탈레이스', '간조각'], text: '간 조각을 과산화수소수에 넣어 기포 발생을 관찰함.',
      }),
      rec({
        id: 'L1', subj: '과학탐구실험1', lane: '과학', year: 1, sem: 1, depth: 4, methods: ['experiment', 'data'],
        tf: { 카탈레이스: 2, 간조각: 1 }, ktf: ['카탈레이스', '간조각'],
        text: '통합과학1 시간에 다루었던 간 조각 관찰에서 생긴 궁금증을 탐구 질문으로 구체화함.',
      }),
    ];
    const links = buildLinks(recs, stats(recs), [], student());
    expect(pairs(links)).toEqual(['L0>L1']);
    const l = links[0];
    expect(l.rel).toBe('심화');
    expect(l.cite).toBe(true);
    expect(l.lines.some((x) => x.startsWith('같은 학기 기록이지만') && x.endsWith('통합과학1 → 과학탐구실험1 순서로 놓음'))).toBe(true);
  });
  it('앞 기록(배열 앞)이 뒤 기록을 언급하면 방향을 뒤집는다(생명과학 → 대수)', () => {
    const recs = [
      rec({
        id: 'M0', subj: '대수', lane: '수학', year: 2, sem: 1, depth: 4, methods: ['modeling', 'data'],
        tf: { 기질: 2, 포화: 1 }, ktf: ['기질', '포화'], text: '생명과학 시간에 본 기질 농도 그래프는 포화되는 모양이어서 지수함수로는 설명하기 어렵다고 지적함.',
      }),
      rec({
        id: 'M1', subj: '생명과학', lane: '과학', year: 2, sem: 1, depth: 3, methods: ['modeling'],
        tf: { 기질: 1, 포화: 1 }, ktf: ['기질', '포화'], text: '기질 농도가 높아지면 효소가 포화되는 까닭을 설명함.',
      }),
    ];
    const links = buildLinks(recs, stats(recs), [], student());
    expect(pairs(links)).toEqual(['M1>M0']);
    expect(links[0].rel).toBe('심화');
    expect(links[0].cite).toBe(true);
    expect(links[0].lines).toContain('뒤 기록이 ‘2학년 생명과학’을 직접 언급함');
  });
  it('직접 언급이 없는 같은 학기·같은 교과군 기록은 핵심 낱말이 세 개 이상 겹쳐야 동시로 잇는다', () => {
    const mk = (ktf1: string[]) => {
      const recs = [
        rec({ id: 'N0', subj: '물리학', lane: '과학', year: 2, sem: 1, depth: 3, methods: ['experiment'], tf: { 전극: 2, 전압: 2, 아연판: 2 }, ktf: ['전극', '전압', '아연판'] }),
        rec({ id: 'N1', subj: '화학', lane: '과학', year: 2, sem: 1, depth: 3, methods: ['experiment'], tf: { 전극: 2, 전압: 2, 아연판: 2 }, ktf: ktf1 }),
      ];
      return buildLinks(recs, stats(recs), [], student());
    };
    expect(mk(['전극', '전압', '아연판']).map((l) => l.rel)).toEqual(['동시']);
    expect(mk(['전극', '전압'])).toEqual([]);
  });
});

describe('buildLinks: 공통 관심 주제가 있는 교과↔창체 후보는 한 자리를 따로 받는다', () => {
  const mk = (clubKey: string[]) => {
    const recs = [
      rec({
        id: 'P0', subj: '과학탐구실험1', lane: '과학', year: 1, sem: 1, depth: 4, methods: ['experiment'],
        tf: { 기질: 1, 포화: 1, 저해제: 1 }, ktf: ['기질', '포화', '저해제'], text: '효소 실험을 함.',
      }),
      rec({
        id: 'P1', kind: '창체', subj: '동아리활동 (생명과학탐구반)', lane: '동아리', year: 1, sem: null, depth: 4, methods: ['experiment'],
        tf: { 기질: 1, 포화: 1, 저해제: 1 }, ktf: clubKey, text: '기질 농도별 반응 속도를 측정함.',
      }),
      rec({
        id: 'P2', subj: '생명과학', lane: '과학', year: 2, sem: 1, depth: 3, methods: ['modeling'],
        tf: { 기질: 1, 포화: 1, 저해제: 1 }, ktf: ['기질', '포화', '저해제'], text: '1학년 때 과학탐구실험1 시간에 수행했던 효소 실험을 다시 꺼내어 설명함.',
      }),
    ];
    const themes = [theme('효소', ['P0', 'P1', 'P2'])];
    return buildLinks(recs, stats(recs), themes, student());
  };
  it('직접 언급 후보(1위)의 55%에 못 미쳐도 핵심 낱말 세 개를 나누면 남긴다(동아리 → 생명과학)', () => {
    const links = mk(['기질', '포화', '저해제']);
    expect(pair(links, 'P0', 'P2')?.cite).toBe(true);
    const l = pair(links, 'P1', 'P2');
    expect(l).toBeDefined();
    expect(l!.cc).toBe(true);
    expect(l!.sc).toBeLessThan(pair(links, 'P0', 'P2')!.sc * 0.55);
  });
  it('핵심 낱말이 두 개만 겹치면 따로 자리를 받지 않는다', () => {
    const links = mk(['기질', '포화']);
    expect(pair(links, 'P1', 'P2')).toBeUndefined();
  });
});

describe('buildLinks: 같은 학년의 창체 ↔ 세특 선후', () => {
  const mk = (chemText: string) => {
    const recs = [
      rec({
        id: 'Q0', subj: '화학', lane: '과학', year: 2, sem: 1, depth: 3, methods: ['literature'],
        tf: { 에탄올: 1, 세정제: 1, 억제대: 1 }, ktf: ['에탄올', '세정제', '억제대'], text: chemText,
      }),
      rec({
        id: 'Q1', kind: '창체', subj: '동아리활동 (미생물탐구반)', lane: '동아리', year: 2, sem: null, depth: 4, methods: ['experiment'],
        tf: { 에탄올: 1, 세정제: 1, 억제대: 1 }, ktf: ['에탄올', '세정제', '억제대'], text: '손 세정제 종류에 따른 억제대 지름을 비교함.',
      }),
    ];
    return buildLinks(recs, stats(recs), [], student());
  };
  it('1학기 세특이 같은 학년 창체에서 한 활동을 언급하면 창체 → 세특으로 놓는다', () => {
    const links = mk('동아리에서 진행한 손 세정제의 세균 억제 효과 비교 실험에서 본 에탄올 함량 표기를 계기로 살균 효과를 조사함.');
    expect(pairs(links)).toEqual(['Q1>Q0']);
    expect(links[0].lines).toContain('화학 세특이 같은 학년의 동아리활동 (미생물탐구반)에서 한 활동을 언급하므로 동아리활동 (미생물탐구반) → 화학 순서로 놓음');
  });
  it('언급이 없으면 학기 순서(세특 1학기 → 창체)로 두되 선후를 확정할 수 없다고 적는다', () => {
    const links = mk('에탄올 농도와 살균 효과를 조사함.');
    expect(pairs(links)).toEqual(['Q0>Q1']);
    expect(links[0].lines.some((x) => x.startsWith('창의적 체험활동은 학기 구분이 없어'))).toBe(true);
  });
  it('다른 학년이 적힌 창체 언급(1학년 동아리에서)은 같은 학년 창체로 보지 않는다', () => {
    const links = mk('1학년 동아리에서 진행한 손 세정제 실험에서 본 에탄올 함량 표기를 계기로 조사함.');
    expect(pairs(links)).toEqual(['Q0>Q1']);
  });
});

describe('buildLinks: 카드 한 줄(why)에는 연결 종류 이름이 없다', () => {
  it('예시 학생의 모든 연결', () => {
    const S = sampleStudent();
    const recs = buildRecords(S);
    const ctx = buildCtx(S);
    for (const r of recs) analyzeRecord(r, ctx);
    const st = buildStats(recs);
    const themes = buildThemes(recs, st);
    assignTopics(recs, keywordFn(st), themes);
    const links = buildLinks(recs, st, themes, S);
    for (const l of links) {
      expect(l.why).not.toMatch(/심화|확장|전환|반복|같은 시기|동시/);
      expect(l.why).not.toMatch(/ · /);
    }
  });
});
