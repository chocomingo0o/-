/** 직접 입력 → StudentRecord 테스트 */
import { describe, expect, it } from 'vitest';
import { fromManual, guessGroup } from './manual';

describe('guessGroup', () => {
  it('과목명으로 교과를 추정한다', () => {
    expect(guessGroup('공통수학1')).toBe('수학');
    expect(guessGroup('인공지능 수학')).toBe('수학');
    expect(guessGroup('영어 독해와 작문')).toBe('영어');
    expect(guessGroup('영미 문학 읽기')).toBe('영어');
    expect(guessGroup('문학')).toBe('국어');
    expect(guessGroup('화법과 언어')).toBe('국어');
    expect(guessGroup('정보')).toBe('기술·가정/정보');
    expect(guessGroup('데이터 과학')).toBe('기술·가정/정보');
    expect(guessGroup('통합과학1')).toBe('과학');
    expect(guessGroup('물리학')).toBe('과학');
    expect(guessGroup('한국지리')).toBe('사회(역사/도덕 포함)');
    expect(guessGroup('한국사1')).toBe('사회(역사/도덕 포함)');
    expect(guessGroup('체육1')).toBe('체육');
    expect(guessGroup('음악')).toBe('예술');
    expect(guessGroup('일본어')).toBe('제2외국어');
    expect(guessGroup('한문')).toBe('한문');
    expect(guessGroup('진로와 직업')).toBe('교양');
  });
  it('모르면 빈 문자열', () => {
    expect(guessGroup('알 수 없는 항목')).toBe('');
    expect(guessGroup('')).toBe('');
  });
});

describe('fromManual', () => {
  const S = fromManual({
    name: ' 김가상 ',
    hopes: [{ year: 1, text: '생명공학 연구원' }],
    entries: [
      { year: 1, sem: 1, kind: '세특', subject: '통합과학1', text: '전류를 측정하고 그래프로 나타냄.', ach: 'a', rank: 2 },
      { year: 1, sem: 2, kind: '세특', subject: '과학탐구실험 1', text: '전기분해 실험을 설계함.', ach: 'P' },
      { year: 1, sem: null, kind: '세특', subject: '공통국어1', text: '토론에서 근거를 들어 주장함.' },
      { year: 2, sem: 1, kind: '세특', subject: '화학', text: '반응 속도를 비교함.', ach: 'B', group: '과학' },
      { year: 1, sem: null, kind: '창체', subject: '동아리활동', text: '광합성 속도를 측정함.' },
      { year: 1, sem: null, kind: '창체', subject: '진로활동', text: '   ' }, // 빈 내용 → 버림
    ],
  });

  it('메타, 희망분야, 학년 목록', () => {
    expect(S.meta.name).toBe('김가상');
    expect(S.meta.source).toBe('manual');
    expect(S.hopes).toEqual([{ year: 1, text: '생명공학 연구원' }]);
    expect(S.years).toEqual([1, 2]);
    expect(S.meta.curriculum).toBe(2022);
    expect(S.warnings).toEqual([]);
  });
  it('세특은 과목명 공백을 뺀 names로, 창체는 영역으로', () => {
    expect(S.seteuk.map(s => [s.year, s.sem, s.names[0]])).toEqual([[1, 1, '통합과학1'], [1, 2, '과학탐구실험1'], [1, null, '공통국어1'], [2, 1, '화학']]);
    expect(S.changche).toEqual([{ year: 1, area: '동아리활동', hours: null, text: '광합성 속도를 측정함.' }]);
  });
  it('성취도·등급이 있는 과목만 courses에 넣는다(성적 칩용)', () => {
    expect(S.courses.map(c => c.name)).toEqual(['통합과학1', '과학탐구실험 1', '화학']);
    expect(S.courses[0]).toMatchObject({ year: 1, sem: 1, group: '과학', ach: 'A', rank: 2, kind: 'main', pass: '' });
    expect(S.courses[1]).toMatchObject({ sem: 2, ach: 'P', rank: null, kind: 'career', pass: 'P' });
    expect(S.courses[2]).toMatchObject({ group: '과학', ach: 'B', rank: null, kind: 'career' });
  });
  it('기록이 하나도 없으면 경고', () => {
    const E = fromManual({ entries: [] });
    expect(E.warnings).toHaveLength(1);
    expect(E.years).toEqual([]);
    expect(E.meta.curriculum).toBe(2015);
  });
  it('과목명이 비어 있으면 (과목 미확인)', () => {
    const E = fromManual({ entries: [{ year: 1, sem: null, kind: '세특', subject: '', text: '내용' }] });
    expect(E.seteuk[0].names).toEqual(['(과목 미확인)']);
    expect(E.courses).toHaveLength(0);
  });
});
