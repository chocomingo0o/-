import { describe, it, expect } from 'vitest';
import {
  SUF, STOP, STOP2, GENERIC, NOUN_OK, VERB_END, LEAD_WORD, COMMON, commonWeight,
} from './stop';

describe('SUF 조사·어미', () => {
  it('필수 항목 포함', () => {
    for (const s of ['으로부터', '에서는', '으로써', '이라는', '하였으며', '라는', '에서', '으로', '에게', '부터', '까지',
      '처럼', '보다', '하여', '하는', '적인', '적으로', '들의', '을', '를', '이', '가', '은', '는', '의', '에', '로',
      '와', '과', '도', '만', '들', '함', '한', '할', '된', '적']) {
      expect(SUF).toContain(s);
    }
  });
  it('길이 내림차순(긴 것부터 대조)', () => {
    for (let i = 1; i < SUF.length; i++) {
      expect(SUF[i].length, `${SUF[i - 1]} → ${SUF[i]}`).toBeLessThanOrEqual(SUF[i - 1].length);
    }
  });
  it('중복·빈 항목 없음', () => {
    expect(new Set(SUF).size).toBe(SUF.length);
    expect(SUF.every((s) => s.length > 0)).toBe(true);
  });
  it('긴 것부터 대조하면 한 번에 바른 조사가 떨어진다', () => {
    const strip = (w: string) => {
      for (const s of SUF) if (w.length > s.length && w.endsWith(s)) return w.slice(0, -s.length);
      return w;
    };
    expect(strip('실험으로부터')).toBe('실험');
    expect(strip('학생들의')).toBe('학생');
    expect(strip('탐구하였으며')).toBe('탐구');
    expect(strip('측정함으로써')).toBe('측정');
    expect(strip('효소를')).toBe('효소');
    expect(strip('에너지')).toBe('에너지');
  });
});

describe('불용어 집합', () => {
  it('STOP 300개 이상, 핵심 낱말 포함', () => {
    expect(STOP.size).toBeGreaterThanOrEqual(300);
    for (const w of ['활동', '수업', '단원', '학생', '내용', '친구', '발표', '이해', '정리', '과정', '방법', '결과',
      '자신', '모둠', '수행평가', '탐구', '실험', '분석', '조사', '자료', '보고서', '질문', '의견', '생각', '개념',
      '문제', '사례']) {
      expect(STOP.has(w), w).toBe(true);
    }
  });
  it('STOP2 200개 이상, 핵심 낱말 포함', () => {
    expect(STOP2.size).toBeGreaterThanOrEqual(200);
    for (const w of ['기준', '사용', '조건', '변화', '연결', '원인', '관계', '기술', '습관', '생활', '방안', '계획',
      '추가', '구분', '출처', '점검', '선택', '규칙', '동료', '그림', '이용', '핵심', '지역', '완성', '운동', '평균',
      '관리', '수치', '주장', '소개', '함수', '발견', '처리', '개인', '반복', '범위', '진로', '동아리', '축제', '체험',
      '실제', '원칙', '배경', '사건', '위치', '상대', '구성', '공간', '실천', '탐색', '관찰', '답변', '교육', '용어',
      '전략', '수정', '정의', '주기', '상황', '경향', '적용', '반영', '프로젝트', '흐름', '가능성', '고려', '방향',
      '발전', '비용', '기초', '그래프', '활동지', '결과물', '장점', '단점', '특성', '요소', '요인', '측정', '시간',
      '공식', '결론', '오차', '한계', '문장', '목표', '종류', '소감']) {
      expect(STOP2.has(w), w).toBe(true);
    }
  });
  it('GENERIC 200개 이상, 핵심 낱말 포함', () => {
    expect(GENERIC.size).toBeGreaterThanOrEqual(200);
    for (const w of ['가치', '갈등', '강조', '개념', '객관적', '경청', '경험', '계기', '고민', '공감', '과정', '관점',
      '교훈', '구체화', '긍정적', '기여', '노력', '논리적', '능력', '도전', '리더십', '마무리', '모습', '목표', '바탕',
      '발전', '배려', '분위기', '사고력', '성실', '성장', '소통', '수준', '시도', '실천', '열정', '의지', '자세',
      '잠재력', '적극적', '책임감', '태도', '협력', '호기심']) {
      expect(GENERIC.has(w), w).toBe(true);
    }
  });
  it('불용어에 빈 문자열이나 공백 포함 낱말 없음', () => {
    for (const set of [STOP, STOP2, GENERIC, NOUN_OK]) {
      for (const w of set) {
        expect(w.length, JSON.stringify(w)).toBeGreaterThan(0);
        expect(w, w).not.toMatch(/\s/);
      }
    }
  });
  it('개별 탐구 주제가 될 낱말은 불용어가 아니다', () => {
    for (const w of ['효소', '유전자', '바이러스', '전압', '배드민턴', '소설', '민주주의', '인공지능', '플라스틱']) {
      expect(STOP.has(w) || STOP2.has(w) || GENERIC.has(w), w).toBe(false);
    }
  });
});

describe('NOUN_OK 명사 예외', () => {
  it('40개 이상, 필수 낱말 포함', () => {
    expect(NOUN_OK.size).toBeGreaterThanOrEqual(40);
    for (const w of ['용어', '단어', '언어', '정의', '분해', '소음', '부여', '온도', '속도', '농도', '밀도', '강도',
      '정도', '회의', '유전자', '효소', '세포', '기후', '항생제', '미생물', '인공지능', '바이러스', '전지', '전해질',
      '산도', '습도', '조도', '염도', '에너지', '민주주의', '물질', '단백질', '미세먼지']) {
      expect(NOUN_OK.has(w), w).toBe(true);
    }
  });
  it('조사·어미와 끝 글자가 같은 낱말을 보호한다', () => {
    const endsWithSuf = (w: string) => SUF.some((s) => w.length > s.length && w.endsWith(s));
    // 보호가 필요한 대표 낱말: 조사로 끝나거나 용언 어미로 끝남
    for (const w of ['온도', '정의', '에너지', '물질', '언어', '회의', '분해', '게임', '기록', '높이', '회로', '효과']) {
      expect(NOUN_OK.has(w), w).toBe(true);
      expect(endsWithSuf(w) || VERB_END.test(w), `${w}는 보호가 필요한 꼴이어야 함`).toBe(true);
    }
  });
});

describe('VERB_END, LEAD_WORD', () => {
  it('용언 어미로 끝나는 토큰을 가려낸다', () => {
    for (const w of ['측정함', '조사하였음', '만들었다', '나타냄', '보여줌', '알아보고', '정리하면서', '참여하는']) {
      expect(VERB_END.test(w), w).toBe(true);
    }
    for (const w of ['효소', '유전자', '바이러스', '전압', '그래프', '민주주의', '플라스틱', '인공지능']) {
      expect(VERB_END.test(w), w).toBe(false);
    }
  });
  it('낱말 앞 접두 부사를 떼어 낸다(뒤에 두 글자 이상 남을 때만)', () => {
    expect('다시측정'.replace(LEAD_WORD, '')).toBe('측정');
    expect('직접제작'.replace(LEAD_WORD, '')).toBe('제작');
    expect('특히효소'.replace(LEAD_WORD, '')).toBe('효소');
    expect('모두'.replace(LEAD_WORD, '')).toBe('모두');
    expect('다시'.replace(LEAD_WORD, '')).toBe('다시');
    expect('효소'.replace(LEAD_WORD, '')).toBe('효소');
  });
});

describe('COMMON, commonWeight', () => {
  it('300개 이상, 값은 0~1', () => {
    const keys = Object.keys(COMMON);
    expect(keys.length).toBeGreaterThanOrEqual(300);
    for (const k of keys) {
      const v = COMMON[k];
      expect(typeof v, k).toBe('number');
      expect(v, k).toBeGreaterThanOrEqual(0);
      expect(v, k).toBeLessThanOrEqual(1);
      expect(k, k).not.toMatch(/\s/);
    }
  });
  it('예시 값이 명세와 같다', () => {
    const expected: Record<string, number> = {
      '감정': 0.9, '청소년': 0.8, '역사': 1, '소설': 0.8, '환경': 0.9, '에너지': 0.7, '효소': 0.9, '유전자': 0.5,
      '바이러스': 0.3, '온도': 0.6, '용액': 0.7, '전기': 0.6, '데이터': 0.8, '인공지능': 0.7, '기후': 0.8,
      '플라스틱': 0.7, '배드민턴': 0.9, '연주': 0.6,
    };
    for (const [k, v] of Object.entries(expected)) expect(COMMON[k], k).toBe(v);
  });
  it('공통과목 핵심 개념어는 개인 탐구 낱말보다 흔하다', () => {
    expect(COMMON['역사']).toBeGreaterThan(COMMON['바이러스']);
    expect(COMMON['효소']).toBeGreaterThan(COMMON['유전자']);
    expect(COMMON['환경']).toBeGreaterThan(COMMON['머신러닝']);
  });
  it('commonWeight 범위와 공식', () => {
    expect(commonWeight('역사')).toBeCloseTo(0.25, 10);          // 1 → 0.25
    expect(commonWeight('바이러스')).toBeCloseTo(0.25 + 0.75 * 0.7, 10);
    expect(commonWeight('효소')).toBeCloseTo(0.25 + 0.75 * 0.1, 10);
    expect(commonWeight('이런낱말은없음')).toBe(1);               // 사전에 없으면 1
    for (const k of Object.keys(COMMON)) {
      const w = commonWeight(k);
      expect(w, k).toBeGreaterThanOrEqual(0.25);
      expect(w, k).toBeLessThanOrEqual(1);
    }
  });
  it('객체 프로토타입 키에도 안전하다', () => {
    for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(commonWeight(k), k).toBe(1);
    }
  });
});
