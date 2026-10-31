import { describe, expect, it } from 'vitest';
import type { StudentRecord } from '../engine/types';
import { SAMPLE_NAME, sampleStudent } from './sample';

const nos = (s: string) => s.replace(/\s+/g, '');

/** 세특, 창체, 행발 본문을 모두 모은다. */
function allTexts(S: StudentRecord): string[] {
  return [...S.seteuk.map((x) => x.text), ...S.changche.map((x) => x.text), ...S.behavior.map((x) => x.text)];
}

/** 세특과 창체 기록(계보도의 단위) 가운데 낱말이 들어 있는 기록 수 */
function recordsWith(S: StudentRecord, word: string): number {
  return [...S.seteuk, ...S.changche].filter((x) => x.text.includes(word)).length;
}

/** 마침표 뒤 공백을 기준으로 문장을 나눈다(엔진의 sentences와 같은 기준은 아니지만 종결 검사에는 충분). */
function sentencesOf(text: string): string[] {
  return text.split(/(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean);
}

/** 마지막 글자가 ㅁ 받침 한글인지(…함, …보임, …제안함, …냄 같은 명사형 종결) */
function endsWithMieum(sentence: string): boolean {
  const body = sentence.replace(/[.!?]$/, '');
  const ch = body.charCodeAt(body.length - 1);
  return ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 === 16;
}

describe('sampleStudent 기본 구조', () => {
  const S = sampleStudent();

  it('메타 정보: 2025년 입학, 5등급제, 2022 개정, 가상 예시', () => {
    expect(S.meta).toEqual({ name: SAMPLE_NAME, entry: 2025, scale: 5, curriculum: 2022, sample: true, source: 'sample' });
    expect(SAMPLE_NAME).toBe('이도윤');
    expect(S.years).toEqual([1, 2]);
    expect(S.warnings).toEqual([]);
  });

  it('진로 희망 2개(1학년 생명과학 연구원, 2학년 미생물학 연구원)', () => {
    expect(S.hopes).toHaveLength(2);
    expect(S.hopes[0]).toEqual({ year: 1, text: '생명과학 연구원' });
    expect(S.hopes[1]).toEqual({ year: 2, text: '미생물학 연구원' });
  });

  it('호출마다 새 객체를 돌려준다(한쪽을 고쳐도 다른 쪽에 번지지 않음)', () => {
    const a = sampleStudent();
    const b = sampleStudent();
    expect(a).not.toBe(b);
    expect(a.seteuk).not.toBe(b.seteuk);
    expect(a.hopes[0]).not.toBe(b.hopes[0]);
    a.seteuk[0].text = '바뀐 본문.';
    a.hopes[0].text = '바뀐 희망';
    a.courses.pop();
    expect(b.seteuk[0].text).not.toBe('바뀐 본문.');
    expect(b.hopes[0].text).toBe('생명과학 연구원');
    expect(b.courses.length).toBe(a.courses.length + 1);
  });
});

describe('성적표(courses)', () => {
  const S = sampleStudent();

  it('1학년 1·2학기와 2학년 1학기 성적이 있고 2학년 2학기는 없다', () => {
    const slots = new Set(S.courses.map((c) => `${c.year}-${c.sem}`));
    expect(slots).toEqual(new Set(['1-1', '1-2', '2-1']));
  });

  it('과목 이름이 겹치지 않는다', () => {
    const names = S.courses.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('요구된 과목이 모두 들어 있다', () => {
    const names = new Set(S.courses.map((c) => nos(c.name)));
    for (const n of [
      '공통국어1', '공통국어2', '공통수학1', '공통수학2', '공통영어1', '공통영어2', '한국사1', '한국사2',
      '통합사회1', '통합사회2', '통합과학1', '통합과학2', '과학탐구실험1', '과학탐구실험2', '정보', '기술·가정',
      '체육1', '음악', '미술', '문학', '대수', '영어Ⅰ', '생명과학', '화학', '세계시민과지리',
    ]) {
      expect(names.has(n), `과목 ${n}`).toBe(true);
    }
  });

  it('과학탐구실험은 성취도 P, 원점수와 석차등급 없음', () => {
    const labs = S.courses.filter((c) => c.name.startsWith('과학탐구실험'));
    expect(labs).toHaveLength(2);
    for (const c of labs) {
      expect(c.ach).toBe('P');
      expect(c.rank).toBeNull();
      expect(c.raw).toBeNull();
      expect(c.kind).toBe('main');
    }
  });

  it('일반 과목은 원점수, 평균, 표준편차, 성취도 A~E, 1~5등급, 분포 문자열을 모두 갖는다', () => {
    const mains = S.courses.filter((c) => c.kind === 'main' && c.ach !== 'P');
    expect(mains.length).toBeGreaterThanOrEqual(18);
    for (const c of mains) {
      expect(c.raw, c.name).not.toBeNull();
      expect(c.avg, c.name).not.toBeNull();
      expect(c.sd, c.name).not.toBeNull();
      expect(c.n, c.name).not.toBeNull();
      expect(c.ach, c.name).toMatch(/^[A-E]$/);
      expect(c.rank, c.name).toBeGreaterThanOrEqual(1);
      expect(c.rank, c.name).toBeLessThanOrEqual(5);
      expect(c.dist, c.name).toMatch(/^A\(\d+(\.\d)?\) B\(\d+(\.\d)?\) C\(\d+(\.\d)?\) D\(\d+(\.\d)?\) E\(\d+(\.\d)?\)$/);
      // 원점수와 성취도가 맞물린다(90 이상 A, 80 이상 B …)
      const expected = c.raw! >= 90 ? 'A' : c.raw! >= 80 ? 'B' : c.raw! >= 70 ? 'C' : c.raw! >= 60 ? 'D' : 'E';
      expect(c.ach, `${c.name} 원점수 ${c.raw}`).toBe(expected);
      expect(c.raw!, c.name).toBeGreaterThan(c.avg!);
    }
  });

  it('성취도 분포 비율의 합은 100에 가깝다', () => {
    for (const c of S.courses.filter((x) => x.dist)) {
      const sum = [...c.dist.matchAll(/\(([\d.]+)\)/g)].reduce((a, m) => a + parseFloat(m[1]), 0);
      expect(Math.abs(sum - 100), `${c.name} ${c.dist}`).toBeLessThan(0.2);
    }
  });

  it('과학은 1~2등급, 나머지 일반 과목은 2~3등급', () => {
    for (const c of S.courses.filter((x) => x.kind === 'main' && x.rank !== null)) {
      if (c.group === '과학') expect(c.rank, c.name).toBeLessThanOrEqual(2);
      else {
        expect(c.rank, c.name).toBeGreaterThanOrEqual(2);
        expect(c.rank, c.name).toBeLessThanOrEqual(3);
      }
    }
  });

  it('체육·예술 과목은 kind art이고 성취도만 있다', () => {
    const arts = S.courses.filter((c) => c.kind === 'art');
    expect(arts.map((c) => c.name).sort()).toEqual(['미술', '음악', '체육1']);
    for (const c of arts) {
      expect(c.ach).toMatch(/^[A-C]$/);
      expect(c.rank).toBeNull();
      expect(c.raw).toBeNull();
    }
  });

  it('교과 이름은 NEIS 표기를 따른다', () => {
    const groups = new Set(S.courses.map((c) => c.group));
    expect(groups).toEqual(new Set(['국어', '수학', '영어', '사회(역사/도덕 포함)', '과학', '기술·가정/정보', '체육', '예술']));
  });
});

describe('세부능력 및 특기사항(seteuk)', () => {
  const S = sampleStudent();

  it('18개 이상이며 모든 본문이 300자 이상 700자 이하', () => {
    expect(S.seteuk.length).toBeGreaterThanOrEqual(18);
    for (const x of S.seteuk) {
      expect(x.text.length, x.names.join('·')).toBeGreaterThanOrEqual(300);
      expect(x.text.length, x.names.join('·')).toBeLessThanOrEqual(700);
    }
  });

  it('과목명은 공백을 뺀 형태이고 모두 성적표에 있다(자율적교육과정 제외)', () => {
    const names = new Set(S.courses.map((c) => nos(c.name)));
    for (const x of S.seteuk) {
      expect(x.names.length).toBeGreaterThan(0);
      for (const n of x.names) {
        if (n === '자율적교육과정') continue;
        expect(n).toBe(nos(n));
        expect(names.has(n), `세특 과목 ${n}`).toBe(true);
      }
    }
  });

  it('성적표의 모든 과목에 세특이 하나씩 있다', () => {
    const covered = new Set(S.seteuk.flatMap((x) => x.names));
    for (const c of S.courses) expect(covered.has(nos(c.name)), `과목 ${c.name}의 세특`).toBe(true);
    expect(new Set(S.seteuk.map((x) => x.names.join('·'))).size).toBe(S.seteuk.length);
  });

  it('학기(sem)는 과목의 학기와 같다(2022 개정)', () => {
    const bySubj = new Map(S.courses.map((c) => [nos(c.name), c]));
    for (const x of S.seteuk) {
      expect(x.sem, x.names.join('·')).not.toBeNull();
      for (const n of x.names) {
        const c = bySubj.get(n)!;
        expect(x.year, n).toBe(c.year);
        expect(x.sem, n).toBe(c.sem);
      }
    }
  });
});

describe('창의적 체험활동(changche)과 행발', () => {
  const S = sampleStudent();

  it('학년마다 자율·자치, 동아리, 진로 3건씩 총 6건', () => {
    expect(S.changche).toHaveLength(6);
    for (const year of [1, 2] as const) {
      const areas = S.changche.filter((x) => x.year === year).map((x) => x.area);
      expect(areas.some((a) => a.startsWith('자율·자치활동')), `${year}학년 자율`).toBe(true);
      expect(areas.some((a) => a.startsWith('동아리활동')), `${year}학년 동아리`).toBe(true);
      expect(areas.some((a) => a.startsWith('진로활동')), `${year}학년 진로`).toBe(true);
    }
  });

  it('동아리 영역은 "동아리활동 (이름)(시간)" 형식이고 시간은 숫자', () => {
    const clubs = S.changche.filter((x) => x.area.startsWith('동아리활동'));
    expect(clubs).toHaveLength(2);
    for (const x of clubs) {
      const m = x.area.match(/^동아리활동 \((.+)\)\((\d+)시간\)$/);
      expect(m, x.area).not.toBeNull();
      expect(x.hours).toBe(Number(m![2]));
    }
    expect(clubs[0].area).toContain('생명과학탐구반');
    expect(clubs[1].area).toContain('미생물탐구반');
    for (const x of S.changche) expect(typeof x.hours).toBe('number');
  });

  it('1학년 창체는 450자 이상, 2학년 창체는 1학기 분량으로 500자 이하, 모두 300자 이상', () => {
    for (const x of S.changche) {
      expect(x.text.length, x.area).toBeGreaterThanOrEqual(300);
      if (x.year === 1) expect(x.text.length, x.area).toBeGreaterThanOrEqual(450);
      else expect(x.text.length, x.area).toBeLessThanOrEqual(500);
    }
  });

  it('행동특성 및 종합의견은 1학년 1건, 250~400자', () => {
    expect(S.behavior).toHaveLength(1);
    expect(S.behavior[0].year).toBe(1);
    expect(S.behavior[0].text.length).toBeGreaterThanOrEqual(250);
    expect(S.behavior[0].text.length).toBeLessThanOrEqual(400);
  });
});

describe('본문 서술 규칙', () => {
  const S = sampleStudent();
  const texts = allTexts(S);

  it('학생 이름이 어느 본문에도 나오지 않는다', () => {
    for (const t of texts) expect(t).not.toContain(SAMPLE_NAME);
  });

  it('모든 문장이 교사 관찰 시점의 명사형 종결(…함, …보임)로 끝난다', () => {
    for (const t of texts) {
      for (const sent of sentencesOf(t)) {
        expect(sent.endsWith('.'), sent).toBe(true);
        expect(endsWithMieum(sent), sent).toBe(true);
      }
    }
  });

  it('엠 대시가 없고 본문 속 소수점(문장 분리를 깨뜨림)도 없다', () => {
    for (const t of texts) {
      expect(t).not.toMatch(/[—–]/);
      expect(t).not.toMatch(/\d\.\d/);
    }
  });
});

describe('의도한 탐구 줄기가 낱말을 공유한다', () => {
  const S = sampleStudent();

  it('효소 줄기: 카탈레이스가 3개 이상 기록에, 과산화수소도 3개 이상 기록에 나온다', () => {
    expect(recordsWith(S, '카탈레이스')).toBeGreaterThanOrEqual(3);
    expect(recordsWith(S, '과산화수소')).toBeGreaterThanOrEqual(3);
    const t = (name: string) => S.seteuk.find((x) => x.names.includes(name))!.text;
    expect(t('통합과학1')).toContain('카탈레이스');
    expect(t('과학탐구실험1')).toContain('변인');
    expect(t('생명과학')).toContain('저해제');
    expect(t('생명과학')).toMatch(/1학년 때 과학탐구실험1/);
    expect(t('대수')).toContain('과산화수소');
  });

  it('미생물·항생제 줄기: 항생제가 3개 이상 기록에, 배지와 억제대는 2학년 동아리에 나온다', () => {
    expect(recordsWith(S, '항생제')).toBeGreaterThanOrEqual(3);
    expect(recordsWith(S, '내성')).toBeGreaterThanOrEqual(3);
    const club2 = S.changche.find((x) => x.year === 2 && x.area.startsWith('동아리활동'))!;
    expect(club2.text).toContain('배지');
    expect(club2.text).toContain('억제대');
    expect(club2.text).toContain('대조군');
    const chem = S.seteuk.find((x) => x.names.includes('화학'))!;
    expect(chem.text).toContain('에탄올');
    expect(chem.text).toContain('70%');
  });

  it('반복 줄기: 기후변화가 통합사회1, 통합사회2, 세계시민과 지리에 모두 나온다', () => {
    for (const n of ['통합사회1', '통합사회2', '세계시민과지리']) {
      expect(S.seteuk.find((x) => x.names.includes(n))!.text, n).toContain('기후변화');
    }
  });

  it('과학 오개념 방지용 핵심 서술이 들어 있다', () => {
    const t = (name: string) => S.seteuk.find((x) => x.names.includes(name))!.text;
    expect(t('통합과학1')).toContain('물과 산소로 분해');
    expect(t('과학탐구실험1')).toContain('변성');
    expect(t('통합과학2')).toContain('선택');
    expect(t('생명과학')).toContain('포화');
    expect(t('과학탐구실험2')).toContain('반응성');
  });
});
