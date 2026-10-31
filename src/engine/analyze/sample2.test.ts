/**
 * 두 번째 가상 학생(fixtures/sample2.ts)으로 방법 판정 규칙과 분석 결과를 지킨다.
 *  - 심어 둔 문장(SAMPLE2_PROBES): 실험·측정 판정(명사만 있는 표현은 같은 문장에 수행 동사가 있어야 센다),
 *    맨몸 '탐구'는 개념 분석·해석이 아님, 평가 문장은 깊이 규칙을 거치면 방법이 남지 않음(설계 명세 4.2, 4.3)
 *  - 기록 단위: 실험·측정 유무가 문장 판정과 맞는지, 형광 표시와 문장 판정이 같은지, 학교자율과정의 교과군,
 *    동아리 이름, 진로 희망 분야 문장(4.9)
 *  - 현실성: 평가 문장 비율, 개념 분석·해석이 든 기록 비율, 깊이 분포, 동음이의 함정
 * 스냅샷은 쓰지 않는다. 계산할 수 있는 기대는 문장 판정에서 계산해 견주고, 픽스처 머리말에 적힌 설계는 그대로 단언한다.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from './index';
import { compileMethods, methodHits, methodMarks } from './methods';
import { nos } from './text';
import { hopeFields } from './gaps';
import { METHOD } from '../dict/methods';
import { SAMPLE2_PROBES, sampleStudent2, type Sample2Probe, type Sample2ProbeKind } from '../../fixtures/sample2';
import type { MethodKey, Rec, Sent } from '../types';

const S = sampleStudent2();
const an = analyze(S);
const M = compileMethods();
const lvOf = (k: MethodKey): number => METHOD[k].lv;
const hasExp = (s: string): boolean => methodHits(s, M).includes('experiment');

/** 심어 둔 문장이 든 기록. 세특 이름은 공백을 빼고 견준다(세특 '생활과윤리' ↔ 성적표 과목 '생활과 윤리'). */
function recOf(p: Sample2Probe): Rec {
  const r = an.recs.find((x) => x.year === p.year && nos(x.subj) === nos(p.subject));
  if (!r) throw new Error(`기록 없음: ${p.year}학년 ${p.subject}`);
  return r;
}

/** 기록 안에서 그 문장(분석 결과의 문장 단위) */
function sentOf(r: Rec, s: string): Sent {
  const o = r.sents.find((x) => x.s.trim() === s);
  if (!o) throw new Error(`문장 없음: ${r.subj} ${s}`);
  return o;
}

/** 과목(또는 창체 영역) 이름과 학년으로 기록 하나 */
function rec(subj: string, year: number): Rec {
  const r = an.recs.find((x) => x.subj === subj && x.year === year);
  if (!r) throw new Error(`기록 없음: ${year}학년 ${subj}`);
  return r;
}

const KIND: Record<Sample2ProbeKind, string> = {
  'concept-technique': '기법을 배우거나 설명만 함',
  performed: '직접 실험하거나 잼',
  'performed-ambiguous': '기법과 수행 동사만 있음',
  'bare-inquiry': "근거가 '탐구' 한 낱말",
  evaluative: '방법처럼 보이는 말을 칭찬에 씀',
};
const probesOf = (k: Sample2ProbeKind): Sample2Probe[] => SAMPLE2_PROBES.filter((p) => p.kind === k);

/* ───────────────────────── 심어 둔 문장 ───────────────────────── */

describe('심어 둔 문장(SAMPLE2_PROBES)', () => {
  it('종류마다 문장이 셋 이상이고, 문장마다 그 기록 본문에 한 번만 온전한 문장으로 들어 있다', () => {
    for (const k of Object.keys(KIND) as Sample2ProbeKind[]) expect(probesOf(k).length, k).toBeGreaterThanOrEqual(3);
    for (const p of SAMPLE2_PROBES) {
      const r = recOf(p);
      expect(r.text.split(p.sentence).length - 1, p.sentence).toBe(1);
      expect(sentOf(r, p.sentence).s.trim()).toBe(p.sentence);
    }
  });

  for (const p of SAMPLE2_PROBES) {
    it(`${p.year}학년 ${p.subject}, ${KIND[p.kind]}: 실험·측정 ${p.expectExperiment ? '있음' : '없음'}`, () => {
      expect(hasExp(p.sentence), p.sentence).toBe(p.expectExperiment);
    });
  }

  it("근거가 '탐구' 한 낱말뿐인 문장은 사전 판정에서도 분석 결과에서도 개념 분석·해석이 아니다", () => {
    for (const p of probesOf('bare-inquiry')) {
      expect(methodHits(p.sentence, M), p.sentence).not.toContain('analysis');
      expect(sentOf(recOf(p), p.sentence).ms, p.sentence).not.toContain('analysis');
    }
  });

  it('평가 문장은 깊이 규칙을 거친 뒤 3단계 방법도 개념 분석·해석도 남지 않는다', () => {
    let filtered = 0;
    for (const p of probesOf('evaluative')) {
      const o = sentOf(recOf(p), p.sentence);
      expect(o.ms.filter((k) => lvOf(k) >= 3), p.sentence).toEqual([]);
      expect(o.ms, p.sentence).not.toContain('analysis');
      // 사전만 보면 '분석력', '따져 보는'이 개념 분석·해석으로 잡히는 문장도 있다. 그것을 빼는 것이 깊이 규칙(4.3)이다
      if (methodHits(p.sentence, M).includes('analysis')) filtered++;
    }
    expect(filtered).toBeGreaterThanOrEqual(1);
  });
});

/* ───────────────────────── 기록 단위 ───────────────────────── */

describe('기록 단위 판정(analyze)', () => {
  /** 심어 둔 문장이 든 기록 → 그 기록의 문장들 */
  const groups = new Map<Rec, Sample2Probe[]>();
  for (const p of SAMPLE2_PROBES) {
    const r = recOf(p);
    groups.set(r, [...(groups.get(r) ?? []), p]);
  }

  it('심어 둔 문장이 든 기록의 실험·측정 유무는 그 문장들의 기대와 나머지 문장의 판정으로 정해진다', () => {
    expect(groups.size).toBe(new Set(SAMPLE2_PROBES.map((p) => `${p.year}:${nos(p.subject)}`)).size);
    for (const [r, ps] of groups) {
      const planted = new Set(ps.map((p) => p.sentence));
      const fromProbes = ps.some((p) => p.expectExperiment);
      const fromOthers = r.sents.filter((o) => !planted.has(o.s.trim())).some((o) => hasExp(o.s));
      expect(r.methods.includes('experiment'), `${r.year}학년 ${r.subj}`).toBe(fromProbes || fromOthers);
      // 깊이 규칙은 3단계 방법을 빼지 않으므로 분석 결과의 문장 방법과 사전 판정이 같다
      for (const o of r.sents) expect(o.ms.includes('experiment'), o.s).toBe(hasExp(o.s));
    }
  });

  it('직접 한 실험이 적힌 과학, 동아리 기록에만 실험·측정이 있다', () => {
    const performed: [string, number][] = [
      ['과학탐구실험', 1], ['생명과학Ⅰ', 2], ['화학Ⅰ', 2], ['물리학Ⅰ', 2], ['화학Ⅱ', 3], ['생명과학Ⅱ', 3],
      ['동아리활동(생명실험탐구반)', 1], ['동아리활동(생명실험탐구반)', 2],
    ];
    for (const [subj, year] of performed) {
      const r = rec(subj, year);
      expect(r.methods, `${year}학년 ${subj}`).toContain('experiment');
      expect(r.depth, `${year}학년 ${subj}`).toBeGreaterThanOrEqual(3);
    }
    // 개념을 배우거나 문헌으로 다룬 문장뿐인 기록. 통합과학의 '과학탐구실험 시간에 이를 확인해 보고 싶다고 밝힘'은 바람이다
    const none: [string, number][] = [
      ['통합과학', 1], ['지구과학Ⅰ', 2], ['생활과 윤리', 2], ['진로활동', 1], ['진로활동', 3], ['동아리활동(과학저널읽기반)', 3],
    ];
    for (const [subj, year] of none) expect(rec(subj, year).methods, `${year}학년 ${subj}`).not.toContain('experiment');
    const sci = an.recs.filter((r) => r.lane === '과학' || r.lane === '동아리');
    expect(sci.filter((r) => r.methods.includes('experiment')).map((r) => `${r.year}학년 ${r.subj}`).sort())
      .toEqual(performed.map(([s, y]) => `${y}학년 ${s}`).sort());
  });

  it('모든 기록의 모든 문장에서 형광 표시(methodMarks)와 문장 판정(methodHits)이 같다', () => {
    let n = 0;
    for (const r of an.recs) {
      const marks = methodMarks(r.text, M);
      for (const m of marks) expect(r.sents.some((o) => o.a <= m.a && m.b <= o.b), `${r.subj}: ${r.text.slice(m.a, m.b)}`).toBe(true);
      for (const o of r.sents) {
        const shown = [...new Set(marks.filter((m) => m.a >= o.a && m.b <= o.b).map((m) => m.key))].sort();
        expect(shown, o.s).toEqual([...methodHits(o.s, M)].sort());
        n++;
      }
    }
    expect(n).toBeGreaterThan(350);
    // 기법만 배운 문장에는 실험·측정 형광이 없다
    for (const p of probesOf('concept-technique')) {
      const r = recOf(p);
      const o = sentOf(r, p.sentence);
      expect(methodMarks(r.text, M).some((m) => m.key === 'experiment' && m.a >= o.a && m.b <= o.b), p.sentence).toBe(false);
    }
  });

  it('학교자율과정 기록 둘은 융합(자율과정) 줄에 놓인다', () => {
    const self = an.recs.filter((r) => r.subj === '학교자율과정');
    expect(self.map((r) => [r.kind, r.year, r.lane])).toEqual([
      ['세특', 1, '융합(자율과정)'],
      ['세특', 2, '융합(자율과정)'],
    ]);
    expect(an.recs.filter((r) => r.lane === '융합(자율과정)')).toHaveLength(2);
  });

  it('동아리 기록은 동아리 이름을 영역 이름에 그대로 지닌다', () => {
    const clubs = an.recs.filter((r) => r.lane === '동아리');
    expect(clubs.map((r) => [r.year, r.subj])).toEqual([
      [1, '동아리활동(생명실험탐구반)'],
      [2, '동아리활동(생명실험탐구반)'],
      [3, '동아리활동(과학저널읽기반)'],
    ]);
    expect(an.recs.some((r) => r.subj === '동아리활동')).toBe(false);
  });

  it('진로 희망 분야와 맞닿은 기록 비율은 강점이나 부족이 아닌 점검(g) 한 줄이다', () => {
    const lines = an.insights.filter((i) => i.t.includes('진로 희망 분야'));
    expect(lines).toHaveLength(1);
    const [ins] = lines;
    expect(ins.tg).toBe('g');
    // 문장의 수는 기록에서 다시 센다: 약한 기록을 뺀 기록 가운데 관심 분야가 진로 희망 분야와 겹치는 기록
    const hf: string[] = [];
    for (const h of [...S.hopes].sort((a, b) => a.year - b.year)) for (const k of hopeFields(h.text)) if (!hf.includes(k)) hf.push(k);
    expect(hf.length).toBeGreaterThanOrEqual(2);
    const real = an.recs.filter((r) => !r.faint);
    const hit = real.filter((r) => r.fields.some((f) => hf.includes(f.k))).length;
    expect(ins.t).toBe(
      `진로 희망 분야(${hf.slice(0, 2).join(', ')})와 맞닿은 탐구 기록은 ${real.length}건 중 ${hit}건(${Math.round((hit / real.length) * 100)}%)입니다. ` +
        '비율만으로 판단하지 말고, 진로와 관련된 교과에서 탐구가 깊어졌는지도 함께 확인해 보세요.',
    );
    expect(ins.t).not.toContain('늘려');
    expect(ins.t).not.toMatch(/강점|부족|여지/);
  });
});

/* ───────────────────────── 현실성 ───────────────────────── */

describe('현실성 점검(픽스처와 분석 결과가 실제 학생부에 가까운지)', () => {
  it('평가 표현이 든 문장이 전체 문장의 22~35%다(픽스처 머리말과 같은 낱말 목록)', () => {
    const texts = [...S.seteuk.map((x) => x.text), ...S.changche.map((x) => x.text), ...S.behavior.map((x) => x.text)];
    const sents = texts.flatMap((t) => t.split(/[.!?]/)).map((s) => s.trim()).filter(Boolean);
    // 뛰어남, 돋보임, 우수함, 탁월함, 인상적임, 역량, 태도가, 성실함, 능력, 자세, 열정, 모범, 감탄.
    // '뛰어나며', '돋보이며', '성실하게'처럼 활용한 꼴도 세도록 줄기로 적는다
    const EVAL = /뛰어나|돋보|우수|탁월|인상적|역량|태도가|성실|능력|자세|열정|모범|감탄/;
    const share = sents.filter((s) => EVAL.test(s)).length / sents.length;
    expect(sents.length).toBeGreaterThan(300);
    expect(share).toBeGreaterThanOrEqual(0.22);
    expect(share).toBeLessThanOrEqual(0.35);
  });

  it('개념 분석·해석이 든 기록은 80%를 넘지 않는다', () => {
    const share = an.recs.filter((r) => r.methods.includes('analysis')).length / an.recs.length;
    expect(share).toBeLessThanOrEqual(0.8);
  });

  it('깊이가 한 단계에 몰리지 않는다', () => {
    // 작성 시점 분포(기록 45건): 1단계 4, 2단계 20, 3단계 17, 4단계 4
    const N = an.recs.length;
    const count = (d: number): number => an.recs.filter((r) => r.depth === d).length;
    for (const d of [1, 2, 3, 4]) expect(count(d), `${d}단계`).toBeGreaterThanOrEqual(1);
    expect(count(4)).toBeLessThanOrEqual(N / 3);
    expect(count(1) + count(2)).toBeGreaterThanOrEqual(N / 3);
    expect(Math.max(...[1, 2, 3, 4].map(count))).toBeLessThanOrEqual(N * 0.6);
    // 평가 위주로 쓴 기록 셋(픽스처 머리말)은 3단계 방법이 없고 2단계를 넘지 않는다
    for (const [subj, year] of [['음악', 1], ['운동과 건강', 2], ['중국어Ⅰ', 2]] as const) {
      const r = rec(subj, year);
      expect(r.depth, `${year}학년 ${subj}`).toBeLessThanOrEqual(2);
      expect(r.methods.filter((k) => lvOf(k) >= 3), `${year}학년 ${subj}`).toEqual([]);
    }
    // 그 가운데 약한 기록(faint)은 음악과 중국어Ⅰ 둘이다. 운동과 건강은 '운동 계획을 세워 실천함'이 해결안 제안으로 잡혀 깊이 2다
    expect(an.recs.filter((r) => r.faint).map((r) => `${r.year}학년 ${r.subj}`)).toEqual(['1학년 음악', '2학년 중국어Ⅰ']);
    expect(rec('운동과 건강', 2).faint).toBe(false);
    expect(rec('운동과 건강', 2).depth).toBe(2);
  });

  it("동음이의 함정 '압력'(또래의 동조 압력, 기체의 압력)은 이 낱말 하나로 기록을 잇지 않는다", () => {
    // 픽스처 설계: '압력'은 1학년 통합사회와 2학년 물리학Ⅰ에만 나온다
    const trap = an.recs.filter((r) => r.tf.has('압력'));
    expect(trap.map((r) => [r.year, r.subj])).toEqual([[1, '통합사회'], [2, '물리학Ⅰ']]);
    for (const l of an.links) {
      expect(l.words.length > 0 && l.words.every((w) => w === '압력'), `${l.from} → ${l.to}: ${l.words.join(', ')}`).toBe(false);
    }
    // 두 기록은 그 밖에 이어질 내용이 없으므로 어느 쪽으로도 연결이 없다
    const ids = new Set(trap.map((r) => r.id));
    expect(an.links.filter((l) => ids.has(l.from) && ids.has(l.to))).toEqual([]);
    expect(an.themes.some((t) => t.words.includes('압력'))).toBe(false);
  });
});
