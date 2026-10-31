import { describe, it, expect } from 'vitest';
import { METHODS, METHOD, METHOD_KEYS } from './methods';
import type { MethodDef, MethodKey } from '../types';

const EXPECTED: MethodKey[] = ['experiment', 'survey', 'data', 'modeling', 'coding', 'making', 'proof', 'literature', 'fieldtrip', 'reading', 'critique', 'proposal', 'analysis', 'understanding', 'performance', 'discussion', 'writing'];

/**
 * 테스트용 단순 매처(엔진의 methodHits와 같은 규칙): exclude 구간을 공백으로 지운 뒤 terms 정규식을 적용하고,
 * weak는 지운 문장에 cue나 terms가 맞을 때만 센다.
 */
function hits(s: string): MethodKey[] {
  const out: MethodKey[] = [];
  for (const m of METHODS) {
    let t = s;
    if (m.exclude?.length) t = t.replace(new RegExp(m.exclude.join('|'), 'g'), (x) => ' '.repeat(x.length));
    const strong = new RegExp(m.terms.join('|')).test(t);
    const weak = !!m.weak?.length && new RegExp(m.weak.join('|')).test(t) && (strong || (!!m.cue && new RegExp(m.cue).test(t)));
    if (strong || weak) out.push(m.key);
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
  it('모든 terms/exclude/weak/cue가 정규식으로 컴파일되고 빈 문자열에 매치되지 않는다', () => {
    for (const m of METHODS) {
      expect(m.terms.length).toBeGreaterThanOrEqual(30);
      for (const t of [...m.terms, ...(m.exclude || []), ...(m.weak || []), ...(m.cue ? [m.cue] : [])]) {
        expect(() => new RegExp(t)).not.toThrow();
        expect(new RegExp('^(?:' + t + ')$').test('')).toBe(false);
        expect(t).not.toMatch(/(^|[^\\])\((?!\?)/); // 캡처 그룹 금지
      }
      expect(() => new RegExp(m.terms.join('|'), 'g')).not.toThrow();
      if (m.weak) expect(() => new RegExp(m.weak!.join('|'), 'g')).not.toThrow();
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

/* ───────────────────────── 리뷰에서 찾은 오탐(맨 명사 항목) ───────────────────────── */
describe('맨 명사 항목이 설명·조사 문장을 3단계 방법으로 잡지 않는다', () => {
  it("'논설문'은 설문이 아니다(앞에 한글이 붙은 설문)", () => {
    expect(hits('환경 문제를 주제로 논설문을 작성하고 근거 자료를 조사함.')).not.toContain('survey');
    expect(hits('해설문을 읽고 요약함.')).not.toContain('survey');
    expect(hits('학급 친구들에게 설문을 실시함.')).toContain('survey');
    expect(hits('설문지를 만들어 배포함.')).toContain('survey');
  });
  it("'실험'은 수행 어미·목적어가 붙은 꼴만 실험이다", () => {
    expect(hits('실험 기록을 꼼꼼히 남기는 습관이 연구자에게 중요하다는 점을 소감문에 적음.')).not.toContain('experiment');
    expect(hits('1학년 때 수행했던 온도에 따른 카탈레이스 활성 실험의 결과를 다시 꺼내어 설명함.')).not.toContain('experiment');
    expect(hits('과일 전지의 전압에 영향을 주는 요인을 주제로 모둠 실험을 설계함.')).toContain('experiment');
    expect(hits('중화 적정 실험에 참여하여 지시약의 색 변화를 관찰함.')).toContain('experiment');
    expect(hits('온도를 달리하여 3회 반복 측정함.')).toContain('experiment');
  });
  it('직업 설명과 계획·바람의 배양·실험은 활동이 아니다', () => {
    expect(hits('미생물학 연구원을 조사하여 세균, 바이러스, 곰팡이를 배양하고 분석하는 일을 발표 자료로 정리함.')).not.toContain('experiment');
    expect(hits('2학년에는 미생물을 직접 배양하는 탐구를 해 보겠다는 계획을 세움.')).not.toContain('experiment');
    expect(hits('미생물 배양 실험을 더 배우고 싶다는 바람을 적음.')).not.toContain('experiment');
    expect(hits('손바닥을 면봉으로 닦아 영양 한천 배지에 펴 바른 뒤 세균을 배양함.')).toContain('experiment');
  });
  it('인터뷰를 듣거나 매체의 인터뷰를 분석한 것, 구술 자료를 읽은 것은 면담이 아니다', () => {
    expect(hits('과학자 인터뷰를 듣고 화자의 의견과 사실을 구분하는 활동을 수행함.')).not.toContain('survey');
    expect(hits('같은 소식을 전한 두 매체의 보도 분량과 인터뷰 대상이 다른 까닭을 분석함.')).not.toContain('survey');
    expect(hits('6·25 전쟁 피란민의 구술 자료를 읽고 교과서 서술과 비교함.')).not.toContain('survey');
    expect(hits('현직 연구원을 인터뷰하여 하루 일과를 정리함.')).toContain('survey');
    expect(hits('어르신을 찾아가 전쟁 경험담을 듣고 구술 채록을 남김.')).toContain('survey');
  });
  it("'연표로 정리', 함수 '그래프를 그려 설명', 개념 비교표는 데이터 분석이 아니다", () => {
    expect(hits('훈민정음 창제 과정을 조사해 집현전 학자들의 역할을 연표로 정리함.')).not.toContain('data');
    expect(hits('판별식의 부호에 따라 교점 개수가 달라지는 이유를 그래프를 그려 설명하는 발표를 맡음.')).not.toContain('data');
    expect(hits('두 학과의 교육과정을 비교하여 공통 과목과 차이를 표로 정리함.')).not.toContain('data');
    expect(hits('각 조건을 3회 반복 측정하여 평균을 표로 정리함.')).toContain('data');
    expect(hits('체력 측정 결과를 그래프로 그려 약한 요소를 찾음.')).toContain('data');
  });
  it("과산화수소·카탈레이스·pH는 다루는 동작이 붙어야 실험이고, '예를 직접 만들어 제시'와 '학급 전시회'는 제작·탐방이 아니다", () => {
    expect(hits('과산화수소 분해 반응의 산화수 변화를 따져 산소 원자가 산화와 환원을 동시에 겪는 반응임을 설명함.')).not.toContain('experiment');
    expect(hits('온도와 pH가 모두 효소 단백질의 구조에 영향을 준다는 점으로 일반화함.')).not.toContain('experiment');
    expect(hits('생간 조각을 과산화수소수에 넣어 기포 발생을 관찰함.')).toContain('experiment');
    expect(hits('행렬의 곱셈이 교환법칙을 만족하지 않는 예를 직접 만들어 제시함.')).not.toContain('making');
    expect(hits('학급 전시회에서 친구들의 작품에 짧은 감상평을 남기는 활동에 참여함.')).not.toContain('fieldtrip');
    expect(hits('과학관을 방문하여 전시를 관람함.')).toContain('fieldtrip');
  });
});

/* ───────────────────────── 실험·측정: 명사만으로 된 표현은 수행 동사가 있어야 센다 ───────────────────────── */
describe('실험·측정의 조건부 표현(weak)과 수행 단서(cue)', () => {
  const ex = METHOD.experiment;
  const strongRx = new RegExp(ex.terms.join('|'));
  const weakRx = new RegExp((ex.weak ?? []).join('|'));
  const cueRx = new RegExp(ex.cue ?? '(?!)');
  const isExp = (s: string): boolean => hits(s).includes('experiment');

  it('실험·측정만 조건부 표현과 수행 단서를 쓴다', () => {
    expect(ex.weak?.length).toBeGreaterThanOrEqual(60);
    expect(ex.cue).toBeTruthy();
    for (const m of METHODS) if (m.key !== 'experiment') expect(m.weak ?? []).toEqual([]);
  });
  it('기구, 시약, 생물, 기법, 현상 이름은 조건 없는 표현(terms)이 아니라 조건부 표현(weak)이다', () => {
    const nouns = [
      '센서', '데이터 로거', '현미경', '프레파라트', '거름종이', '비커', '피펫', '스포이트', '메스실린더', '전자 저울', '온도계', '스톱워치',
      '원심 분리', '시료', '시약', '지시약', '리트머스', 'BTB', '페놀프탈레인', '크로마토그래피', '전기영동', 'PCR', '검정말', '초파리',
      '대조군', '실험군', '굴절률', '진자의 주기', '분광기', '용존 산소', 'BOD', 'COD', '탁도', '억제대', '디스크 확산', '멸균', '천체 관측',
      '중화 적정', '불꽃 반응', '기포 발생', '감자 즙', '독립 변인', '변인 통제', '실험 결과', '실험으로', '실험에서', '측정값', '관찰 결과',
    ];
    for (const w of nouns) {
      expect(strongRx.test(w), w).toBe(false);
      expect(weakRx.test(w), w).toBe(true);
    }
  });
  it('수행 단서에는 문헌으로 배운 내용에도 쓰는 동사가 없다', () => {
    for (const v of ['탐구함', '탐구하여', '이해함', '조사함', '비교함', '설명함', '정리함', '확인함', '분석함', '학습함', '알아봄', '수행평가에서']) {
      expect(cueRx.test(v), v).toBe(false);
    }
    for (const v of [
      '탐구를 수행함', '실험을 진행하였다', '관찰 활동에 참여함', '직접 확인함', '자로 재어', '온도를 30초마다 기록함', '측정값을 표에 기록함',
      '관찰 일지로 기록함', '시험관에 넣어', '떨어뜨린 뒤', '가열하여', '적신', '중화 적정을 실시함', '적정을 수행함',
      '해부 실습에서', '관측 캠프에서', '결과를 얻음', '얻은 측정값',
    ]) {
      expect(cueRx.test(v), v).toBe(true);
    }
  });
  it('시료를 다루는 동작은 -며, -면서로 이어져도 수행 단서다', () => {
    for (const v of ['넣으며', '넣으면서', '섞으며', '섞으면서', '떨어뜨리며', '떨어뜨리면서']) expect(cueRx.test(v), v).toBe(true);
    expect(isExp('페놀프탈레인 용액을 떨어뜨린 수산화 나트륨 수용액에 염산을 조금씩 넣으며 색이 사라지는 지점을 찾아 중화 적정을 수행함.')).toBe(true);
    expect(isExp('뷰렛으로 수산화 나트륨 수용액을 한 방울씩 떨어뜨리며 중화 적정을 수행함.')).toBe(true);
    expect(isExp('식초에 BTB 용액을 넣으며 색 변화를 비교함.')).toBe(true);
  });
  it('학습이나 발표에도 쓰는 동사(기록, 넣다, 섞다, 거르다, 여과, 가열, 직접 확인)는 실험 맥락일 때만 수행 단서다', () => {
    for (const v of [
      '학습지에 기록함', '탐구 노트에 기록함', '발표 자료에 넣어', '그림을 넣어', '그림을 그려 넣어', '비유를 섞어',
      '가짜 뉴스를 걸러 내는', '침전물을 여과하는 원리', '원 논문에서 직접 확인함', '결과를 정리하여 학습지에 기록함',
    ]) {
      expect(cueRx.test(v), v).toBe(false);
    }
    // 시료를 다루는 동작이라도 '…하는 원리'를 꾸미는 절 안에 있으면 과정을 설명한 말이다
    expect(cueRx.test('혼합물을 가열하여 끓는점 차이로 성분을 분리하는 원리를 정리함')).toBe(false);
    expect(cueRx.test('거름종이로 걸러 낸 여과액')).toBe(true);
    const concept = [
      'PCR의 변성, 결합, 신장 단계를 그림으로 그려 학습지에 기록함.',
      '전기영동에서 DNA가 음전하를 띠어 양극 쪽으로 이동하는 원리를 그림으로 정리해 발표 자료에 넣어 설명함.',
      '현미경의 배율과 해상력의 차이를 정리하고 광학 현미경과 전자 현미경의 쓰임새를 비교해 탐구 노트에 기록함.',
      '인터넷에 떠도는 PCR 검사 관련 가짜 뉴스를 걸러 내는 방법을 친구들에게 안내함.',
      '증류 장치에서 혼합물을 가열하여 끓는점 차이로 성분을 분리하는 원리를 정리함.',
      '정수장에서 침전물을 여과하는 원리를 조사하여 발표함.',
      'PCR의 원리를 친구들이 이해하기 쉽게 비유를 섞어 설명함.',
      '교과서에 실린 멘델의 교배 실험 결과를 원 논문에서 직접 확인함.',
      '페놀프탈레인이 염기성 용액에서 붉게 변하는 까닭을 분자 구조 변화로 설명하고 공책에 기록함.',
      '현미경의 발달 과정을 조사하여 탐구 노트에 기록함.',
      '러더퍼드의 알파 입자 산란 실험으로 원자핵의 존재가 밝혀진 과정을 정리하여 탐구 노트에 기록함.',
      '러더퍼드의 알파 입자 산란 실험 결과를 정리하여 학습지에 기록함.',
      'PCR이 DNA를 증폭하는 원리를 그림을 넣어 단계별로 정리함.',
      '대조군을 두어야 하는 이유를 실험 설계의 원칙과 관련지어 정리하고 탐구 노트에 기록함.',
    ];
    for (const s of concept) expect(isExp(s), s).toBe(false);
    // 같은 동사가 시료나 잰 값과 함께 오면 그대로 센다
    expect(isExp('시금치 잎을 갈아 거름종이로 걸러 낸 즙을 비커에 모음.')).toBe(true);
    expect(isExp('비커에 담은 물을 알코올램프로 가열하며 온도계 눈금을 1분마다 기록함.')).toBe(true);
    expect(isExp('플라나리아를 잘라 재생 과정을 2주 동안 관찰 일지로 기록함.')).toBe(true);
    expect(isExp('스마트폰 가속도 센서 앱으로 엘리베이터가 움직일 때의 가속도를 기록하고 그래프로 분석함.')).toBe(true);
  });
  it("지난 활동을 떠올리는 꼴('수행했던', '수행하였던')은 수행 단서가 아니다", () => {
    for (const v of ['탐구를 수행했던', '탐구를 수행하였던', '실습에 참여했던', '실습에 참여하였던', '관찰을 진행하였던']) {
      expect(cueRx.test(v), v).toBe(false);
    }
    expect(cueRx.test('탐구를 수행하였다')).toBe(true);
    expect(isExp('1학년 때 탐구를 수행했던 경험을 떠올려 현미경의 구조와 배율을 정리함.')).toBe(false);
    expect(isExp('1학년 때 탐구를 수행하였던 경험을 떠올려 현미경의 구조와 배율을 정리함.')).toBe(false);
  });
  it("실습, 관측 캠프 안에서 한 일과 직접 얻은 결과는 수행 단서로 센다", () => {
    expect(isExp('돼지 심장 해부실습에서 심방과 심실, 판막의 구조를 확인함.')).toBe(true);
    expect(isExp('천체 관측 캠프에서 망원경으로 목성의 위성 네 개를 찾아 위치를 스케치함.')).toBe(true);
    expect(isExp('반복 실험을 통해 얻은 측정값의 평균을 구하여 오차를 줄임.')).toBe(true);
    expect(isExp('알코올형 세정제의 억제대가 가장 넓고 대조군에는 억제대가 생기지 않은 결과를 얻음.')).toBe(true);
    // 문헌에서 자료나 측정값을 얻는 것, 과학자의 이야기에 흔한 '결과를 얻었다'는 수행 단서가 아니다
    expect(isExp('공공 데이터 포털에서 수질 측정 자료를 얻어 지역별로 비교함.')).toBe(false);
    expect(isExp('기상청 누리집에서 얻은 측정값으로 우리 지역의 기온 변화를 그래프로 나타냄.')).toBe(false);
    expect(isExp('멘델은 완두 교배 실험으로 3 : 1의 분리비라는 결과를 얻었다는 내용을 정리함.')).toBe(false);
  });
  it('남이 한 실험이나 개념을 배운 문장은 실험·측정이 아니다', () => {
    expect(isExp('페놀프탈레인 용액이 염기성 용액에서 붉은색을 띠는 원리를 지시약의 구조 변화와 관련지어 정리함.')).toBe(false);
    expect(isExp('광학 현미경과 전자 현미경의 분해능 차이를 비교하여 발표함.')).toBe(false);
    expect(isExp('초파리가 유전 연구에 널리 쓰이는 까닭을 세대 시간이 짧다는 점과 관련지어 조사함.')).toBe(false);
    expect(isExp('크로마토그래피로 혼합물을 분리하는 원리를 성분의 이동 속도 차이로 설명함.')).toBe(false);
    expect(isExp('러더퍼드의 알파 입자 산란 실험으로 원자핵의 존재가 밝혀진 과정을 정리함.')).toBe(false);
    expect(isExp('밀러의 실험에서 원시 대기 조건으로 아미노산이 만들어진 결과를 근거로 화학 진화설을 설명함.')).toBe(false);
    expect(isExp('PCR이 DNA를 증폭하는 원리를 온도 변화 단계별로 정리함.')).toBe(false);
  });
  it("조건이나 당위로 말하는 변인 조작('농도를 높이면', '대조군을 두어야')은 실험·측정이 아니다", () => {
    expect(isExp('반응물의 농도를 높이면 충돌 횟수가 늘어 반응 속도가 빨라지는 까닭을 설명함.')).toBe(false);
    expect(isExp('대조군을 두어야 하는 이유를 실험 설계의 원칙과 관련지어 정리함.')).toBe(false);
    expect(isExp('변인을 통제해야 하는 까닭을 공정한 비교와 관련지어 설명함.')).toBe(false);
    expect(isExp('온도를 달리하여 3회 반복 측정함.')).toBe(true);
    expect(isExp('증류수 디스크를 대조군으로 두고 억제대의 지름을 비교함.')).toBe(true);
    expect(isExp('온도를 달리할 때 효소의 활성이 어떻게 변하는지 그래프를 읽고 설명함.')).toBe(false);
  });
  it("조건을 바꾸어 가며 실험한 꼴('달리하면서', '달리할 때마다')은 조건문이 아니다", () => {
    for (const w of ['농도를 달리하면서', '온도를 바꾸면서', '빛의 세기를 달리하면서', '농도를 조절하면서', '농도를 달리할 때마다']) {
      expect(strongRx.test(w), w).toBe(true);
    }
    expect(isExp('설탕 용액의 농도를 달리하면서 효모가 내는 기포의 양을 비교함.')).toBe(true);
    expect(isExp('빛의 세기를 달리하면서 검정말 잎의 색 변화를 비교함.')).toBe(true);
    expect(isExp('물의 온도를 바꾸면서 같은 양의 물에 녹는 설탕의 양을 비교함.')).toBe(true);
    expect(isExp('감자 즙의 농도를 조절하면서 거품 높이를 비교함.')).toBe(true);
    expect(isExp('농도를 달리할 때마다 용액의 색 변화를 비교함.')).toBe(true);
    // '-하며'와 '-하면서'는 같은 판정이다
    expect(isExp('설탕 용액의 농도를 달리하며 효모가 내는 기포의 양을 비교함.')).toBe(true);
  });
  it("방향만 말하는 '온도를 낮추어', '농도를 높여'는 조건부 표현이다(기술의 과정을 설명할 때도 쓴다)", () => {
    for (const w of ['온도를 낮추어', '온도를 높이고', '농도를 높이며', '농도를 낮추어']) {
      expect(strongRx.test(w), w).toBe(false);
      expect(weakRx.test(w), w).toBe(true);
    }
    // 조작을 뜻하는 '달리하다', '조절하다'는 그대로 조건 없는 표현이다
    for (const w of ['온도를 달리하여', '온도를 조절하며', '농도를 달리한']) expect(strongRx.test(w), w).toBe(true);
    expect(isExp(
      'PCR이 DNA 이중 가닥을 높은 온도에서 분리하고 온도를 낮추어 프라이머를 붙인 뒤 다시 온도를 조금 높여 열에 강한 DNA 중합 효소로 새 가닥을 합성하는 과정을 되풀이해 원하는 DNA 부위를 증폭하는 기술임을 단계별 그림으로 정리하여 동아리원에게 설명함.',
    )).toBe(false);
    // 같은 문장에 재거나 다루는 동작이 있으면 그대로 실험·측정이다
    expect(isExp('물의 온도를 낮추어 가며 같은 양의 물에 녹는 기체의 양을 비교하고 결과를 표에 기록함.')).toBe(true);
    expect(isExp('설탕 용액의 농도를 높여 가며 감자 조각을 넣어 질량 변화를 비교함.')).toBe(true);
  });
  it('학교 실험에 흔한 기법 이름(아이오딘 시계 반응, 형질 전환, 매니큐어 떼어 내기)도 조건부 표현이다', () => {
    for (const w of ['아이오딘 시계 반응', '요오드 시계 반응', '형질 전환', '형질전환', '매니큐어']) {
      expect(strongRx.test(w), w).toBe(false);
      expect(weakRx.test(w), w).toBe(true);
    }
    // 수행 동사가 있으면 센다(교사가 정한 기준)
    expect(isExp('반응 속도 단원에서 온도에 따른 반응 속도 변화를 아이오딘 시계 반응으로 확인하는 탐구를 수행함.')).toBe(true);
    expect(isExp('녹색 형광 단백질 유전자를 대장균에 넣는 형질 전환을 주제로 탐구를 진행함.')).toBe(true);
    expect(isExp('식물 잎의 기공 분포를 매니큐어 떼어 내기 방법으로 비교하는 탐구를 수행함.')).toBe(true);
    // 배운 내용만 적었으면 세지 않는다
    expect(isExp('그리피스의 폐렴 쌍구균 실험에서 열로 죽인 S형 균의 어떤 물질이 R형 균을 형질 전환시킨다는 사실이 밝혀진 과정을 정리함.')).toBe(false);
    expect(isExp('아이오딘 시계 반응에서 용액의 색이 갑자기 짙은 남색으로 바뀌는 까닭을 반응 단계로 설명함.')).toBe(false);
  });
  it('같은 문장에 수행 동사가 있으면 기구, 시약, 생물 이름도 실험·측정이다', () => {
    expect(isExp('검정말을 넣은 시험관을 전등에서 10 cm, 20 cm, 30 cm 떨어진 곳에 두고 1분 동안 발생하는 기포 수를 세어 기록함.')).toBe(true);
    expect(isExp('거름종이에 수성 사인펜 잉크를 찍고 끝을 물에 담가 색소가 퍼진 거리를 자로 재어 비교함.')).toBe(true);
    expect(isExp('페놀프탈레인 용액을 떨어뜨린 뒤 수산화 나트륨 수용액을 조금씩 넣어 색이 변하는 지점을 기록함.')).toBe(true);
    expect(isExp('데이터 로거와 온도 센서를 연결하여 물이 식는 동안의 온도를 30초마다 기록함.')).toBe(true);
  });
  it('문헌으로 했을 수도 있지만 수행 동사가 있으면 실험·측정으로 센다(교사가 정한 기준)', () => {
    expect(isExp('아가로스 젤 전기영동으로 DNA 조각을 크기별로 분리하는 탐구를 수행함.')).toBe(true);
    expect(isExp('아가로스 젤 전기영동으로 DNA 조각을 크기별로 분리하는 원리를 탐구함.')).toBe(false);
  });
  it('수행 단서만 있고 실험 표현이 없으면 실험·측정이 아니다', () => {
    expect(isExp('토론 결과를 학급 게시판에 기록함.')).toBe(false);
    expect(isExp('모둠 발표 탐구를 수행함.')).toBe(false);
  });
  it('수행 동사가 제외 구간(바람, 계획) 안에 있으면 조건부 표현을 살리지 못한다', () => {
    expect(isExp('다음 학기에는 BTB 용액의 색 변화를 직접 확인해 보고 싶다고 밝힘.')).toBe(false);
    expect(isExp('다음 실험에서는 거름종이 대신 실리카 판을 써서 직접 측정해 보고 싶다고 적음.')).toBe(false);
    expect(isExp('2학기에는 현미경으로 세포 분열 과정을 직접 관찰해 보겠다는 계획을 세움.')).toBe(false);
    // 제외 구간이 한쪽을 지워도 다른 자리의 수행 동사는 그대로 센다
    expect(isExp('연구원이 하는 실험을 소개한 영상을 보고, 같은 방법으로 감자 즙의 카탈레이스 반응을 직접 확인함.')).toBe(true);
  });
});

describe("실험·측정: '혈당 측정 방식'처럼 측정이 뒤 명사를 꾸미는 합성 명사는 학생이 잰 것이 아니다", () => {
  const isExp = (s: string) => hits(s).includes('experiment');
  it('측정 방식, 측정 방법, 측정기를 설명하거나 조사한 문장은 실험·측정이 아니다', () => {
    expect(isExp('널리 쓰이는 혈당 측정 방식이 혈액 채취를 필요로 한다는 한계를 짚고 대안을 고안함.')).toBe(false);
    expect(isExp('광합성 속도 측정 방법을 조사하여 장단점을 표로 정리함.')).toBe(false);
    expect(isExp('효소 활성 측정 키트가 색 변화로 활성을 나타내는 원리를 발표함.')).toBe(false);
    expect(isExp('연속 혈당 측정기의 작동 원리를 조사하여 소개함.')).toBe(false);
  });
  it('직접 재거나 센 문장, 기구를 쓰며 수행 동사가 있는 문장은 그대로 센다', () => {
    expect(isExp('식사 전후의 혈당을 측정하여 변화를 비교함.')).toBe(true);
    expect(isExp('운동 전후 맥박 수를 세어 회복 시간을 비교함.')).toBe(true);
    expect(isExp('귀 체온계로 체온을 재어 하루 동안의 변화를 기록함.')).toBe(true);
    expect(isExp('운동 강도별로 혈압 측정을 진행하고 결과를 그래프로 나타냄.')).toBe(true);
    expect(isExp('광합성 속도 측정 실험을 수행하여 빛의 세기에 따른 차이를 비교함.')).toBe(true);
  });
});

/* ───────────────────────── 개념 분석·해석: 맨몸 '탐구'는 세지 않는다 ───────────────────────── */
describe("개념 분석·해석에서 맨몸 '탐구'를 뺐다", () => {
  const isAna = (s: string): boolean => hits(s).includes('analysis');
  it("'탐구'라는 낱말만으로는 개념 분석·해석이 아니다", () => {
    expect(METHOD.analysis.terms.some((t) => t.startsWith('탐구'))).toBe(false);
    expect(isAna('동아리 연간 탐구 주제로 식물의 굴광성을 정하고 역할을 나눔.')).toBe(false);
    expect(isAna('주제 탐구 활동에서 관심 있는 신소재를 골라 발표함.')).toBe(false);
    expect(isAna('선배에게 어떤 탐구를 해 두면 좋은지 질문함.')).toBe(false);
  });
  it('무엇을 따졌는지 드러나는 탐구는 그대로 개념 분석·해석이다', () => {
    expect(isAna('식물이 빛 쪽으로 굽는 원리를 탐구함.')).toBe(true);
    expect(isAna('겨울철 정전기가 자주 생기는 원인을 탐구함.')).toBe(true);
    expect(isAna('계절마다 낮의 길이가 왜 다른지 탐구함.')).toBe(true);
  });
});
