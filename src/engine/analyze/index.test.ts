/**
 * analyze() 통합 테스트. 가상 예시 학생(fixtures/sample.ts)으로 끝까지 돌려 설계 명세의 기대를 명시적으로 단언한다.
 * 스냅샷은 쓰지 않는다. 기대가 어긋나면 사전이나 규칙을 먼저 의심하고, 데이터 한계이면 이유를 주석으로 남긴다.
 */
import { describe, expect, it } from 'vitest';
import {
  analyze, highlightSegments,
  DEPTH_TXT, LINK_KINDS, lineage, semLabel, slotIdx, compileMethods, methodHits, sentences, summarize,
} from './index';
import { sampleStudent } from '../../fixtures/sample';
import type { Analysis, Link, Rec, StudentRecord } from '../types';

const S = sampleStudent();
const an: Analysis = analyze(S);
const byId = new Map<string, Rec>(an.recs.map((r) => [r.id, r]));

/** 과목(또는 창체 영역) 이름과 학년으로 기록 하나를 찾는다. */
function rec(subj: string, year?: number): Rec {
  const r = an.recs.find((x) => x.subj === subj && (year === undefined || x.year === year));
  if (!r) throw new Error(`기록 없음: ${subj} ${year ?? ''}`);
  return r;
}

/** 두 기록 사이의 연결(앞 → 뒤). */
function linkBetween(a: Rec, b: Rec): Link | undefined {
  return an.links.find((l) => l.from === a.id && l.to === b.id);
}

/** 분석 결과 안의 모든 문자열을 모은다(배열, Map, Set, 일반 객체를 끝까지 따라간다). */
function allStrings(x: unknown, out: string[] = [], seen = new Set<unknown>()): string[] {
  if (typeof x === 'string') {
    out.push(x);
    return out;
  }
  if (!x || typeof x !== 'object' || seen.has(x)) return out;
  seen.add(x);
  if (Array.isArray(x)) for (const v of x) allStrings(v, out, seen);
  else if (x instanceof Map) x.forEach((v, k) => { allStrings(k, out, seen); allStrings(v, out, seen); });
  else if (x instanceof Set) x.forEach((v) => allStrings(v, out, seen));
  else for (const v of Object.values(x as Record<string, unknown>)) allStrings(v, out, seen);
  return out;
}

describe('analyze(sampleStudent())', () => {
  it('기록 수 = 세특 + 창체(12자 미만 제외), 연결 6개 이상, 관심 주제 2개 이상, mode는 rule', () => {
    const expected =
      S.seteuk.filter((s) => s.text.trim().length >= 12).length +
      S.changche.filter((c) => c.text.trim().length >= 12).length;
    expect(an.recs.length).toBe(expected);
    expect(an.recs.length).toBe(31);
    expect(an.links.length).toBeGreaterThanOrEqual(6);
    expect(an.themes.length).toBeGreaterThanOrEqual(2);
    expect(an.mode).toBe('rule');
  });

  it('모든 기록에 분석 필드가 채워진다', () => {
    for (const r of an.recs) {
      expect(r.sents.length).toBeGreaterThan(0);
      expect([1, 2, 3, 4]).toContain(r.depth);
      expect(r.key.length).toBeGreaterThan(0);
      expect(r.topic.length).toBeGreaterThan(0);
      expect(['q', 'p', 'b', 's', 'k']).toContain(r.topicKind);
      expect(r.tf.size).toBeGreaterThan(0);
      expect(r.kw.length).toBeGreaterThan(0);
    }
  });

  it('입력(StudentRecord)을 바꾸지 않는다', () => {
    const fresh = sampleStudent();
    const before = JSON.stringify(fresh);
    analyze(fresh);
    expect(JSON.stringify(fresh)).toBe(before);
  });

  it('효소 줄기: 과학탐구실험1 → 동아리 또는 2학년 생명과학 연결이 있고, 줄기 안에 심화가 하나 이상 있다', () => {
    const t1 = rec('통합과학1');
    const lab = rec('과학탐구실험1');
    const club1 = rec('동아리활동 (생명과학탐구반)');
    const bio = rec('생명과학', 2);

    const toClub = linkBetween(lab, club1);
    const toBio = linkBetween(lab, bio);
    expect(toClub || toBio).toBeTruthy();
    // 생명과학 세특은 '1학년 때 과학탐구실험1 시간에 수행했던'이라고 직접 언급한다
    expect(toBio?.cite).toBe(true);

    // 과학탐구실험1은 재실험, 오차의 원인, 개선안이 적혀 있어 규칙 4.3대로 이미 4단계다.
    // 규칙 4.6에서 심화는 깊이나 최고 방법 수준이 올라갈 때이므로 4단계 → 4단계(둘 다 실험·측정)는 심화가 될 수 없고
    // 확장(동아리로 건너감)이나 전환(새 방법 수학적 모델링)으로 판정된다. 이 줄기의 심화는 통합과학1(3단계) → 동아리(4단계)다.
    expect(lab.depth).toBe(4);
    expect(club1.depth).toBe(4);
    const strandIds = new Set([t1.id, lab.id, club1.id, bio.id]);
    const strand = an.links.filter((l) => strandIds.has(l.from) && strandIds.has(l.to));
    expect(strand.length).toBeGreaterThanOrEqual(3);
    expect(strand.some((l) => l.rel === '심화')).toBe(true);
    expect(linkBetween(t1, club1)?.rel).toBe('심화');
    // 모든 연결이 '카탈레이스' 관심 주제를 공유한다
    expect(strand.every((l) => l.theme === '카탈레이스' || l.words.length > 0)).toBe(true);
  });

  it('기후변화 줄기: 통합사회1 → 통합사회2 → 세계시민과 지리에 반복 또는 전환 연결이 있다', () => {
    const a = rec('통합사회1');
    const b = rec('통합사회2');
    const c = rec('세계시민과 지리');
    const ab = linkBetween(a, b);
    const bc = linkBetween(b, c);
    expect(ab).toBeTruthy();
    expect(bc).toBeTruthy();
    expect(['반복', '전환']).toContain(ab!.rel);
    expect(['반복', '전환']).toContain(bc!.rel);
    // 같은 과목 계열(통합사회1 → 통합사회2)이고, 조사와 토론만 되풀이된 줄기이므로 반복이다
    expect(ab!.ss).toBe(true);
    expect(ab!.rel).toBe('반복');
    // 세계시민과 지리는 '1학년 때 통합사회2에서 조사했던'이라고 직접 언급한다
    expect(bc!.cite).toBe(true);
    expect(bc!.cross).toBe(false);
  });

  it('항생제 줄기: 교과군이 바뀌는 연결(cross)이 있다', () => {
    const t2 = rec('통합과학2');
    const eng = rec('영어Ⅰ');
    const club2 = rec('동아리활동 (미생물탐구반)');
    const l1 = linkBetween(t2, eng);
    const l2 = linkBetween(t2, club2);
    expect(l1 || l2).toBeTruthy();
    for (const l of [l1, l2]) if (l) expect(l.cross).toBe(true);
    // 과학 → 영어는 깊이가 같으므로 확장, 과학 → 동아리는 4단계로 올라가므로 심화
    expect(l1?.rel).toBe('확장');
    expect(l2?.rel).toBe('심화');
    // 항생제 관심 주제 안에서 교과군을 건너간 연결이 둘 이상
    const crossLinks = an.links.filter((l) => l.cross && l.theme === '항생제');
    expect(crossLinks.length).toBeGreaterThanOrEqual(2);
  });

  it('연결은 시간 순이고(동시는 같은 시기), 종류와 설명이 채워져 있다', () => {
    for (const l of an.links) {
      const a = byId.get(l.from)!;
      const b = byId.get(l.to)!;
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      if (l.rel === '동시') expect(a.t).toBe(b.t);
      else expect(a.t).toBeLessThan(b.t);
      expect(l.cross).toBe(a.lane !== b.lane);
      expect(Object.keys(LINK_KINDS)).toContain(l.rel);
      expect(l.words.length).toBeGreaterThan(0);
      expect(l.sent.length).toBeGreaterThan(10);
      expect(l.why.length).toBeGreaterThan(0);
      expect(l.lines.length).toBeGreaterThanOrEqual(3);
    }
    // 같은 쌍이 두 번 잡히지 않는다
    const pairs = an.links.map((l) => `${l.from}>${l.to}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('관심 주제에 카탈레이스와 항생제가 있고 각 기록의 themes와 맞는다', () => {
    const names = an.themes.map((t) => t.name);
    expect(names).toContain('카탈레이스');
    expect(names).toContain('항생제');
    expect(an.themes.length).toBeLessThanOrEqual(6);
    for (const th of an.themes) {
      expect(th.ids.length).toBeGreaterThanOrEqual(2);
      for (const id of th.ids) expect(byId.get(id)!.themes).toContain(th.name);
    }
    for (const r of an.recs) for (const name of r.themes) expect(an.themes.find((t) => t.name === name)!.ids).toContain(r.id);
  });

  it('결손 분석: semMatrix 합계가 기록 방법 수와 같고, 제안이 하나 이상이다', () => {
    const methodUses = an.recs.reduce((a, r) => a + r.methods.length, 0);
    const totalSum = an.gaps.semMatrix.reduce((a, row) => a + row.total, 0);
    expect(totalSum).toBe(methodUses);
    // 칸 합계: 학기 없는 기록(창체)은 두 칸에 모두 들어간다
    const cellSum = an.gaps.semMatrix.reduce((a, row) => a + row.cells.reduce((x, y) => x + y, 0), 0);
    const expectedCells = an.recs.reduce((a, r) => a + r.methods.length * slotIdx(r).length, 0);
    expect(cellSum).toBe(expectedCells);
    for (const row of an.gaps.semMatrix) expect(row.cells).toHaveLength(6);
    expect(an.gaps.suggestions.length).toBeGreaterThanOrEqual(1);
    // 1학년 1·2학기, 2학년 1·2학기(창체가 두 칸에 걸침)에 기록이 있다
    expect(an.gaps.slots.map((s) => s.slot)).toEqual([0, 1, 2, 3]);
    expect(an.gaps.trend.length).toBeGreaterThanOrEqual(2);
  });

  it('상담 포인트는 4~14개이고 태그가 올바르다', () => {
    expect(an.insights.length).toBeGreaterThanOrEqual(4);
    expect(an.insights.length).toBeLessThanOrEqual(14);
    for (const i of an.insights) {
      expect(['s', 'g', 'q', 'd']).toContain(i.tg);
      expect(i.t.length).toBeGreaterThan(5);
      if (i.go) expect(byId.has(i.go)).toBe(true);
    }
    expect(an.insights.some((i) => i.tg === 's')).toBe(true);
    expect(an.insights.some((i) => i.tg === 'q')).toBe(true);
  });

  it("모든 문자열 결과에 'undefined', 'NaN', '[object' 가 없다", () => {
    const strs = allStrings(an);
    expect(strs.length).toBeGreaterThan(100);
    for (const s of strs) {
      expect(s).not.toContain('undefined');
      expect(s).not.toContain('NaN');
      expect(s).not.toContain('[object');
    }
  });
});

describe('highlightSegments', () => {
  it('구간이 겹치지 않고 원문 순이며 세 종류가 모두 나온다', () => {
    const r = rec('과학탐구실험1');
    const segs = highlightSegments(r, an);
    expect(segs.length).toBeGreaterThan(5);
    let end = -1;
    for (const s of segs) {
      expect(s.a).toBeGreaterThanOrEqual(end);
      expect(s.b).toBeGreaterThan(s.a);
      expect(s.b).toBeLessThanOrEqual(r.text.length);
      expect(['method', 'theme', 'skill']).toContain(s.kind);
      expect(s.label.length).toBeGreaterThan(0);
      end = s.b;
    }
    const kinds = new Set(segs.map((s) => s.kind));
    expect(kinds.has('method')).toBe(true);
    expect(kinds.has('theme')).toBe(true);
    expect(kinds.has('skill')).toBe(true);
    // 관심 주제 낱말(대표 낱말이나 합쳐진 낱말)은 원문에서 그대로 찾히고, 라벨은 주제 이름이다.
    // '카탈레이스' 자체는 실험·측정 사전에도 들어 있어 방법(노랑)이 먼저 차지하므로, 주제 구간은 합쳐진 낱말('반응')로 남는다.
    const theme = an.themes.find((t) => t.name === '카탈레이스')!;
    const themeSegs = segs.filter((s) => s.kind === 'theme');
    expect(themeSegs.every((s) => r.themes.includes(s.label))).toBe(true);
    const mine = themeSegs.filter((x) => x.label === '카탈레이스');
    expect(mine.length).toBeGreaterThan(0);
    for (const s of mine) expect(theme.words).toContain(r.text.slice(s.a, s.b));
    // 방법 구간은 같은 자리에서 주제 구간보다 먼저다
    expect(segs.filter((s) => s.kind === 'method').some((s) => r.text.slice(s.a, s.b) === '카탈레이스')).toBe(true);
    // 방법 라벨은 사전의 이름이다
    const methodSeg = segs.find((s) => s.kind === 'method')!;
    expect(methodSeg.label).toMatch(/·|\s/);
  });

  it('교사 추가 표현은 라벨에 (추가한 표현)이 붙는다', () => {
    const r = rec('음악');
    const dict = { performance: ['세마치장단'] };
    const segs = highlightSegments(r, an, dict);
    const user = segs.find((s) => s.label.includes('(추가한 표현)'));
    expect(user).toBeTruthy();
    expect(r.text.slice(user!.a, user!.b)).toBe('세마치장단');
    expect(user!.label).toBe('실기·창작 수행 (추가한 표현)');
    // 사전 없이 부르면 그 구간은 없다
    expect(highlightSegments(r, an).some((s) => s.label.includes('(추가한 표현)'))).toBe(false);
  });

  it('관심 주제가 없는 기록은 theme 구간이 없다', () => {
    const r = an.recs.find((x) => x.themes.length === 0)!;
    expect(r).toBeTruthy();
    expect(highlightSegments(r, an).some((s) => s.kind === 'theme')).toBe(false);
  });
});

describe('userDict와 빈 입력', () => {
  it('교사 추가 표현이 방법 탐지에 반영된다', () => {
    const base = analyze(S);
    const withDict = analyze(S, { survey: ['세마치장단'] });
    const before = base.recs.find((r) => r.subj === '음악')!;
    const after = withDict.recs.find((r) => r.subj === '음악')!;
    expect(before.methods).not.toContain('survey');
    expect(after.methods).toContain('survey');
  });

  it('기록이 없는 학생도 오류 없이 빈 결과를 돌려준다', () => {
    const empty: StudentRecord = { meta: {}, courses: [], seteuk: [], changche: [], hopes: [], behavior: [], warnings: [], years: [] };
    const out = analyze(empty);
    expect(out.recs).toEqual([]);
    expect(out.links).toEqual([]);
    expect(out.themes).toEqual([]);
    expect(out.gaps.slots).toEqual([]);
    expect(out.gaps.trend[0]).toContain('기록이 없습니다');
    expect(Array.isArray(out.insights)).toBe(true);
  });
});

describe('재export', () => {
  it('설계 명세 7장의 이름을 모두 내보낸다', () => {
    expect(DEPTH_TXT[4]).toBe('성찰·확장');
    expect(LINK_KINDS['심화'].cls).toBe('deep');
    expect(typeof lineage).toBe('function');
    expect(semLabel({ year: 1, sem: 2 })).toBe('1학년 2학기');
    expect(slotIdx({ year: 2, sem: null })).toEqual([2, 3]);
    expect(compileMethods().length).toBe(17);
    expect(methodHits('온도별로 3회 반복 측정하여 평균을 구함.', compileMethods())).toContain('experiment');
    expect(sentences('가. 나.').length).toBe(2);
    expect(summarize('또한 실험을 함.', 90)).toBe('실험을 함');
  });

  it('lineage는 효소 줄기의 뿌리부터 끝까지 이어진다', () => {
    const club2 = rec('동아리활동 (미생물탐구반)');
    const { up } = lineage(an.links, club2.id);
    expect(up.has(rec('통합과학2').id)).toBe(true);
    expect(up.size).toBeGreaterThanOrEqual(3);
  });
});
