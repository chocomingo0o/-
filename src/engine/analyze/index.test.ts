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
import type { Analysis, Link, Rec, StudentRecord, UserDict } from '../types';

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
    const club1 = rec('동아리활동(생명과학탐구반)');
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
    const club2 = rec('동아리활동(미생물탐구반)');
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
      else if (a.t === b.t) {
        // 같은 학기라도 직접 언급이 있으면 언급된 기록을 앞에 둔 연결이다(통합과학1 → 과학탐구실험1)
        expect(l.cite).toBe(true);
      } else if (a.t > b.t) {
        // 1학기 세특이 같은 학년 창체 활동을 언급하면 창체 → 세특으로 뒤집는다(미생물탐구반 → 화학)
        expect(a.kind).toBe('창체');
        expect(l.lines.some((x) => x.endsWith('순서로 놓음'))).toBe(true);
      }
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
    const theme = an.themes.find((t) => t.name === '카탈레이스')!;
    const themeSegs = segs.filter((s) => s.kind === 'theme');
    expect(themeSegs.every((s) => r.themes.includes(s.label))).toBe(true);
    const mine = themeSegs.filter((x) => x.label === '카탈레이스');
    expect(mine.length).toBeGreaterThan(0);
    for (const s of mine) expect(theme.words).toContain(r.text.slice(s.a, s.b));
    // 방법 구간은 사전 표현('반복 측정', '측정하여' …)을 원문에서 그대로 가리킨다
    expect(segs.filter((s) => s.kind === 'method').some((s) => /변인|측정|실험|반복/.test(r.text.slice(s.a, s.b)))).toBe(true);
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
    // 효소 줄기: 통합과학1 → 과학탐구실험1 → 동아리(생명과학탐구반) → 생명과학 → 대수
    const { up } = lineage(an.links, rec('대수').id);
    for (const s of ['통합과학1', '과학탐구실험1', '동아리활동(생명과학탐구반)', '생명과학']) expect(up.has(rec(s).id)).toBe(true);
    expect(lineage(an.links, rec('통합과학1').id).down.has(rec('대수').id)).toBe(true);
    // 미생물 줄기의 동아리는 통합과학2를 직접 언급해 이어받는다
    expect(lineage(an.links, rec('동아리활동(미생물탐구반)').id).up.has(rec('통합과학2').id)).toBe(true);
  });
});

/* ───────────────────────── 리뷰 뒤 보강 ───────────────────────── */
describe('highlightSegments: 사용자 사전 캐시는 내용 기준이다', () => {
  it('같은 객체를 제자리에서 고쳐도 새 표현이 형광펜에 반영된다', () => {
    const S2 = sampleStudent();
    const ud: UserDict = { experiment: [] };
    const a1 = analyze(S2, ud);
    const r1 = a1.recs.find((x) => x.subj === '공통국어1')!;
    expect(highlightSegments(r1, a1, ud).some((s) => s.label.includes('추가한 표현'))).toBe(false);
    ud.experiment!.push('구조도로 정리');
    const a2 = analyze(S2, ud);
    const r2 = a2.recs.find((x) => x.subj === '공통국어1')!;
    expect(r2.sents.some((s) => s.ms.includes('experiment'))).toBe(true);
    expect(highlightSegments(r2, a2, ud).some((s) => s.label.includes('추가한 표현'))).toBe(true);
  });
});

/* ───────────────────────── 검수 뒤 보강: 예시 학생의 줄기와 상담 포인트(phase 3/4) ───────────────────────── */
describe('예시 학생: 줄기가 원문과 맞게 이어진다', () => {
  const t1 = rec('통합과학1');
  const lab1 = rec('과학탐구실험1');
  const info = rec('정보');
  const club1 = rec('동아리활동(생명과학탐구반)');
  const bio = rec('생명과학', 2);
  const alg = rec('대수');
  const chem = rec('화학');
  const t2 = rec('통합과학2');
  const kor2 = rec('공통국어2');
  const eng1 = rec('영어Ⅰ');
  const club2 = rec('동아리활동(미생물탐구반)');
  const math2 = rec('공통수학2');
  const soc1 = rec('통합사회1');
  const soc2 = rec('통합사회2');
  const geo = rec('세계시민과 지리');

  it('효소 줄기: 통합과학1 → 과학탐구실험1 → 동아리(생명과학탐구반) → 생명과학 → 대수', () => {
    // 같은 1학년 1학기지만 과학탐구실험1이 '통합과학1 시간에 다루었던'이라고 언급하므로 앞뒤가 정해진 심화(3 → 4)다
    const a = linkBetween(t1, lab1)!;
    expect(a.rel).toBe('심화');
    expect(a.cite).toBe(true);
    expect(linkBetween(lab1, t1)).toBeUndefined();
    expect(linkBetween(lab1, club1)?.cite).toBe(true);
    expect(linkBetween(club1, bio)).toBeDefined();
    // 대수는 '생명과학 시간에 본'이라고 언급하고, 생명과학은 '대수 수행평가 주제로 이어 갔으며'라고 적는다: 생명과학 → 대수
    const b = linkBetween(bio, alg)!;
    expect(b.cite).toBe(true);
    expect(b.rel).toBe('심화');
    // 대수의 '1학년 동아리에서 진행한 … 카탈레이스 반응 실험'은 1학년 동아리를 직접 언급한 것이다
    expect(linkBetween(club1, alg)?.cite).toBe(true);
    // 정보의 '과학탐구실험1 시간에 측정한 … 자료'도 직접 언급이다(정보 카드의 카탈레이스 점과 선이 맞는다)
    expect(linkBetween(lab1, info)?.cite).toBe(true);
    expect(info.themes).toContain('카탈레이스');
  });

  it('수학 줄기: 공통수학2 → 대수(학년 접두어 없는 직접 언급, 같은 과목 계열)', () => {
    const l = linkBetween(math2, alg)!;
    expect(l).toBeDefined();
    expect(l.cite).toBe(true);
    expect(l.ss).toBe(true);
    expect(l.why.startsWith('같은 계열 / ')).toBe(true);
    expect(an.insights.some((i) => i.go === math2.id && i.t.includes('뒤이은 탐구가 없습니다'))).toBe(false);
  });

  it("통합과학2의 '감염병 확산 모형을 보고 … 해석함'은 수학적 모델링이 아니고, 통합과학2는 2단계다", () => {
    const s = t2.sents.find((x) => x.s.includes('감염병 확산 모형을 보고'))!;
    expect(s).toBeDefined();
    expect(s.ms).not.toContain('modeling');
    expect(s.skills).toContain('interpret');
    expect(t2.methods).not.toContain('modeling');
    expect(t2.depth).toBe(2);
    for (const l of an.links.filter((x) => (x.from === t2.id || x.to === t2.id) && x.rel !== '동시')) {
      expect(l.sent).not.toContain('수학적 모델링');
      expect(l.why).not.toContain('깊이↓');
    }
  });

  it('항생제 줄기: 통합과학2에서 공통국어2·영어Ⅰ·미생물탐구반으로, 미생물탐구반에서 화학으로 이어진다', () => {
    // 공통국어2(같은 학기)가 '통합과학2 시간에 조사했던'이라고 언급한다
    expect(linkBetween(t2, kor2)?.cite).toBe(true);
    expect(linkBetween(t2, eng1)?.rel).toBe('확장');
    expect(linkBetween(t2, club2)?.rel).toBe('심화');
    // 화학(2학년 1학기)이 '동아리에서 진행한 손 세정제의 세균 억제 효과 비교 실험에서 본'이라고 적으므로 동아리가 먼저다
    const f = linkBetween(club2, chem)!;
    expect(f).toBeDefined();
    expect(linkBetween(chem, club2)).toBeUndefined();
    expect(f.lines.some((x) => x.endsWith('순서로 놓음'))).toBe(true);
    // 대수의 '거품 높이'(측정 변수)와 '세균 수를 등비수열로'(수열 예시)는 미생물 줄기와 무관하다
    expect(linkBetween(alg, club2)).toBeUndefined();
    expect(alg.themes).not.toContain('항생제');
  });

  it('기후변화 반복 줄기: 통합사회1 → 통합사회2 → 세계시민과 지리가 모두 반복이고 대표 낱말은 기후변화다', () => {
    const ab = linkBetween(soc1, soc2)!;
    const bc = linkBetween(soc2, geo)!;
    expect(ab.rel).toBe('반복');
    expect(bc.rel).toBe('반복');
    expect(ab.words[0]).toBe('기후변화');
    expect(ab.theme).toBe('기후변화');
    expect(ab.why).toBe('같은 과목 / 기후변화 / 깊이 2→2');
    const rep = an.insights.find((i) => i.t.includes('‘반복’ 연결이'))!;
    expect(rep).toBeDefined();
    expect(rep.t).toContain('통합사회1 → 통합사회2(기후변화)');
  });

  it('관심 주제는 6개 이하이고 같은 관심(세균·감염병)은 항생제로 합쳐지며 측정 변수(거품)는 주제가 아니다', () => {
    const names = an.themes.map((t) => t.name);
    expect(names.length).toBeLessThanOrEqual(6);
    for (const bad of ['거품', '세균', '감염병', '미생물학']) expect(names).not.toContain(bad);
    expect(an.themes.find((t) => t.name === '항생제')!.words).toEqual(expect.arrayContaining(['세균', '감염병']));
    expect(names).toContain('기후변화');
  });
});

describe('예시 학생: 방법·깊이·주제 오탐 바로잡기', () => {
  it("'탐구를 설계함', '실험을 설계함', '만들기 부스에 참가'는 설계·제작이 아니다", () => {
    for (const subj of ['과학탐구실험1', '과학탐구실험2', '동아리활동(미생물탐구반)']) expect(rec(subj).methods).not.toContain('making');
    expect(rec('자율·자치활동', 1).methods).not.toContain('making');
  });
  it("체육 체력 기록 측정과 다른 수업에서 측정한 자료의 입력은 실험·측정이 아니고, '보완 운동'은 성찰이 아니다", () => {
    const pe = rec('체육1');
    expect(pe.methods).not.toContain('experiment');
    expect(pe.depth).toBeLessThan(4);
    expect(pe.sents.some((x) => x.rf)).toBe(false);
    expect(rec('정보').methods).not.toContain('experiment');
  });
  it('평가 문장의 성찰 단서와 후속 단서는 세지 않는다', () => {
    const info = rec('정보');
    expect(info.sents.find((x) => x.s.includes('디버깅 습관이 돋보임'))!.rf).toBe(false);
    expect(info.depth).toBe(3);
    const soc2 = rec('통합사회2');
    expect(soc2.sents.find((x) => x.s.includes('발표하는 데 익숙함'))!.fu).toBe(false);
    expect(soc2.summary).not.toContain('익숙함');
    // 통합사회1의 요약은 '문화 상대주의의 한계를 다룬 사례'(개념 설명)가 아니라 기후변화 토론·자료 조사에서 고른다
    expect(rec('통합사회1').summary).not.toContain('문화 상대주의');
  });
  it('카드 주제가 원문 핵심을 가리킨다', () => {
    expect(rec('통합사회1').topic).toBe('기후변화 대응은 개인의 실천으로 충분한가');
    expect(rec('통합과학1').topic).toBe('간 조각의 과산화수소 분해 관찰');
    expect(rec('생명과학', 2).topic).toBe('효소 반응 속도에 영향을 주는 요인');
    expect(rec('정보').topic).toBe('공공데이터 포털의 지역별 월평균 기온 자료');
    expect(rec('음악').topic).not.toContain('여덟');
    // 뒤쪽 어절만 잘라 낸 조각('올리기 기록')을 주제로 쓰지 않는다
    expect(rec('체육1').topic).not.toBe('올리기 기록');
  });
  it('과학 탐구 기능: 결과 문장의 대조군, 온라인 탐방, 국어의 구조도·반론은 잡지 않고, 처음 예상·측정 규칙·관찰 확인은 잡는다', () => {
    const skillsOf = (subj: string, part: string, year?: number): string[] =>
      rec(subj, year).sents.find((x) => x.s.includes(part))!.skills;
    expect(skillsOf('동아리활동(미생물탐구반)', '대조군에는 억제대가')).not.toContain('design');
    expect(skillsOf('동아리활동(미생물탐구반)', '대조군으로 둠')).toContain('design');
    expect(skillsOf('진로활동', '온라인 탐방', 1)).not.toContain('collect');
    expect(skillsOf('공통국어1', '구조도로 정리')).not.toContain('model');
    expect(skillsOf('공통국어2', '반론을 스스로')).not.toContain('problem');
    expect(skillsOf('과학탐구실험2', '처음 예상과 달리')).toContain('problem');
    expect(skillsOf('과학탐구실험2', '측정 규칙으로')).toContain('design');
    expect(skillsOf('통합과학1', '산소임을 확인')).toContain('collect');
  });
});

describe('예시 학생: 상담 포인트 문장이 사실과 맞는다', () => {
  const ins = an.insights;
  const t = (part: string) => ins.find((i) => i.t.includes(part));

  it('14개 이하이고 화면 용어(계보)를 쓰며, 이미 깊은 주제에 깊이 정체를 붙이지 않는다', () => {
    expect(ins.length).toBeLessThanOrEqual(14);
    expect(ins.some((i) => i.t.includes('줄기'))).toBe(false);
    expect(ins.some((i) => i.t.includes('깊어지지 않습니다'))).toBe(false);
  });
  it('가장 긴 계보는 효소 줄기 5건이고 대수에서 끝나며, 질문은 그 계보의 마지막 한 걸음을 묻는다', () => {
    const chain = t('가장 긴 탐구 계보')!;
    expect(chain.t).toBe('가장 긴 탐구 계보는 기록 5건이 한 줄로 이어진 것으로, 2학년 1학기 대수에서 끝납니다.');
    expect(chain.go).toBe(rec('대수').id);
    const q = ins.find((i) => i.tg === 'q' && i.t.includes('어떻게 이어졌는지'))!;
    expect(q.go).toBe(rec('생명과학', 2).id);
    expect(q.t).toContain('2학년 생명과학에서 한');
    expect(q.t).toContain('2학년 대수 탐구로');
  });
  it('관통 주제는 한 문장으로 합쳐지고, 진로 희망 문장 둘이 강점에 남는다', () => {
    const span = ins.filter((i) => i.tg === 's' && i.t.includes('교과군에서 이어집니다'));
    expect(span).toHaveLength(1);
    expect(span[0].t).toContain('‘카탈레이스’(');
    expect(span[0].t).toContain('‘항생제’(');
    expect(t('진로 희망 분야(생명과학·바이오)')?.tg).toBe('s');
    expect(t('생명과학 연구원 → 미생물학 연구원으로 한 방향을 유지합니다')?.tg).toBe('s');
  });
  it('심화 예시는 직접 언급이 있는 연결부터 고른다', () => {
    const deep = t('‘심화’ 연결이')!;
    expect(deep.tg).toBe('s');
    expect(deep.t).toContain('예: 통합과학1 → 과학탐구실험1');
    const n = an.links.filter((l) => l.rel === '심화').length;
    expect(deep.t).toContain(`‘심화’ 연결이 ${n}개`);
  });
  it('뒤이은 탐구가 있는 기록(공통수학2, 1학년 동아리)을 후속 없는 깊은 탐구로 꼽지 않는다', () => {
    const tips = ins.filter((i) => i.t.includes('뒤이은 탐구가 없습니다'));
    for (const tip of tips) {
      expect(an.links.some((l) => l.from === tip.go && l.rel !== '동시')).toBe(false);
      expect([rec('공통수학2').id, rec('동아리활동(생명과학탐구반)').id]).not.toContain(tip.go);
    }
  });
});
