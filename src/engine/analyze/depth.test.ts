import { describe, expect, it } from 'vitest';
import type { MethodKey, Rec, StudentRecord } from '../types';
import { sampleStudent } from '../../fixtures/sample';
import { METHOD } from '../dict/methods';
import { INQ_RX } from '../dict/patterns';
import { buildRecords } from './records';
import { sentences } from './text';
import { DEPTH_TXT, analyzeRecord, buildCtx } from './depth';
import type { Ctx } from './depth';

/* ───────────────────────── 도구 ───────────────────────── */

function emptyStudent(): StudentRecord {
  return { meta: {}, courses: [], seteuk: [], changche: [], hopes: [], behavior: [], warnings: [], years: [] };
}

/** 본문만 있는 세특 기록 하나. 분석 필드는 빈 값. */
function mkRec(text: string, id: string = 'T0'): Rec {
  return {
    id,
    kind: '세특',
    subj: '시험과목',
    lane: '과학',
    year: 1,
    sem: 1,
    t: 0,
    text,
    grades: [],
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

/** 본문을 분석한 기록을 돌려준다. */
function run(text: string, ctx: Ctx): Rec {
  const r = mkRec(text);
  analyzeRecord(r, ctx);
  return r;
}

const lvOf = (k: MethodKey): number => METHOD[k].lv;
const maxLv = (r: Rec): number => r.methods.reduce((m, k) => Math.max(m, lvOf(k)), 0);

/** 명세 4.3의 점수식. 결과의 ms, rf를 바탕으로 다시 계산한다(사전이 바뀌어도 식 자체는 검증된다). */
function expectedScore(s: { s: string; ms: MethodKey[]; rf: boolean }): number {
  return s.ms.reduce((a, k) => a + (lvOf(k) >= 3 ? 2 : 1), 0) + (s.rf ? 2 : 0) + (INQ_RX.test(s.s) ? 1 : 0) + (/[‘'“"『]/.test(s.s) ? 0.5 : 0);
}

const CTX = buildCtx(emptyStudent());

/* ───────────────────────── DEPTH_TXT, buildCtx ───────────────────────── */

describe('DEPTH_TXT', () => {
  it('깊이 1~4의 이름. 0번은 비어 있다', () => {
    expect([...DEPTH_TXT]).toEqual(['', '정리·참여', '조사·분석', '실험·자료 생산', '성찰·확장']);
  });
});

describe('buildCtx', () => {
  it('방법 17종, 기능 8종, 관심 분야 사전을 컴파일하고 단서 정규식을 담는다', () => {
    const S = sampleStudent();
    const ctx = buildCtx(S);
    expect(ctx.methods).toHaveLength(17);
    expect(ctx.skills).toHaveLength(8);
    expect(ctx.fields.length).toBeGreaterThan(0);
    // test()에만 쓰므로 g 플래그가 없다(lastIndex 문제 예방)
    for (const re of [ctx.reflect, ctx.follow, ctx.inq, ctx.connect, ctx.evalRx]) expect(re.global).toBe(false);
    expect(ctx.reflect.test('오차의 원인을 찾아 재실험함')).toBe(true);
    expect(ctx.follow.test('더 나아가 추가로 조사함')).toBe(true);
    expect(ctx.inq.test('온도를 측정함')).toBe(true);
    expect(ctx.connect.test('1학년 때 조사했던 자료')).toBe(true);
    expect(ctx.evalRx.test('탐구 태도가 돋보임')).toBe(true);
    expect(ctx.subjStop.has('통합과학1')).toBe(true);
    expect(ctx.subjStop.has('과학탐구실험')).toBe(true);
  });
  it('교사 추가 표현(userDict)이 방법 탐지에 합쳐진다', () => {
    const plain = run('거품 높이 재기를 모둠별로 함.', buildCtx(emptyStudent()));
    const withUser = run('거품 높이 재기를 모둠별로 함.', buildCtx(emptyStudent(), { experiment: ['거품 높이 재기'] }));
    expect(plain.methods).not.toContain('experiment');
    expect(withUser.methods).toContain('experiment');
    expect(withUser.depth).toBe(3);
  });
});

/* ───────────────────────── 예시 학생 ───────────────────────── */

describe('analyzeRecord(sampleStudent())', () => {
  const S = sampleStudent();
  const ctx = buildCtx(S);
  const recs = buildRecords(S);
  for (const r of recs) analyzeRecord(r, ctx);
  const by = (subj: string, year?: number): Rec => {
    const r = recs.find((x) => x.subj === subj && (year === undefined || x.year === year));
    if (!r) throw new Error(`기록 없음: ${subj}`);
    return r;
  };

  it('과학탐구실험1: 실험·측정과 재실험·한계가 함께 있어 깊이 4', () => {
    const r = by('과학탐구실험1');
    expect(r.depth).toBe(4);
    expect(r.methods).toContain('experiment');
    expect(r.methods[0]).toBe('experiment'); // 3단계이면서 가장 자주 나온 방법이 맨 앞
    expect(r.sents.some((s) => s.rf && s.ms.some((k) => lvOf(k) >= 3))).toBe(true);
    expect(r.faint).toBe(false);
    expect(r.connectCue).toBe(true); // '통합과학1 시간에 다루었던'
    expect(r.fuCount).toBeGreaterThanOrEqual(1); // '추가로 확인하여'
  });

  it('과학 탐구 기능: 변인 통제(design)와 측정(collect)이 과학탐구실험1과 생명과학탐구반에 잡힌다', () => {
    for (const r of [by('과학탐구실험1'), by('동아리활동(생명과학탐구반)')]) {
      expect(r.skills, r.subj).toContain('design');
      expect(r.skills, r.subj).toContain('collect');
      expect(r.skillCounts.design).toBeGreaterThanOrEqual(1);
      expect(r.skillCounts.collect).toBeGreaterThanOrEqual(1);
      // 문장 단위 기능이 기록 집계와 맞는다
      const n = r.sents.filter((s) => s.skills.includes('collect')).length;
      expect(r.skillCounts.collect).toBe(n);
    }
  });

  it('효소 줄기: 직접 실험한 과학탐구실험1과 동아리는 실험·측정, 자료를 해석한 생명과학은 3단계 모델링', () => {
    for (const subj of ['과학탐구실험1', '동아리활동(생명과학탐구반)']) {
      expect(by(subj).methods, subj).toContain('experiment');
    }
    // 생명과학 세특은 그래프 해석과 모식도 설명이지 실험을 한 기록이 아니다('카탈레이스', '실험의' 같은 낱말만으로 실험으로 세지 않는다)
    const bio = by('생명과학');
    expect(bio.methods).not.toContain('experiment');
    expect(bio.methods).toContain('modeling');
    expect(bio.depth).toBeGreaterThanOrEqual(3);
    expect(by('동아리활동(생명과학탐구반)').depth).toBe(4); // 반복 측정 + 한계 지적
  });

  it('평가 문장에 걸린 설명 낱말로 깊이가 올라가지 않는다(한국사1, 공통수학1, 1학년 진로활동은 3단계 미만)', () => {
    // '연표로 정리', '그래프를 그려 설명', '예를 직접 만들어 제시', '배양하고 분석하는 일(직업 설명)', '실험 기록을 남기는 습관'
    for (const subj of ['한국사1', '한국사2', '공통수학1']) expect(by(subj).depth, subj).toBeLessThan(3);
    const career = recs.find((r) => r.kind === '창체' && r.lane === '진로' && r.year === 1)!;
    expect(career.methods).not.toContain('experiment');
    expect(career.depth).toBeLessThan(3);
  });

  it('통합사회: 토론과 자료 조사만 있어 깊이 2 이하', () => {
    for (const subj of ['통합사회1', '통합사회2', '세계시민과 지리']) {
      const r = by(subj);
      expect(r.depth, subj).toBeLessThanOrEqual(2);
      expect(maxLv(r), subj).toBeLessThanOrEqual(2);
      expect(r.methods, subj).toContain('discussion');
    }
  });

  it('음악: 실기·참여만 있어 깊이 1이고 약한 기록(faint)', () => {
    const r = by('음악');
    expect(r.depth).toBe(1);
    expect(r.faint).toBe(true);
    expect(r.methods.length).toBeGreaterThan(0);
    expect(r.methods.every((k) => lvOf(k) === 1)).toBe(true);
  });

  it('모든 기록: 문장 수, 깊이 범위, 핵심 문장·활동 흐름 개수, 방법 정렬, 점수식', () => {
    for (const r of recs) {
      expect(r.sents).toHaveLength(sentences(r.text).length);
      expect(r.depth).toBeGreaterThanOrEqual(1);
      expect(r.depth).toBeLessThanOrEqual(4);
      expect(r.key.length).toBeGreaterThanOrEqual(1);
      expect(r.key.length).toBeLessThanOrEqual(3);
      expect(r.acts.length).toBeGreaterThanOrEqual(1);
      expect(r.acts.length).toBeLessThanOrEqual(5);
      expect(r.acts[0].fu).toBe(false);
      expect(r.fuCount).toBe(r.acts.filter((a) => a.fu).length);
      // 핵심 문장은 원문 순
      for (let i = 1; i < r.key.length; i++) expect(r.key[i].a).toBeGreaterThan(r.key[i - 1].a);
      // 방법은 수준 내림차순, 같은 수준이면 빈도 내림차순
      for (let i = 1; i < r.methods.length; i++) {
        const a = r.methods[i - 1];
        const b = r.methods[i];
        expect(lvOf(a)).toBeGreaterThanOrEqual(lvOf(b));
        if (lvOf(a) === lvOf(b)) expect(r.methodCounts[a]!).toBeGreaterThanOrEqual(r.methodCounts[b]!);
      }
      // methodCounts는 문장 수를 넘지 않고, methods와 키가 같다
      expect(Object.keys(r.methodCounts).sort()).toEqual([...r.methods].sort());
      for (const k of r.methods) {
        expect(r.methodCounts[k]!).toBeGreaterThan(0);
        expect(r.methodCounts[k]!).toBeLessThanOrEqual(r.sents.length);
      }
      // 깊이 규칙
      const top = maxLv(r);
      if (top <= 1) expect(r.depth).toBe(1);
      if (top === 2) expect(r.depth).toBe(2);
      if (top >= 3) expect(r.depth).toBeGreaterThanOrEqual(3);
      expect(r.faint).toBe(r.depth <= 1 && top < 2);
      // 문장 점수식
      for (const s of r.sents) {
        expect(s.sc).toBe(expectedScore(s));
        expect(s.b - s.a).toBe(s.s.length);
      }
      expect(r.sents[0]?.fu ?? false).toBe(false);
      // 활동 요약은 140자 + '…' 안
      for (const a of r.acts) expect(a.text.length).toBeLessThanOrEqual(141);
    }
  });

  it('tf에는 과목명이 들어가지 않고, ktf는 핵심 문장 낱말만 담는다', () => {
    const r = by('과학탐구실험1');
    expect(r.tf.has('통합과학1')).toBe(false);
    expect(r.tf.has('통합과학')).toBe(false);
    expect(r.tf.get('카탈레이스')).toBeGreaterThanOrEqual(1);
    expect(r.ktf.has('카탈레이스')).toBe(true);
    expect(r.ktf.size).toBeLessThanOrEqual(r.tf.size);
    for (const t of r.ktf) expect(r.tf.has(t), t).toBe(true);
  });

  it('관심 분야: 효소 실험 기록은 생명과학 쪽 분야가 잡힌다', () => {
    const r = by('과학탐구실험1');
    expect(r.fields.length).toBeGreaterThanOrEqual(1);
    expect(r.fields.some((f) => /생명/.test(f.k))).toBe(true);
  });

  it('같은 기록을 다시 분석해도 결과가 같다(정규식 lastIndex 영향 없음)', () => {
    const snap = (r: Rec): string =>
      JSON.stringify({ d: r.depth, m: r.methods, mc: r.methodCounts, k: r.key.map((k) => k.a), acts: r.acts, sk: r.skills, tf: [...r.tf], ktf: [...r.ktf], f: r.fields, cue: r.connectCue, faint: r.faint });
    const before = recs.map(snap);
    for (const r of recs) analyzeRecord(r, ctx);
    for (const r of recs) analyzeRecord(r, ctx);
    expect(recs.map(snap)).toEqual(before);
  });
});

/* ───────────────────────── 평가 문장 ───────────────────────── */

describe('평가 문장 처리', () => {
  it('문장 전체가 평가이고 행위 동사가 없으면 방법이 비고 점수도 0', () => {
    const r = run('온도별로 효소 활성을 측정함. 비판적 사고력이 돋보임.', CTX);
    expect(r.sents[1].ms).toEqual([]);
    expect(r.sents[1].sc).toBe(0);
    expect(r.methods).not.toContain('critique');
  });
  it('태도 서술("…태도가 꾸준히 보임.")도 방법이 없다', () => {
    const r = run('개념을 정확한 용어로 설명하려는 태도가 꾸준히 보임.', CTX);
    expect(r.sents[0].ms).toEqual([]);
    expect(r.depth).toBe(1);
    expect(r.faint).toBe(true);
  });
  it('평가 어휘가 있어도 행위 동사가 있으면 실험 같은 방법은 남고, 개념 이해·분석만 뺀다', () => {
    const r = run('실험 결과를 꼼꼼히 기록하는 태도가 돋보임.', CTX);
    expect(r.sents[0].ms).toContain('experiment');
    expect(r.sents[0].ms).not.toContain('understanding');
    expect(r.sents[0].ms).not.toContain('analysis');
  });
  it('평가 어휘가 섞였고 행위 동사가 없으면 개념 분석·해석은 뺀다', () => {
    const r = run('자료를 해석할 때 축의 단위와 조건을 먼저 확인하는 꼼꼼함이 돋보임.', CTX);
    expect(r.sents[0].ms).not.toContain('analysis');
    expect(r.sents[0].ms).not.toContain('understanding');
  });
  it('평가가 아닌 활동 문장의 개념 정리는 그대로 센다', () => {
    const r = run('효소의 작용 원리를 개념 노트로 정리하여 모둠에 설명함.', CTX);
    expect(r.sents[0].ms).toContain('understanding');
  });
});

/* ───────────────────────── 깊이 규칙 ───────────────────────── */

describe('깊이 1~4', () => {
  const S3 = '온도별로 효소 활성을 측정하여 그래프로 나타냄.';
  const S3b = '농도별로 반응 속도를 측정하여 평균을 구함.';
  const RF3 = '예상과 달리 결과가 다르게 나와 오차의 원인을 분석하고 재실험함.';
  const RF2 = '관련 문헌을 조사하여 이 방법의 한계를 정리함.';
  const S2 = '기후변화 관련 자료를 조사하여 발표함.';
  const S1 = '학급 회의에 참여함.';

  it('3단계 방법만 있고 성찰이 없으면 3', () => {
    const r = run(S3, CTX);
    expect(r.sents[0].rf).toBe(false);
    expect(r.methods).toContain('experiment');
    expect(r.depth).toBe(3);
    expect(DEPTH_TXT[r.depth]).toBe('실험·자료 생산');
  });
  it('3단계 문장에 성찰(오차, 재실험)이 붙으면 4', () => {
    const r = run(`${S3} ${RF3}`, CTX);
    expect(r.sents[1].rf).toBe(true);
    expect(r.depth).toBe(4);
    expect(DEPTH_TXT[r.depth]).toBe('성찰·확장');
  });
  it('3단계 문장이 2개 이상이고 2단계 문장에 성찰이 있으면 4, 3단계 문장이 하나뿐이면 3', () => {
    const two = run(`${S3} ${S3b} ${RF2}`, CTX);
    expect(two.sents[2].rf).toBe(true);
    expect(two.sents[2].ms.some((k) => lvOf(k) >= 2)).toBe(true);
    expect(two.sents[2].ms.some((k) => lvOf(k) >= 3)).toBe(false);
    expect(two.depth).toBe(4);
    const one = run(`${S3} ${RF2}`, CTX);
    expect(one.depth).toBe(3);
  });
  it('2단계 방법(조사)만 있으면 2이고 약한 기록이 아니다', () => {
    const r = run(S2, CTX);
    expect(maxLv(r)).toBe(2);
    expect(r.depth).toBe(2);
    expect(r.faint).toBe(false);
    expect(DEPTH_TXT[r.depth]).toBe('조사·분석');
  });
  it('1단계 방법(참여)만 있으면 1이고 약한 기록', () => {
    const r = run(S1, CTX);
    expect(maxLv(r)).toBe(1);
    expect(r.depth).toBe(1);
    expect(r.faint).toBe(true);
    expect(DEPTH_TXT[r.depth]).toBe('정리·참여');
  });
  it('방법이 하나도 없으면 1, faint, 핵심 문장과 활동은 최고점 문장 하나', () => {
    const r = run('수업에 성실히 임함. 친구를 잘 도움.', CTX);
    expect(r.methods).toEqual([]);
    expect(r.depth).toBe(1);
    expect(r.faint).toBe(true);
    expect(r.key).toHaveLength(1);
    expect(r.acts).toHaveLength(1);
    expect(r.acts[0].fu).toBe(false);
  });
  it('빈 본문이면 모두 빈 값', () => {
    const r = run('', CTX);
    expect(r.sents).toEqual([]);
    expect(r.methods).toEqual([]);
    expect(r.key).toEqual([]);
    expect(r.acts).toEqual([]);
    expect(r.depth).toBe(1);
    expect(r.faint).toBe(true);
    expect(r.skills).toEqual([]);
    expect(r.tf.size).toBe(0);
  });
});

/* ───────────────────────── 점수, 후속, 핵심 문장, 활동 흐름 ───────────────────────── */

describe('문장 점수와 후속 탐구', () => {
  it('sc = Σ(3단계 2, 그 외 1) + 성찰 2 + 탐구 동사 1 + 따옴표 0.5', () => {
    const r = run('예상과 달리 결과가 다르게 나와 오차의 원인을 분석하고 재실험함. ‘효소의 최적 온도’를 주제로 보고서를 작성함.', CTX);
    const a = r.sents[0];
    expect(a.ms).toContain('experiment');
    expect(a.rf).toBe(true);
    expect(a.sc).toBe(expectedScore(a));
    expect(a.sc).toBeGreaterThanOrEqual(2 + 2 + 1);
    const b = r.sents[1];
    expect(b.sc % 1).toBe(0.5); // 따옴표 가산
    expect(b.sc).toBe(expectedScore(b));
  });
  it('fu: 첫 문장은 후속이 될 수 없고, 후속 단서가 있는 뒤 문장만 fu', () => {
    const r = run('더 나아가 관련 자료를 추가로 조사하여 정리함. 더 나아가 손 씻기 습관의 역할을 추가로 조사하여 발표 끝에 덧붙임. 수업에 성실히 임함.', CTX);
    expect(r.sents[0].fu).toBe(false);
    expect(r.sents[1].fu).toBe(true);
    expect(r.sents[2].fu).toBe(false);
  });
  it('fu: 후속 단서가 있어도 점수가 0이고 탐구 동사도 없으면 fu가 아니다', () => {
    const r = run('학급 회의에 참여함. 더 나아가 친구들과 사이좋게 지냄.', CTX);
    expect(r.sents[1].ms).toEqual([]);
    expect(r.sents[1].sc).toBe(0);
    expect(r.sents[1].fu).toBe(false);
  });
});

describe('핵심 문장과 활동 흐름', () => {
  const strong = [
    '온도별로 효소 활성을 측정하여 그래프로 나타냄.',
    '농도별로 반응 속도를 측정하여 평균을 구함.',
    '예상과 달리 결과가 다르게 나와 오차의 원인을 분석하고 재실험함.',
    '관련 논문을 찾아 읽고 효소 저해제의 종류를 조사하여 정리함.',
    '설문 조사를 설계하여 학급 친구들의 응답을 수집하고 분석함.',
    '측정 자료를 표로 정리하고 통계 처리하여 상관관계를 해석함.',
    '더 나아가 pH에 따른 활성 변화를 추가로 실험하여 비교함.',
  ];
  it('key: sc>=2 문장 가운데 상위 3개를 원문 순으로', () => {
    const r = run(strong.join(' '), CTX);
    expect(r.sents.filter((s) => s.sc >= 2).length).toBeGreaterThan(3);
    expect(r.key).toHaveLength(3);
    expect(r.key[0].a).toBeLessThan(r.key[1].a);
    expect(r.key[1].a).toBeLessThan(r.key[2].a);
    // 뽑힌 문장의 점수는 뽑히지 않은 문장의 점수보다 낮지 않다
    const minKey = Math.min(...r.key.map((k) => k.sc));
    for (const s of r.sents) if (!r.key.includes(s)) expect(s.sc).toBeLessThanOrEqual(minKey);
  });
  it('acts: 최대 5개, 원문 순, 첫 활동은 fu가 아님, fuCount', () => {
    const r = run(strong.join(' '), CTX);
    expect(r.acts).toHaveLength(5);
    expect(r.acts[0].fu).toBe(false);
    // 원문 순: 요약은 문장 앞부분을 보존하므로 원문에서의 위치가 오름차순
    const pos = r.acts.map((a) => r.text.indexOf(a.text.replace(/…$/, '').slice(0, 10)));
    for (let i = 1; i < pos.length; i++) expect(pos[i]).toBeGreaterThan(pos[i - 1]);
    const last = r.acts[r.acts.length - 1];
    expect(last.fu).toBe(true); // '더 나아가 … 추가로 실험'
    expect(r.fuCount).toBe(r.acts.filter((a) => a.fu).length);
    expect(r.fuCount).toBeGreaterThanOrEqual(1);
  });
  it('acts: 요약이 14자 미만인 짧은 문장은 후보에서 빠진다', () => {
    const r = run('효소를 측정함. 온도별로 효소 활성을 측정하여 그래프로 나타내고 결과를 해석함.', CTX);
    expect(r.sents[0].sc).toBeGreaterThanOrEqual(2);
    expect(r.acts).toHaveLength(1);
    expect(r.acts[0].text.startsWith('온도별로')).toBe(true);
  });
  it('acts: 요약은 평가 꼬리를 떼고 140자를 넘지 않는다', () => {
    const long = '온도별로 효소 활성을 측정하여 ' + '거품 높이를 기록하고 '.repeat(12) + '그래프로 나타내는 꼼꼼한 태도가 돋보임.';
    const r = run(long, CTX);
    expect(r.acts).toHaveLength(1);
    expect(r.acts[0].text.length).toBeLessThanOrEqual(141);
    expect(r.acts[0].text.endsWith('…')).toBe(true);
    const short = run('온도별로 효소 활성을 측정하여 그래프로 나타내는 성실한 태도가 돋보임.', CTX);
    expect(short.acts[0].text).toBe('온도별로 효소 활성을 측정하여 그래프로 나타내는');
    // 꼬리만 있는 평가 문장은 요약이 너무 짧아지므로 원문을 유지한다(summarize 규칙)
    const tailOnly = run('온도별로 효소 활성을 측정함. 탐구 태도가 돋보임.', CTX);
    expect(tailOnly.acts.every((a) => a.text.length >= 6)).toBe(true);
  });
});

/* ───────────────────────── connectCue, 기능, 낱말 ───────────────────────── */

describe('connectCue, skills, tf', () => {
  it('connectCue: 앞 기록을 끌어오는 단서', () => {
    expect(run('1학년 때 조사했던 자료를 다시 활용함.', CTX).connectCue).toBe(true);
    expect(run('지난 학기에 배운 내용을 바탕으로 실험함.', CTX).connectCue).toBe(true);
    expect(run('온도별로 효소 활성을 측정함.', CTX).connectCue).toBe(false);
  });
  it('skills: 문장별 기능과 기록 집계(빈도순)', () => {
    const r = run('독립 변인을 온도, 종속 변인을 거품 높이로 정하고 통제 변인을 명시함. 각 조건을 3회 반복 측정하여 평균을 구함. 측정값을 표로 정리하고 다시 측정함.', CTX);
    expect(r.sents[0].skills).toContain('design');
    expect(r.sents[1].skills).toContain('collect');
    expect(r.skills).toContain('design');
    expect(r.skills).toContain('collect');
    expect(r.skillCounts.collect).toBeGreaterThanOrEqual(2);
    // 빈도 내림차순
    for (let i = 1; i < r.skills.length; i++) expect(r.skillCounts[r.skills[i - 1]]!).toBeGreaterThanOrEqual(r.skillCounts[r.skills[i]]!);
  });
  it('tf: 낱말 빈도, 과목명(subjStop) 제외', () => {
    const S = emptyStudent();
    S.courses.push({ year: 1, sem: 1, group: '과학', name: '통합과학1', credit: 4, raw: 90, avg: 70, sd: 10, ach: 'A', dist: '', rank: 1, n: 200, note: '', kind: 'main', pass: '' });
    const ctx = buildCtx(S);
    const r = run('통합과학1 시간에 배운 카탈레이스의 작용을 카탈레이스 실험으로 확인함.', ctx);
    expect(r.tf.has('통합과학1')).toBe(false);
    expect(r.tf.get('카탈레이스')).toBe(2);
  });
});

/* ───────────────────────── 리뷰 뒤 보강 ───────────────────────── */
describe('평가 문장에서도 3단계 방법은 남는다', () => {
  it("'글라이더를 만들어 비행 거리를 늘리는 모습이 인상적임'은 설계·제작 3단계", () => {
    const r = run('글라이더를 만들어 비행 거리를 늘리는 모습이 인상적임.', CTX);
    expect(r.sents[0].ms).toContain('making');
    expect(r.depth).toBe(3);
  });
  it("'파이썬으로 시뮬레이션을 만들어 결과를 예측하는 역량이 돋보임'은 코딩·시뮬레이션", () => {
    const r = run('파이썬으로 시뮬레이션을 만들어 결과를 예측하는 역량이 돋보임.', CTX);
    expect(r.sents[0].ms).toContain('coding');
    expect(r.depth).toBe(3);
  });
  it("행위 동사 없는 평가 문장('비판적 사고력이 돋보임')의 1·2단계 방법은 여전히 뺀다", () => {
    const r = run('비판적 사고력이 돋보임.', CTX);
    expect(r.sents[0].ms).toEqual([]);
  });
});
