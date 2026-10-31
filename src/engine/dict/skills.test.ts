import { describe, it, expect } from 'vitest';
import { SKILLS, SKILL, SKILL_KEYS } from './skills';
import type { SkillDef, SkillKey } from '../types';

const ORDER: SkillKey[] = ['problem', 'design', 'collect', 'transform', 'interpret', 'conclude', 'model', 'communicate'];
const COLORS: Record<SkillKey, string> = {
  problem: '#2a78d6', design: '#eb6834', collect: '#1baf7a', transform: '#eda100',
  interpret: '#e87ba4', conclude: '#008300', model: '#6250d6', communicate: '#e34948',
};
const LABELS: Record<SkillKey, [string, string]> = {
  problem: ['문제 인식·가설 설정', '문제'],
  design: ['변인 통제·탐구 설계', '설계'],
  collect: ['자료 수집·측정', '수집'],
  transform: ['자료 변환·시각화', '변환'],
  interpret: ['자료 해석·분석', '해석'],
  conclude: ['결론 도출·평가·일반화', '결론'],
  model: ['모형 구성·활용', '모형'],
  communicate: ['의사소통·논증', '소통'],
};

/** 엔진(compileSkills)과 같은 방식: exclude 구간을 같은 길이 공백으로 지운 뒤 terms를 적용한다. */
function compile(def: SkillDef) {
  const re = new RegExp('(?:' + def.terms.join('|') + ')', 'g');
  const ex = def.exclude && def.exclude.length ? new RegExp('(?:' + def.exclude.join('|') + ')', 'g') : null;
  return { def, re, ex };
}
const COMPILED = SKILLS.map(compile);
function hits(s: string): SkillKey[] {
  const out: SkillKey[] = [];
  for (const c of COMPILED) {
    const masked = c.ex ? s.replace(c.ex, (m) => ' '.repeat(m.length)) : s;
    c.re.lastIndex = 0;
    if (c.re.test(masked)) out.push(c.def.key);
  }
  return out;
}

describe('기능 8종 정의', () => {
  it('8개이고 순서가 맞음', () => {
    expect(SKILLS.map((s) => s.key)).toEqual(ORDER);
    expect(SKILL_KEYS).toEqual(ORDER);
  });
  it('SKILL 맵이 SKILLS와 같은 객체를 가리킴', () => {
    for (const s of SKILLS) expect(SKILL[s.key]).toBe(s);
    expect(Object.keys(SKILL).sort()).toEqual([...ORDER].sort());
  });
  it('이름·짧은 이름·색이 명세대로', () => {
    for (const s of SKILLS) {
      expect(s.label).toBe(LABELS[s.key][0]);
      expect(s.short).toBe(LABELS[s.key][1]);
      expect(s.color).toBe(COLORS[s.key]);
    }
  });
  it('설명은 한 줄이고 비어 있지 않음', () => {
    for (const s of SKILLS) {
      expect(s.desc.trim().length).toBeGreaterThan(8);
      expect(s.desc).not.toMatch(/\n/);
      expect(s.desc).not.toMatch(/—/);
    }
  });
});

describe('표현 목록 형식', () => {
  for (const s of SKILLS) {
    it(`${s.key}: 표현 30~60개`, () => {
      expect(s.terms.length).toBeGreaterThanOrEqual(30);
      expect(s.terms.length).toBeLessThanOrEqual(60);
    });
    it(`${s.key}: 제외 표현이 있음`, () => {
      expect(s.exclude && s.exclude.length).toBeGreaterThan(0);
    });
    it(`${s.key}: 빈 항목·중복 없음`, () => {
      const all = [...s.terms, ...(s.exclude ?? [])];
      expect(all.every((t) => t.trim().length > 0)).toBe(true);
      expect(new Set(s.terms).size).toBe(s.terms.length);
      expect(new Set(s.exclude ?? []).size).toBe((s.exclude ?? []).length);
    });
    it(`${s.key}: 항목마다 정규식으로 컴파일되고 합친 것도 컴파일됨`, () => {
      for (const t of [...s.terms, ...(s.exclude ?? [])]) expect(() => new RegExp(t), t).not.toThrow();
      expect(() => compile(s)).not.toThrow();
    });
    it(`${s.key}: 공백은 \\s* 로만 적음(평문 공백 없음)`, () => {
      for (const t of [...s.terms, ...(s.exclude ?? [])]) expect(t, t).not.toMatch(/ /);
    });
    it(`${s.key}: 캡처 그룹 없음(비캡처만 허용)`, () => {
      for (const t of [...s.terms, ...(s.exclude ?? [])]) expect(t.replace(/\(\?:/g, ''), t).not.toMatch(/\(/);
    });
    it(`${s.key}: 빈 문자열에 맞는 표현 없음`, () => {
      for (const t of s.terms) expect(new RegExp('^(?:' + t + ')$').test(''), t).toBe(false);
    });
  }
});

describe('대표 문장 매칭', () => {
  it('design: 변인 설정과 실험 설계', () => {
    const h = hits('독립 변인을 온도로 정하고 종속 변인을 기포 발생 수로 하여 실험을 설계함');
    expect(h).toContain('design');
  });
  it('collect + transform: 반복 측정과 평균·그래프', () => {
    const h = hits('3회 반복 측정한 값의 평균을 구해 그래프로 나타냄');
    expect(h).toContain('collect');
    expect(h).toContain('transform');
  });
  it('conclude: 예상과 다른 원인과 한계 제시', () => {
    const h = hits('측정값이 예상과 다른 원인을 온도계의 눈금 간격에서 찾아 한계로 제시함');
    expect(h).toContain('conclude');
  });
  it('problem: 궁금증에서 탐구 질문과 가설로', () => {
    expect(hits('식물이 왜 빛 쪽으로 굽는지 궁금증을 갖고 탐구 질문을 세움')).toContain('problem');
    expect(hits('온도가 높을수록 반응이 빨라질 것이라고 예상함')).toContain('problem');
    expect(hits('빛의 세기가 광합성량에 영향을 미칠 것이라는 가설을 설정함')).toContain('problem');
  });
  it('interpret: 경향과 상관관계, 원인 추론', () => {
    expect(hits('농도가 높아질수록 반응 시간이 짧아지는 경향을 확인함')).toContain('interpret');
    expect(hits('두 변수 사이의 상관관계를 분석함')).toContain('interpret');
    expect(hits('측정값이 튀는 원인을 추론함')).toContain('interpret');
  });
  it('model: 모식도와 모형 설명', () => {
    expect(hits('세포막의 구조를 모식도로 그려 설명함')).toContain('model');
    expect(hits('태양계 모형을 만들어 행성의 공전을 설명함')).toContain('model');
    expect(hits('전류의 흐름을 물의 흐름에 비유하여 설명함')).toContain('model');
    expect(hits('시뮬레이션으로 결과를 예측함')).toContain('model');
  });
  it('communicate: 근거를 들어 발표하고 질문에 답함', () => {
    expect(hits('실험 결과를 근거를 들어 발표하고 친구들의 질문에 답함')).toContain('communicate');
    expect(hits('동료 평가를 거쳐 보고서를 수정함')).toContain('communicate');
    expect(hits('찬반 토론에서 반론을 제기함')).toContain('communicate');
  });
  it('conclude: 결론 도출과 가설 검증, 일반화', () => {
    expect(hits('결과를 바탕으로 결론을 도출함')).toContain('conclude');
    expect(hits('가설이 지지됨을 확인함')).toContain('conclude');
    expect(hits('오차의 원인을 분석하고 재실험함')).toContain('conclude');
    expect(hits('다른 조건에서도 성립하는지 일반화 가능성을 검토함')).toContain('conclude');
  });
  it('transform: 표와 수치화', () => {
    expect(hits('결과를 표로 정리하고 증가율을 계산함')).toContain('transform');
    expect(hits('설문 응답을 수치화하여 막대 그래프로 나타냄')).toContain('transform');
  });
  it('collect: 관찰 기록과 센서, 자료 수집', () => {
    expect(hits('일주일 동안 관찰 일지를 작성함')).toContain('collect');
    expect(hits('아두이노 센서로 온도를 측정하여 기록함')).toContain('collect');
    expect(hits('기상청의 자료를 내려받아 데이터를 수집함')).toContain('collect');
  });
});

describe('오탐 제외', () => {
  it('롤 모델은 model이 아님', () => {
    expect(hits('진로 수업에서 과학자를 롤 모델로 삼음')).not.toContain('model');
    expect(hits('롤모델로 삼음')).not.toContain('model');
  });
  it('모의고사·모의 재판은 model이 아님', () => {
    expect(hits('모의고사 성적이 향상됨')).not.toContain('model');
    expect(hits('모의 재판 활동에 참여함')).not.toContain('model');
  });
  it('우표 수집·관찰력은 collect가 아님', () => {
    expect(hits('취미로 우표 수집을 함')).not.toContain('collect');
    expect(hits('관찰력이 뛰어난 학생임')).not.toContain('collect');
    expect(hits('성장하는 모습이 관찰됨')).not.toContain('collect');
  });
  it('소통 능력·발표 태도 같은 평가어는 communicate가 아님', () => {
    expect(hits('의사소통 능력이 뛰어남')).not.toContain('communicate');
    expect(hits('발표 태도가 바름')).not.toContain('communicate');
    expect(hits('선생님의 설명을 잘 듣고 이해함')).not.toContain('communicate');
  });
  it('목표로 정하다·성적표는 transform이 아님', () => {
    expect(hits('과학자를 목표로 정하고 노력함')).not.toContain('transform');
    expect(hits('성적표를 확인함')).not.toContain('transform');
    expect(hits('평균 내신이 올라감')).not.toContain('transform');
  });
  it('예상 문제·문제 풀이는 problem이 아님', () => {
    expect(hits('예상 문제를 만들어 친구들과 풀어 봄')).not.toContain('problem');
    expect(hits('수학 문제를 풀고 문제 풀이를 정리함')).not.toContain('problem');
  });
  it('진로 설계·학습 계획은 design이 아님', () => {
    expect(hits('자신의 진로 설계를 구체화함')).not.toContain('design');
    expect(hits('학습 계획을 세워 실천함')).not.toContain('design');
  });
  it('문학 작품 분석·판단력은 interpret·conclude가 아님', () => {
    expect(hits('소설을 분석하여 주제를 찾음')).not.toContain('interpret');
    expect(hits('분석력이 뛰어남')).not.toContain('interpret');
    expect(hits('자신의 한계를 극복하려는 의지가 강함')).not.toContain('conclude');
    expect(hits('판단력이 뛰어남')).not.toContain('conclude');
  });
  it('평범한 평가 문장에는 아무 기능도 잡히지 않음', () => {
    expect(hits('수업 시간에 성실하게 참여하고 과제를 제때 제출함')).toEqual([]);
    expect(hits('친구들과 사이좋게 지내며 배려심이 깊음')).toEqual([]);
  });
});
