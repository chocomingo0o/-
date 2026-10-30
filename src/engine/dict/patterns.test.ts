import { describe, it, expect } from 'vitest';
import {
  REFLECT_TERMS, CONNECT_TERMS, FOLLOW_TERMS, INQ_TERMS, EVAL_WORDS,
  EVAL_SENT, EVAL_TAIL, ACTION_VERBS, LEAD_ADVERBS, rx,
  REFLECT_RX, CONNECT_RX, FOLLOW_RX, INQ_RX, EVAL_RX,
} from './patterns';

const LISTS: Array<[string, string[], number]> = [
  ['REFLECT_TERMS', REFLECT_TERMS, 50],
  ['CONNECT_TERMS', CONNECT_TERMS, 20],
  ['FOLLOW_TERMS', FOLLOW_TERMS, 40],
  ['INQ_TERMS', INQ_TERMS, 30],
  ['EVAL_WORDS', EVAL_WORDS, 80],
];

describe('단서 목록 크기와 형식', () => {
  for (const [name, list, min] of LISTS) {
    it(`${name}: ${min}개 이상`, () => {
      expect(list.length).toBeGreaterThanOrEqual(min);
    });
    it(`${name}: 빈 항목·중복 없음`, () => {
      expect(list.every((t) => t.trim().length > 0)).toBe(true);
      expect(new Set(list).size).toBe(list.length);
    });
    it(`${name}: 항목마다 정규식으로 컴파일됨`, () => {
      for (const t of list) expect(() => new RegExp(t)).not.toThrow();
    });
    it(`${name}: 공백은 \\s* 로만 적음(평문 공백 없음)`, () => {
      for (const t of list) expect(t, t).not.toMatch(/ /);
    });
    it(`${name}: 캡처 그룹 없음(비캡처만 허용)`, () => {
      for (const t of list) expect(t.replace(/\(\?:/g, ''), t).not.toMatch(/\(/);
    });
  }
});

describe('필수 단서 포함', () => {
  it('REFLECT_TERMS 핵심 단서', () => {
    for (const w of ['한계', '오차', '개선', '보완', '수정하', '재실험', '일반화', '재검증', '시행착오', '오개념']) {
      expect(REFLECT_TERMS).toContain(w);
    }
    expect(REFLECT_RX.test('다시 측정하여 오차를 줄였다')).toBe(true);
    expect(REFLECT_RX.test('가설을 수정하고 재실험함')).toBe(true);
    expect(REFLECT_RX.test('예상과 다른 결과가 나와 원인을 분석함')).toBe(true);
    expect(REFLECT_RX.test('변인을 추가하여 타당성을 검토함')).toBe(true);
    expect(REFLECT_RX.test('놓친 점을 찾아 신뢰도를 높임')).toBe(true);
    expect(REFLECT_RX.test('전압을 측정하여 그래프로 나타냄')).toBe(false);
    expect(REFLECT_RX.test('모둠 발표를 성실하게 준비함')).toBe(false);
  });

  it('CONNECT_TERMS 핵심 단서', () => {
    for (const w of ['앞서', '이전에', '이어서', '후속', '심화', '확장', '연계하', '발전시', '작년']) {
      expect(CONNECT_TERMS).toContain(w);
    }
    expect(CONNECT_RX.test('1학년 때 탐구한 내용을 바탕으로')).toBe(true);
    expect(CONNECT_RX.test('2학년에 배운 개념을 떠올려')).toBe(true);
    expect(CONNECT_RX.test('지난 학기 실험을 이어서 진행함')).toBe(true);
    expect(CONNECT_RX.test('지난학기에 다룬 주제를 다시 떠올려')).toBe(true);
    expect(CONNECT_RX.test('작년 동아리에서 다룬 주제를 확장함')).toBe(true);
    expect(CONNECT_RX.test('용액의 농도를 바꾸어 측정함')).toBe(false);
  });

  it('FOLLOW_TERMS 핵심 단서', () => {
    for (const w of ['더\\s*나아가', '궁금해져', '이를\\s*바탕으로', '심화\\s*탐구', '후속\\s*활동', '적용해\\s*보']) {
      expect(FOLLOW_TERMS).toContain(w);
    }
    expect(FOLLOW_RX.test('추가로 탐구하여')).toBe(true);
    expect(FOLLOW_RX.test('이에 그치지 않고 관련 논문을 찾아 읽음')).toBe(true);
    expect(FOLLOW_RX.test('의문이 생겨 직접 실험함')).toBe(true);
    expect(FOLLOW_RX.test('이를 바탕으로 실생활에 적용해 봄')).toBe(true);
    expect(FOLLOW_RX.test('수업 내용을 정리하여 발표함')).toBe(false);
  });

  it('INQ_TERMS 핵심 단서', () => {
    for (const w of ['탐구', '실험', '조사', '분석', '측정', '모델링', '설계', '제작', '검증', '비교', '가설', '설문',
      '보고서', '프로젝트', '시뮬레이션', '탐색', '규명', '고찰', '연구', '해석', '증명', '적용하', '제안하', '구현',
      '관찰', '수집', '도출', '추론', '파악하', '밝혀', '알아보', '발표', '주제']) {
      expect(INQ_TERMS).toContain(w);
    }
    expect(INQ_RX.test('원인을 파악하고자 자료를 찾아봄')).toBe(true);
    expect(INQ_RX.test('친구들과 사이좋게 지냄')).toBe(false);
  });

  it('EVAL_WORDS 핵심 어휘', () => {
    for (const w of ['성실함', '적극적으로', '돋보임', '우수함', '리더십', '배려심', '호기심이\\s*많', '성장\\s*가능성']) {
      expect(EVAL_WORDS).toContain(w);
    }
    expect(EVAL_RX.test('수업에 적극적으로 참여하는 태도가 돋보임')).toBe(true);
    expect(EVAL_RX.test('호기심이 많고 리더십이 있음')).toBe(true);
    expect(EVAL_RX.test('용액의 농도를 바꾸어 측정함')).toBe(false);
  });
});

describe('EVAL_SENT', () => {
  it('플래그 없음', () => {
    expect(EVAL_SENT.flags).toBe('');
  });
  it('평가 문장은 true', () => {
    expect(EVAL_SENT.test('비판적 사고력이 돋보임.')).toBe(true);
    expect(EVAL_SENT.test('비판적 사고력이 돋보임')).toBe(true);
    expect(EVAL_SENT.test('수업에 임하는 태도가 매우 우수함.')).toBe(true);
    expect(EVAL_SENT.test('탐구에 임하는 태도가 성실하여 발전이 기대됨.')).toBe(true);
    expect(EVAL_SENT.test('열정을 지닌 학생임.')).toBe(true);
    expect(EVAL_SENT.test('문제 해결 능력을 갖춤.')).toBe(true);
  });
  it('앞머리 명사가 없는 평가 문장은 EVAL_SENT만으로는 못 잡는다(EVAL_RX + 행위 동사 없음 규칙이 보완)', () => {
    expect(EVAL_SENT.test('앞으로의 성장이 기대되는 학생임.')).toBe(false);
    expect(EVAL_RX.test('앞으로의 성장이 기대되는 학생임.')).toBe(true);
    expect(ACTION_VERBS.test('앞으로의 성장이 기대되는 학생임.')).toBe(false);
  });
  it('탐구 문장은 false', () => {
    expect(EVAL_SENT.test('전압을 측정하여 그래프로 나타냄.')).toBe(false);
    expect(EVAL_SENT.test('효소의 농도에 따른 반응 속도를 측정함.')).toBe(false);
    expect(EVAL_SENT.test('태도 변화의 원인을 설문으로 조사하여 보고서를 작성함.')).toBe(false);
  });
});

describe('EVAL_TAIL', () => {
  const strip = (s: string) => s.replace(EVAL_TAIL, '').trim();
  it('g 플래그 없음, 끝에 고정', () => {
    expect(EVAL_TAIL.flags.includes('g')).toBe(false);
    expect(EVAL_TAIL.source.endsWith('$')).toBe(true);
  });
  it('문장 끝 평가 꼬리를 떼어 낸다', () => {
    expect(strip('실험 결과를 꼼꼼히 기록하는 태도가 돋보임.')).toBe('실험 결과를 꼼꼼히 기록');
    expect(strip('모둠원과 협력하는 모습이 돋보임.')).toBe('모둠원과 협력');
    expect(strip('자료를 정리하여 발표하는 등 적극적인 태도를 보임.')).toBe('자료를 정리하여 발표하는');
    expect(strip('원인을 끝까지 파악하려는 끈기 있는 자세가 인상적임.')).toBe('원인을 끝까지 파악하려는');
    expect(strip('다양한 자료를 비교하는 능력이 우수함')).toBe('다양한 자료를 비교');
    expect(strip('탐구 과정을 꼼꼼히 기록하여 성실한 학생임.')).toBe('탐구 과정을 꼼꼼히 기록하여');
  });
  it('탐구 서술은 건드리지 않는다', () => {
    expect(strip('전압을 측정하여 그래프로 나타냄.')).toBe('전압을 측정하여 그래프로 나타냄.');
    expect(strip('용액의 농도가 높을수록 반응이 빨라짐을 확인함.')).toBe('용액의 농도가 높을수록 반응이 빨라짐을 확인함.');
    expect(strip('설문 결과를 표로 정리함.')).toBe('설문 결과를 표로 정리함.');
  });
});

describe('ACTION_VERBS, LEAD_ADVERBS', () => {
  it('ACTION_VERBS: 플래그 없음, 행위 동사 판별', () => {
    expect(ACTION_VERBS.flags).toBe('');
    expect(ACTION_VERBS.test('전압을 측정하여 그래프로 나타냄')).toBe(true);
    expect(ACTION_VERBS.test('설문을 설계하고 분석함')).toBe(true);
    expect(ACTION_VERBS.test('호기심이 많고 성실함')).toBe(false);
  });
  it('LEAD_ADVERBS: 문장 앞 접속어 제거', () => {
    expect('또한, 효소의 농도를 바꾸어 측정함'.replace(LEAD_ADVERBS, '')).toBe('효소의 농도를 바꾸어 측정함');
    expect('이를 바탕으로 보고서를 작성함'.replace(LEAD_ADVERBS, '')).toBe('보고서를 작성함');
    expect('수업 시간에 배운 내용을 정리함'.replace(LEAD_ADVERBS, '')).toBe('배운 내용을 정리함');
    expect('효소의 농도를 바꾸어 측정함'.replace(LEAD_ADVERBS, '')).toBe('효소의 농도를 바꾸어 측정함');
    // 문장 가운데 있는 접속어는 건드리지 않는다
    expect('가설을 세움. 또한 측정함'.replace(LEAD_ADVERBS, '')).toBe('가설을 세움. 또한 측정함');
  });
});

describe('rx()', () => {
  it('기본 플래그 g, 비캡처 그룹으로 감싼다', () => {
    const r = rx(['가', '나\\s*다']);
    expect(r.flags).toBe('g');
    expect(r.source).toBe('(?:가|나\\s*다)');
    expect('나 다'.match(r)).toEqual(['나 다']);
  });
  it('플래그를 바꿀 수 있다', () => {
    expect(rx(['가'], '').flags).toBe('');
    expect(rx(['가'], 'gi').flags).toBe('gi');
  });
  it('모든 목록이 하나의 정규식으로 컴파일된다', () => {
    for (const [, list] of LISTS) {
      expect(() => rx(list)).not.toThrow();
      expect(() => rx(list, '')).not.toThrow();
    }
  });
  it('편의용 RegExp는 g 플래그가 없어 test()를 반복해도 결과가 같다', () => {
    for (const r of [REFLECT_RX, CONNECT_RX, FOLLOW_RX, INQ_RX, EVAL_RX]) {
      expect(r.flags.includes('g')).toBe(false);
    }
    const s = '오차의 원인을 분석하여 개선함';
    expect(REFLECT_RX.test(s)).toBe(true);
    expect(REFLECT_RX.test(s)).toBe(true);
  });
});

describe('EVAL_TAIL은 공백이 긴 입력에서도 빠르다(역행 폭발 없음)', () => {
  it('공백 3000개짜리 문장을 50ms 안에 검사한다', () => {
    const t0 = Date.now();
    EVAL_TAIL.test('가' + ' '.repeat(3000) + '가.');
    EVAL_TAIL.test('가' + '\u00a0'.repeat(3000) + '가.');
    expect(Date.now() - t0).toBeLessThan(50);
  });
  it('행위 동사에 만들기·구현·배양이 들어 있다', () => {
    for (const s of ['글라이더를 만들어 비행 거리를 늘림', '시뮬레이션을 구현함', '세균을 배양함', '전압을 측정함']) {
      expect(ACTION_VERBS.test(s), s).toBe(true);
    }
    expect(ACTION_VERBS.test('비판적 사고력이 돋보임')).toBe(false);
  });
});
