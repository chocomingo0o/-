import { describe, expect, it } from 'vitest';
import type { GapReport, Insight, LaneKey, Link, MethodKey, Rec, Sem, StudentRecord, Theme, Year } from '../types';
import { sampleStudent } from '../../fixtures/sample';
import { buildRecords } from './records';
import { analyzeRecord, buildCtx } from './depth';
import { buildStats, buildThemes, keywordFn } from './themes';
import { assignTopics } from './topic';
import { buildGaps } from './gaps';
import { buildInsights } from './insights';

/* ───────────────────────── 도구 ───────────────────────── */

function emptyStudent(): StudentRecord {
  return { meta: {}, courses: [], seteuk: [], changche: [], hopes: [], behavior: [], warnings: [], years: [] };
}

interface RecOpts {
  lane?: LaneKey;
  year?: Year;
  sem?: Sem | null;
  methods?: MethodKey[];
  depth?: 1 | 2 | 3 | 4;
  subj?: string;
  topic?: string;
  topicKind?: Rec['topicKind'];
  fields?: string[];
  faint?: boolean;
}

/** 손으로 만든 기록. 상담 포인트가 보는 필드만 채운다. */
function rec(id: string, o: RecOpts = {}): Rec {
  const year = o.year ?? 1;
  const sem = o.sem === undefined ? 1 : o.sem;
  return {
    id,
    kind: '세특',
    subj: o.subj ?? `${o.lane ?? '과학'}과목`,
    lane: o.lane ?? '과학',
    year,
    sem,
    t: (year - 1) * 2 + (sem === 1 ? 0 : sem === 2 ? 1 : 0.5),
    text: '',
    grades: [],
    sents: [],
    methods: o.methods ?? [],
    methodCounts: {},
    depth: o.depth ?? 1,
    faint: o.faint ?? false,
    key: [],
    acts: [],
    fuCount: 0,
    connectCue: false,
    tf: new Map(),
    ktf: new Set(),
    fields: (o.fields ?? []).map((k) => ({ k, n: 2, u: 2, words: [] })),
    topic: o.topic ?? '',
    topicKind: o.topicKind ?? (o.topic ? 'q' : 'k'),
    kw: [],
    summary: '',
    summaryFu: false,
    themes: [],
    skills: [],
    skillCounts: {},
  };
}

function link(from: string, to: string, rel: Link['rel'] = '심화', words: string[] = []): Link {
  return {
    from, to, rel, cross: false, ss: false, cc: false, cite: false, words, theme: null, hope: null, sc: 5,
    sent: '', head: '', detail: '', why: '', lines: [], newM: [],
  };
}

function emptyGaps(): GapReport {
  return { slots: [], lanes: [], semMatrix: [], laneMatrix: [], skillMatrix: [], skillLaneMatrix: [], trend: [], suggestions: [] };
}

const BAD = /undefined|NaN|null/;
const ORDER = ['s', 'g', 'd', 'q'];

/** s → g → d → q 순으로 묶여 있는지 */
function inOrder(ins: Insight[]): boolean {
  let last = -1;
  for (const i of ins) {
    const k = ORDER.indexOf(i.tg);
    if (k < last) return false;
    last = k;
  }
  return true;
}

/* ───────────────────────── 예시 학생 ───────────────────────── */

describe('buildInsights: 예시 학생 + 손으로 그린 연결', () => {
  const S = sampleStudent();
  const recs = buildRecords(S);
  const ctx = buildCtx(S);
  for (const r of recs) analyzeRecord(r, ctx);
  const stats = buildStats(recs);
  const themes = buildThemes(recs, stats);
  assignTopics(recs, keywordFn(stats));

  const by = (subj: string, year?: Year): Rec => {
    const r = recs.find((x) => x.subj === subj && (year === undefined || x.year === year));
    if (!r) throw new Error(`기록 없음: ${subj}`);
    return r;
  };
  // 효소 줄기: 통합과학1 → 과학탐구실험1 → 1학년 동아리 → 생명과학 (심화), 생명과학과 대수는 같은 시기
  const a1 = by('통합과학1');
  const a2 = by('과학탐구실험1');
  const a3 = by('동아리활동(생명과학탐구반)');
  const a4 = by('생명과학');
  const a5 = by('대수');
  // 항생제 줄기: 통합과학2 → 영어Ⅰ (확장)
  const b1 = by('통합과학2');
  const b2 = by('영어Ⅰ');
  // 반복 줄기: 통합사회1 → 통합사회2 → 세계시민과 지리
  const c1 = by('통합사회1');
  const c2 = by('통합사회2');
  const c3 = by('세계시민과 지리');
  const links: Link[] = [
    link(a1.id, a2.id, '심화', ['효소']),
    link(a2.id, a3.id, '심화', ['카탈레이스']),
    link(a3.id, a4.id, '심화', ['카탈레이스']),
    link(a4.id, a5.id, '동시', ['반응']),
    link(b1.id, b2.id, '확장', ['항생제']),
    link(c1.id, c2.id, '반복', ['기후변화']),
    link(c2.id, c3.id, '반복', ['기후변화']),
  ];
  const gaps = buildGaps(recs, links, S);
  const ins = buildInsights(recs, links, themes, gaps, S);
  // 내용 확인은 결손 제안 없이 만든 것으로 한다(제안 수는 사전에 따라 달라져 14개 자르기에 영향을 준다)
  const insNoGaps = buildInsights(recs, links, themes, emptyGaps(), S);

  it('네 태그가 모두 있고 14개 이하이며 s → g → d → q 순이다', () => {
    expect(ins.length).toBeGreaterThan(0);
    expect(ins.length).toBeLessThanOrEqual(14);
    for (const tg of ['s', 'g', 'd', 'q']) expect(ins.some((i) => i.tg === tg)).toBe(true);
    expect(inOrder(ins)).toBe(true);
    expect(ins.filter((i) => i.tg === 'q').length).toBe(2);
  });

  it('문장에 undefined, NaN이 없고 같은 문장이 둘 없다', () => {
    for (const i of ins) {
      expect(i.t).not.toMatch(BAD);
      expect(i.t.trim().length).toBeGreaterThan(10);
    }
    const texts = ins.map((i) => i.t.replace(/\s+/g, ''));
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('가장 긴 계보는 기록 4건이 한 줄로 이어져 생명과학에서 끝나고, 그 줄기를 묻는 질문이 있다', () => {
    const ins = insNoGaps;
    // 화면의 용어('계보')와 맞춘다. '줄기'는 화면 어디에도 정의되지 않은 말이다
    const chain = ins.find((i) => i.t.includes('가장 긴 탐구 계보'));
    expect(chain).toBeDefined();
    expect(chain!.tg).toBe('s');
    expect(ins.some((i) => i.t.includes('줄기'))).toBe(false);
    expect(chain!.t).toContain('기록 4건이 한 줄로');
    expect(chain!.t).not.toContain('단계');
    expect(chain!.t).toContain('2학년 1학기 생명과학');
    expect(chain!.go).toBe(a4.id);
    const q = ins.find((i) => i.tg === 'q' && i.t.includes('어떻게 이어졌는지'));
    expect(q).toBeDefined();
    expect(q!.t).toContain('1학년 통합과학1');
    expect(q!.t).toContain('2학년 생명과학');
    expect(q!.go).toBe(a1.id);
  });

  it('심화 3개는 강점, 반복 2개는 점검으로 나온다', () => {
    const ins = insNoGaps;
    const deep = ins.find((i) => i.t.includes('‘심화’ 연결이 3개'));
    expect(deep).toBeDefined();
    expect(deep!.tg).toBe('s');
    expect(deep!.t).toContain('통합과학1 → 과학탐구실험1');
    const rep = ins.find((i) => i.t.includes('‘반복’ 연결이 2개'));
    expect(rep).toBeDefined();
    expect(rep!.tg).toBe('g');
    expect(rep!.t).toContain('통합사회1 → 통합사회2(기후변화)');
  });

  it('관통 주제와 진로 희망 문장이 강점으로 들어간다', () => {
    const ins = insNoGaps;
    // 관통 주제가 둘 이상이면 한 문장으로 합쳐지므로 강점 칸에 관통 주제 문장은 하나뿐이다
    const span = ins.filter((i) => i.tg === 's' && i.th && i.t.includes('교과군에서 이어집니다'));
    expect(span).toHaveLength(1);
    expect(span[0].t).toMatch(/^관심 주제 \d개가 [\d·]+학년에 걸쳐 두 개 이상의 교과군에서 이어집니다: ‘/);
    expect(span[0].t).toContain('‘카탈레이스’(');
    const hope = ins.find((i) => i.t.includes('진로 희망 분야(생명과학·바이오)'));
    expect(hope).toBeDefined();
    expect(hope!.t).toMatch(/\d+건 중 \d+건\(\d+%\)/);
    // 관통 주제를 한 문장으로 합쳤으므로 14개 상한에서도 진로 유지 문장이 밀리지 않는다
    expect(ins.some((i) => i.t.includes('한 방향을 유지합니다'))).toBe(true);
    const keep = buildInsights(recs, links, [], emptyGaps(), S).find((i) => i.t.includes('한 방향을 유지합니다'));
    expect(keep).toBeDefined();
    expect(keep!.tg).toBe('s');
    expect(keep!.t).toContain('생명과학 연구원 → 미생물학 연구원으로');
  });

  it('결손 분석의 제안이 그대로 합쳐지고 한 번만 들어간다', () => {
    expect(gaps.suggestions.length).toBeGreaterThan(0);
    for (const s of gaps.suggestions) {
      const hits = ins.filter((i) => i.t === s.text);
      expect(hits.length).toBe(1);
      expect(hits[0].tg).toBe(s.tg);
    }
  });

  it('줄기의 끝(생명과학)이나 뒤로 이어진 기록은 후속 없는 깊은 탐구로 꼽지 않는다', () => {
    const tips = insNoGaps.filter((i) => i.t.includes('뒤이은 탐구가 없습니다'));
    for (const t of tips) {
      expect([a1.id, a2.id, a3.id, b1.id].includes(t.go ?? '')).toBe(false);
      // 가장 최근 학기(2학년 1학기) 기록은 아직 후속이 있을 수 없으니 꼽지 않는다
      expect(recs.find((r) => r.id === t.go)!.year).toBe(1);
    }
  });
});

/* ───────────────────────── 손으로 만든 경우 ───────────────────────── */

describe('buildInsights: 손으로 만든 경우', () => {
  it('기록이 없으면 빈 배열', () => {
    expect(buildInsights([], [], [], emptyGaps(), emptyStudent())).toEqual([]);
  });

  it('진로 희망이 바뀌면 질문, 같은 문구가 이어지면 강점', () => {
    const recs = [rec('A', { depth: 3, topic: '효소 반응 속도' }), rec('B', { lane: '국어', year: 2, depth: 2, topic: '광고 언어' })];
    const S1 = emptyStudent();
    S1.hopes = [{ year: 1, text: '간호사' }, { year: 2, text: '건축가' }];
    const i1 = buildInsights(recs, [], [], emptyGaps(), S1);
    const ch = i1.find((i) => i.t.includes('바뀌었습니다'));
    expect(ch).toBeDefined();
    expect(ch!.tg).toBe('q');
    expect(ch!.t).toContain('간호사 → 건축가로');

    const S2 = emptyStudent();
    S2.hopes = [{ year: 1, text: '간호사' }, { year: 2, text: '간호사' }];
    const i2 = buildInsights(recs, [], [], emptyGaps(), S2);
    const same = i2.find((i) => i.t.includes('한결같습니다'));
    expect(same).toBeDefined();
    expect(same!.tg).toBe('s');
    expect(same!.t).toContain('1학년부터 2학년까지 ‘간호사’로');
    expect(i2.some((i) => i.t.includes('바뀌었습니다'))).toBe(false);
  });

  it('진로 희망 분야와 맞닿은 기록 비율: 40% 미만이면 방향', () => {
    const recs = [
      rec('A', { depth: 3, topic: '효소', fields: ['생명과학·바이오'] }),
      rec('B', { lane: '국어', depth: 2, topic: '광고', fields: ['미디어·콘텐츠'] }),
      rec('C', { lane: '사회', depth: 2, topic: '선거', fields: ['법·정치·행정'] }),
    ];
    const S = emptyStudent();
    S.hopes = [{ year: 1, text: '생명과학 연구원' }];
    const ins = buildInsights(recs, [], [], emptyGaps(), S);
    const h = ins.find((i) => i.t.includes('진로 희망 분야'));
    expect(h).toBeDefined();
    expect(h!.tg).toBe('d');
    expect(h!.t).toContain('3건 중 1건(33%)');
    expect(h!.t).toContain('늘려 볼 여지');
  });

  it('아직 쓰지 않은 수준 3 방법을 방향으로 알려 준다', () => {
    const recs = [
      rec('A', { methods: ['experiment', 'data', 'writing'], depth: 3, topic: '효소' }),
      rec('B', { lane: '수학', methods: ['proof'], depth: 2, topic: '증명' }),
    ];
    const ins = buildInsights(recs, [], [], emptyGaps(), emptyStudent());
    const d = ins.find((i) => i.t.startsWith('아직 쓰지 않은 수준 3 방법'));
    expect(d).toBeDefined();
    expect(d!.tg).toBe('d');
    expect(d!.t).toContain('설문·면담');
    expect(d!.t).toContain('코딩·시뮬레이션');
    expect(d!.t).not.toContain('실험·측정');
  });

  it('과학 기록에 실험·측정이 없으면 점검. 결손 분석이 이미 짚었으면 겹치지 않게 한다', () => {
    const recs = [
      rec('A', { methods: ['literature'], depth: 2, topic: '효소의 종류' }),
      rec('B', { methods: ['analysis', 'understanding'], depth: 2, sem: 2, topic: '산과 염기' }),
    ];
    const S = emptyStudent();
    // 결손 분석 없이: 상담 포인트가 직접 짚는다
    const i1 = buildInsights(recs, [], [], emptyGaps(), S);
    const own = i1.find((i) => i.t.includes('이론 정리에 그친'));
    expect(own).toBeDefined();
    expect(own!.tg).toBe('g');
    expect(own!.t).toContain('과학 교과 기록 2건');
    // 결손 분석이 과학 교과군의 실험·측정 결손을 제안하면 그 문장만 남는다
    const gaps = buildGaps(recs, [], S);
    expect(gaps.suggestions.some((s) => s.lane === '과학' && s.method === 'experiment')).toBe(true);
    const i2 = buildInsights(recs, [], [], gaps, S);
    expect(i2.some((i) => i.t.includes('이론 정리에 그친'))).toBe(false);
    expect(i2.filter((i) => i.t.includes('실험·측정')).length).toBeGreaterThanOrEqual(1);
  });

  it('연결이 4개 이상인데 심화가 없으면 점검', () => {
    const recs = [
      rec('A', { depth: 2, topic: 'ㄱ' }), rec('B', { lane: '국어', depth: 2, topic: 'ㄴ' }),
      rec('C', { year: 1, sem: 2, depth: 2, topic: 'ㄷ' }), rec('D', { lane: '사회', year: 1, sem: 2, depth: 2, topic: 'ㄹ' }),
      rec('E', { year: 2, depth: 2, topic: 'ㅁ' }),
    ];
    const links = [link('A', 'C', '반복'), link('B', 'D', '확장'), link('C', 'E', '반복'), link('D', 'E', '전환')];
    const ins = buildInsights(recs, links, [], emptyGaps(), emptyStudent());
    expect(ins.some((i) => i.tg === 'g' && i.t.includes('‘심화’ 연결이 없습니다'))).toBe(true);
    expect(ins.some((i) => i.t.includes('‘심화’ 연결이') && i.tg === 's')).toBe(false);
  });

  it('깊이 정체: 관심 주제의 뒤 절반 깊이가 늘지 않으면 점검', () => {
    const recs = [
      rec('A', { depth: 3, topic: 'ㄱ' }),
      rec('B', { lane: '동아리', depth: 3, sem: 2, topic: 'ㄴ' }),
      rec('C', { lane: '수학', year: 2, depth: 2, topic: 'ㄷ' }),
      rec('D', { lane: '사회', year: 2, sem: 2, depth: 2, topic: 'ㄹ' }),
    ];
    const themes: Theme[] = [{ name: '효소', words: ['효소'], ids: ['A', 'B', 'C', 'D'], color: '#000' }];
    const ins = buildInsights(recs, [], themes, emptyGaps(), emptyStudent());
    const g = ins.find((i) => i.t.includes('깊이가 깊어지지 않습니다'));
    expect(g).toBeDefined();
    expect(g!.th).toBe('효소');
    expect(g!.t).toContain('3.0 → 2.0');
    // 두 교과군 이상에 걸치므로 관통 주제 강점도 함께 나온다
    expect(ins.some((i) => i.tg === 's' && i.th === '효소')).toBe(true);
  });

  it('깊이 정체: 앞이나 뒤 절반 평균이 3.5 이상이면 이미 깊은 주제이므로 만들지 않는다', () => {
    const mk = (depths: (1 | 2 | 3 | 4)[], words: string[] = ['효소', '기질']) => {
      const lanes: LaneKey[] = ['과학', '동아리', '수학', '사회', '국어'];
      const recs = depths.map((d, i) =>
        rec(`R${i}`, { lane: lanes[i % lanes.length], year: (i < 2 ? 1 : 2) as Year, sem: i % 2 === 0 ? 1 : 2, depth: d, topic: `t${i}` }),
      );
      const themes: Theme[] = [{ name: words[0], words, ids: recs.map((r) => r.id), color: '#000' }];
      return buildInsights(recs, [], themes, emptyGaps(), emptyStudent()).filter((i) => i.t.includes('깊어지지 않습니다'));
    };
    // 뒤 절반 평균 3.5(4, 3): 이미 깊다
    expect(mk([4, 4, 4, 3])).toHaveLength(0);
    // 앞 절반 평균 3.5(4, 3) → 뒤 3.0: 앞이 이미 성찰·확장 수준이라 '깊어지지 않는다'고 하지 않는다
    expect(mk([4, 3, 3, 3])).toHaveLength(0);
    // 3.0 → 2.5: 점검
    expect(mk([3, 3, 3, 2])).toHaveLength(1);
    // 기록이 세 건이면 만들지 않는다
    expect(mk([3, 3, 2])).toHaveLength(0);
    // 주제 낱말이 하나뿐이고 관심 분야 낱말도 아니면 만들지 않는다
    expect(mk([3, 3, 3, 2], ['거품'])).toHaveLength(0);
  });

  it('14개를 넘으면 자르되 질문 두 개는 남긴다', () => {
    const recs = [
      rec('A', { depth: 4, topic: '효소 활성' }),
      rec('B', { lane: '국어', depth: 3, topic: '광고 언어' }),
      rec('C', { lane: '사회', year: 2, depth: 3, topic: '지역 격차' }),
    ];
    const gaps = emptyGaps();
    for (let i = 0; i < 12; i++) gaps.suggestions.push({ tg: 'd', text: `방향 제안 ${i + 1}번입니다.` });
    for (let i = 0; i < 6; i++) gaps.suggestions.push({ tg: 'g', text: `점검 제안 ${i + 1}번입니다.` });
    gaps.suggestions.push({ tg: 'g', text: '점검 제안 1번입니다.' }); // 중복
    const ins = buildInsights(recs, [], [], gaps, emptyStudent());
    expect(ins.length).toBe(14);
    expect(inOrder(ins)).toBe(true);
    expect(ins.filter((i) => i.tg === 'q').length).toBe(2);
    expect(ins.filter((i) => i.t === '점검 제안 1번입니다.').length).toBe(1);
    // 묶음 안에서는 만든 순서를 지킨다
    const ds = ins.filter((i) => i.tg === 'd' && i.t.startsWith('방향 제안')).map((i) => i.t);
    expect(ds).toEqual(ds.slice().sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10)));
    for (const i of ins) expect(i.t).not.toMatch(BAD);
  });

  it('연결이 없어도 깊은 기록으로 질문 두 개를 채운다', () => {
    const recs = [
      rec('A', { depth: 4, topic: '효소 활성' }),
      rec('B', { lane: '국어', depth: 2, topic: '광고 언어' }),
      rec('C', { lane: '예체능', depth: 4, topic: '달리기 기록' }),
    ];
    const ins = buildInsights(recs, [], [], emptyGaps(), emptyStudent());
    const qs = ins.filter((i) => i.tg === 'q');
    expect(qs.length).toBe(2);
    expect(qs[0].go).toBe('A'); // 가장 깊은 기록(예체능은 빼고)
    expect(qs[0].t).toContain('‘효소 활성’');
    expect(qs[1].go).toBe('B');
    for (const q of qs) expect(q.t.startsWith('“') && q.t.endsWith('”')).toBe(true);
  });
});

/* ───────────────────────── 리뷰 뒤 보강 ───────────────────────── */
describe('buildInsights: 최근 학기 판정과 계보 문장', () => {
  it('학기 없는 2학년 창체가 있어도 2학년 1학기 세특은 최근 기록이라 후속 없음으로 꼽지 않는다', () => {
    const recs = [
      rec('A', { year: 1, sem: 1, depth: 3, topic: '효소 반응 속도' }),
      rec('B', { year: 2, sem: 1, depth: 3, topic: '카탈레이스 반응 속도' }),
      rec('C', { lane: '자율·자치', year: 2, sem: null, depth: 1, topic: '학급 회의' }),
    ];
    const ins = buildInsights(recs, [], [], emptyGaps(), emptyStudent());
    const tips = ins.filter((i) => i.t.includes('뒤이은 탐구가 없습니다'));
    expect(tips.some((i) => i.go === 'A')).toBe(true);
    expect(tips.some((i) => i.go === 'B')).toBe(false);
  });
  it('가장 긴 줄기는 조상 수가 아니라 한 줄로 이어진 기록 수를 말하고, 창체는 (학년 전체) 없이 적는다', () => {
    const recs = [
      rec('A', { year: 1, sem: 1, depth: 2, topic: 'ㄱ' }),
      rec('B', { year: 1, sem: 2, depth: 3, topic: 'ㄴ' }),
      rec('C', { lane: '수학', year: 1, sem: 2, depth: 3, topic: 'ㄷ' }),
      rec('D', { lane: '동아리', subj: '동아리활동(미생물탐구반)', year: 2, sem: null, depth: 4, topic: 'ㄹ' }),
    ];
    // A→B→D 와 C→D: 조상은 3개지만 가장 긴 한 줄은 A→B→D(기록 3건)
    const links = [link('A', 'B'), link('B', 'D'), link('C', 'D')];
    const ins = buildInsights(recs, links, [], emptyGaps(), emptyStudent());
    const chain = ins.find((i) => i.t.includes('가장 긴 탐구 계보'))!;
    expect(chain).toBeDefined();
    expect(chain.t).toContain('기록 3건이 한 줄로');
    expect(chain.t).toContain('2학년 동아리활동(미생물탐구반)에서 끝납니다');
    expect(chain.t).not.toContain('학년 전체');
    expect(chain.t).not.toContain('4');
    const q = ins.find((i) => i.tg === 'q' && i.t.includes('어떻게 이어졌는지'))!;
    expect(q.go).toBe('A');
  });
  it('관통 주제 문장은 교과군 수와 나열이 맞고 5개가 넘으면 등을 붙인다', () => {
    const lanes: LaneKey[] = ['과학', '수학', '영어', '국어', '사회', '동아리'];
    const recs = lanes.map((lane, i) => rec(`R${i}`, { lane, year: 1, depth: 2, topic: `t${i}` }));
    const themes: Theme[] = [{ name: '카탈레이스', words: ['카탈레이스'], ids: recs.map((r) => r.id), color: '#000' }];
    const ins = buildInsights(recs, [], themes, emptyGaps(), emptyStudent());
    const s = ins.find((i) => i.th === '카탈레이스' && i.tg === 's')!;
    expect(s.t).toBe('‘카탈레이스’ 주제가 1학년에 걸쳐 과학, 수학, 영어, 국어, 사회 등 6개 교과군에서 이어집니다.');
  });
});
