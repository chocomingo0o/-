import { describe, expect, it } from 'vitest';
import type { Link, MethodKey, Rec, Sem, SkillKey, StudentRecord, Year, LaneKey } from '../types';
import { sampleStudent } from '../../fixtures/sample';
import { buildRecords } from './records';
import { analyzeRecord, buildCtx } from './depth';
import { buildGaps, hopeFields, isScienceRec, methodBias } from './gaps';

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
  skills?: SkillKey[];
  subj?: string;
  kind?: '세특' | '창체';
  faint?: boolean;
}

/** 손으로 만든 기록. 결손 분석이 보는 필드(lane, year, sem, methods, depth, skills, subj, kind, faint)만 채운다. */
function rec(id: string, o: RecOpts = {}): Rec {
  const year = o.year ?? 1;
  const sem = o.sem === undefined ? 1 : o.sem;
  const methods = o.methods ?? [];
  const counts: Partial<Record<MethodKey, number>> = {};
  for (const k of methods) counts[k] = 1;
  return {
    id,
    kind: o.kind ?? '세특',
    subj: o.subj ?? (o.lane ?? '과학'),
    lane: o.lane ?? '과학',
    year,
    sem,
    t: (year - 1) * 2 + (sem === 1 ? 0 : sem === 2 ? 1 : 0.5),
    text: '',
    grades: [],
    sents: [],
    methods,
    methodCounts: counts,
    depth: o.depth ?? 1,
    faint: o.faint ?? false,
    key: [],
    acts: [],
    fuCount: 0,
    connectCue: false,
    tf: new Map(),
    ktf: new Set(),
    fields: [],
    topic: '',
    topicKind: 'k',
    kw: [],
    summary: '',
    summaryFu: false,
    themes: [],
    skills: o.skills ?? [],
    skillCounts: {},
  };
}

function link(from: string, to: string, rel: Link['rel'] = '심화'): Link {
  return {
    from, to, rel, cross: false, ss: false, cc: false, cite: false, words: [], theme: null, hope: null, sc: 5,
    sent: '', head: '', detail: '', why: '', lines: [], newM: [],
  };
}

const row = <K extends string>(rows: { key: K; cells: number[]; total: number }[], k: K) => rows.find((r) => r.key === k)!;
const BAD = /undefined|NaN|null/;

/* ───────────────────────── 손으로 만든 기록 ───────────────────────── */

describe('buildGaps: 손으로 만든 기록', () => {
  const recs = [
    rec('A', { lane: '과학', year: 1, sem: 1, methods: ['experiment', 'data'], depth: 3, skills: ['collect', 'interpret'] }),
    rec('B', { lane: '과학', year: 1, sem: 2, methods: ['literature'], depth: 2, skills: ['problem'] }),
    // 학기가 없는 창체 기록: 1학년 두 칸에 모두 들어간다
    rec('C', { lane: '동아리', kind: '창체', subj: '동아리활동 (생명과학탐구반)', year: 1, sem: null, methods: ['experiment', 'writing'], depth: 3, skills: ['collect', 'conclude'] }),
    rec('D', { lane: '국어', year: 1, sem: 2, methods: ['writing'], depth: 1 }),
    rec('E', { lane: '국어', year: 2, sem: 1, methods: ['critique', 'reading'], depth: 2 }),
  ];
  const links = [link('A', 'C', '심화'), link('B', 'E', '확장')];
  const S = emptyStudent();
  const g = buildGaps(recs, links, S);

  it('semMatrix: 방법 × 6칸. 학기 없는 기록은 두 칸에 세고 total은 기록 수로 한 번만 센다', () => {
    expect(g.semMatrix.length).toBe(17);
    for (const r of g.semMatrix) expect(r.cells.length).toBe(6);
    const ex = row(g.semMatrix, 'experiment');
    expect(ex.cells).toEqual([2, 1, 0, 0, 0, 0]); // A(1-1), C(1-1, 1-2)
    expect(ex.total).toBe(2);
    const wr = row(g.semMatrix, 'writing');
    expect(wr.cells).toEqual([1, 2, 0, 0, 0, 0]); // C(두 칸), D(1-2)
    expect(wr.total).toBe(2);
    expect(row(g.semMatrix, 'literature').cells).toEqual([0, 1, 0, 0, 0, 0]);
    expect(row(g.semMatrix, 'coding').total).toBe(0);
    // 칸 합계 = 방법별 (기록, 칸) 쌍의 수
    const sum = g.semMatrix.reduce((a, r) => a + r.cells.reduce((x, y) => x + y, 0), 0);
    // A 2방법×1칸 + B 1×1 + C 2×2 + D 1×1 + E 2×1 = 10
    expect(sum).toBe(10);
  });

  it('slots: 기록이 있는 칸만. 학기 없는 기록은 두 칸에 모두 들어간다', () => {
    expect(g.slots.map((s) => s.slot)).toEqual([0, 1, 2]);
    const s0 = g.slots[0];
    expect(s0.recIds.sort()).toEqual(['A', 'C']);
    expect(s0.lvCounts).toEqual([1, 0, 3]); // writing(1) + experiment, data, experiment(3)
    expect(s0.lv3Share).toBe(1);
    expect(s0.avgDepth).toBe(3);
    expect(s0.missingLv3).toEqual(['survey', 'modeling', 'coding', 'making']);
    const s1 = g.slots[1];
    expect(s1.recIds.sort()).toEqual(['B', 'C', 'D']);
    expect(s1.lv3Share).toBeCloseTo(1 / 3, 10);
    expect(s1.avgDepth).toBeCloseTo(2, 10);
    const s2 = g.slots[2];
    expect(s2.recIds).toEqual(['E']);
    expect(s2.lvCounts).toEqual([0, 2, 0]);
    expect(s2.lv3Share).toBe(0);
  });

  it('lanes: 기록이 있는 교과군만, expected는 사전의 것, missing = expected 중 안 쓴 것', () => {
    expect(g.lanes.map((l) => l.lane)).toEqual(['동아리', '국어', '과학']);
    const sci = g.lanes.find((l) => l.lane === '과학')!;
    expect(sci.recCount).toBe(2);
    expect(sci.used).toEqual(['experiment', 'data', 'literature']);
    expect(sci.expected).toEqual(['experiment', 'data', 'modeling']);
    expect(sci.missing).toEqual(['modeling']);
    expect(sci.lv3Share).toBe(0.5);
    const ko = g.lanes.find((l) => l.lane === '국어')!;
    expect(ko.used).toEqual(['reading', 'critique', 'writing']);
    expect(ko.missing).toEqual([]);
    const club = g.lanes.find((l) => l.lane === '동아리')!;
    expect(club.missing).toEqual(['making', 'survey', 'fieldtrip']);
  });

  it('laneMatrix: 교과군별 방법 수와 기록 수', () => {
    const sci = g.laneMatrix.find((l) => l.lane === '과학')!;
    expect(sci.total).toBe(2);
    expect(sci.cells.experiment).toBe(1);
    expect(sci.cells.literature).toBe(1);
    expect(sci.cells.coding).toBeUndefined();
  });

  it('skillMatrix: 과학 교과군과 과학 동아리 기록만 센다', () => {
    expect(isScienceRec(recs[0])).toBe(true);
    expect(isScienceRec(recs[2])).toBe(true);
    expect(isScienceRec(recs[3])).toBe(false);
    expect(g.skillMatrix.length).toBe(8);
    expect(row(g.skillMatrix, 'collect').cells).toEqual([2, 1, 0, 0, 0, 0]); // A, C(두 칸)
    expect(row(g.skillMatrix, 'collect').total).toBe(2);
    expect(row(g.skillMatrix, 'problem').cells).toEqual([0, 1, 0, 0, 0, 0]);
    expect(row(g.skillMatrix, 'design').total).toBe(0);
    expect(g.skillLaneMatrix.map((l) => l.lane)).toEqual(['동아리', '과학']);
    expect(g.skillLaneMatrix.find((l) => l.lane === '과학')!.cells.collect).toBe(1);
    expect(g.trend.some((t) => t.includes('전체 기록으로 계산'))).toBe(false);
  });

  it('suggestions: 교과군 결손(과학의 수학적 모델링)과 학기 결손(2학년 1학기는 기록 1건이라 제외)', () => {
    const sci = g.suggestions.find((s) => s.lane === '과학' && s.method === 'modeling');
    expect(sci).toBeDefined();
    expect(sci!.tg).toBe('d');
    expect(sci!.text).toContain('과학 교과 기록 2건');
    expect(sci!.text).toContain('수학적 모델링이');
    // 1학년 2학기는 기록 3건에 C의 실험·측정이 있으므로 학기 결손이 아니다
    expect(g.suggestions.some((s) => s.slot !== undefined)).toBe(false);
    // 과학 관련 기록 3건(A, B, C)에서 안 나온 기능은 4개라 한 문장으로 묶인다
    const sk = g.suggestions.filter((s) => s.skill);
    expect(sk.length).toBe(1);
    expect(sk[0].text).toContain('과학 관련 기록 3건');
    expect(sk[0].text).toContain('변인 통제·탐구 설계');
    // 국어는 기대 방법을 모두 썼으니 제안이 없다
    expect(g.suggestions.some((s) => s.lane === '국어')).toBe(false);
    // 진로 희망이 없으면 동아리 줄은 네 방법이 모두 없을 때만 짚는다(여기는 실험·측정이 있어 제안 없음)
    expect(g.suggestions.some((s) => s.lane === '동아리')).toBe(false);
  });

  it('trend: 학기별 문장과 변화 문장, 이어받은 기록 수', () => {
    expect(g.trend[0]).toContain('1학년 1학기: 기록 2건');
    expect(g.trend[0]).toContain('100%');
    expect(g.trend[1]).toContain('1학년 1학기 → 1학년 2학기');
    expect(g.trend[1]).toContain('내려감');
    expect(g.trend[1]).toContain('이어받은 기록 1건'); // A → C
    expect(g.trend[2]).toContain('기록이 1건이라 참고만 하세요');
    for (const t of g.trend) expect(t).not.toMatch(BAD);
    for (const s of g.suggestions) expect(s.text).not.toMatch(BAD);
  });
});

describe('buildGaps: 학기 결손과 방법 편중', () => {
  const recs = [
    rec('A', { lane: '사회', year: 1, sem: 1, methods: ['literature', 'discussion'], depth: 2 }),
    rec('B', { lane: '사회', year: 1, sem: 1, methods: ['literature'], depth: 2 }),
    rec('C', { lane: '국어', year: 1, sem: 1, methods: ['literature', 'writing'], depth: 2 }),
    rec('D', { lane: '영어', year: 1, sem: 1, methods: ['literature'], depth: 2 }),
    rec('E', { lane: '과학', year: 1, sem: 2, methods: ['experiment'], depth: 3 }),
  ];
  const g = buildGaps(recs, [], emptyStudent());

  it('3단계 방법이 없는 학기(기록 2건 이상)를 점검으로 낸다', () => {
    const s = g.suggestions.find((x) => x.slot === 0);
    expect(s).toBeDefined();
    expect(s!.tg).toBe('g');
    expect(s!.text).toContain('1학년 1학기 기록 4건');
    expect(g.suggestions.some((x) => x.slot === 1)).toBe(false);
  });

  it('방법 편중: 문헌·자료 조사 4/7', () => {
    const b = methodBias(recs);
    expect(b).not.toBeNull();
    expect(b!.method).toBe('literature');
    expect(b!.count).toBe(4);
    expect(b!.total).toBe(7);
    const s = g.suggestions.find((x) => x.method === 'literature' && !x.lane);
    expect(s).toBeDefined();
    expect(s!.text).toContain('57%');
    expect(s!.tg).toBe('g');
  });

  it('3단계 방법이 편중되어도 편중으로 보지 않는다', () => {
    const rs = [
      rec('A', { methods: ['experiment', 'data'] }),
      rec('B', { methods: ['experiment'] }),
      rec('C', { methods: ['experiment'] }),
      rec('D', { methods: ['experiment', 'writing'] }),
    ];
    expect(methodBias(rs)).toBeNull();
  });
});

describe('buildGaps: 과학 관련 기록이 없을 때', () => {
  const recs = [
    rec('A', { lane: '국어', year: 1, sem: 1, methods: ['writing'], skills: ['communicate'] }),
    rec('B', { lane: '사회', year: 1, sem: 2, methods: ['literature'], skills: ['interpret'] }),
    rec('C', { lane: '동아리', kind: '창체', subj: '동아리활동 (독서토론반)', year: 1, sem: null, methods: ['reading'], skills: ['communicate'] }),
  ];
  const g = buildGaps(recs, [], emptyStudent());

  it('전체 기록으로 대신 계산하고 trend에 적는다', () => {
    expect(recs.some(isScienceRec)).toBe(false);
    expect(row(g.skillMatrix, 'communicate').cells).toEqual([2, 1, 0, 0, 0, 0]);
    expect(row(g.skillMatrix, 'communicate').total).toBe(2);
    expect(row(g.skillMatrix, 'interpret').cells).toEqual([0, 1, 0, 0, 0, 0]);
    expect(g.skillLaneMatrix.map((l) => l.lane).sort()).toEqual(['국어', '동아리', '사회']);
    expect(g.trend.some((t) => t.includes('전체 기록으로 계산'))).toBe(true);
    // 과학 관련 기록이 없으니 기능 결손 제안은 내지 않는다
    expect(g.suggestions.some((s) => s.skill)).toBe(false);
  });
});

describe('buildGaps: 창체 줄과 진로 희망', () => {
  it('진로 희망 분야와 맞는 방법만 결손으로 본다', () => {
    const S = emptyStudent();
    S.hopes = [{ year: 1, text: '생명과학 연구원' }];
    const recs = [
      rec('C1', { lane: '동아리', kind: '창체', subj: '동아리활동 (독서반)', year: 1, sem: null, methods: ['reading', 'discussion'] }),
      rec('C2', { lane: '동아리', kind: '창체', subj: '동아리활동 (독서반)', year: 2, sem: null, methods: ['literature'] }),
      rec('P1', { lane: '진로', kind: '창체', subj: '진로활동', year: 1, sem: null, methods: ['fieldtrip', 'survey'] }),
      rec('P2', { lane: '진로', kind: '창체', subj: '진로활동', year: 2, sem: null, methods: ['experiment'] }),
    ];
    const g = buildGaps(recs, [], S);
    const club = g.suggestions.find((s) => s.lane === '동아리');
    expect(club).toBeDefined();
    expect(club!.method).toBe('experiment');
    expect(club!.text).toContain('동아리활동 기록 2건');
    expect(club!.text).toContain('생명과학·바이오');
    expect(club!.text).toContain('실험·측정이');
    // 진로활동의 기대 방법(현장 탐방, 설문·면담)은 모두 썼으므로 결손도 제안도 없다
    expect(g.suggestions.some((s) => s.lane === '진로')).toBe(false);
    expect(g.lanes.find((l) => l.lane === '진로')!.missing).toEqual([]);
  });

  it('진로 희망을 모르면 네 방법이 모두 없을 때만 점검한다', () => {
    const recs = [
      rec('C1', { lane: '동아리', kind: '창체', subj: '동아리활동 (독서반)', year: 1, sem: null, methods: ['reading'] }),
      rec('C2', { lane: '동아리', kind: '창체', subj: '동아리활동 (독서반)', year: 2, sem: null, methods: ['discussion'] }),
    ];
    const g = buildGaps(recs, [], emptyStudent());
    const club = g.suggestions.find((s) => s.lane === '동아리');
    expect(club).toBeDefined();
    expect(club!.tg).toBe('g');
    expect(club!.text).toContain('어느 것도 드러나지 않습니다');
  });

  it('hopeFields: 희망 문구의 분야', () => {
    expect(hopeFields('생명과학 연구원')).toEqual(['생명과학·바이오']);
    expect(hopeFields('미생물학 연구원')[0]).toBe('생명과학·바이오');
    expect(hopeFields('간호사')[0]).toBe('간호·보건');
    expect(hopeFields('')).toEqual([]);
    expect(hopeFields('아직 없음')).toEqual([]);
  });
});

describe('buildGaps: 기록이 없을 때', () => {
  it('빈 표와 안내 문장만 돌려주고 NaN이 없다', () => {
    const g = buildGaps([], [], emptyStudent());
    expect(g.slots).toEqual([]);
    expect(g.lanes).toEqual([]);
    expect(g.semMatrix.length).toBe(17);
    expect(g.semMatrix.every((r) => r.total === 0)).toBe(true);
    expect(g.laneMatrix).toEqual([]);
    expect(g.skillMatrix.length).toBe(8);
    expect(g.skillLaneMatrix).toEqual([]);
    expect(g.trend).toEqual(['분석할 기록이 없습니다.']);
    expect(g.suggestions).toEqual([]);
  });
});

/* ───────────────────────── 예시 학생 ───────────────────────── */

describe('buildGaps: 예시 학생', () => {
  const S = sampleStudent();
  const recs = buildRecords(S);
  const ctx = buildCtx(S);
  for (const r of recs) analyzeRecord(r, ctx);
  const g = buildGaps(recs, [], S);

  it('기록이 있는 학기는 1-1, 1-2, 2-1, 그리고 2학년 창체가 걸치는 2-2', () => {
    expect(g.slots.map((s) => s.slot)).toEqual([0, 1, 2, 3]);
    // 2-2 칸은 학기 구분 없는 2학년 창체만 있다
    const s3 = g.slots[3];
    expect(s3.recIds.every((id) => recs.find((r) => r.id === id)!.sem === null)).toBe(true);
    // 2-2 칸은 2-1 칸에 이미 든 창체만 다시 들어 있으므로 변화 문장을 만들지 않고 사실만 적는다
    expect(g.trend.some((t) => t.startsWith('2학년 2학기:') && t.includes('아직 학기별 기록이 없습니다'))).toBe(true);
    expect(g.trend.some((t) => t.includes('2학년 1학기 → 2학년 2학기'))).toBe(false);
    // 전체 흐름은 아직 오지 않은 2-2 대신 2-1까지 본다
    const whole = g.trend.find((t) => t.startsWith('전체 흐름'))!;
    expect(whole).toContain('2학년 1학기까지');
    for (const s of g.slots) {
      expect(s.recIds.length).toBeGreaterThan(0);
      expect(s.avgDepth).toBeGreaterThanOrEqual(1);
      expect(s.avgDepth).toBeLessThanOrEqual(4);
      expect(s.lv3Share).toBeGreaterThanOrEqual(0);
      expect(s.lv3Share).toBeLessThanOrEqual(1);
    }
  });

  it('창체 기록은 그 학년의 두 칸에 들어간다', () => {
    const club = recs.find((r) => r.kind === '창체' && r.lane === '동아리' && r.year === 1)!;
    expect(g.slots[0].recIds).toContain(club.id);
    expect(g.slots[1].recIds).toContain(club.id);
    expect(g.slots[2].recIds).not.toContain(club.id);
  });

  it('과학 교과군과 과학 동아리가 과학 관련 기록이고, 실험·측정이 표에 잡힌다', () => {
    const sci = recs.filter(isScienceRec);
    expect(sci.length).toBeGreaterThanOrEqual(4);
    expect(sci.some((r) => r.kind === '창체')).toBe(true);
    expect(row(g.semMatrix, 'experiment').total).toBeGreaterThanOrEqual(2);
    expect(row(g.skillMatrix, 'collect').total).toBeGreaterThanOrEqual(1);
    expect(g.trend.some((t) => t.includes('전체 기록으로 계산'))).toBe(false);
  });

  it('문장에 undefined, NaN이 없고 숫자가 들어 있다', () => {
    expect(g.trend.length).toBeGreaterThanOrEqual(3);
    for (const t of g.trend) expect(t).not.toMatch(BAD);
    expect(g.suggestions.length).toBeGreaterThan(0);
    for (const s of g.suggestions) {
      expect(s.text).not.toMatch(BAD);
      expect(s.text).toMatch(/\d/);
      expect(['d', 'g']).toContain(s.tg);
    }
    // 학급 자치 활동에 변인 통제 실험을 기대하지 않으므로 자율·자치 줄에는 실험·측정 제안이 없다
    expect(g.suggestions.some((s) => s.lane === '자율·자치' && s.method === 'experiment')).toBe(false);
    // 통합사회·한국사 기록은 자료 조사와 토론에 머물러 사회 교과의 설문·면담, 데이터 분석 결손이 잡힌다
    const soc = g.suggestions.find((s) => s.lane === '사회');
    expect(soc).toBeDefined();
    expect(soc!.text).toContain('가운데 어느 것도 드러나지 않습니다');
    expect(soc!.text).not.toContain('가운데 설문·면담, 데이터 분석 가운데');
  });
});

/* ───────────────────────── 리뷰 뒤 보강 ───────────────────────── */
describe('buildGaps: 학기 구분 없는 기록의 흐름 문장', () => {
  it('창체 한 건만 있으면 자기 자신과 비교하지 않고 (학년 전체)로 부른다', () => {
    const recs = [rec('C', { lane: '동아리', kind: '창체', sem: null, methods: ['experiment'], depth: 3 })];
    const g = buildGaps(recs, [], emptyStudent());
    expect(g.trend[0]).toMatch(/^1학년 \(학년 전체\): 기록 1건/);
    expect(g.trend.some((t) => t.includes('→'))).toBe(false);
    expect(g.trend.some((t) => t.includes('1학년 1학기'))).toBe(false);
  });
  it('세특이 있는 학기와 같은 학년의 창체만 든 다음 칸은 변화 문장 대신 사실만 적는다', () => {
    const recs = [
      rec('A', { year: 1, sem: 1, methods: ['literature'], depth: 2 }),
      rec('B', { year: 2, sem: 1, methods: ['experiment'], depth: 3 }),
      rec('C', { lane: '동아리', kind: '창체', year: 2, sem: null, methods: ['experiment'], depth: 4 }),
    ];
    const g = buildGaps(recs, [], emptyStudent());
    expect(g.trend.some((t) => t.includes('2학년 1학기 → 2학년 2학기'))).toBe(false);
    expect(g.trend.some((t) => t.startsWith('2학년 2학기:') && t.includes('아직 학기별 기록이 없습니다'))).toBe(true);
    expect(g.trend.some((t) => t.includes('1학년 1학기 → 2학년 1학기'))).toBe(true);
  });
  it('같은 칸 안의 연결은 앞 탐구를 이어받은 것으로 세지 않는다', () => {
    const recs = [
      rec('A', { year: 1, sem: 1, methods: ['experiment'], depth: 3 }),
      rec('C', { lane: '동아리', kind: '창체', year: 1, sem: null, methods: ['experiment'], depth: 4 }),
      rec('B', { year: 1, sem: 2, methods: ['experiment'], depth: 3 }),
    ];
    const links: Link[] = [
      { from: 'A', to: 'C', rel: '심화', cross: true, ss: false, cc: true, cite: false, words: [], theme: null, hope: null, sc: 5, sent: '', head: '', detail: '', why: '', lines: [], newM: [] },
      { from: 'A', to: 'B', rel: '심화', cross: false, ss: false, cc: false, cite: false, words: [], theme: null, hope: null, sc: 5, sent: '', head: '', detail: '', why: '', lines: [], newM: [] },
    ];
    const g = buildGaps(recs, links, emptyStudent());
    // 1-1 칸: A→C는 둘 다 같은 칸에 있으므로 세지 않는다. 1-2 칸: B와 (두 칸에 걸친) C가 1-1의 A에서 이어받았다
    expect(g.trend[0]).not.toContain('이어받은');
    expect(g.trend[1]).toContain('앞 탐구를 이어받은 기록 2건');
  });
  it('학기 결손 문장도 창체만 있는 칸은 (학년 전체)로 부른다', () => {
    const recs = [
      rec('C1', { lane: '동아리', kind: '창체', year: 2, sem: null, methods: ['reading'], depth: 2 }),
      rec('C2', { lane: '진로', kind: '창체', year: 2, sem: null, methods: ['literature'], depth: 2 }),
    ];
    const g = buildGaps(recs, [], emptyStudent());
    const s = g.suggestions.find((x) => x.slot !== undefined);
    expect(s).toBeDefined();
    expect(s!.text).toMatch(/^2학년 \(학년 전체\) 기록 2건에 3단계 방법/);
    expect(g.suggestions.filter((x) => x.slot !== undefined)).toHaveLength(1);
  });
});

describe('buildGaps: 결손 문장의 조사', () => {
  it("결손 방법이 둘 이상이면 'A, B 가운데 어느 것도 드러나지 않습니다'", () => {
    const recs = [
      rec('A', { lane: '사회', methods: ['literature'], depth: 2 }),
      rec('B', { lane: '사회', methods: ['discussion'], depth: 1 }),
    ];
    const g = buildGaps(recs, [], emptyStudent());
    const s = g.suggestions.find((x) => x.lane === '사회')!;
    expect(s.text).toMatch(/기록 2건에 .* 가운데 어느 것도 드러나지 않습니다\./);
    expect(s.text).not.toMatch(/가운데 .* 가운데/);
  });
  it('결손 방법이 하나면 받침에 맞는 조사를 붙인다', () => {
    const recs = [
      rec('A', { lane: '과학', methods: ['experiment', 'data'], depth: 3 }),
      rec('B', { lane: '과학', methods: ['experiment'], depth: 3 }),
    ];
    const g = buildGaps(recs, [], emptyStudent());
    const s = g.suggestions.find((x) => x.lane === '과학')!;
    expect(s.text).toContain('기록 2건 가운데 수학적 모델링이 드러난 기록이 없습니다.');
  });
  it('자율·자치활동에는 실험·측정을 기대하지 않는다', () => {
    const S = emptyStudent();
    S.hopes = [{ year: 1, text: '생명과학 연구원' }];
    const recs = [
      rec('C1', { lane: '자율·자치', kind: '창체', subj: '자율·자치활동', year: 1, sem: null, methods: ['proposal', 'survey'] }),
      rec('C2', { lane: '자율·자치', kind: '창체', subj: '자율·자치활동', year: 2, sem: null, methods: ['discussion'] }),
    ];
    const g = buildGaps(recs, [], S);
    expect(g.lanes.find((l) => l.lane === '자율·자치')!.expected).toEqual(['survey', 'proposal']);
    expect(g.suggestions.some((s) => s.lane === '자율·자치')).toBe(false);
  });
});
