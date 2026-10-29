import { describe, it, expect } from 'vitest';
import { METHODS, METHOD, METHOD_KEYS } from './methods';
import type { MethodDef, MethodKey } from '../types';

const EXPECTED: MethodKey[] = ['experiment', 'survey', 'data', 'modeling', 'coding', 'making', 'proof', 'literature', 'fieldtrip', 'reading', 'critique', 'proposal', 'analysis', 'understanding', 'performance', 'discussion', 'writing'];

/** 테스트용 단순 매처: exclude 구간을 공백으로 지운 뒤 terms 정규식 적용 */
function hits(s: string): MethodKey[] {
  const out: MethodKey[] = [];
  for (const m of METHODS) {
    let t = s;
    if (m.exclude?.length) t = t.replace(new RegExp(m.exclude.join('|'), 'g'), (x) => ' '.repeat(x.length));
    if (new RegExp(m.terms.join('|')).test(t)) out.push(m.key);
  }
  return out;
}

describe('탐구 방법 사전', () => {
  it('17개가 정해진 순서로 있고 키가 겹치지 않는다', () => {
    expect(METHOD_KEYS).toEqual(EXPECTED);
    expect(new Set(METHOD_KEYS).size).toBe(17);
    expect(Object.keys(METHOD)).toHaveLength(17);
  });
  it('수준이 내림차순이고 라벨·짧은 이름·설명이 있다', () => {
    let prev = 3;
    for (const m of METHODS) {
      expect(m.lv <= prev).toBe(true);
      prev = m.lv;
      expect(m.label.length).toBeGreaterThan(1);
      expect(m.short.length).toBeGreaterThan(0);
      expect(m.desc.length).toBeGreaterThan(5);
      expect(m.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    expect(METHODS.filter((m) => m.lv === 3)).toHaveLength(6);
    expect(METHODS.filter((m) => m.lv === 2)).toHaveLength(7);
    expect(METHODS.filter((m) => m.lv === 1)).toHaveLength(4);
  });
  it('모든 terms/exclude가 정규식으로 컴파일되고 빈 문자열에 매치되지 않는다', () => {
    for (const m of METHODS) {
      expect(m.terms.length).toBeGreaterThanOrEqual(30);
      for (const t of [...m.terms, ...(m.exclude || [])]) {
        expect(() => new RegExp(t)).not.toThrow();
        expect(new RegExp('^(?:' + t + ')$').test('')).toBe(false);
        expect(t).not.toMatch(/(^|[^\\])\((?!\?)/); // 캡처 그룹 금지
      }
      expect(() => new RegExp(m.terms.join('|'), 'g')).not.toThrow();
    }
  });
  it('대표 문장을 맞춘다', () => {
    expect(hits('전극을 구리와 아연으로 바꾸어 전압을 측정함.')).toContain('experiment');
    expect(hits('독립 변인을 온도로 정하고 기포 발생량을 3회 반복 측정함.')).toContain('experiment');
    expect(hits('동물 실험의 윤리 문제를 두고 찬반 토론에 참여함.')).not.toContain('experiment');
    expect(hits('동물 실험의 윤리 문제를 두고 찬반 토론에 참여함.')).toContain('discussion');
    expect(hits('공공데이터포털의 통계 자료를 수집하여 그래프로 시각화함.')).toContain('data');
    expect(hits('파이썬으로 전염병 확산 시뮬레이션을 구현함.')).toContain('coding');
    expect(hits('학급 학생 120명을 대상으로 구글 설문을 실시함.')).toContain('survey');
    expect(hits('가상 인물 인터뷰 형식의 글을 씀.')).not.toContain('survey');
    expect(hits('배터리 잔량 변화를 일차함수로 근사하는 모델을 세움.')).toContain('modeling');
    expect(hits('아두이노로 온도 경보 장치를 설계하고 시제품을 제작함.')).toContain('making');
    expect(hits('수학적 귀납법으로 등식을 증명함.')).toContain('proof');
    expect(hits('전자기 유도 현상을 설명함.')).not.toContain('proof');
    expect(hits('관련 논문과 기사를 찾아 자료를 조사함.')).toContain('literature');
    expect(hits('국립과천과학관을 견학하고 보고서를 작성함.')).toContain('fieldtrip');
    expect(hits('『이기적 유전자』를 읽고 서평을 씀.')).toContain('reading');
    expect(hits('두 이론의 장단점을 비교하고 비판적으로 평가함.')).toContain('critique');
    expect(hits('학교 급식 잔반을 줄이는 해결 방안을 제안함.')).toContain('proposal');
    expect(hits('개념을 정리하여 모둠에 설명함.')).toContain('understanding');
    expect(hits('합창 대회에서 알토 파트를 맡아 노래함.')).toContain('performance');
    expect(hits('모의재판에서 검사 역할을 맡아 논증함.')).toContain('discussion');
    expect(hits('탐구 결과를 소논문 형식의 보고서로 작성함.')).toContain('writing');
  });
  it('평가어는 개념 분석·해석으로 잡히지 않는다', () => {
    expect(hits('분석 역량이 뛰어남.')).not.toContain('analysis');
    expect(hits('탐구 능력이 돋보임.')).not.toContain('analysis');
  });
  it('MethodDef 형식', () => {
    const m: MethodDef = METHOD.experiment;
    expect(m.key).toBe('experiment');
    expect(m.lv).toBe(3);
  });
});
