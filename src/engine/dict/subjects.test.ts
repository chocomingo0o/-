import { describe, it, expect } from 'vitest';
import {
  LANES, LANE, CC_AREAS, SUBJECTS,
  laneOf, laneOfArea, subjectType, baseSubject,
} from './subjects';
import type { LaneKey, MethodKey } from '../types';

const ORDER: LaneKey[] = [
  '진로', '동아리', '자율·자치',
  '국어', '수학', '영어', '사회', '과학', '정보·기술', '예체능', '제2외국어·한문', '교양·기타', '융합(자율과정)',
];
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const METHOD_KEYS: MethodKey[] = [
  'experiment', 'survey', 'data', 'modeling', 'coding', 'making', 'proof', 'literature', 'fieldtrip',
  'reading', 'critique', 'proposal', 'analysis', 'understanding', 'performance', 'discussion', 'writing',
];

describe('교과군 정의', () => {
  it('13줄이고 순서가 명세와 같다', () => {
    expect(LANES.map((l) => l.key)).toEqual(ORDER);
  });
  it('LANE은 키로 같은 정의를 가리킨다', () => {
    for (const l of LANES) expect(LANE[l.key]).toBe(l);
    expect(Object.keys(LANE).length).toBe(13);
  });
  it('창체 세 줄만 cc가 참이다', () => {
    for (const l of LANES) expect(l.cc, l.key).toBe(['진로', '동아리', '자율·자치'].includes(l.key));
  });
  it('label이 비어 있지 않다', () => {
    for (const l of LANES) expect(l.label.trim().length, l.key).toBeGreaterThan(0);
  });
  it('색은 정해진 8색 안에서 쓴다', () => {
    for (const l of LANES) expect(PALETTE, `${l.key} ${l.color}`).toContain(l.color);
  });
  it('이웃한 두 줄은 색이 다르다', () => {
    for (let i = 1; i < LANES.length; i++) {
      expect(LANES[i].color, `${LANES[i - 1].key} → ${LANES[i].key}`).not.toBe(LANES[i - 1].color);
    }
  });
});

describe('기대 방법(결손 분석 기준)', () => {
  it('모든 줄에 기대 방법이 있고 올바른 방법 키만 쓴다', () => {
    for (const l of LANES) {
      expect(l.expected.length, l.key).toBeGreaterThan(0);
      for (const m of l.expected) expect(METHOD_KEYS, `${l.key} ${m}`).toContain(m);
      expect(new Set(l.expected).size, l.key).toBe(l.expected.length);
    }
  });
  it('DESIGN.md 4.8의 교과별 기대 방법을 따른다', () => {
    const has = (k: LaneKey, ms: MethodKey[]) => { for (const m of ms) expect(LANE[k].expected, `${k} ${m}`).toContain(m); };
    has('과학', ['experiment', 'data', 'modeling']);
    has('수학', ['proof', 'modeling', 'data']);
    has('사회', ['survey', 'data', 'literature', 'proposal']);
    has('국어', ['critique', 'writing', 'reading']);
    has('영어', ['reading', 'critique', 'discussion']);
    has('정보·기술', ['coding', 'data', 'making']);
    has('예체능', ['performance', 'making']);
    for (const k of ['진로', '동아리', '자율·자치'] as LaneKey[]) has(k, ['making', 'survey', 'fieldtrip', 'experiment']);
  });
});

describe('laneOf: 교과와 과목명으로 교과군 판정', () => {
  it('명세의 예시', () => {
    expect(laneOf('과학', '통합과학1')).toBe('과학');
    expect(laneOf('기술·가정/정보', '정보')).toBe('정보·기술');
    expect(laneOf('제2외국어/한문', '일본어Ⅰ')).toBe('제2외국어·한문');
    expect(laneOf('교양', '진로와 직업')).toBe('교양·기타');
    expect(laneOf(undefined, '미적분Ⅰ')).toBe('수학');
    expect(laneOf(undefined, '데이터 과학')).toBe('정보·기술');
    expect(laneOf('체육', '체육1')).toBe('예체능');
    expect(laneOf('예술', '음악')).toBe('예체능');
    expect(laneOf('사회(역사/도덕 포함)', '한국사1')).toBe('사회');
  });
  it('교과가 있으면 교과를 우선한다', () => {
    expect(laneOf('과학', '생활과학 탐구')).toBe('과학');
    expect(laneOf('사회(역사/도덕 포함)', '경제')).toBe('사회');
    expect(laneOf('교양', '철학')).toBe('교양·기타');
    expect(laneOf('한국사', '한국사')).toBe('사회');
  });
  it('2015 개정의 묶음 교과(기술·가정/제2외국어/한문/교양)는 과목명으로 가른다', () => {
    const g = '기술·가정/제2외국어/한문/교양';
    expect(laneOf(g, '정보')).toBe('정보·기술');
    expect(laneOf(g, '중국어Ⅰ')).toBe('제2외국어·한문');
    expect(laneOf(g, '한문Ⅰ')).toBe('제2외국어·한문');
    expect(laneOf(g, '심리학')).toBe('교양·기타');
    expect(laneOf(g, '논술')).toBe('교양·기타');
    expect(laneOf(g, '기술·가정')).toBe('정보·기술');
  });
  it('"○○ 계열"처럼 느슨한 교과는 과목명을 따른다', () => {
    expect(laneOf('외국어 계열', '심화 영어 독해')).toBe('영어');
    expect(laneOf('과학 계열', '고급 물리학')).toBe('과학');
  });
  it('교과가 없거나 비어 있으면 과목명으로 추정한다', () => {
    expect(laneOf(null, '통합사회2')).toBe('사회');
    expect(laneOf('', '세포와 물질대사')).toBe('과학');
    expect(laneOf(undefined, '인공지능 수학')).toBe('수학');
    expect(laneOf(undefined, '인공지능 기초')).toBe('정보·기술');
    expect(laneOf(undefined, '소프트웨어와 생활')).toBe('정보·기술');
    expect(laneOf(undefined, '생활과학 탐구')).toBe('정보·기술');
    expect(laneOf(undefined, '기후변화와 지속가능한 세계')).toBe('사회');
    expect(laneOf(undefined, '기후변화와 환경생태')).toBe('과학');
    expect(laneOf(undefined, '생태와 환경')).toBe('교양·기타');
    expect(laneOf(undefined, '스포츠 생활1')).toBe('예체능');
    expect(laneOf(undefined, '미술과 매체')).toBe('예체능');
    expect(laneOf(undefined, '문학과 영상')).toBe('국어');
    expect(laneOf(undefined, '한문 고전 읽기')).toBe('제2외국어·한문');
    expect(laneOf(undefined, '언어생활과 한자')).toBe('제2외국어·한문');
    expect(laneOf(undefined, '실용 경제')).toBe('교양·기타');
    expect(laneOf(undefined, '금융과 경제생활')).toBe('사회');
  });
  it('목록에 없는 과목은 이름의 낱말로 추정한다', () => {
    expect(laneOf(undefined, '고급 화학')).toBe('과학');
    expect(laneOf(undefined, '물리학 실험')).toBe('과학');
    expect(laneOf(undefined, '정보과학')).toBe('정보·기술');
    expect(laneOf(undefined, '심화 수학Ⅰ')).toBe('수학');
    expect(laneOf(undefined, '과학과제 연구')).toBe('과학');
    expect(laneOf(undefined, '국제 경제')).toBe('사회');
    expect(laneOf(undefined, '음악 이론')).toBe('예체능');
  });
  it('자율적 교육과정은 교과와 상관없이 융합(자율과정)', () => {
    expect(laneOf(undefined, '자율적교육과정')).toBe('융합(자율과정)');
    expect(laneOf(undefined, '자율적 교육과정')).toBe('융합(자율과정)');
    expect(laneOf('과학', '자율적 교육과정')).toBe('융합(자율과정)');
  });
  it('여러 과목이 이어진 이름은 앞 과목을 따른다', () => {
    expect(laneOf(undefined, '물리학Ⅰ·화학Ⅰ')).toBe('과학');
    expect(laneOf(undefined, '음악·미술')).toBe('예체능');
  });
  it('공백과 영문 로마 숫자 차이를 무시한다', () => {
    expect(laneOf(undefined, '미적분 I')).toBe('수학');
    expect(laneOf(undefined, '세포와물질대사')).toBe('과학');
    expect(laneOf(undefined, '사회ㆍ문화')).toBe('사회');
  });
  it('아무것도 맞지 않으면 교양·기타', () => {
    expect(laneOf(undefined, '(과목 미확인)')).toBe('교양·기타');
    expect(laneOf(undefined, '')).toBe('교양·기타');
    expect(laneOf(undefined, '서예')).toBe('교양·기타');
  });
});

describe('laneOfArea: 창체 영역', () => {
  it('명세의 예시', () => {
    expect(laneOfArea('동아리활동(생명과학탐구반)')).toBe('동아리');
    expect(laneOfArea('진로활동')).toBe('진로');
    expect(laneOfArea('자율·자치활동')).toBe('자율·자치');
    expect(laneOfArea('자율활동')).toBe('자율·자치');
    expect(laneOfArea('자치활동')).toBe('자율·자치');
    expect(laneOfArea('봉사활동')).toBe('자율·자치');
  });
  it('공백과 빈 값', () => {
    expect(laneOfArea('동아리 활동')).toBe('동아리');
    expect(laneOfArea('진로 활동')).toBe('진로');
    expect(laneOfArea('')).toBe('자율·자치');
  });
  it('영역 이름이 앞에 오면 괄호 안 낱말보다 우선한다', () => {
    expect(laneOfArea('동아리활동(진로탐구반)')).toBe('동아리');
    expect(laneOfArea('진로활동(동아리 연계)')).toBe('진로');
  });
  it('표준 영역 이름은 모두 판정된다', () => {
    expect(laneOfArea(CC_AREAS[0])).toBe('자율·자치');
    expect(laneOfArea(CC_AREAS[1])).toBe('동아리');
    expect(laneOfArea(CC_AREAS[2])).toBe('진로');
  });
});

describe('subjectType: 과목 유형', () => {
  it('명세의 예시', () => {
    expect(subjectType('통합과학1')).toBe('공통');
    expect(subjectType('세포와 물질대사')).toBe('진로');
    expect(subjectType('융합과학 탐구')).toBe('융합');
  });
  it('공백을 무시한다', () => {
    expect(subjectType('세포와물질대사')).toBe('진로');
    expect(subjectType('융합과학탐구')).toBe('융합');
    expect(subjectType('확률과통계')).toBe('일반');
    expect(subjectType(' 영어 Ⅰ ')).toBe('일반');
  });
  it('2022 개정 과목', () => {
    expect(subjectType('공통국어1')).toBe('공통');
    expect(subjectType('기본수학2')).toBe('공통');
    expect(subjectType('과학탐구실험2')).toBe('공통');
    expect(subjectType('화법과 언어')).toBe('일반');
    expect(subjectType('대수')).toBe('일반');
    expect(subjectType('미적분Ⅰ')).toBe('일반');
    expect(subjectType('미적분Ⅱ')).toBe('진로');
    expect(subjectType('물리학')).toBe('일반');
    expect(subjectType('역학과 에너지')).toBe('진로');
    expect(subjectType('주제 탐구 독서')).toBe('진로');
    expect(subjectType('독서 토론과 글쓰기')).toBe('융합');
    expect(subjectType('실생활 영어 회화')).toBe('융합');
    expect(subjectType('기후변화와 지속가능한 세계')).toBe('융합');
    expect(subjectType('체육1')).toBe('일반');
    expect(subjectType('스포츠 생활1')).toBe('융합');
    expect(subjectType('음악 연주와 창작')).toBe('진로');
    expect(subjectType('음악과 미디어')).toBe('융합');
    expect(subjectType('기술·가정')).toBe('일반');
    expect(subjectType('정보')).toBe('일반');
    expect(subjectType('데이터 과학')).toBe('진로');
    expect(subjectType('소프트웨어와 생활')).toBe('융합');
    expect(subjectType('일본어')).toBe('일반');
    expect(subjectType('일본어 회화')).toBe('진로');
    expect(subjectType('심화 중국어')).toBe('진로');
    expect(subjectType('일본 문화')).toBe('융합');
    expect(subjectType('프랑스어권 문화')).toBe('융합');
    expect(subjectType('한문')).toBe('일반');
    expect(subjectType('한문 고전 읽기')).toBe('진로');
    expect(subjectType('진로와 직업')).toBe('교양');
    expect(subjectType('인간과 철학')).toBe('교양');
    expect(subjectType('논술')).toBe('교양');
  });
  it('2015 개정 과목', () => {
    expect(subjectType('국어')).toBe('공통');
    expect(subjectType('수학')).toBe('공통');
    expect(subjectType('영어')).toBe('공통');
    expect(subjectType('한국사')).toBe('공통');
    expect(subjectType('통합과학')).toBe('공통');
    expect(subjectType('과학탐구실험')).toBe('공통');
    expect(subjectType('수학Ⅰ')).toBe('일반');
    expect(subjectType('미적분')).toBe('일반');
    expect(subjectType('화법과 작문')).toBe('일반');
    expect(subjectType('언어와 매체')).toBe('일반');
    expect(subjectType('영어 회화')).toBe('일반');
    expect(subjectType('생활과 윤리')).toBe('일반');
    expect(subjectType('사회·문화')).toBe('일반');
    expect(subjectType('사회문화')).toBe('일반');
    expect(subjectType('물리학Ⅰ')).toBe('일반');
    expect(subjectType('생명과학Ⅱ')).toBe('진로');
    expect(subjectType('과학사')).toBe('진로');
    expect(subjectType('융합과학')).toBe('진로');
    expect(subjectType('고전 읽기')).toBe('진로');
    expect(subjectType('기본 수학')).toBe('진로');
    expect(subjectType('진로 영어')).toBe('진로');
    expect(subjectType('고전과 윤리')).toBe('진로');
    expect(subjectType('체육')).toBe('일반');
    expect(subjectType('스포츠 생활')).toBe('진로');
    expect(subjectType('체육 탐구')).toBe('진로');
    expect(subjectType('음악 연주')).toBe('진로');
    expect(subjectType('공학 일반')).toBe('진로');
    expect(subjectType('가정과학')).toBe('진로');
    expect(subjectType('일본어Ⅰ')).toBe('일반');
    expect(subjectType('일본어Ⅱ')).toBe('진로');
    expect(subjectType('한문Ⅱ')).toBe('진로');
    expect(subjectType('철학')).toBe('교양');
    expect(subjectType('심리학')).toBe('교양');
    expect(subjectType('환경')).toBe('교양');
    expect(subjectType('실용 경제')).toBe('교양');
  });
  it('두 교육과정에서 유형이 다른 과목은 2022가 기본, 2015를 넘기면 2015 유형', () => {
    expect(subjectType('여행지리')).toBe('융합');
    expect(subjectType('여행지리', 2015)).toBe('진로');
    expect(subjectType('여행지리', 2022)).toBe('융합');
    expect(subjectType('경제')).toBe('진로');
    expect(subjectType('경제', 2015)).toBe('일반');
    expect(subjectType('윤리와 사상', 2015)).toBe('일반');
    expect(subjectType('사회문제 탐구', 2015)).toBe('진로');
    expect(subjectType('수학과제 탐구', 2015)).toBe('진로');
    expect(subjectType('지식 재산 일반', 2015)).toBe('진로');
    expect(subjectType('운동과 건강', 2015)).toBe('일반');
    // 유형이 같은 과목은 어느 교육과정을 넘겨도 같다
    expect(subjectType('문학', 2015)).toBe('일반');
    expect(subjectType('기하', 2015)).toBe('진로');
  });
  it('영문 로마 숫자와 아라비아 숫자 표기 차이를 흡수한다', () => {
    expect(subjectType('영어I')).toBe('일반');
    expect(subjectType('물리학II')).toBe('진로');
    expect(subjectType('미적분1')).toBe('일반');
    expect(subjectType('미적분2')).toBe('진로');
    expect(subjectType('통합과학Ⅰ')).toBe('공통');
  });
  it('빠진 과목은 기타', () => {
    expect(subjectType('고급 물리학')).toBe('기타');
    expect(subjectType('정보과학')).toBe('기타');
    expect(subjectType('자율적 교육과정')).toBe('기타');
    expect(subjectType('(과목 미확인)')).toBe('기타');
    expect(subjectType('')).toBe('기타');
  });
});

describe('baseSubject: 과목 기본형', () => {
  it('명세의 예시', () => {
    expect(baseSubject('통합과학1')).toBe('통합과학');
    expect(baseSubject('영어 Ⅰ')).toBe('영어');
    expect(baseSubject('생명과학Ⅱ')).toBe('생명과학');
  });
  it('공백, 괄호, 끝의 숫자·로마 숫자를 뗀다', () => {
    expect(baseSubject('공통국어 1')).toBe('공통국어');
    expect(baseSubject('물리학 I')).toBe('물리학');
    expect(baseSubject('물리학II')).toBe('물리학');
    expect(baseSubject('화학Ⅲ')).toBe('화학');
    expect(baseSubject('스포츠 생활2')).toBe('스포츠생활');
    expect(baseSubject('통합사회1(심화)')).toBe('통합사회');
    expect(baseSubject('정보(선택)')).toBe('정보');
    expect(baseSubject('확률과 통계')).toBe('확률과통계');
  });
  it('기본형이 같으면 같은 과목 계열이다', () => {
    expect(baseSubject('물리학Ⅰ')).toBe(baseSubject('물리학Ⅱ'));
    expect(baseSubject('한국사1')).toBe(baseSubject('한국사2'));
    expect(baseSubject('수학Ⅰ')).toBe(baseSubject('수학'));
    expect(baseSubject('미적분Ⅰ')).not.toBe(baseSubject('대수'));
  });
});

describe('CC_AREAS', () => {
  it('2022 개정 세 영역을 앞에 두고 봉사활동을 포함한다', () => {
    expect(CC_AREAS.slice(0, 3)).toEqual(['자율·자치활동', '동아리활동', '진로활동']);
    expect(CC_AREAS).toContain('봉사활동');
    expect(new Set(CC_AREAS).size).toBe(CC_AREAS.length);
  });
});

describe('과목 목록의 일관성', () => {
  it('이름이 겹치지 않는다(공백·가운뎃점 차이 포함)', () => {
    const keys = SUBJECTS.map((e) => e.name.replace(/\s+/g, '').replace(/·/g, ''));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('등록된 과목은 교과 없이도 자기 교과군으로 판정된다', () => {
    for (const e of SUBJECTS) expect(laneOf(undefined, e.name), e.name).toBe(e.lane);
  });
  it('등록된 과목의 유형이 그대로 나온다', () => {
    for (const e of SUBJECTS) {
      expect(subjectType(e.name), e.name).toBe(e.type);
      if (e.type2015) expect(subjectType(e.name, 2015), e.name).toBe(e.type2015);
    }
  });
  it('명세에 적힌 과목이 모두 등록되어 있다', () => {
    const must = [
      '공통국어1', '공통수학1', '기본수학1', '공통영어1', '기본영어1', '한국사1', '통합사회1', '통합과학1', '과학탐구실험1',
      '화법과 언어', '독서와 작문', '문학', '주제 탐구 독서', '문학과 영상', '직무 의사소통', '독서 토론과 글쓰기', '매체 의사소통', '언어생활 탐구',
      '대수', '미적분Ⅰ', '확률과 통계', '기하', '미적분Ⅱ', '경제 수학', '인공지능 수학', '직무 수학', '수학과 문화', '실용 통계', '수학과제 탐구',
      '영어Ⅰ', '영어Ⅱ', '영어 독해와 작문', '영미 문학 읽기', '영어 발표와 토론', '심화 영어', '심화 영어 독해와 작문', '직무 영어', '실생활 영어 회화', '미디어 영어', '세계 문화와 영어',
      '세계시민과 지리', '세계사', '사회와 문화', '현대사회와 윤리', '한국지리 탐구', '도시의 미래 탐구', '동아시아 역사 기행', '정치', '법과 사회', '경제', '윤리와 사상', '인문학과 윤리', '국제 관계의 이해',
      '여행지리', '역사로 탐구하는 현대 세계', '사회문제 탐구', '금융과 경제생활', '윤리문제 탐구', '기후변화와 지속가능한 세계',
      '물리학', '화학', '생명과학', '지구과학', '역학과 에너지', '전자기와 양자', '물질과 에너지', '화학 반응의 세계', '세포와 물질대사', '생물의 유전', '지구시스템과학', '행성우주과학',
      '과학의 역사와 문화', '기후변화와 환경생태', '융합과학 탐구',
      '체육1', '체육2', '운동과 건강', '스포츠 문화', '스포츠 과학', '스포츠 생활1', '스포츠 생활2',
      '음악', '미술', '연극', '음악 연주와 창작', '음악 감상과 비평', '미술 창작', '미술 감상과 비평', '음악과 미디어', '미술과 매체',
      '기술·가정', '정보', '로봇과 공학세계', '생활과학 탐구', '인공지능 기초', '데이터 과학', '소프트웨어와 생활', '창의 공학 설계', '지식 재산 일반', '생애 설계와 자립', '아동발달과 부모',
      '독일어', '프랑스어', '스페인어', '중국어', '일본어', '러시아어', '아랍어', '베트남어', '한문', '한문 고전 읽기',
      '진로와 직업', '생태와 환경', '인간과 철학', '논리와 사고', '인간과 심리', '교육의 이해', '삶과 종교', '보건', '인간관계와 소통', '논술',
      // 2015 개정
      '국어', '수학', '영어', '한국사', '통합사회', '통합과학', '과학탐구실험', '화법과 작문', '독서', '언어와 매체', '수학Ⅰ', '수학Ⅱ', '미적분',
      '영어 회화', '한국지리', '세계지리', '동아시아사', '정치와 법', '생활과 윤리', '물리학Ⅰ', '물리학Ⅱ', '화학Ⅰ', '화학Ⅱ', '생명과학Ⅰ', '생명과학Ⅱ', '지구과학Ⅰ', '지구과학Ⅱ',
      '과학사', '생활과 과학', '융합과학', '실용 국어', '심화 국어', '고전 읽기', '실용 수학', '기본 수학', '영어권 문화', '진로 영어', '고전과 윤리',
      '체육', '스포츠 생활', '체육 탐구', '음악 연주', '농업 생명 과학', '공학 일반', '창의 경영', '해양 문화와 기술', '가정과학',
      '심리학', '교육학', '종교학', '철학', '환경', '실용 경제',
    ];
    for (const n of must) expect(subjectType(n), n).not.toBe('기타');
  });
});
