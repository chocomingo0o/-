/**
 * 섹션 파서 단위 테스트.
 *  - 세특 접두 분리(validPrefix / splitSeteuk)는 합성 줄 배열로.
 *  - 섹션 인식·성적표·창체·행발은 NEIS 배치를 흉내 낸 셀 스트림을 직접 만들어 parseCells로.
 *  - 제목이 사각형 밖 맨글자인 경우(가상 셀)는 parseStudent로.
 */
import { describe, expect, it } from 'vitest';
import type { Cell, Page, StudentRecord, TextItem } from '../types';
import { curriculumOf, parseCells, parseStudent, splitClubs, splitSeteuk, validPrefix } from './parse';

/** 셀 하나. text가 배열이면 여러 줄 */
const C = (x: number, y: number, w: number, h: number, text: string | string[] = '', page = 0): Cell => {
  const lines = Array.isArray(text) ? text : text ? [text] : [];
  return { x, y, w, h, items: [], lines, text: lines.join(' '), top: y + h, page };
};
/** 같은 줄에 여러 칸: cols = [x, w][] */
const row = (cols: [number, number][], y: number, h: number, vals: (string | string[])[], page = 0): Cell[] =>
  cols.map(([x, w], i) => C(x, y, w, h, vals[i] ?? '', page));

describe('validPrefix', () => {
  const known = new Set(['통합과학1', '화법과언어', '독서와작문', '기술·가정', '미적분Ⅰ']);
  it('성적표 과목명과 맞으면 공백을 뺀 이름을 돌려준다', () => {
    expect(validPrefix('통합과학1', known)).toEqual(['통합과학1']);
    expect(validPrefix('통합 과학 1', known)).toEqual(['통합과학1']);
  });
  it('·로 이어진 두 과목', () => {
    expect(validPrefix('화법과 언어·독서와 작문', known)).toEqual(['화법과언어', '독서와작문']);
  });
  it('과목명 자체에 ·가 있어도 된다', () => {
    expect(validPrefix('기술·가정', known)).toEqual(['기술·가정']);
  });
  it('모르는 과목이 섞이면 null', () => {
    expect(validPrefix('미술', known)).toBeNull();
    expect(validPrefix('통합과학1·미술', known)).toBeNull();
    expect(validPrefix('', known)).toBeNull();
  });
});

describe('splitSeteuk', () => {
  const known = new Set(['통합과학1', '과학탐구실험1', '화법과언어', '독서와작문', '기술·가정']);
  it('줄머리 과목명으로 문단을 나누고 (1학기) 접두를 학기로 읽는다', () => {
    const { seteuk, warnings } = splitSeteuk([{
      year: 1,
      lines: [
        '(1학기) 통합과학1: 전압과 전류의 관계를 알아보는 실험을 수행함.',
        '측정값을 그래프로 나타내고 오차 원인을 분석함.',
        '화법과 언어·독서와 작문: 토론에서 근거를 들어 주장함.',
        '자율적 교육과정 지역 하천의 수질을 조사하는 프로젝트에 참여함.',
        '기술·가정: 생활 속 문제를 해결하는 제품을 설계함.',
        '참고 자료: 교과서 3단원을 활용함.',
      ],
    }], known);
    expect(warnings).toEqual([]);
    expect(seteuk).toHaveLength(4);
    expect(seteuk[0]).toEqual({ year: 1, sem: 1, names: ['통합과학1'], text: '전압과 전류의 관계를 알아보는 실험을 수행함. 측정값을 그래프로 나타내고 오차 원인을 분석함.' });
    expect(seteuk[1]).toEqual({ year: 1, sem: null, names: ['화법과언어', '독서와작문'], text: '토론에서 근거를 들어 주장함.' });
    expect(seteuk[2]).toEqual({ year: 1, sem: null, names: ['자율적교육과정'], text: '지역 하천의 수질을 조사하는 프로젝트에 참여함.' });
    // '참고 자료:'는 과목이 아니므로 앞 세특에 이어진다
    expect(seteuk[3]).toEqual({ year: 1, sem: null, names: ['기술·가정'], text: '생활 속 문제를 해결하는 제품을 설계함. 참고 자료: 교과서 3단원을 활용함.' });
  });
  it('(1학기)와 과목명 사이에 공백이 없어도 되고, 전각 콜론도 읽는다', () => {
    const { seteuk } = splitSeteuk([{ year: 2, lines: ['(2학기)과학탐구실험1：기체 발생량을 비교함.'] }], known);
    expect(seteuk).toEqual([{ year: 2, sem: 2, names: ['과학탐구실험1'], text: '기체 발생량을 비교함.' }]);
  });
  it('과목을 확인할 수 없는 첫 문단은 (과목 미확인)으로 두고 경고는 한 번만', () => {
    const { seteuk, warnings } = splitSeteuk([{ year: 1, lines: ['알 수 없는 과목: 내용 하나.', '이어지는 줄.'] }, { year: 1, lines: ['또 모르는 줄.'] }], known);
    expect(seteuk).toHaveLength(1);
    expect(seteuk[0].names).toEqual(['(과목 미확인)']);
    expect(seteuk[0].text).toBe('알 수 없는 과목: 내용 하나. 이어지는 줄. 또 모르는 줄.');
    expect(warnings).toEqual(['과목명을 찾지 못한 세특 문단이 있습니다.']);
  });
  it("2015 개정 '학교자율과정 :' 문단은 앞 과목에 섞지 않고 별도 세특으로 나눈다", () => {
    const { seteuk, warnings } = splitSeteuk([{
      year: 2,
      lines: [
        '통합과학1: 효소의 활성을 온도별로 측정함.',
        '학교자율과정 : 지역 하천의 수질을 조사하고 보고서를 씀.',
        '학교 자율 과정：두 번째 주제로 토양 산성도를 측정함.',
      ],
    }], known);
    expect(warnings).toEqual([]);
    expect(seteuk.map(x => [x.names, x.text])).toEqual([
      [['통합과학1'], '효소의 활성을 온도별로 측정함.'],
      [['학교자율과정'], '지역 하천의 수질을 조사하고 보고서를 씀.'],
      [['학교자율과정'], '두 번째 주제로 토양 산성도를 측정함.'],
    ]);
  });
  it("본문이 줄바꿈되어 '학교자율과정에서', '학교자율과정 시간에'로 시작하는 줄은 새 세특을 열지 않는다", () => {
    const { seteuk } = splitSeteuk([{
      year: 2,
      lines: [
        '통합과학1: 1학년 때',
        '학교자율과정에서 조사한 하천 수질 자료를 다시 분석함.',
        '학교자율과정 시간에 만든 측정 계획도 보완함.',
      ],
    }], known);
    expect(seteuk).toHaveLength(1);
    expect(seteuk[0].names).toEqual(['통합과학1']);
    expect(seteuk[0].text).toContain('학교자율과정에서 조사한');
    expect(seteuk[0].text).toContain('학교자율과정 시간에 만든');
  });
  it('여러 덩어리(쪽이 나뉜 세특)도 이어서 읽는다', () => {
    const { seteuk } = splitSeteuk([
      { year: 1, lines: ['통합과학1: 앞 쪽의 내용이며'] },
      { year: 1, lines: ['다음 쪽으로 이어짐.'] },
    ], known);
    expect(seteuk).toEqual([{ year: 1, sem: null, names: ['통합과학1'], text: '앞 쪽의 내용이며 다음 쪽으로 이어짐.' }]);
  });
});

describe('splitClubs', () => {
  it("특기사항 첫머리의 '(동아리명)(N시간)'을 영역 이름과 시간으로 옮긴다", () => {
    expect(splitClubs([{ year: 1, area: '동아리활동', hours: 68, text: '(생명과학탐구부)(34시간) 효소 실험을 설계함.' }]))
      .toEqual([{ year: 1, area: '동아리활동(생명과학탐구부)', hours: 34, text: '효소 실험을 설계함.' }]);
  });
  it('한 칸에 동아리가 여럿이면 문장 끝 뒤의 표시마다 나눈다', () => {
    const out = splitClubs([{ year: 2, area: '동아리활동', hours: 51, text: '(천문부)(34시간) 별의 시차를 측정함. (토론부)(17시간) 기후 정책 토론에 참여함.' }]);
    expect(out.map(c => [c.area, c.hours, c.text])).toEqual([
      ['동아리활동(천문부)', 34, '별의 시차를 측정함.'],
      ['동아리활동(토론부)', 17, '기후 정책 토론에 참여함.'],
    ]);
  });
  it('문장 가운데의 괄호나 시간 표시가 없는 이름, 동아리 밖 영역은 건드리지 않는다', () => {
    const list = [
      { year: 1 as const, area: '동아리활동', hours: 30, text: '(과학탐구반) 식물의 광합성 속도를 측정함.' },
      { year: 1 as const, area: '동아리활동', hours: 30, text: '실험 계획서를 쓰고 발표 자료(그림)(2시간 분량)를 만듦.' },
      { year: 1 as const, area: '진로활동', hours: 20, text: '(진로캠프)(6시간) 연구원 강연을 들음.' },
    ];
    expect(splitClubs(list)).toEqual(list);
  });
});

/* ───────────── NEIS 배치를 흉내 낸 셀 스트림 ───────────── */
const DIST = 'A(32.1) B(25.3) C(20.1) D(12.5) E(10.0)';
const GCOLS: [number, number][] = [[30, 30], [60, 50], [110, 90], [200, 30], [230, 95], [325, 60], [385, 100], [485, 40], [525, 40]];
const GHEAD = ['학기', '교과', '과목', '학점', ['원점수/과목평균', '(표준편차)'], ['성취도', '(수강자수)'], ['성취도별', '분포비율'], '석차등급', '비고'];
// 진로 선택 과목 표: 석차등급 열이 없다
const PCOLS: [number, number][] = [[30, 30], [60, 50], [110, 90], [200, 30], [230, 95], [325, 60], [385, 100], [485, 80]];
const PHEAD = ['학기', '교과', '과목', '학점', ['원점수/과목평균', '(표준편차)'], ['성취도', '(수강자수)'], ['성취도별', '분포비율'], '비고'];
const CCOLS: [number, number][] = [[70, 80], [150, 40], [190, 375]];

function sampleStream(): Cell[] {
  const s: Cell[] = [];
  // 1쪽: 인적·학적사항, 창체
  s.push(C(30, 800, 535, 18, '1. 인적·학적사항'));
  s.push(C(30, 776, 535, 22, '성명 : 김가상 성별 : 남'));
  s.push(C(30, 754, 80, 22, '학적사항'), C(110, 754, 455, 22, '2025년 03월 02일 대한고등학교 제1학년 입학'));
  s.push(C(30, 720, 535, 18, '6. 창의적 체험활동상황'));
  s.push(...row([[30, 40], ...CCOLS], 696, 22, ['학년', '영역', '시간', '특기사항']));
  s.push(C(30, 474, 40, 222, '1')); // 학년 칸은 세 영역에 걸쳐 병합
  s.push(...row(CCOLS, 636, 60, ['자율·자치활동', '34', ['학급 회의에서 안건을 제안하고', '의견을 조율함.']]));
  s.push(C(70, 556, 80, 80, '동아리활동'), C(150, 556, 40, 80, '30'));
  s.push(C(190, 596, 375, 40, ['(과학탐구반) 식물의 광합성 속도를', '측정하는 실험을 설계함.']));
  s.push(C(190, 556, 375, 40, ['이후 변인을 바꾸어 추가 실험을', '진행함.'])); // 같은 학년·영역 → 합쳐짐
  s.push(...row(CCOLS, 496, 60, ['진로활동', '20', ['진로 탐색 활동에서 생명공학 분야를', '조사하고 발표함.']]));
  s.push(C(70, 474, 80, 22, '희망분야'), C(150, 474, 415, 22, '생명공학 연구원'));
  // 2쪽: 교과학습발달상황
  s.push(C(30, 800, 535, 18, '7. 교과학습발달상황', 1));
  s.push(C(30, 780, 60, 16, '[1학년]', 1));
  s.push(...row(GCOLS, 740, 36, GHEAD, 1));
  s.push(...row(GCOLS, 718, 22, ['1', '과학', '통합과학1', '4', '84/71.2(14.6)', 'A(248)', DIST, '2', ''], 1));
  s.push(...row(GCOLS, 696, 22, ['1', '국어', '공통국어1', '4', '88/75.3(12.1)', 'A(250)', DIST, '1', ''], 1));
  s.push(...row(GCOLS, 674, 22, ['', '과학', '과학탐구실험1', '1', '', 'P', '', '', ''], 1)); // 학기 비어 있음 → 1 상속
  s.push(...row(GCOLS, 652, 22, ['2', '수학', '공통수학2', '4', '79/68.4(15.2)', 'B(250)', DIST, '3', ''], 1));
  s.push(C(30, 630, 535, 22, '이수학점 합계 13', 1));
  s.push(C(30, 606, 100, 18, '<진로 선택 과목>', 1));
  s.push(...row(PCOLS, 570, 36, PHEAD, 1));
  s.push(...row(PCOLS, 548, 22, ['2', '과학', '과학사', '2', '90/80.0(10.0)', 'A(120)', 'A(40.0) B(35.0) C(25.0)', ''], 1));
  s.push(C(30, 520, 535, 22, '과목 세부능력 및 특기사항', 1));
  s.push(C(30, 440, 535, 80, [
    '통합과학1: 전압과 전류의 관계를 알아보는 실험에서 저항을 바꾸어 가며 전류를 측정함.',
    '측정값을 그래프로 나타내고 이론값과의 차이를 오차 원인과 함께 분석함.',
    '(1학기)과학탐구실험1: 물의 전기분해 실험을 설계하고 변인을 통제하여 기체 발생량을 비교함.',
    '실험 후 보고서를 작성하여 발표함.',
    '공통수학2: 함수의 그래프를 그려 변화를 설명함.',
  ], 1));
  // 3쪽: 행동특성 및 종합의견
  s.push(C(30, 800, 535, 18, '9. 행동특성 및 종합의견', 2));
  s.push(C(30, 770, 40, 22, '학년', 2), C(70, 770, 495, 22, '행동특성 및 종합의견', 2));
  s.push(C(30, 690, 40, 80, '1', 2), C(70, 690, 495, 80, ['책임감이 강하고 맡은 일을 끝까지 해냄.', '친구들의 의견을 경청함.'], 2));
  return s;
}

describe('parseCells (NEIS 유사 셀 스트림)', () => {
  const S = parseCells(sampleStream());

  it('인적·학적사항: 이름, 입학 연도, 학교명 가림, 등급제·교육과정', () => {
    expect(S.meta.name).toBe('김가상');
    expect(S.meta.entry).toBe(2025);
    expect(S.hakjeok).toEqual(['2025년 03월 02일 ○○고등학교 제1학년 입학']);
    expect(S.meta.scale).toBe(5);
    expect(S.meta.curriculum).toBe(2022);
    expect(S.meta.source).toBe('pdf');
  });
  it('성적표: 과목 줄과 열 값', () => {
    expect(S.courses.map(c => c.name)).toEqual(['통합과학1', '공통국어1', '과학탐구실험1', '공통수학2', '과학사']);
    expect(S.courses.map(c => c.sem)).toEqual([1, 1, 1, 2, 2]);
    const c0 = S.courses[0];
    expect(c0).toMatchObject({ year: 1, group: '과학', credit: 4, raw: 84, avg: 71.2, sd: 14.6, ach: 'A', n: 248, rank: 2, kind: 'main', dist: DIST });
    expect(S.courses[2]).toMatchObject({ ach: 'P', rank: null, raw: null, credit: 1 });
    // 석차등급 열이 없는 표 → 진로 선택
    expect(S.courses[4]).toMatchObject({ name: '과학사', kind: 'career', ach: 'A', n: 120, rank: null, raw: 90 });
  });
  it('세특: 과목명 접두로 나뉘고 (1학기) 접두를 읽으며, 세특 없는 과목은 noSeteuk', () => {
    expect(S.seteuk.map(s => s.names)).toEqual([['통합과학1'], ['과학탐구실험1'], ['공통수학2']]);
    expect(S.seteuk[0].sem).toBeNull();
    expect(S.seteuk[0].text).toBe('전압과 전류의 관계를 알아보는 실험에서 저항을 바꾸어 가며 전류를 측정함. 측정값을 그래프로 나타내고 이론값과의 차이를 오차 원인과 함께 분석함.');
    expect(S.seteuk[1].sem).toBe(1);
    expect(S.seteuk[1].text).toBe('물의 전기분해 실험을 설계하고 변인을 통제하여 기체 발생량을 비교함. 실험 후 보고서를 작성하여 발표함.');
    expect(S.courses.find(c => c.name === '공통국어1')?.noSeteuk).toBe(true);
    expect(S.courses.find(c => c.name === '통합과학1')?.noSeteuk).toBeUndefined();
  });
  it('창체: 영역·시간·본문, 같은 학년·영역의 이어지는 칸은 합친다', () => {
    expect(S.changche.map(c => [c.year, c.area, c.hours])).toEqual([[1, '자율·자치활동', 34], [1, '동아리활동', 30], [1, '진로활동', 20]]);
    expect(S.changche[0].text).toBe('학급 회의에서 안건을 제안하고 의견을 조율함.');
    expect(S.changche[1].text).toBe('(과학탐구반) 식물의 광합성 속도를 측정하는 실험을 설계함. 이후 변인을 바꾸어 추가 실험을 진행함.');
  });
  it('희망분야와 행동특성', () => {
    expect(S.hopes).toEqual([{ year: 1, text: '생명공학 연구원' }]);
    expect(S.behavior).toEqual([{ year: 1, text: '책임감이 강하고 맡은 일을 끝까지 해냄. 친구들의 의견을 경청함.' }]);
  });
  it('학년 목록과 경고', () => {
    expect(S.years).toEqual([1]);
    expect(S.warnings).toEqual([]);
  });
  it('입력 순서가 뒤섞여 있어도 같은 결과', () => {
    const shuffled = sampleStream().reverse();
    const S2 = parseCells(shuffled);
    expect(S2.courses.map(c => c.name)).toEqual(S.courses.map(c => c.name));
    expect(S2.seteuk).toEqual(S.seteuk);
  });
});

describe('parseCells 그 밖의 양식', () => {
  it('번호 없는 제목(대입전형자료 조회 양식)도 섹션으로 읽는다', () => {
    const s: Cell[] = [
      C(30, 800, 120, 16, '교과학습발달상황'),
      C(30, 780, 60, 16, '[2학년]'),
      ...row(GCOLS, 740, 36, GHEAD),
      ...row(GCOLS, 718, 22, ['1', '수학', '대수', '4', '80/70.0(10.0)', 'B(200)', DIST, '2', '']),
    ];
    const S = parseCells(s);
    expect(S.courses).toHaveLength(1);
    expect(S.courses[0]).toMatchObject({ year: 2, name: '대수', rank: 2 });
    expect(S.years).toEqual([2]);
  });
  it("머리글이 '학점수 원점수/과목평균'처럼 학점 칸 하나에 합쳐 찍혀도 학점과 원점수 열을 나눠 읽는다", () => {
    const s: Cell[] = [
      C(30, 800, 120, 16, '교과학습발달상황'),
      C(30, 780, 60, 16, '[3학년]'),
      C(30, 760, 100, 18, '<진로 선택 과목>'),
      ...row(PCOLS, 720, 36, ['학기', '교과', '과목', '학점수 원점수/과목평균', '', ['성취도', '(수강자수)'], ['성취도별', '분포비율'], '비고']),
      ...row(PCOLS, 698, 22, ['1', '과학', '생명과학Ⅱ', '3', '91/78.5', 'A(85)', 'A(45.0) B(35.0) C(20.0)', '']),
    ];
    const S = parseCells(s);
    expect(S.courses).toHaveLength(1);
    expect(S.courses[0]).toMatchObject({ year: 3, name: '생명과학Ⅱ', kind: 'career', credit: 3, raw: 91, avg: 78.5, ach: 'A', n: 85 });
  });
  it('성적표가 없으면 경고하고, 낱글자로 떨어진 과목명을 붙인다', () => {
    const S0 = parseCells([C(30, 800, 535, 18, '7. 교과학습발달상황')]);
    expect(S0.courses).toHaveLength(0);
    expect(S0.warnings.some(w => /성적표를 찾지 못했습니다/.test(w))).toBe(true);
    const S1 = parseCells([
      C(30, 800, 535, 18, '7. 교과학습발달상황'), C(30, 780, 60, 16, '[1학년]'),
      ...row(GCOLS, 740, 36, GHEAD),
      ...row(GCOLS, 718, 22, ['1', '수학', '수 학', '4', '80/70.0(10.0)', 'B(200)', DIST, '2', '']),
    ]);
    expect(S1.courses[0].name).toBe('수학');
  });
  it('교양 표(이수여부 열)는 liberal, 과목 줄이 다음 쪽으로 넘어가도 읽는다', () => {
    const LCOLS: [number, number][] = [[30, 30], [60, 50], [110, 90], [200, 30], [230, 95]];
    const s: Cell[] = [
      C(30, 800, 535, 18, '7. 교과학습발달상황'), C(30, 780, 60, 16, '[1학년]'),
      C(30, 760, 60, 16, '<교양>'),
      ...row(LCOLS, 740, 22, ['학기', '교과', '과목', '학점', '이수여부']),
      ...row(LCOLS, 718, 22, ['1', '교양', '진로와 직업', '1', 'P']),
      ...row(LCOLS, 800, 22, ['2', '교양', '보건', '1', 'P'], 1),
    ];
    const S = parseCells(s);
    expect(S.courses.map(c => [c.name, c.kind, c.pass, c.ach, c.sem])).toEqual([['진로와 직업', 'liberal', 'P', 'P', 1], ['보건', 'liberal', 'P', 'P', 2]]);
  });
  it('행발이 여러 칸으로 나뉘면 같은 학년끼리 합치고, 2학년이 나오면 새 항목', () => {
    const s: Cell[] = [
      C(30, 800, 535, 18, '9. 행동특성 및 종합의견'),
      C(30, 770, 40, 22, '학년'), C(70, 770, 495, 22, '행동특성 및 종합의견'),
      C(30, 700, 40, 70, '1'), C(70, 735, 495, 35, '첫 칸의 내용임.'), C(70, 700, 495, 35, '둘째 칸의 내용임.'),
      C(30, 640, 40, 60, '2'), C(70, 640, 495, 60, '2학년 내용임.'),
    ];
    const S = parseCells(s);
    expect(S.behavior).toEqual([{ year: 1, text: '첫 칸의 내용임. 둘째 칸의 내용임.' }, { year: 2, text: '2학년 내용임.' }]);
  });
  it('수상경력과 독서활동은 선택 필드에, 수여기관 학교명은 가린다', () => {
    const s: Cell[] = [
      C(30, 800, 535, 18, '4. 수상경력'),
      C(30, 770, 30, 22, '학년'), C(60, 770, 30, 22, '학기'), C(90, 770, 150, 22, '수상명'), C(240, 770, 60, 22, '등급(위)'), C(300, 770, 80, 22, '수상연월일'), C(380, 770, 100, 22, '수여기관'), C(480, 770, 85, 22, '참가대상'),
      C(30, 748, 30, 22, '1'), C(60, 748, 30, 22, '1'), C(90, 748, 150, 22, '과학탐구대회'), C(240, 748, 60, 22, '금상(1위)'), C(300, 748, 80, 22, '2025.07.15.'), C(380, 748, 100, 22, '대한고등학교장'), C(480, 748, 85, 22, '1학년 전체'),
      C(30, 700, 535, 18, '8. 독서활동상황'),
      C(30, 670, 40, 22, '학년'), C(70, 670, 80, 22, '과목 또는 영역'), C(150, 670, 415, 22, '독서활동상황'),
      C(30, 640, 40, 30, '1'), C(70, 640, 80, 30, '과학'), C(150, 640, 415, 30, '코스모스(칼 세이건)'),
    ];
    const S = parseCells(s);
    expect(S.awards).toEqual([{ year: 1, sem: 1, name: '과학탐구대회', grade: '금상(1위)', date: '2025.07.15.', org: '○○고등학교장', target: '1학년 전체' }]);
    expect(S.reading).toEqual([{ year: 1, area: '과학', text: '코스모스(칼 세이건)' }]);
  });
  it('봉사활동 실적 표는 창체로 읽지 않는다', () => {
    const s: Cell[] = [
      C(30, 800, 535, 18, '6. 창의적 체험활동상황'),
      ...row([[30, 40], ...CCOLS], 760, 22, ['학년', '영역', '시간', '특기사항']),
      C(30, 700, 40, 60, '1'), ...row(CCOLS, 700, 60, ['진로활동', '10', '진로 특강을 들음.']),
      C(30, 670, 535, 18, '봉사활동실적'),
      C(30, 640, 40, 22, '학년'), C(70, 640, 80, 22, '일자 또는 기간'), C(150, 640, 100, 22, '장소 또는 주관기관명'), C(250, 640, 200, 22, '활동내용'), C(450, 640, 50, 22, '시간'), C(500, 640, 65, 22, '누계시간'),
      C(30, 618, 40, 22, '1'), C(70, 618, 80, 22, '2025.05.01.'), C(150, 618, 100, 22, '○○복지관'), C(250, 618, 200, 22, '환경 정화'), C(450, 618, 50, 22, '3'), C(500, 618, 65, 22, '3'),
    ];
    const S = parseCells(s);
    expect(S.changche).toEqual([{ year: 1, area: '진로활동', hours: 10, text: '진로 특강을 들음.' }]);
  });
});

describe('parseStudent (가상 셀: 제목이 사각형 밖 맨글자)', () => {
  const T = (s: string, x: number, y: number, w = s.length * 6): TextItem => ({ s, x, y, w });
  it('섹션 제목과 [1학년]이 셀 밖에 있어도 성적표를 읽는다', () => {
    const cols: [number, number][] = [[30, 30], [60, 50], [110, 90], [200, 30], [230, 95], [325, 60], [385, 40]];
    const heads = ['학기', '교과', '과목', '학점', '원점수/과목평균(표준편차)', '성취도(수강자수)', '석차등급'];
    const vals = ['1', '수학', '공통수학1', '4', '80/70.0(10.0)', 'B(200)', '2'];
    const page: Page = { rects: [], items: [T('7. 교과학습발달상황', 30, 805), T('[1학년]', 30, 785)] };
    cols.forEach(([x, w], i) => {
      page.rects.push({ x, y: 740, w, h: 22 }); page.items.push(T(heads[i], x + 3, 746));
      page.rects.push({ x, y: 718, w, h: 22 }); page.items.push(T(vals[i], x + 3, 724));
    });
    const S = parseStudent([page]);
    expect(S.courses).toHaveLength(1);
    expect(S.courses[0]).toMatchObject({ year: 1, sem: 1, name: '공통수학1', rank: 2, ach: 'B', n: 200 });
  });
});

describe('curriculumOf', () => {
  const base = (over: Partial<StudentRecord>): StudentRecord => ({ meta: {}, courses: [], seteuk: [], changche: [], hopes: [], behavior: [], warnings: [], years: [], ...over });
  const course = (name: string) => ({ year: 1 as const, sem: 1 as const, group: '', name, credit: 0, raw: null, avg: null, sd: null, ach: '', dist: '', rank: null, n: null, note: '', kind: 'main' as const, pass: '' });
  it('입학 연도가 있으면 2025년 이후만 2022', () => {
    expect(curriculumOf(base({ meta: { entry: 2024 }, courses: [course('공통국어1')] }))).toBe(2015);
    expect(curriculumOf(base({ meta: { entry: 2025 } }))).toBe(2022);
  });
  it('입학 연도가 없으면 과목명으로', () => {
    expect(curriculumOf(base({ courses: [course('공통국어1')] }))).toBe(2022);
    expect(curriculumOf(base({ courses: [course('국어')] }))).toBe(2015);
    expect(curriculumOf(base({ seteuk: [{ year: 1, sem: null, names: ['통합과학2'], text: 'x' }] }))).toBe(2022);
  });
});
