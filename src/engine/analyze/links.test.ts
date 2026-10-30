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
  it('공유 낱말은 드문 순으로 최대 3개, 근거 첫 줄은 공통 낱말', () => {
    const l = pair(links, 'S0', 'S1')!;
    expect(l.words).toHaveLength(3);
    expect(l.words).toEqual(expect.arrayContaining(['카탈레이스', '과산화수소', '감자']));
    // df 2인 낱말(감자)이 df 3인 낱말(카탈레이스, 과산화수소)보다 앞에 온다. 같은 df면 뒤 기록 본문 순서
    expect(l.words).toEqual(['감자', '카탈레이스', '과산화수소']);
    expect(l.lines[0]).toBe('공통 낱말: 감자, 카탈레이스, 과산화수소');
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
    expect(l.lines).toContain('방법: 문헌·자료 조사 → 실험·측정 (새로 쓴 방법: 실험·측정)');
    expect(l.lines).toContain('탐구 깊이: 2단계(조사·분석) → 3단계(분석·실험)');
    expect(l.sent).toBe(
      '1학년 통합과학1에서 다룬 ‘감자·카탈레이스·과산화수소’를 1학년 과학탐구실험1에서 다시 다뤘습니다. '
        + '같은 교과군 안에서 이어졌고, 방법은 문헌·자료 조사에서 실험·측정으로 바뀌었으며, 탐구 깊이는 2단계에서 3단계로 올라갔습니다.',
    );
    expect(l.head).toBe('‘감자·카탈레이스’');
    expect(l.detail).toBe('문헌·자료 조사 → 실험·측정 · 깊이 2→3');
    expect(l.why).toBe('카탈레이스 · 깊이 2→3');
  });

  it('교과군이 바뀌고 깊이가 같으면 확장(새 방법이 있어도 확장이 먼저)', () => {
    const l = pair(links, 'S1', 'S2')!;
    expect(l.rel).toBe('확장');
    expect(l.cross).toBe(true);
    expect(l.newM).toEqual(['survey']);
    expect(l.lines).toContain('교과군: 과학 → 사회');
    expect(l.lines).toContain('탐구 깊이: 3단계(분석·실험) → 3단계(분석·실험) (같은 수준)');
    expect(l.sent).toContain('교과군이 과학에서 사회로 바뀌어 다른 관점으로 넓어졌고');
    expect(l.sent).toContain('방법은 실험·측정에서 설문·면담으로 바뀌었으며');
    expect(l.sent).toContain('탐구 깊이는 3단계에서 3단계로 같습니다.');
    expect(l.head).toMatch(/’ · 과학→사회$/);
    expect(l.why).toBe('카탈레이스 · 과학→사회');
  });

  it('같은 시기(같은 t)의 다른 교과군이면 동시', () => {
    const l = pair(links, 'S1', 'S3')!;
    expect(l.rel).toBe('동시');
    expect(l.theme).toBe('거품');
    expect(l.sent).toBe('1학년에 과학탐구실험1과 공통수학2에서 ‘지수함수·반응속도·거품’을 같은 시기에 함께 다뤘습니다.');
    expect(l.detail).toBe('과학·수학 함께 다룸');
    expect(l.why).toBe('거품 · 같은 시기');
    // 같은 시기 쌍은 한 번만(배열에서 앞선 기록이 from)
    expect(pair(links, 'S3', 'S1')).toBeUndefined();
  });

  it('같은 교과군에서 깊이가 같고 2단계 이상 새 방법이 있으면 전환', () => {
    const recs = [
      rec({
        id: 'A0', subj: '통합사회1', lane: '사회', year: 1, sem: 1, depth: 2, methods: ['literature', 'discussion'],
        tf: { 기후정의: 2, 해수면: 1, 배출량: 1 }, ktf: ['기후정의', '해수면', '배출량'],
      }),
      rec({
        id: 'A1', subj: '사회와 문화', lane: '사회', year: 2, sem: 1, depth: 2, methods: ['literature', 'proposal'],
        tf: { 기후정의: 1, 해수면: 2, 배출량: 1 }, ktf: ['기후정의', '해수면', '배출량'],
      }),
    ];
    const links = buildLinks(recs, stats(recs), [], student());
    expect(pairs(links)).toEqual(['A0>A1']);
    const l = links[0];
    expect(l.rel).toBe('전환');
    expect(l.ss).toBe(false);
    expect(l.newM).toEqual(['proposal']);
    expect(l.lines).toContain('방법: 문헌·자료 조사 → 해결안 제안 (새로 쓴 방법: 해결안 제안)');
    expect(l.sent).toContain('같은 교과군 안에서 이어졌고, 방법은 문헌·자료 조사에서 해결안 제안으로 바뀌었으며, 탐구 깊이는 2단계에서 2단계로 같습니다.');
    expect(l.why).toMatch(/^(기후정의|해수면|배출량) · 문헌·자료 조사→해결안 제안$/);
  });

  it('교과군, 깊이, 방법 수준이 모두 같으면 반복', () => {
    const recs = [
      rec({
        id: 'A0', subj: '통합사회1', lane: '사회', year: 1, sem: 1, depth: 2, methods: ['literature', 'discussion'],
        tf: { 기후정의: 2, 해수면: 1, 배출량: 1 }, ktf: ['기후정의', '해수면', '배출량'],
      }),
      rec({
        id: 'A1', subj: '사회와 문화', lane: '사회', year: 2, sem: 1, depth: 2, methods: ['literature'],
        tf: { 기후정의: 1, 해수면: 2, 배출량: 1 }, ktf: ['기후정의', '해수면', '배출량'],
      }),
    ];
    const links = buildLinks(recs, stats(recs), [], student());
    expect(pairs(links)).toEqual(['A0>A1']);
    const l = links[0];
    expect(l.rel).toBe('반복');
    expect(l.newM).toEqual([]);
    expect(l.lines).toContain('방법: 문헌·자료 조사 → 문헌·자료 조사');
    expect(l.sent).toContain('방법은 문헌·자료 조사 그대로였으며');
    expect(l.why).toMatch(/ · 반복\(깊이 2→2\)$/);
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
    expect(links[0].lines).toContain('탐구 깊이: 3단계(분석·실험) → 2단계(조사·분석) (앞 탐구보다 얕아짐)');
    expect(links[0].why).toMatch(/ · 과학→국어 · 깊이↓$/);
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
    expect(l.head).toMatch(/ · 같은 과목$/);
    expect(l.why).toMatch(/^같은 과목 · /);
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
    expect(l.head).toMatch(/^직접 언급 · /);
    expect(l.why).toMatch(/^직접 언급 · /);
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

  it('창체 기록은 과목명이 아니므로 직접 언급 대상이 아니다', () => {
    const recs = [
      rec({
        id: 'G0', kind: '창체', subj: '동아리활동 (생명과학탐구반)', lane: '동아리', year: 1, sem: null, depth: 3, methods: ['experiment'],
        tf: { 콜로니: 2 }, ktf: ['콜로니'], text: '콜로니 수를 셈.',
      }),
      rec({
        id: 'G1', subj: '생명과학', lane: '과학', year: 2, sem: 1, depth: 3, methods: ['experiment'],
        tf: { 한천: 1 }, ktf: ['한천'], text: '1학년 때 동아리활동 (생명과학탐구반)에서 했던 실험을 떠올림.',
      }),
    ];
    expect(buildLinks(recs, stats(recs), [], student())).toEqual([]);
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
      expect(a.t).toBeLessThanOrEqual(b.t);
      expect(l.rel === '동시').toBe(a.t === b.t);
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

  it('1학년 과목을 직접 언급한 2학년 기록은 그 과목과 cite로 이어진다', () => {
    const cites = links.filter((l) => l.cite);
    expect(cites.length).toBeGreaterThan(0);
    for (const l of cites) {
      const a = byId.get(l.from)!;
      expect(a.kind).toBe('세특');
      expect(a.year).toBe(1);
      expect(l.lines.some((x) => x.includes('직접 언급함'))).toBe(true);
    }
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
