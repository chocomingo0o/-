import { describe, expect, it } from 'vitest';
import type { MethodKey } from '../types';
import { METHODS, METHOD_KEYS } from '../dict/methods';
import { SKILL_KEYS } from '../dict/skills';
import { FIELDS, FIELD_KEYS } from '../dict/fields';
import {
  compileFields, compileMethods, compileSkills, escapeRegExp, fieldsOf, isMethodKey,
  masked, methodHits, methodMarks, skillHits, skillMarks,
} from './methods';

const M = compileMethods();

describe('compileMethods', () => {
  it('사전 17종을 사전 순서(수준 내림차순)로 컴파일하고 정규식은 모두 g 플래그', () => {
    expect(M.map((c) => c.def.key)).toEqual(METHOD_KEYS);
    for (const c of M) {
      expect(c.re.global).toBe(true);
      if (c.ex) expect(c.ex.global).toBe(true);
      expect(c.user).toBeNull();
    }
    expect(M.find((c) => c.def.key === 'experiment')?.ex).toBeInstanceOf(RegExp);
  });
  it('사용자 사전: 평문을 이스케이프하고 공백을 \\s*로 바꾼다. 알 수 없는 키와 빈 표현은 무시', () => {
    const dict = { experiment: ['디스크 확산법', '  ', ''], coding: ['C++ 코드 (유의)'], nope: ['x'] } as Record<string, string[]>;
    const MU = compileMethods(dict);
    const ex = MU.find((c) => c.def.key === 'experiment')!;
    expect(ex.user).toBeInstanceOf(RegExp);
    expect(ex.user!.global).toBe(true);
    expect(ex.user!.source).toContain('디스크\\s*확산법');
    const cd = MU.find((c) => c.def.key === 'coding')!;
    expect(cd.user!.source).toContain('C\\+\\+\\s*코드\\s*\\(유의\\)');
    expect(MU.filter((c) => c.user).length).toBe(2);
    expect(MU.find((c) => c.def.key === 'survey')!.user).toBeNull();
  });
  it('escapeRegExp, isMethodKey', () => {
    expect(new RegExp(escapeRegExp('a.b*c(d)')).test('a.b*c(d)')).toBe(true);
    expect(new RegExp(escapeRegExp('a.b')).test('axb')).toBe(false);
    expect(isMethodKey('experiment')).toBe(true);
    expect(isMethodKey('없는키')).toBe(false);
  });
});

describe('masked', () => {
  it('제외 표현 구간을 같은 길이의 공백으로 바꾼다(길이와 나머지 위치 유지)', () => {
    const ex = M.find((c) => c.def.key === 'experiment')!;
    const s = '동물 실험의 윤리 문제를 두고 토론함.';
    const t = masked(s, ex);
    expect(t.length).toBe(s.length);
    expect(t.startsWith('     ')).toBe(true);       // '동물 실험' 다섯 글자가 공백
    expect(t.slice(5)).toBe(s.slice(5));
  });
  it('제외 표현이 없는 방법은 원문 그대로', () => {
    const noEx = M.find((c) => !c.ex);
    if (noEx) expect(masked('아무 문장.', noEx)).toBe('아무 문장.');
    const ex = M.find((c) => c.def.key === 'experiment')!;
    expect(masked('전압을 측정함.', ex)).toBe('전압을 측정함.');
  });
});

describe('methodHits', () => {
  const cases: [string, MethodKey, boolean][] = [
    ['전극을 구리와 아연으로 바꾸어 전압을 측정함.', 'experiment', true],
    ['독립 변인을 온도로 정하고 기포 발생량을 3회 반복 측정함.', 'experiment', true],
    ['동물 실험의 윤리 문제를 두고 찬반 토론에 참여함.', 'experiment', false],
    ['동물 실험의 윤리 문제를 두고 찬반 토론에 참여함.', 'discussion', true],
    ['학급 학생 120명을 대상으로 구글 설문을 실시함.', 'survey', true],
    ['가상 인물 인터뷰 형식의 글을 씀.', 'survey', false],
    ['공공데이터포털의 통계 자료를 수집하여 그래프로 시각화함.', 'data', true],
    ['배터리 잔량 변화를 일차함수로 근사하는 모델을 세움.', 'modeling', true],
    ['파이썬으로 전염병 확산 시뮬레이션을 구현함.', 'coding', true],
    ['아두이노로 온도 경보 장치를 설계하고 시제품을 제작함.', 'making', true],
    ['수학적 귀납법으로 등식을 증명함.', 'proof', true],
    ['전자기 유도 현상을 설명함.', 'proof', false],
    ['관련 논문과 기사를 찾아 자료를 조사함.', 'literature', true],
    ['국립과천과학관을 견학하고 보고서를 작성함.', 'fieldtrip', true],
    ['『이기적 유전자』를 읽고 서평을 씀.', 'reading', true],
    ['두 이론의 장단점을 비교하고 비판적으로 평가함.', 'critique', true],
    ['학교 급식 잔반을 줄이는 해결 방안을 제안함.', 'proposal', true],
    ['개념을 정리하여 모둠에 설명함.', 'understanding', true],
    ['합창 대회에서 알토 파트를 맡아 노래함.', 'performance', true],
    ['탐구 결과를 소논문 형식의 보고서로 작성함.', 'writing', true],
    ['분석 역량이 뛰어남.', 'analysis', false],
  ];
  it('대표 문장을 맞춘다', () => {
    for (const [s, key, want] of cases) {
      const hits = methodHits(s, M);
      expect(hits.includes(key), `${s} → ${key}`).toBe(want);
    }
  });
  it('결과는 사전 순서(수준 내림차순)이고 겹치지 않는다', () => {
    const hits = methodHits('독립 변인을 정해 3회 반복 측정하고 결과를 그래프로 시각화하여 보고서를 작성함.', M);
    const idx = hits.map((k) => METHOD_KEYS.indexOf(k));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(new Set(hits).size).toBe(hits.length);
  });
  it('같은 문장을 되풀이 검사해도 결과가 같다(g 플래그 lastIndex 문제 없음)', () => {
    const s = '전압을 측정함. 전압을 다시 측정함.';
    const a = methodHits(s, M);
    const b = methodHits(s, M);
    const c = methodHits(s, M);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    for (const cm of M) {
      expect(cm.re.lastIndex).toBe(0);
      if (cm.ex) expect(cm.ex.lastIndex).toBe(0);
    }
  });
  it('사용자 사전 표현은 띄어쓰기가 달라도 맞고, 제외 규칙보다 우선한다', () => {
    // 기본 사전에는 없는 표현
    expect(methodHits('배지에 펴 바른 뒤 둠.', M)).toEqual([]);
    const MU = compileMethods({ experiment: ['배지에 펴 바른', '동물 실험'], coding: ['엔트리로 만든'] });
    expect(methodHits('배지에 펴 바른 뒤 둠.', MU)).toEqual(['experiment']);
    expect(methodHits('배지에펴바른 뒤 둠.', MU)).toEqual(['experiment']);
    expect(methodHits('배지에  펴  바른 뒤 둠.', MU)).toEqual(['experiment']);
    expect(methodHits('엔트리로   만든 게임을 발표함.', MU)).toContain('coding');
    // 기본 사전의 제외 규칙('동물 실험')보다 교사가 넣은 표현이 우선한다
    expect(methodHits('동물 실험의 윤리 문제를 두고 토론함.', M)).not.toContain('experiment');
    expect(methodHits('동물 실험의 윤리 문제를 두고 토론함.', MU)).toContain('experiment');
  });
});

describe('methodMarks', () => {
  it('원문 위치를 돌려주고 사용자 사전 매치는 user:true, 시작 위치 순', () => {
    const MU = compileMethods({ experiment: ['디스크 확산법'] });
    const text = '전압을 측정하고 설문을 실시함. 디스크 확산법을 본떠 비교함.';
    const marks = methodMarks(text, MU);
    for (const m of marks) {
      expect(m.b).toBeGreaterThan(m.a);
      expect(text.slice(m.a, m.b).length).toBe(m.b - m.a);
    }
    for (let i = 1; i < marks.length; i++) expect(marks[i].a).toBeGreaterThanOrEqual(marks[i - 1].a);
    const user = marks.filter((m) => m.user);
    expect(user).toHaveLength(1);
    expect(user[0].key).toBe('experiment');
    expect(text.slice(user[0].a, user[0].b)).toBe('디스크 확산법');
    expect(marks.some((m) => m.key === 'survey' && text.slice(m.a, m.b).includes('설문'))).toBe(true);
    expect(marks.some((m) => m.key === 'experiment' && !m.user && text.slice(m.a, m.b).includes('측정'))).toBe(true);
  });
  it('제외 구간은 표시하지 않고, 같은 방법 안에서 겹치는 구간은 하나만', () => {
    const marks = methodMarks('동물 실험의 윤리를 토론함.', M);
    expect(marks.some((m) => m.key === 'experiment')).toBe(false);
    const dup = methodMarks('실험 실험 실험', M).filter((m) => m.key === 'experiment');
    expect(dup).toHaveLength(3);
    const spans = dup.map((m) => `${m.a}-${m.b}`);
    expect(new Set(spans).size).toBe(3);
  });
  it('빈 본문은 빈 배열', () => {
    expect(methodMarks('', M)).toEqual([]);
  });
});

describe('skills', () => {
  const SK = compileSkills();
  it('8개를 사전 순서로 컴파일한다', () => {
    expect(SK.map((c) => c.def.key)).toEqual(SKILL_KEYS);
    for (const c of SK) expect(c.re.global).toBe(true);
  });
  it('대표 문장을 맞춘다', () => {
    expect(skillHits('독립 변인을 감자 즙의 온도, 종속 변인을 거품 높이로 정하고 통제 변인을 명시함.', SK)).toContain('design');
    expect(skillHits('평균을 표로 정리하고 꺾은선그래프로 나타냄.', SK)).toContain('transform');
    expect(skillHits('온도가 높아지면 활성이 증가할 것이라는 가설을 세워 확인함.', SK)).toContain('problem');
    expect(skillHits('궁금증을 탐구 질문으로 구체화함.', SK)).toContain('problem');
    expect(skillHits('의사소통 능력이 뛰어남.', SK)).not.toContain('communicate');
    expect(skillHits('', SK)).toEqual([]);
  });
  it('skillMarks는 원문 위치를 돌려주고 시작 위치 순', () => {
    const text = '가설을 세우고 독립 변인을 정함. 평균을 표로 정리함.';
    const marks = skillMarks(text, SK);
    expect(marks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < marks.length; i++) expect(marks[i].a).toBeGreaterThanOrEqual(marks[i - 1].a);
    expect(marks.some((m) => m.key === 'problem' && text.slice(m.a, m.b).startsWith('가설'))).toBe(true);
    expect(marks.some((m) => m.key === 'design')).toBe(true);
    expect(marks.some((m) => m.key === 'transform')).toBe(true);
  });
});

describe('fields', () => {
  const F = compileFields();
  it('분야마다 정규식 하나, 사전 순서, g 플래그', () => {
    expect(F.map((f) => f.k)).toEqual(FIELD_KEYS);
    for (const f of F) expect(f.re.global).toBe(true);
  });
  it('낱말 글자 사이의 공백을 허용한다', () => {
    const bio = F.find((f) => f.k === '생명과학·바이오')!;
    bio.re.lastIndex = 0;
    expect(bio.re.test('항생제 내성')).toBe(true);
    bio.re.lastIndex = 0;
  });
  it('서로 다른 낱말 2개 이상이면 분야로 인정한다', () => {
    const out = fieldsOf('항생제 내성균과 미생물을 배양함.', F);
    const bio = out.find((h) => h.k === '생명과학·바이오');
    expect(bio).toBeDefined();
    expect(bio!.u).toBeGreaterThanOrEqual(2);
    expect(bio!.words.map((w) => w.replace(/\s/g, ''))).toContain('미생물');
  });
  it('낱말 하나가 한두 번이면 인정하지 않고, 같은 낱말이라도 3회 이상이면 인정한다', () => {
    expect(fieldsOf('미생물을 관찰함.', F).find((h) => h.k === '생명과학·바이오')).toBeUndefined();
    expect(fieldsOf('미생물을 관찰함. 미생물을 다시 관찰함.', F).find((h) => h.k === '생명과학·바이오')).toBeUndefined();
    const three = fieldsOf('미생물을 관찰함. 미생물을 다시 관찰함. 미생물 배양.', F).find((h) => h.k === '생명과학·바이오');
    expect(three).toBeDefined();
    expect(three!.n).toBeGreaterThanOrEqual(3);
  });
  it('겹치는 구간은 더 긴 낱말만 센다(짧은 낱말이 다른 분야 낱말 안에 들어 있을 때)', () => {
    // 사전에서 다른 분야 낱말 안에 통째로 들어 있는 낱말 쌍을 찾는다(예: 의학 ⊂ 스포츠의학)
    let pair: [string, string, string, string] | null = null;
    outer: for (const a of FIELD_KEYS) for (const w1 of FIELDS[a]) for (const b of FIELD_KEYS) {
      if (a === b) continue;
      for (const w2 of FIELDS[b]) if (w2 !== w1 && w2.includes(w1)) { pair = [a, w1, b, w2]; break outer; }
    }
    expect(pair).not.toBeNull();
    const [shortField, , longField, longWord] = pair!;
    const out = fieldsOf(`${longWord}. ${longWord}. ${longWord}.`, F);
    const long = out.find((h) => h.k === longField);
    expect(long).toBeDefined();
    expect(long!.n).toBe(3);
    expect(long!.u).toBe(1);
    expect(out.find((h) => h.k === shortField)).toBeUndefined();
  });
  it('u 내림차순, n 내림차순으로 최대 3개', () => {
    const text = '항생제 내성균과 미생물을 배양함. 소독제와 알코올, 에탄올 농도를 비교함. 미적분과 확률 통계로 함수의 극한을 구함. 주식과 환율, 금리와 물가를 조사함. 민주주의와 헌법, 선거 제도.';
    const out = fieldsOf(text, F);
    expect(out.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < out.length; i++) {
      const p = out[i - 1], q = out[i];
      expect(p.u > q.u || (p.u === q.u && p.n >= q.n)).toBe(true);
    }
    for (const h of out) {
      expect(h.words.length).toBeLessThanOrEqual(6);
      expect(h.words.length).toBe(Math.min(6, h.u));
    }
  });
  it('빈 본문은 빈 배열', () => {
    expect(fieldsOf('', F)).toEqual([]);
  });
});

describe('사전 전체 건전성(엔진 기준)', () => {
  it('모든 방법 정규식이 빈 문자열에 맞지 않는다(무한 루프 방지)', () => {
    for (const c of M) {
      c.re.lastIndex = 0;
      expect(c.re.test('')).toBe(false);
      c.re.lastIndex = 0;
    }
    expect(METHODS.length).toBe(17);
  });
});
