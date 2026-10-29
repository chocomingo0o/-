import { describe, it, expect } from 'vitest';
import { FIELDS, FIELD_KEYS, FIELD_TERMS } from './fields';

/** 설계 명세에 정한 분야 이름(순서 포함). */
const EXPECTED_KEYS = [
  '의학·의료', '간호·보건', '약학·제약', '생명과학·바이오', '화학·화학공학', '물리·천문', '지구·환경·기후',
  '수학·통계', '컴퓨터·AI·데이터', '전기·전자·반도체', '기계·로봇·항공', '건축·토목·도시', '신소재·에너지',
  '농림·수산·식품', '경제·경영', '법·정치·행정', '사회·복지', '심리·상담', '교육', '언어·문학', '철학·윤리',
  '역사·지리', '예술·디자인', '체육·스포츠', '미디어·콘텐츠',
];

/** 엔진(compileFields)이 하듯 글자 사이에 \s* 를 넣어 정규식으로 만든다. */
function toRegExp(term: string): RegExp {
  const esc = term.split('').map((ch) => ch.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&'));
  return new RegExp(esc.join('\\s*'));
}

const ALL: string[] = FIELD_KEYS.flatMap((k) => FIELDS[k]);

describe('분야 목록', () => {
  it('분야 이름과 순서가 설계 명세와 같다', () => {
    expect(FIELD_KEYS).toEqual(EXPECTED_KEYS);
    expect(Object.keys(FIELDS)).toEqual(EXPECTED_KEYS);
  });
  it('분야 수가 24개 이상이다', () => {
    expect(FIELD_KEYS.length).toBeGreaterThanOrEqual(24);
  });
  it('분야마다 낱말이 50개 이상이다', () => {
    for (const k of FIELD_KEYS) {
      expect(FIELDS[k].length, k).toBeGreaterThanOrEqual(50);
    }
  });
  it('낱말이 모두 1,300개 이상이다', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(1300);
  });
});

describe('낱말 형식', () => {
  it('공백이 들어간 낱말이 없다', () => {
    for (const w of ALL) expect(w, w).not.toMatch(/\s/);
  });
  it('빈 낱말이나 1글자 낱말이 없다', () => {
    for (const w of ALL) expect(w.length, w).toBeGreaterThanOrEqual(2);
  });
  it('따옴표·쉼표 같은 문장부호가 섞인 낱말이 없다', () => {
    for (const w of ALL) expect(w, w).not.toMatch(/['",;:]/);
  });
  it('2글자 낱말 비율이 10% 미만이다', () => {
    const two = ALL.filter((w) => w.length === 2).length;
    expect(two / ALL.length).toBeLessThan(0.1);
  });
  it('낱말마다 글자 사이에 \\s* 를 넣은 정규식으로 컴파일되고, 원문과 띄어 쓴 원문 모두에 맞는다', () => {
    for (const w of ALL) {
      const re = toRegExp(w);
      expect(re.test(w), w).toBe(true);
      expect(re.test(w.split('').join(' ')), w).toBe(true);
    }
  });
});

describe('중복', () => {
  it('한 분야 안에 같은 낱말이 두 번 없다', () => {
    for (const k of FIELD_KEYS) {
      const list = FIELDS[k];
      expect(new Set(list).size, k).toBe(list.length);
    }
  });
  it('두 분야 이상에 같은 낱말을 넣지 않았다', () => {
    const owner = new Map<string, string>();
    const dups: string[] = [];
    for (const k of FIELD_KEYS) {
      for (const w of FIELDS[k]) {
        const o = owner.get(w);
        if (o && o !== k) dups.push(`${w}(${o}/${k})`);
        owner.set(w, k);
      }
    }
    expect(dups, dups.join(', ')).toEqual([]);
  });
  it('FIELD_TERMS는 모든 낱말의 합집합이다', () => {
    expect(FIELD_TERMS.size).toBe(ALL.length);
    for (const w of ALL) expect(FIELD_TERMS.has(w), w).toBe(true);
  });
});

describe('범용 낱말 제외', () => {
  it('여러 분야에 두루 쓰이는 낱말은 어느 분야에도 없다', () => {
    const generic = [
      '환경', '에너지', '분석', '탐구', '실험', '조사', '자료', '정보', '활동', '수업', '발표', '보고서', '토론',
      '관찰', '측정', '연구', '문제', '해결', '변화', '관계', '영향', '사회', '과학', '기술', '문화', '생활', '학생',
      '시간', '온도', '결과', '방법', '원리', '개념', '이론', '교과', '평가', '자신', '자료조사', '설계', '제작',
      '모델', '검사', '유도', '의사', '저항', '정책', '감사', '지각', '간섭', '편집', '유리',
    ];
    for (const g of generic) expect(FIELD_TERMS.has(g), g).toBe(false);
  });
});

describe('필수 낱말 포함', () => {
  const must: Record<string, string[]> = {
    '생명과학·바이오': [
      '카탈레이스', '과산화수소분해', '효소활성', '기질농도', '광합성속도', '검정말', '세포호흡', '유전자발현',
      '돌연변이', '항생제내성', '마이크로바이옴', '생물다양성', '먹이그물', '생태계평형', '효소', '세포',
    ],
    '화학·화학공학': [
      '산화환원', '전기분해', '전해질', '중화반응', '지시약', '화학평형', '반응속도', '촉매', '이온결합', '공유결합',
      '주기율표',
    ],
    '물리·천문': ['역학적에너지', '운동량보존', '전자기유도', '파동', '굴절', '도플러효과', '별의진화'],
    '지구·환경·기후': ['지구온난화', '탄소순환', '판구조론', '해류', '기후변화적응', '기후변화'],
    '수학·통계': ['확률', '미분', '적분', '회귀분석', '정규분포'],
    '컴퓨터·AI·데이터': ['인공지능', '머신러닝', '딥러닝', '파이썬', '빅데이터'],
    '전기·전자·반도체': ['반도체', '트랜지스터', '아두이노', '전자회로'],
    '기계·로봇·항공': ['로봇', '드론', '자율주행', '3D프린터'],
    '건축·토목·도시': ['건축', '도시계획', '내진설계', '교량'],
    '신소재·에너지': ['신소재', '그래핀', '태양전지', '배터리', '연료전지'],
    '농림·수산·식품': ['스마트팜', '식품안전', '발효식품', '양식'],
    '경제·경영': ['수요공급', '인플레이션', '마케팅', '창업'],
    '법·정치·행정': ['헌법', '민주주의', '모의재판', '지방자치'],
    '사회·복지': ['사회복지', '저출산', '고령화', '다문화'],
    '심리·상담': ['심리학', '상담', '애착이론', '회복탄력성'],
    '교육': ['교육학', '교육과정', '자기주도학습', '진로교육'],
    '언어·문학': ['문학', '소설', '언어학', '훈민정음', '번역'],
    '철학·윤리': ['철학', '윤리학', '공리주의', '생명윤리', '트롤리딜레마'],
    '역사·지리': ['역사', '한국사', '일제강점기', '지리', 'GIS'],
    '예술·디자인': ['미술', '음악', '디자인', '색채', '작곡'],
    '체육·스포츠': ['체육', '스포츠과학', '축구', '올림픽'],
    '미디어·콘텐츠': ['미디어', '저널리즘', '유튜브', '웹툰', '팩트체크'],
    '의학·의료': ['의학', '감염병', '심폐소생술', '정밀의료'],
    '간호·보건': ['간호학', '공중보건', '예방접종', '건강증진'],
    '약학·제약': ['약학', '신약개발', '임상시험', '백신'],
  };
  for (const [k, words] of Object.entries(must)) {
    it(`${k}: 핵심 낱말이 들어 있다`, () => {
      for (const w of words) expect(FIELDS[k], w).toContain(w);
    });
  }
});

describe('실제 문장에 적용', () => {
  function hit(text: string): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const k of FIELD_KEYS) {
      const found = FIELDS[k].filter((w) => toRegExp(w).test(text));
      if (found.length) out[k] = found;
    }
    return out;
  }
  it('효소 실험 세특은 생명과학·바이오 낱말 2개 이상에 맞는다', () => {
    const h = hit('감자 즙 속 카탈레이스가 과산화 수소 분해에 미치는 영향을 알아보기 위해 기질 농도를 달리하여 기포 발생량을 측정함.');
    expect(h['생명과학·바이오'].length).toBeGreaterThanOrEqual(2);
    expect(h['생명과학·바이오']).toContain('카탈레이스');
    expect(h['생명과학·바이오']).toContain('과산화수소분해');
  });
  it('전기 분해 세특은 화학·화학공학 낱말에 맞고 띄어쓰기 차이를 흡수한다', () => {
    const h = hit('염화 구리 수용액의 전기 분해 실험에서 전해질 농도에 따른 전류 변화를 기록하고 산화 환원 반응으로 설명함.');
    expect(h['화학·화학공학']).toContain('전기분해');
    expect(h['화학·화학공학']).toContain('전해질');
    expect(h['화학·화학공학']).toContain('산화환원');
  });
  it('기후 관련 창체는 지구·환경·기후에 맞는다', () => {
    const h = hit('지구 온난화와 탄소 순환을 주제로 해류 변화 자료를 조사하고 기후변화 적응 방안을 발표함.');
    expect(h['지구·환경·기후'].length).toBeGreaterThanOrEqual(3);
  });
  it('일반 평가 문장에는 분야 낱말이 거의 걸리지 않는다', () => {
    const h = hit('수업 시간에 성실하게 참여하고 모둠 활동에서 친구들을 배려하는 태도가 돋보임.');
    expect(Object.keys(h)).toEqual([]);
  });
});
