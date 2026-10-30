import { describe, expect, it } from 'vitest';
import { clauseBroken, cleanTopic, jo, nos, sentences, stripAuthor, summarize, tokens, validTopic } from './text';

describe('nos', () => {
  it('공백을 모두 뺀다', () => {
    expect(nos(' 세계시민과 지리 ')).toBe('세계시민과지리');
    expect(nos('a\tb\nc')).toBe('abc');
    expect(nos('')).toBe('');
  });
});

describe('sentences', () => {
  it('마침표 기준으로 나누고 원문 위치를 보존한다(text.slice(a, b) === s)', () => {
    const text = ' 첫 문장임. 둘째 문장은 길게 이어짐! 셋째 문장인가?  ';
    const out = sentences(text);
    expect(out.map((o) => o.s)).toEqual(['첫 문장임.', '둘째 문장은 길게 이어짐!', '셋째 문장인가?']);
    for (const o of out) expect(text.slice(o.a, o.b)).toBe(o.s);
    expect(out[0].a).toBe(1);
    expect(out[1].a).toBeGreaterThan(out[0].b);
  });
  it('문장이 앞뒤 공백 없이 시작하고 끝난다', () => {
    for (const o of sentences('가나다. 라마바.   사아자.')) {
      expect(o.s).toBe(o.s.trim());
    }
  });
  it('숫자 사이의 마침표(소수점)는 문장을 끊지 않는다', () => {
    const out = sentences('원점수 84.5점을 받음. 오차는 3.5%였음.');
    expect(out).toHaveLength(2);
    expect(out[0].s).toBe('원점수 84.5점을 받음.');
    expect(out[1].s).toBe('오차는 3.5%였음.');
  });
  it('잇달은 문장 부호는 한 문장의 끝으로 본다', () => {
    const out = sentences('정말인가?! 그렇다고 함...');
    expect(out.map((o) => o.s)).toEqual(['정말인가?!', '그렇다고 함...']);
  });
  it('마지막 문장에 마침표가 없어도 포함한다', () => {
    const out = sentences('첫 문장. 마침표 없는 끝');
    expect(out.map((o) => o.s)).toEqual(['첫 문장.', '마침표 없는 끝']);
  });
  it('빈 문자열이나 공백만 있으면 빈 배열', () => {
    expect(sentences('')).toEqual([]);
    expect(sentences('   ')).toEqual([]);
    expect(sentences('. . .')).toEqual([]);
  });
});

describe('tokens', () => {
  it('조사를 떼고 불용어를 뺀다: 카탈레이스의 활성을 측정함 → 카탈레이스, 활성', () => {
    expect(tokens('카탈레이스의 활성을 측정함.')).toEqual(['카탈레이스', '활성']);
  });
  it('NOUN_OK 낱말(에너지, 물질, 언어, 온도, 민주주의, 단백질)은 끝 글자가 조사·어미와 같아도 깎이거나 버려지지 않는다', () => {
    const out = tokens('에너지와 물질, 언어 자료를 온도를 민주주의와 함께 다룬 단백질 보고서.');
    expect(out).toEqual(['에너지', '물질', '언어', '온도', '민주주의', '단백질']);
    expect(out).not.toContain('에너');
    expect(out).not.toContain('물');
    expect(out).not.toContain('민주주');
  });
  it('NOUN_OK에 있어도 불용어 집합에 든 낱말(기록, 회의)은 뺀다', () => {
    const out = tokens('실험 기록과 학급 회의 내용을 효소 자료와 함께 정리함.');
    expect(out).toEqual(['효소']);
  });
  it('긴 조사부터 뗀다', () => {
    expect(tokens('실험으로부터 카탈레이스에서는 효소처럼')).toEqual(['카탈레이스', '효소']);
  });
  it('불용어(STOP, STOP2, GENERIC)와 과목명(extraStop)을 뺀다', () => {
    const stop = new Set(['통합과학1', '통합과학']);
    const out = tokens('통합과학1 수업 활동에서 성실한 태도로 효소를 탐구함.', stop);
    expect(out).toEqual(['효소']);
  });
  it('낱말 앞 부사를 떼고, 숫자로 시작하는 것과 한 글자는 버린다', () => {
    const out = tokens('또한직접 과산화수소를 3회 40℃ 물에서 측정함.');
    expect(out).toContain('과산화수소');
    expect(out.some((w) => /^[0-9]/.test(w))).toBe(false);
    expect(out.some((w) => w.length < 2)).toBe(false);
  });
  it('용언 어미로 끝나는 낱말과 어간(…하, …되)을 버린다', () => {
    const out = tokens('반복하여 측정하고 그래프로 나타냄. 꼼꼼히 정리하였으며 설명하 되');
    for (const bad of ['반복하여', '측정하고', '나타냄', '꼼꼼히', '정리하였으며', '설명하']) expect(out).not.toContain(bad);
  });
  it('문장부호와 가운뎃점은 낱말 경계다', () => {
    const out = tokens('‘항생제·내성균’(세균)을 조사함');
    expect(out).toEqual(['항생제', '내성균', '세균']);
  });
  it('빈 입력은 빈 배열', () => {
    expect(tokens('')).toEqual([]);
  });
});

describe('summarize', () => {
  it('앞머리 접속어와 끝의 평가 꼬리, 마침표를 뗀다', () => {
    expect(summarize('또한 실험 결과를 꼼꼼히 기록하는 태도가 돋보임.')).toBe('실험 결과를 꼼꼼히 기록');
    expect(summarize('이를 바탕으로 효소의 활성을 측정함.')).toBe('효소의 활성을 측정함');
  });
  it('평가 꼬리를 뗀 결과가 6자 미만이면 원문을 유지한다', () => {
    expect(summarize('성실한 학생임.')).toBe('성실한 학생임');
    expect(summarize('탐구 능력이 돋보임.')).toBe('탐구 능력이 돋보임');
  });
  it('(1학기) 표시와 여는 부호 찌꺼기를 뗀다', () => {
    expect(summarize('(1학기) 효소 실험을 수행함.')).toBe('효소 실험을 수행함');
    expect(summarize(') , 효소 실험을 수행함.')).toBe('효소 실험을 수행함');
  });
  it('길이를 넘으면 낱말 경계에서 잘라 …을 붙인다', () => {
    const s = '손 세정제 종류에 따른 세균 억제 효과를 비교하기 위해 디스크 확산법을 본떠 영양 한천 배지에 종이 디스크를 올리고 억제대 지름을 3회 반복 측정하여 평균을 표로 정리함.';
    const out = summarize(s, 60);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out).not.toMatch(/[,\s]…$/);
    // 낱말 중간에서 끊지 않는다
    const body = out.slice(0, -1);
    expect(s.startsWith(body)).toBe(true);
    expect(s[body.length]).toMatch(/[\s,]/);
  });
  it('기본 최대 길이는 90자', () => {
    const long = '가나다라 '.repeat(40).trim();
    const out = summarize(long);
    expect(out.length).toBeLessThanOrEqual(91);
    expect(out.endsWith('…')).toBe(true);
    expect(summarize('짧은 문장.')).toBe('짧은 문장');
  });
  it('빈 입력은 빈 문자열', () => {
    expect(summarize('')).toBe('');
  });
});

describe('cleanTopic, validTopic, stripAuthor', () => {
  it('앞의 절과 따옴표, 접속어, 관형어를 뗀다', () => {
    expect(cleanTopic('‘온도에 따른 카탈레이스 활성 변화’')).toBe('온도에 따른 카탈레이스 활성 변화');
    expect(cleanTopic('책을 읽고 미생물의 세계')).toBe('미생물의 세계');
    expect(cleanTopic('이를 바탕으로 항생제 내성균 확산')).toBe('항생제 내성균 확산');
    expect(cleanTopic('대한 항생제 내성균 확산')).toBe('항생제 내성균 확산');
    expect(cleanTopic('')).toBe('');
  });
  it('낱말이 7개를 넘으면 뒤의 7개만 남긴다', () => {
    expect(cleanTopic('하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉')).toBe('셋 넷 다섯 여섯 일곱 여덟 아홉');
  });
  it('validTopic: 명사구는 통과, 문장 조각이나 너무 짧거나 긴 것은 탈락', () => {
    expect(validTopic('온도에 따른 카탈레이스 활성 변화')).toBe(true);
    expect(validTopic('손 세정제 종류에 따른 세균 억제 효과 비교')).toBe(true);
    expect(validTopic('antibiotic resistance')).toBe(true);
    expect(validTopic('실험을 수행함')).toBe(false);          // 어미로 끝남
    expect(validTopic('효소의')).toBe(false);                // 조사로 끝남
    expect(validTopic('실험 결과')).toBe(false);             // 일반 명사로 끝남
    expect(validTopic('효')).toBe(false);                    // 너무 짧음
    expect(validTopic('가 '.repeat(30))).toBe(false);        // 너무 김
    expect(validTopic('123 456')).toBe(false);               // 한글·영문 없음
    expect(validTopic('(짝이 안 맞는 괄호')).toBe(false);
    expect(validTopic('이 주제의 탐구 결과물')).toBe(false);  // 대명사로 시작
    expect(validTopic('팀원과 함께한 탐구')).toBe(false);
    expect(validTopic('')).toBe(false);
  });
  it('stripAuthor: 끝의 (저자)만 뗀다', () => {
    expect(stripAuthor('이기적 유전자 (리처드 도킨스)')).toBe('이기적 유전자');
    expect(stripAuthor('이기적 유전자')).toBe('이기적 유전자');
    expect(stripAuthor('(앞 괄호) 제목')).toBe('(앞 괄호) 제목');
  });
});

describe('jo (조사 고르기)', () => {
  it('받침이 있으면 앞 꼴, 없으면 뒤 꼴', () => {
    expect(jo('전압', '을', '를')).toBe('을');
    expect(jo('효소', '을', '를')).toBe('를');
    expect(jo('과학', '은', '는')).toBe('은');
    expect(jo('지리', '은', '는')).toBe('는');
    expect(jo('실험', '이', '가')).toBe('이');
    expect(jo('배지', '이', '가')).toBe('가');
  });
  it('으로/로: ㄹ받침과 받침 없음은 로, 그 외 받침은 으로', () => {
    expect(jo('과학', '으로', '로')).toBe('으로');
    expect(jo('물', '으로', '로')).toBe('로');
    expect(jo('효소', '으로', '로')).toBe('로');
  });
  it('끝의 따옴표·괄호·공백은 무시하고, 숫자는 읽기를 따른다', () => {
    expect(jo('‘카탈레이스’', '을', '를')).toBe('를');
    expect(jo('전압) ', '을', '를')).toBe('을');
    expect(jo('공통수학1', '을', '를')).toBe('을');   // 일
    expect(jo('통합과학2', '을', '를')).toBe('를');   // 이
    expect(jo('체육3', '으로', '로')).toBe('으로');   // 삼
  });
  it('한글도 숫자도 아니면 뒤 꼴, 빈 낱말도 뒤 꼴', () => {
    expect(jo('DNA', '은', '는')).toBe('는');
    expect(jo('', '을', '를')).toBe('를');
  });
});

/* ───────────────────────── 리뷰 뒤 보강 ───────────────────────── */
describe('sentences: 따옴표 안의 물음표', () => {
  it("‘…일까?’라는 의문을 품고 …' 는 한 문장이다", () => {
    const text = '‘왜 효소는 온도에 따라 활성이 달라질까?’라는 의문을 품고 온도별로 카탈레이스 반응 속도를 측정함.';
    const out = sentences(text);
    expect(out).toHaveLength(1);
    expect(out[0].s).toBe(text);
  });
  it('문장 부호 뒤의 닫는 따옴표는 앞 문장에 붙고, 띄어쓰기가 있으면 거기서 끊는다', () => {
    const text = '실험함.’ 다음.';
    const out = sentences(text);
    expect(out.map((o) => o.s)).toEqual(['실험함.’', '다음.']);
    for (const o of out) expect(text.slice(o.a, o.b)).toBe(o.s);
  });
  it('곧은 따옴표는 문장 안에 열린 짝이 있을 때만 닫는 따옴표다', () => {
    expect(sentences('"왜 그럴까?"라는 질문을 던짐. 다음 문장.').map((o) => o.s)).toEqual(['"왜 그럴까?"라는 질문을 던짐.', '다음 문장.']);
    // 마침표 뒤에 바로 오는 여는 곧은 따옴표는 다음 문장의 시작이다
    expect(sentences('측정함. "다음 질문"을 세움.').map((o) => o.s)).toEqual(['측정함.', '"다음 질문"을 세움.']);
  });
});

describe('tokens: 용언 어간과 관형형을 버린다', () => {
  it("'모르는', '지켜', '줄이는', '어떤', '전한', '쓰인'은 낱말이 아니다", () => {
    const out = tokens('모르는 표현이 나오면 뜻을 추측한 뒤 사전으로 확인함. 수칙을 지켜 실점을 줄이는 모습. 어떤 역할을 했는지 전한 두 기사. 쓰인 외래어.');
    for (const bad of ['모르', '지켜', '줄이', '어떤', '전한', '쓰인']) expect(out).not.toContain(bad);
    expect(out).toEqual(expect.arrayContaining(['추측', '사전', '수칙', '실점', '외래어']));
  });
  it('이/리로 끝나는 명사는 그대로 남고(놀이, 먹이, 종이, 거리), 용언 어간(배우는)은 버린다', () => {
    const out = tokens('놀이는 먹이는 종이는 거리는 배우는 원리는 줄이는 지키는.');
    expect(out).toEqual(expect.arrayContaining(['놀이', '먹이', '종이', '거리']));
    for (const bad of ['배우', '줄이', '지키']) expect(out).not.toContain(bad);
  });
});

describe('validTopic: 절이 끼어 있는 조각은 주제가 아니다', () => {
  it('연결 어미 어절이 가운데 있으면 거부', () => {
    expect(validTopic('이진 탐색의 비교 횟수를 세어 효율 차이')).toBe(false);
    expect(validTopic('장구로 세마치장단을 쳐 보며 전통 음악의 구조')).toBe(false);
    expect(validTopic('학기 말에 오래달리기와 윗몸 말아 올리기 기록')).toBe(false);
  });
  it('부사어로 시작하는 조각은 거부하되 관형어가 이어지면 받는다', () => {
    expect(validTopic('학교에서 생긴 갈등 사례')).toBe(false);
    expect(validTopic('온도에 따른 카탈레이스 활성 변화')).toBe(true);
    expect(validTopic('기질 농도가 반응 속도에 미치는 영향')).toBe(true);
    expect(clauseBroken('영어 기사의 어조 비교')).toBe(false); // '영어'는 명사 예외
  });
  it("'효과', '성과'로 끝나는 명사구는 조사 '과'로 보지 않는다", () => {
    expect(validTopic('소독용 에탄올의 농도와 살균 효과')).toBe(true);
    expect(validTopic('기후변화와 탄소 중립')).toBe(true);
    expect(validTopic('항생제와')).toBe(false);
  });
});

describe('jo: 로마 숫자 과목명', () => {
  it('Ⅰ·Ⅱ·Ⅲ과 영문 I·II·III를 일·이·삼으로 읽는다', () => {
    expect(jo('영어Ⅰ', '을', '를')).toBe('을');
    expect(jo('영어Ⅰ', '과', '와')).toBe('과');
    expect(jo('물리학Ⅱ', '으로', '로')).toBe('로');
    expect(jo('화학Ⅲ', '이', '가')).toBe('이');
    expect(jo('영어I', '을', '를')).toBe('을');
    expect(jo('수학II', '은', '는')).toBe('는');
    expect(jo('AI', '을', '를')).toBe('를'); // 영문 낱말의 I는 로마 숫자가 아니다
  });
});

describe('summarize: 공백을 접는다', () => {
  it('연속 공백과 줄바꿈은 한 칸이 되고 평가 꼬리는 그대로 떼어진다', () => {
    expect(summarize('실험   결과를\n꼼꼼히  기록하는 태도가 돋보임.')).toBe('실험 결과를 꼼꼼히 기록');
    const t0 = Date.now();
    summarize('가' + ' '.repeat(3000) + '가.');
    expect(Date.now() - t0).toBeLessThan(50);
  });
});
