import { describe, expect, it } from 'vitest';
import type { Act, Rec, Sent } from '../types';
import { INQ_RX } from '../dict/patterns';
import { sampleStudent } from '../../fixtures/sample';
import { buildRecords, subjectStop } from './records';
import { sentences, tokens } from './text';
import { buildStats, keywordFn } from './themes';
import { assignTopics, topicOf } from './topic';

/** 핵심 문장. 점수만 의미 있다. */
function sent(s: string, sc: number = 2): Sent {
  return { s, a: 0, b: s.length, ms: [], rf: false, sc, fu: false, skills: [] };
}
/** 활동 흐름 한 줄 */
function act(text: string, sc: number, fu: boolean = false): Act {
  return { text, ms: [], rf: false, sc, fu };
}
/** 손으로 만든 기록. 본문과 핵심 문장만 채운다. */
function rec(text: string, key: string[] = [], extra: Partial<Rec> = {}): Rec {
  return {
    id: 'S0',
    kind: '세특',
    subj: '통합과학1',
    lane: '과학',
    year: 1,
    sem: 1,
    t: 0,
    text,
    key: key.map((s) => sent(s)),
    acts: [],
    tf: new Map(),
    ktf: new Set(),
    kw: [],
    themes: [],
    faint: false,
    depth: 1,
    topic: '',
    topicKind: 'k',
    summary: '',
    summaryFu: false,
    ...extra,
  } as unknown as Rec;
}
const noKw = (): string[] => [];
const someKw = (): string[] => ['전압', '전극', '구리'];

describe('topicOf: 따옴표 주제', () => {
  it("‘…’를 주제로 → 'q'", () => {
    const r = rec('‘온도에 따른 카탈레이스 활성 변화’를 주제로 모둠 탐구를 설계함. 결과를 표로 정리함.');
    expect(topicOf(r, noKw)).toEqual({ text: '온도에 따른 카탈레이스 활성 변화', kind: 'q' });
  });
  it("‘…’라는 질문 → 'q'", () => {
    const r = rec('주제 탐구에서 ‘항생제 내성균은 어떻게 생겨나는가’라는 질문을 세우고 자료를 조사함.');
    expect(topicOf(r, noKw)).toEqual({ text: '항생제 내성균은 어떻게 생겨나는가', kind: 'q' });
  });
  it("‘…’ 탐구 보고서, 곧은 따옴표도 받는다 → 'q'", () => {
    const r = rec('"소금물 농도와 어는점의 관계" 탐구 보고서를 작성함.');
    expect(topicOf(r, noKw)).toEqual({ text: '소금물 농도와 어는점의 관계', kind: 'q' });
  });
  it("‘…’ 프로젝트에 참여 → 'q'. 끝에 (저자)가 붙은 책 제목은 ②에서 제외", () => {
    const r = rec('‘학교 앞 교차로 신호 체계 개선’ 프로젝트에 참여하여 통행량을 측정함.');
    expect(topicOf(r, noKw)).toEqual({ text: '학교 앞 교차로 신호 체계 개선', kind: 'q' });
    const b = rec('‘코스모스 (칼 세이건)’ 활동에 참여함.');
    // ②에서 걸러지고(따옴표 주제 'q'가 아님), ⑨가 핵심 문장 밖의 문장까지 훑어 '제목 (저자)' 꼴의 책으로 잡는다
    expect(topicOf(b, noKw)).toEqual({ text: '코스모스', kind: 'b' });
  });
  it("‘…’라는 제목 → 'q'", () => {
    const r = rec('‘우리 동네 하천의 수질 변화’라는 제목으로 보고서를 썼음.');
    expect(topicOf(r, noKw)).toEqual({ text: '우리 동네 하천의 수질 변화', kind: 'q' });
  });
  it("주제로 ‘…’를 정하고 → 'p' (④)", () => {
    const r = rec('동아리 연간 탐구 주제로 ‘과산화수소 농도에 따른 카탈레이스 반응 속도’를 정하고 모둠장을 맡아 역할을 나눔.');
    expect(topicOf(r, noKw)).toEqual({ text: '과산화수소 농도에 따른 카탈레이스 반응 속도', kind: 'p' });
  });
});

describe('topicOf: 핵심 문장 패턴', () => {
  it("'…에 미치는 영향' 명사구 → 'p'", () => {
    const s = '백신 접종률이 집단 면역에 미치는 영향을 자료로 해석함.';
    const r = rec(s, [s]);
    expect(topicOf(r, noKw)).toEqual({ text: '백신 접종률이 집단 면역에 미치는 영향', kind: 'p' });
  });
  it("'…의 상관관계' 명사구. 앞머리가 한 낱말뿐이면 쓰지 않는다", () => {
    const s1 = '학습 시간과 수면 시간의 상관관계를 설문으로 조사함.';
    expect(topicOf(rec(s1, [s1]), noKw)).toEqual({ text: '학습 시간과 수면 시간의 상관관계', kind: 'p' });
    // 앞머리 '온도'만으로는 두 낱말이 안 되고 길이도 12자 미만 → ⑤ 탈락, 핵심어로
    const s2 = '온도의 변화를 측정함.';
    expect(topicOf(rec(s2, [s2]), someKw)).toEqual({ text: '전압, 전극, 구리', kind: 'k' });
  });
  it("⑤ 명사구 앞에 붙은 활동 절('…을 조사해 ', '…을 듣고 ')은 뗀다", () => {
    const s1 = '훈민정음 창제 과정을 조사해 집현전 학자들과 세종의 역할을 정리함.';
    expect(topicOf(rec(s1, [s1]), noKw)).toEqual({ text: '집현전 학자들과 세종의 역할', kind: 'p' });
    const s2 = '교향곡을 한 악장씩을 듣고 악기 편성과 분위기의 차이를 비교함.';
    expect(topicOf(rec(s2, [s2]), noKw)).toEqual({ text: '악기 편성과 분위기의 차이', kind: 'p' });
    // 명사 '분해'는 자르지 않는다
    const s3 = '간세포 속 과산화수소 분해 반응의 원리를 설명함.';
    expect(topicOf(rec(s3, [s3]), noKw)).toEqual({ text: '간세포 속 과산화수소 분해 반응의 원리', kind: 'p' });
  });
  it("질문형 '…일까?라는 질문' → 'q'", () => {
    const s = '소금물에서 얼음이 더 빨리 녹는 까닭은 무엇인가라는 질문을 세우고 실험으로 확인함.';
    const got = topicOf(rec(s, [s]), noKw);
    expect(got.kind).toBe('q');
    expect(got.text).toMatch(/무엇인가$/);
    expect(got.text.length).toBeLessThanOrEqual(44);
  });
  it("물음표가 붙은 질문도 'q'", () => {
    const s = '왜 비 오는 날에는 소리가 더 멀리 들릴까?라는 의문을 품고 자료를 찾음.';
    const got = topicOf(rec(s, [s]), noKw);
    expect(got.kind).toBe('q');
    expect(got.text).toMatch(/들릴까\?$/);
  });
  it("'…에 관한 보고서' → 'p'", () => {
    const s = '플라스틱 분해 미생물에 관한 보고서를 작성하여 발표함.';
    expect(topicOf(rec(s, [s]), noKw)).toEqual({ text: '플라스틱 분해 미생물', kind: 'p' });
  });
  it("'…을 탐구 주제로 삼아' → 'p'", () => {
    const s = '지역 하천의 수질 오염 원인을 탐구 주제로 삼아 현장 조사를 함.';
    expect(topicOf(rec(s, [s]), noKw)).toEqual({ text: '지역 하천의 수질 오염 원인', kind: 'p' });
  });
  it("'…에 대해 탐구' → 'p'", () => {
    const s = '전기 자동차 배터리의 열 관리 기술에 대해 탐구하고 발표함.';
    expect(topicOf(rec(s, [s]), noKw)).toEqual({ text: '전기 자동차 배터리의 열 관리 기술', kind: 'p' });
  });
  it("핵심 문장의 아무 따옴표. '제목 (저자)'이면 책 'b', 아니면 'q'", () => {
    const s1 = '‘이기적 유전자 (리처드 도킨스)’를 읽고 자연 선택을 유전자 관점으로 설명함.';
    expect(topicOf(rec(s1, [s1]), noKw)).toEqual({ text: '이기적 유전자', kind: 'b' });
    const s2 = '‘침묵의 봄’을 읽고 살충제가 생태계에 남기는 영향을 정리함.';
    expect(topicOf(rec(s2, [s2]), noKw)).toEqual({ text: '침묵의 봄', kind: 'b' });
    const s3 = '모둠 이름을 ‘빛의 속도 측정단’으로 정하고 활동함.';
    expect(topicOf(rec(s3, [s3]), noKw)).toEqual({ text: '빛의 속도 측정단', kind: 'q' });
  });
  it('같은 패턴이면 점수가 높은 핵심 문장을 먼저 본다', () => {
    const low = '전해질 농도와 전류의 관계에 관한 보고서를 썼음.';
    const high = '구리와 아연의 산화 환원 반응에 관한 발표를 함.';
    const r = rec(low + ' ' + high);
    r.key = [sent(low, 1), sent(high, 4)];
    expect(topicOf(r, noKw)).toEqual({ text: '구리와 아연의 산화 환원 반응', kind: 'p' });
  });
  it('패턴 우선순위가 문장 점수보다 앞선다(⑦ 에 관한 보고서 > ⑧ 에 대해 탐구)', () => {
    const low = '전해질 농도와 전류의 관계에 관한 보고서를 썼음.';
    const high = '구리와 아연의 산화 환원 반응에 대해 탐구함.';
    const r = rec(low + ' ' + high);
    r.key = [sent(low, 1), sent(high, 4)];
    expect(topicOf(r, noKw)).toEqual({ text: '전해질 농도와 전류의 관계', kind: 'p' });
  });
});

describe('topicOf: 핵심어', () => {
  it("패턴이 없으면 핵심어 3개를 ', '로 이어 'k'", () => {
    const r = rec('수업에 성실히 참여함.', ['수업에 성실히 참여함.']);
    expect(topicOf(r, someKw)).toEqual({ text: '전압, 전극, 구리', kind: 'k' });
  });
  it("핵심어도 없으면 핵심 문장(없으면 본문) 앞부분을 36자로 줄여 'k'", () => {
    const r = rec('수업에 성실히 참여하고 모둠 활동에서 친구들을 도움.', []);
    const got = topicOf(r, noKw);
    expect(got.kind).toBe('k');
    expect(got.text.length).toBeLessThanOrEqual(37);
    expect(got.text.startsWith('수업에')).toBe(true);
  });
});

describe('assignTopics', () => {
  it('주제가 따옴표로 잡히면 faint를 풀고 kw를 채우고 요약은 주제와 다른 활동에서 고른다', () => {
    const r = rec('‘온도에 따른 카탈레이스 활성 변화’를 주제로 모둠 탐구를 설계함.', [], {
      faint: true,
      acts: [
        act('온도에 따른 카탈레이스 활성 변화를 주제로 모둠 탐구를 설계', 3),
        act('얼음물, 실온, 40℃, 60℃, 80℃ 물중탕에서 각 3회 반복 측정하여 평균을 표로 정리', 4),
      ],
    });
    assignTopics([r], someKw);
    expect(r.topic).toBe('온도에 따른 카탈레이스 활성 변화');
    expect(r.topicKind).toBe('q');
    expect(r.faint).toBe(false);
    expect(r.kw).toEqual(['전압', '전극', '구리']);
    expect(r.summary.startsWith('얼음물, 실온')).toBe(true);
    expect(r.summaryFu).toBe(false);
  });
  it("핵심어뿐이면 활동 요약의 '…을 측정' 앞 명사구를 'p'로 쓴다. faint는 그대로", () => {
    const r = rec('수업 내용을 정리함.', ['수업 내용을 정리함.'], {
      faint: true,
      acts: [act('구리판과 아연판 사이의 전압을 측정하여 표로 정리', 3)],
    });
    assignTopics([r], someKw);
    expect(r.topicKind).toBe('p');
    expect(r.topic).toBe('구리판과 아연판 사이의 전압');
    expect(r.faint).toBe(true);
    expect(r.summary).toBe('');
  });
  it("명사구가 안 잡히면 점수 높은 활동 요약의 첫 절을 's'로 쓴다", () => {
    const r = rec('수업 내용을 정리함.', ['수업 내용을 정리함.'], {
      acts: [act('구리판과 아연판으로 간이 전지 회로 구성, 전구가 켜지는지 확인', 3)],
    });
    assignTopics([r], someKw);
    expect(r.topicKind).toBe('s');
    expect(r.topic).toBe('구리판과 아연판으로 간이 전지 회로 구성');
  });
  it('후속 탐구(fu) 활동이 있으면 요약으로 먼저 고르고 summaryFu를 켠다', () => {
    const r = rec('‘온도에 따른 카탈레이스 활성 변화’를 주제로 탐구함.', [], {
      acts: [
        act('온도에 따른 카탈레이스 활성 변화를 주제로 탐구', 3),
        act('얼음물, 실온, 40℃ 물중탕에서 각 3회 반복 측정하여 평균을 표로 정리', 5),
        act('얼음물에 두었던 즙을 실온으로 되돌리면 활성이 다시 살아나는 것을 추가로 확인', 3, true),
      ],
    });
    assignTopics([r], noKw);
    expect(r.summaryFu).toBe(true);
    expect(r.summary.startsWith('얼음물에 두었던 즙')).toBe(true);
    expect(r.summary.length).toBeLessThanOrEqual(81);
  });
  it('활동이 없으면 요약은 빈 문자열, 핵심어는 그대로 주제가 된다', () => {
    const r = rec('수업에 성실히 참여함.', ['수업에 성실히 참여함.'], { faint: true });
    assignTopics([r], someKw);
    expect(r.topic).toBe('전압, 전극, 구리');
    expect(r.topicKind).toBe('k');
    expect(r.summary).toBe('');
    expect(r.faint).toBe(true);
  });
});

describe('sampleStudent() 기록의 주제 - depth 모듈 없이 모든 문장을 핵심 문장으로 둔 근사', () => {
  const S = sampleStudent();
  const recs = buildRecords(S);
  const stop = subjectStop(S);
  for (const r of recs) {
    const ss = sentences(r.text);
    r.key = ss.map((x) => sent(x.s, INQ_RX.test(x.s) ? 3 : 1));
    for (const w of tokens(r.text, stop)) r.tf.set(w, (r.tf.get(w) ?? 0) + 1);
    for (const x of ss) if (INQ_RX.test(x.s)) for (const w of tokens(x.s, stop)) r.ktf.add(w);
  }
  const kw = keywordFn(buildStats(recs));
  const by = (subj: string): Rec => recs.find((r) => r.subj === subj)!;

  it('과학탐구실험1: 따옴표 주제', () => {
    expect(topicOf(by('과학탐구실험1'), kw)).toEqual({ text: '온도에 따른 카탈레이스 활성 변화', kind: 'q' });
  });
  it('통합과학2: 따옴표 질문 주제', () => {
    expect(topicOf(by('통합과학2'), kw)).toEqual({ text: '항생제 내성균은 어떻게 생겨나는가', kind: 'q' });
  });
  it('1학년 동아리: 주제로 ‘…’를 정하고', () => {
    const club = recs.find((r) => r.kind === '창체' && r.year === 1 && r.lane === '동아리')!;
    expect(topicOf(club, kw)).toEqual({ text: '과산화수소 농도에 따른 카탈레이스 반응 속도', kind: 'p' });
  });
  it('모든 기록에 주제가 붙고 길이가 적당하다', () => {
    assignTopics(recs, kw);
    for (const r of recs) {
      expect(r.topic.length, r.subj).toBeGreaterThan(0);
      expect(r.topic.length, `${r.subj}: ${r.topic}`).toBeLessThanOrEqual(60);
      expect(['q', 'p', 'b', 's', 'k']).toContain(r.topicKind);
    }
    const quoted = recs.filter((r) => r.topicKind === 'q').length;
    expect(quoted).toBeGreaterThanOrEqual(3);
  });
});

/* ───────────────────────── 리뷰 뒤 보강 ───────────────────────── */
describe('⑨ 책 판정은 따옴표 바깥만 본다', () => {
  it("‘책상 위 공간을 넓히는 정리함’은 책이 아니다", () => {
    const s = '발명 단원에서 ‘책상 위 공간을 넓히는 정리함’을 설계하고 골판지로 시제품을 제작하여 하중을 측정함.';
    expect(topicOf(rec(s, [s]), noKw)).toEqual({ text: '책상 위 공간을 넓히는 정리함', kind: 'q' });
    const s2 = '‘도서관 이용 실태’를 설문 조사하여 결과를 발표함.';
    expect(topicOf(rec(s2, [s2]), noKw).kind).toBe('q');
  });
  it('따옴표 앞의 책·도서, 뒤의 읽고는 책으로 본다', () => {
    const s = '책 ‘코스모스’를 완독하고 우주의 역사를 정리함.';
    expect(topicOf(rec(s, [s]), noKw)).toEqual({ text: '코스모스', kind: 'b' });
    const s2 = '교양서 ‘이기적 유전자’에서 유전자 관점의 진화를 정리함.';
    expect(topicOf(rec(s2, [s2]), noKw).kind).toBe('b');
  });
  it("'s' 폴백은 말줄임표로 잘린 조각을 주제로 쓰지 않는다", () => {
    const long = '1학년 때 과학탐구실험1 시간에 수행했던 온도에 따른 카탈레이스 활성 실험의 결과를 다시 꺼내어 최적 온도를 넘으면 활성이 급감한 까닭을 단백질의 입체 구조 변화와 연결해 설명함';
    const r = rec('수업 내용을 정리함.', ['수업 내용을 정리함.'], { acts: [act(long, 3)] });
    assignTopics([r], someKw);
    expect(r.topicKind).toBe('k');
    expect(r.topic).not.toMatch(/…$/);
  });
  it('⑤ 명사구에 연결 어미 절이 끼어 있으면 주제로 쓰지 않는다', () => {
    const s = '순차 탐색과 이진 탐색의 비교 횟수를 세어 효율 차이와 알고리즘의 역할을 설명함.';
    // ⑤('…의 역할')이 '비교 횟수를 세어 효율 차이와 알고리즘의 역할'을 잡지 않고 핵심어로 내려간다
    const t = topicOf(rec(s, [s]), noKw);
    expect(t.kind).not.toBe('p');
    const withKw = topicOf(rec(s, [s]), () => ['이진탐색', '효율']);
    expect(withKw).toEqual({ text: '이진탐색, 효율', kind: 'k' });
  });
});
