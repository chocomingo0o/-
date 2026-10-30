import { describe, expect, it } from 'vitest';
import type { Course, StudentRecord, Year } from '../types';
import { sampleStudent } from '../../fixtures/sample';
import { buildRecords, semLabel, slotIdx, slotT, subjectStop } from './records';

function emptyStudent(): StudentRecord {
  return { meta: {}, courses: [], seteuk: [], changche: [], hopes: [], behavior: [], warnings: [], years: [] };
}
function course(year: Year, sem: 1 | 2, group: string, name: string, ach: string, rank: number | null): Course {
  return { year, sem, group, name, credit: 4, raw: 90, avg: 70, sd: 10, ach, dist: '', rank, n: 200, note: '', kind: 'main', pass: '' };
}
const LONG = '효소의 활성을 온도별로 측정하여 그래프로 나타내고 결과를 해석함.';

describe('slotT, slotIdx, semLabel', () => {
  it('slotT: (학년-1)*2 + 1학기 0, 2학기 1, 학기 없음 0.5', () => {
    expect(slotT(1, 1)).toBe(0);
    expect(slotT(1, 2)).toBe(1);
    expect(slotT(1, null)).toBe(0.5);
    expect(slotT(2, 1)).toBe(2);
    expect(slotT(3, 2)).toBe(5);
    expect(slotT(3, null)).toBe(4.5);
  });
  it('slotIdx: 학기가 있으면 한 칸, 없으면 그 학년의 두 칸', () => {
    expect(slotIdx({ year: 1, sem: 1 })).toEqual([0]);
    expect(slotIdx({ year: 1, sem: 2 })).toEqual([1]);
    expect(slotIdx({ year: 2, sem: null })).toEqual([2, 3]);
    expect(slotIdx({ year: 3, sem: 2 })).toEqual([5]);
    expect(slotIdx({ year: 3, sem: null })).toEqual([4, 5]);
  });
  it('semLabel', () => {
    expect(semLabel({ year: 1, sem: 2 })).toBe('1학년 2학기');
    expect(semLabel({ year: 2, sem: null })).toBe('2학년 (학년 전체)');
  });
});

describe('subjectStop', () => {
  it('성적표·세특 과목명(공백 제거)과 기본형을 모은다. 미확인 표시는 넣지 않는다', () => {
    const S = sampleStudent();
    S.seteuk.push({ year: 2, sem: 1, names: ['(과목 미확인)'], text: LONG });
    const stop = subjectStop(S);
    for (const w of ['통합과학1', '통합과학', '과학탐구실험1', '과학탐구실험', '세계시민과지리', '영어Ⅰ', '영어', '기술·가정', '대수', '문학']) {
      expect(stop.has(w), w).toBe(true);
    }
    expect(stop.has('(과목미확인)')).toBe(false);
    expect([...stop].every((w) => w.length >= 2)).toBe(true);
  });
  it('·로 이어진 여러 과목 이름은 나눠서 넣는다', () => {
    const S = emptyStudent();
    S.seteuk.push({ year: 2, sem: null, names: ['물리학Ⅰ·화학Ⅰ'], text: LONG });
    const stop = subjectStop(S);
    expect(stop.has('물리학Ⅰ')).toBe(true);
    expect(stop.has('물리학')).toBe(true);
    expect(stop.has('화학Ⅰ')).toBe(true);
    expect(stop.has('화학')).toBe(true);
  });
});

describe('buildRecords(sampleStudent())', () => {
  const S = sampleStudent();
  const recs = buildRecords(S);
  const byId = new Map(recs.map((r) => [r.id, r]));

  it('세특 수 + 창체 수만큼 Rec을 만들고, id는 S번호/C번호', () => {
    expect(recs).toHaveLength(S.seteuk.length + S.changche.length);
    expect(recs.filter((r) => r.kind === '세특')).toHaveLength(S.seteuk.length);
    expect(recs.filter((r) => r.kind === '창체')).toHaveLength(S.changche.length);
    S.seteuk.forEach((_, i) => expect(byId.has(`S${i}`)).toBe(true));
    S.changche.forEach((_, i) => expect(byId.has(`C${i}`)).toBe(true));
    expect(new Set(recs.map((r) => r.id)).size).toBe(recs.length);
  });
  it('세특의 교과군·학년·학기·시간 좌표가 맞다', () => {
    const want: Record<string, [string, Year, 1 | 2 | null]> = {
      공통국어1: ['국어', 1, 1], 공통수학1: ['수학', 1, 1], 공통영어1: ['영어', 1, 1], 한국사1: ['사회', 1, 1],
      통합사회1: ['사회', 1, 1], 통합과학1: ['과학', 1, 1], 과학탐구실험1: ['과학', 1, 1], 정보: ['정보·기술', 1, 1],
      체육1: ['예체능', 1, 1], 음악: ['예체능', 1, 1], 공통국어2: ['국어', 1, 2], 통합과학2: ['과학', 1, 2],
      '기술·가정': ['정보·기술', 1, 2], 미술: ['예체능', 1, 2], 문학: ['국어', 2, 1], 대수: ['수학', 2, 1],
      영어Ⅰ: ['영어', 2, 1], 생명과학: ['과학', 2, 1], 화학: ['과학', 2, 1], '세계시민과 지리': ['사회', 2, 1],
    };
    for (const [subj, [lane, year, sem]] of Object.entries(want)) {
      const r = recs.find((x) => x.kind === '세특' && x.subj === subj);
      expect(r, subj).toBeDefined();
      expect(r!.lane, subj).toBe(lane);
      expect(r!.year, subj).toBe(year);
      expect(r!.sem, subj).toBe(sem);
      expect(r!.t, subj).toBe(slotT(year, sem));
    }
  });
  it('세특 이름은 성적표 표기(공백 포함)를 쓴다', () => {
    const geo = recs.find((r) => r.kind === '세특' && r.year === 2 && r.lane === '사회');
    expect(geo?.subj).toBe('세계시민과 지리');
  });
  it('성적 칩: 과목·학기 하나에 칩 하나. 성취도와 등급이 맞다', () => {
    const sci = recs.find((r) => r.subj === '통합과학1')!;
    expect(sci.grades).toEqual([{ sem: 1, ach: 'A', rank: 1 }]);
    const lab = recs.find((r) => r.subj === '과학탐구실험1')!;
    expect(lab.grades).toEqual([{ sem: 1, ach: 'P', rank: null }]);
    const pe = recs.find((r) => r.subj === '체육1')!;
    expect(pe.grades).toEqual([{ sem: 1, ach: 'A', rank: null }]);
    const bio = recs.find((r) => r.subj === '생명과학')!;
    expect(bio.grades).toEqual([{ sem: 1, ach: 'A', rank: 1 }]);
    for (const r of recs.filter((x) => x.kind === '세특')) {
      expect(r.grades.length, r.subj).toBe(1);
      expect(r.grades[0].sem, r.subj).toBe(r.sem);
    }
  });
  it('창체: 학기 없음, 교과군은 영역으로, 성적 칩 없음, 시간 좌표는 두 학기 사이', () => {
    const cc = recs.filter((r) => r.kind === '창체');
    expect(cc).toHaveLength(6);
    for (const r of cc) {
      expect(r.sem).toBeNull();
      expect(r.grades).toEqual([]);
      expect(r.t).toBe((r.year - 1) * 2 + 0.5);
      expect(slotIdx(r)).toHaveLength(2);
    }
    expect(cc.filter((r) => r.lane === '동아리')).toHaveLength(2);
    expect(cc.filter((r) => r.lane === '진로')).toHaveLength(2);
    expect(cc.filter((r) => r.lane === '자율·자치')).toHaveLength(2);
    expect(cc.filter((r) => r.year === 1)).toHaveLength(3);
    expect(cc.filter((r) => r.year === 2)).toHaveLength(3);
  });
  it('동아리 카드 이름은 영역 이름에서 시간 표시를 뺀 것', () => {
    const club1 = recs.find((r) => r.kind === '창체' && r.lane === '동아리' && r.year === 1)!;
    expect(club1.subj).toBe('동아리활동(생명과학탐구반)');
    const club2 = recs.find((r) => r.kind === '창체' && r.lane === '동아리' && r.year === 2)!;
    expect(club2.subj).toBe('동아리활동(미생물탐구반)');
    expect(recs.find((r) => r.kind === '창체' && r.lane === '진로')!.subj).toBe('진로활동');
  });
  it('본문은 원문 그대로이고 분석 필드는 빈 값으로 초기화된다', () => {
    const r = byId.get('S6')!;
    expect(r.text).toBe(S.seteuk[6].text);
    expect(r.sents).toEqual([]);
    expect(r.methods).toEqual([]);
    expect(r.methodCounts).toEqual({});
    expect(r.depth).toBe(1);
    expect(r.faint).toBe(false);
    expect(r.key).toEqual([]);
    expect(r.acts).toEqual([]);
    expect(r.fuCount).toBe(0);
    expect(r.connectCue).toBe(false);
    expect(r.tf).toBeInstanceOf(Map);
    expect(r.tf.size).toBe(0);
    expect(r.ktf).toBeInstanceOf(Set);
    expect(r.ktf.size).toBe(0);
    expect(r.fields).toEqual([]);
    expect(r.topic).toBe('');
    expect(r.topicKind).toBe('k');
    expect(r.kw).toEqual([]);
    expect(r.summary).toBe('');
    expect(r.summaryFu).toBe(false);
    expect(r.themes).toEqual([]);
    expect(r.skills).toEqual([]);
    expect(r.skillCounts).toEqual({});
  });
  it('기록마다 tf, ktf 객체가 따로 있다(공유하지 않음)', () => {
    expect(recs[0].tf).not.toBe(recs[1].tf);
    expect(recs[0].ktf).not.toBe(recs[1].ktf);
  });
});

describe('buildRecords 가장자리 경우', () => {
  it('12자 미만 본문과 1~3학년 밖의 기록은 뺀다', () => {
    const S = emptyStudent();
    S.seteuk.push({ year: 1, sem: 1, names: ['정보'], text: '짧은 글.' });
    S.seteuk.push({ year: 1, sem: 1, names: ['정보'], text: LONG });
    S.changche.push({ year: 4 as Year, area: '진로활동', hours: null, text: LONG });
    S.changche.push({ year: 0 as Year, area: '진로활동', hours: null, text: LONG });
    S.changche.push({ year: 3, area: '진로활동', hours: null, text: '  열 자 안됨.  ' });
    const recs = buildRecords(S);
    expect(recs.map((r) => r.id)).toEqual(['S1']);
  });
  it('자율적교육과정은 융합(자율과정) 교과군', () => {
    const S = emptyStudent();
    S.seteuk.push({ year: 2, sem: null, names: ['자율적교육과정'], text: LONG });
    const [r] = buildRecords(S);
    expect(r.lane).toBe('융합(자율과정)');
    expect(r.subj).toBe('자율적교육과정');
    expect(r.sem).toBeNull();
    expect(r.t).toBe(2.5);
  });
  it('과목 미확인 세특도 기록으로 만든다(교과군은 교양·기타)', () => {
    const S = emptyStudent();
    S.seteuk.push({ year: 1, sem: 1, names: ['(과목 미확인)'], text: LONG });
    const [r] = buildRecords(S);
    expect(r.subj).toBe('(과목 미확인)');
    expect(r.lane).toBe('교양·기타');
    expect(r.grades).toEqual([]);
  });
  it('여러 과목 세특은 이름을 ·로 잇고 과목마다 성적 칩을 붙인다', () => {
    const S = emptyStudent();
    S.courses.push(course(2, 1, '과학', '물리학Ⅰ', 'A', 1), course(2, 1, '과학', '화학Ⅰ', 'B', 2));
    S.seteuk.push({ year: 2, sem: 1, names: ['물리학Ⅰ', '화학Ⅰ'], text: LONG });
    const [r] = buildRecords(S);
    expect(r.subj).toBe('물리학Ⅰ·화학Ⅰ');
    expect(r.lane).toBe('과학');
    expect(r.grades).toEqual([{ sem: 1, ach: 'A', rank: 1 }, { sem: 1, ach: 'B', rank: 2 }]);
  });
  it('세특에 학기가 없으면 성적표의 학기가 하나뿐일 때 그 학기를 쓰고, 둘이면 비워 두되 두 학기 칩을 모두 붙인다', () => {
    const S = emptyStudent();
    S.courses.push(course(1, 1, '수학', '수학', 'B', 2));
    S.seteuk.push({ year: 1, sem: null, names: ['수학'], text: LONG });
    const [one] = buildRecords(S);
    expect(one.sem).toBe(1);
    expect(one.t).toBe(0);
    expect(one.grades).toEqual([{ sem: 1, ach: 'B', rank: 2 }]);

    const T = emptyStudent();
    T.courses.push(course(1, 2, '수학', '수학', 'A', 1), course(1, 1, '수학', '수학', 'B', 2));
    T.seteuk.push({ year: 1, sem: null, names: ['수학'], text: LONG });
    const [two] = buildRecords(T);
    expect(two.sem).toBeNull();
    expect(two.t).toBe(0.5);
    expect(two.grades).toEqual([{ sem: 1, ach: 'B', rank: 2 }, { sem: 2, ach: 'A', rank: 1 }]);
  });
  it('세특에 학기가 있으면 그 학기 성적만 붙이고, 같은 과목·학기 줄이 겹치면 칩 하나', () => {
    const S = emptyStudent();
    S.courses.push(course(1, 1, '수학', '수학', 'B', 2), course(1, 1, '수학', '수학', 'B', 2), course(1, 2, '수학', '수학', 'A', 1));
    S.seteuk.push({ year: 1, sem: 2, names: ['수학'], text: LONG });
    S.seteuk.push({ year: 1, sem: 1, names: ['수학'], text: LONG });
    const recs = buildRecords(S);
    expect(recs[0].grades).toEqual([{ sem: 2, ach: 'A', rank: 1 }]);
    expect(recs[1].grades).toEqual([{ sem: 1, ach: 'B', rank: 2 }]);
  });
  it('성취도가 A~E·P가 아니면 빈 값, 성취도도 등급도 없으면 칩을 만들지 않는다', () => {
    const S = emptyStudent();
    S.courses.push(course(1, 1, '과학', '통합과학', '-', 3), course(1, 1, '과학', '과학탐구실험', '', null));
    S.seteuk.push({ year: 1, sem: 1, names: ['통합과학'], text: LONG });
    S.seteuk.push({ year: 1, sem: 1, names: ['과학탐구실험'], text: LONG });
    const recs = buildRecords(S);
    expect(recs[0].grades).toEqual([{ sem: 1, ach: '', rank: 3 }]);
    expect(recs[1].grades).toEqual([]);
  });
  it('이수여부(pass)만 있는 교양 과목은 pass를 성취도로 쓴다', () => {
    const S = emptyStudent();
    const c = course(2, 1, '교양', '철학', '', null);
    c.kind = 'liberal';
    c.pass = 'P';
    S.courses.push(c);
    S.seteuk.push({ year: 2, sem: 1, names: ['철학'], text: LONG });
    const [r] = buildRecords(S);
    expect(r.lane).toBe('교양·기타');
    expect(r.grades).toEqual([{ sem: 1, ach: 'P', rank: null }]);
  });
  it('세특 과목명의 영문 I는 성적표의 로마 숫자 Ⅰ와 같은 과목으로 본다', () => {
    const S = emptyStudent();
    S.courses.push(course(2, 1, '영어', '영어Ⅰ', 'A', 2));
    S.seteuk.push({ year: 2, sem: 1, names: ['영어I'], text: LONG });
    const [r] = buildRecords(S);
    expect(r.subj).toBe('영어Ⅰ');
    expect(r.grades).toEqual([{ sem: 1, ach: 'A', rank: 2 }]);
  });
  it('창체 영역 이름이 비어 있으면 자율·자치 줄에 창체라는 이름으로', () => {
    const S = emptyStudent();
    S.changche.push({ year: 1, area: '', hours: null, text: LONG });
    S.changche.push({ year: 1, area: '봉사활동', hours: 10, text: LONG });
    const recs = buildRecords(S);
    expect(recs[0].subj).toBe('창체');
    expect(recs[0].lane).toBe('자율·자치');
    expect(recs[1].subj).toBe('봉사활동');
    expect(recs[1].lane).toBe('자율·자치');
  });
});

/* ───────────────────────── 리뷰 뒤 보강 ───────────────────────── */
describe('buildRecords: 배열이 빠진 작업 파일도 예외 없이 다룬다', () => {
  it('names, courses, changche, seteuk이 없어도 분석 단위를 만든다', () => {
    const S = emptyStudent() as unknown as Record<string, unknown>;
    delete S.courses;
    delete S.changche;
    S.seteuk = [{ year: 1, sem: 1, text: LONG }];
    const recs = buildRecords(S as unknown as StudentRecord);
    expect(recs).toHaveLength(1);
    expect(recs[0].subj).toBe('(과목 미확인)');
    expect(subjectStop(S as unknown as StudentRecord).size).toBe(0);
    delete S.seteuk;
    expect(buildRecords(S as unknown as StudentRecord)).toEqual([]);
  });
  it('창체 제목은 괄호 앞 띄어쓰기를 붙인다', () => {
    const S = emptyStudent();
    S.changche = [{ year: 1, area: '동아리활동 (생명과학탐구반)(34시간)', hours: 34, text: LONG }];
    expect(buildRecords(S)[0].subj).toBe('동아리활동(생명과학탐구반)');
  });
});
