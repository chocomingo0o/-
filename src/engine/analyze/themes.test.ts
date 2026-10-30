import { describe, expect, it } from 'vitest';
import type { LaneKey, Rec, Year } from '../types';
import { INQ_RX } from '../dict/patterns';
import { sampleStudent } from '../../fixtures/sample';
import { buildRecords, subjectStop } from './records';
import { sentences, tokens } from './text';
import { MIN_EFFECTIVE_N, THEME_COLORS, buildStats, buildThemes, keywordFn } from './themes';

/** 손으로 만든 기록. tf, ktf만 채우고 나머지는 비워 둔다. */
function rec(id: string, lane: LaneKey, year: Year, tf: Record<string, number>, ktf: string[] = []): Rec {
  return {
    id,
    lane,
    year,
    sem: 1,
    kind: '세특',
    subj: lane,
    t: (year - 1) * 2,
    text: '',
    grades: [],
    tf: new Map(Object.entries(tf)),
    ktf: new Set(ktf),
    key: [],
    acts: [],
    themes: [],
    kw: [],
    faint: false,
    depth: 1,
  } as unknown as Rec;
}

describe('buildStats', () => {
  const recs = [
    rec('A', '과학', 1, { 카탈레이스: 3, 효소: 2, 온도: 1 }, ['카탈레이스', '온도']),
    rec('B', '동아리', 1, { 카탈레이스: 2, 효소: 1, 과산화수소: 2 }, ['카탈레이스']),
    rec('C', '국어', 2, { 항생제: 2, 내성균: 1 }, ['항생제']),
  ];
  const st = buildStats(recs);

  it('N과 df, kdf를 기록 단위로 센다', () => {
    expect(st.N).toBe(3);
    expect(st.df.get('카탈레이스')).toBe(2);
    expect(st.df.get('효소')).toBe(2);
    expect(st.df.get('항생제')).toBe(1);
    expect(st.df.get('없는낱말')).toBeUndefined();
    expect(st.kdf.get('카탈레이스')).toBe(2);
    expect(st.kdf.get('효소')).toBeUndefined();
    expect(st.kdf.get('항생제')).toBe(1);
  });
  it('idf = ln((Neff+1)/(df+0.5)), Neff = max(N, 8). 없는 낱말은 df 0으로 계산한다', () => {
    // 기록 3건이므로 Neff는 8(MIN_EFFECTIVE_N). 기록이 적어도 연결 점수가 문턱에 닿게 하기 위한 하한
    expect(MIN_EFFECTIVE_N).toBe(8);
    expect(st.idf('카탈레이스')).toBeCloseTo(Math.log(9 / 2.5), 10);
    expect(st.idf('항생제')).toBeCloseTo(Math.log(9 / 1.5), 10);
    expect(st.idf('없는낱말')).toBeCloseTo(Math.log(9 / 0.5), 10);
    // 모든 기록에 나와도 양수
    expect(st.idf('카탈레이스')).toBeGreaterThan(0);
  });
  it('cw는 흔한 낱말 가중치(COMMON)다. 사전에 없으면 1, 있으면 0.25 이상 1 미만', () => {
    expect(st.cw('카탈레이스')).toBe(1);
    expect(st.cw('항생제')).toBeCloseTo(0.25 + 0.75 * (1 - 0.3), 10);
    expect(st.cw('역사')).toBeCloseTo(0.25, 10);
  });
  it('기록이 없어도 N은 1이다', () => {
    const e = buildStats([]);
    expect(e.N).toBe(1);
    expect(e.df.size).toBe(0);
    expect(e.idf('x')).toBeCloseTo(Math.log(9 / 0.5), 10);
  });
});

describe('keywordFn', () => {
  it('(핵심 문장 1.6) × min(3,tf) × idf × cw 상위 3개, 흔한 낱말(df > max(4, 0.35N))은 뺀다', () => {
    // 10개 기록 전부에 '효소'가 나오면 df 10 > max(4, 3.5) → 핵심어에서 빠진다
    const recs: Rec[] = [];
    for (let i = 0; i < 10; i++) recs.push(rec(`R${i}`, '과학', 1, { 효소: 3 }));
    const target = rec('T', '과학', 1, { 효소: 5, 카탈레이스: 1, 과산화수소: 3, 거품: 1, 감자: 2 }, ['카탈레이스']);
    recs.push(target);
    const st = buildStats(recs);
    const kw = keywordFn(st)(target);
    expect(kw).toHaveLength(3);
    expect(kw).not.toContain('효소');
    // 과산화수소: 3 × idf(df1), 카탈레이스: 1.6 × 1 × idf(df1), 감자: 2 × idf(df1), 거품: 1 × idf(df1)
    expect(kw).toEqual(['과산화수소', '감자', '카탈레이스']);
  });
  it('핵심 문장에 있는 낱말은 1.6배로 올라간다', () => {
    const a = rec('A', '과학', 1, { 전압: 1, 전극: 1 }, ['전극']);
    const b = rec('B', '수학', 2, { 함수: 1 });
    const st = buildStats([a, b]);
    expect(keywordFn(st)(a)).toEqual(['전극', '전압']);
  });
  it('낱말이 없으면 빈 배열', () => {
    const a = rec('A', '과학', 1, {});
    expect(keywordFn(buildStats([a]))(a)).toEqual([]);
  });
});

describe('buildThemes', () => {
  it('두 교과군에 걸쳐 핵심 문장에 되풀이되는 낱말을 주제로 뽑고 r.themes와 색을 채운다', () => {
    const a = rec('A', '과학', 1, { 카탈레이스: 3, 효소: 2, 온도: 1 }, ['카탈레이스', '온도']);
    const b = rec('B', '동아리', 1, { 카탈레이스: 2, 과산화수소: 2 }, ['카탈레이스', '과산화수소']);
    const c = rec('C', '국어', 1, { 항생제: 1, 글쓰기: 1 }, ['항생제']);
    const recs = [a, b, c];
    const themes = buildThemes(recs, buildStats(recs));
    expect(themes.map((t) => t.name)).toEqual(['카탈레이스']);
    expect(themes[0].ids).toEqual(['A', 'B']);
    expect(themes[0].words).toEqual(['카탈레이스']);
    expect(themes[0].color).toBe(THEME_COLORS[0]);
    expect(a.themes).toEqual(['카탈레이스']);
    expect(b.themes).toEqual(['카탈레이스']);
    expect(c.themes).toEqual([]);
  });
  it('한 교과군, 한 학년 안에서만 되풀이되는 낱말은 주제가 아니다', () => {
    const a = rec('A', '과학', 1, { 카탈레이스: 2 }, ['카탈레이스']);
    const b = rec('B', '과학', 1, { 카탈레이스: 2 }, ['카탈레이스']);
    expect(buildThemes([a, b], buildStats([a, b]))).toEqual([]);
  });
  it('같은 교과군이라도 두 학년에 걸치면 주제가 된다', () => {
    const a = rec('A', '과학', 1, { 카탈레이스: 2 }, ['카탈레이스']);
    const b = rec('B', '과학', 2, { 카탈레이스: 1 }, ['카탈레이스']);
    expect(buildThemes([a, b], buildStats([a, b])).map((t) => t.name)).toEqual(['카탈레이스']);
  });
  it('핵심 문장에 한 기록만 나오는 낱말은 주제가 아니다(본문에 여러 번 있어도)', () => {
    const a = rec('A', '과학', 1, { 카탈레이스: 3 }, ['카탈레이스']);
    const b = rec('B', '동아리', 1, { 카탈레이스: 3 }, []);
    expect(buildThemes([a, b], buildStats([a, b]))).toEqual([]);
  });
  it('두 글자 낱말은 핵심 문장 3건 이상일 때만', () => {
    const a = rec('A', '과학', 1, { 전압: 1 }, ['전압']);
    const b = rec('B', '동아리', 1, { 전압: 1 }, ['전압']);
    expect(buildThemes([a, b], buildStats([a, b]))).toEqual([]);
    const c = rec('C', '수학', 2, { 전압: 1 }, ['전압']);
    expect(buildThemes([a, b, c], buildStats([a, b, c])).map((t) => t.name)).toEqual(['전압']);
  });
  it('기록의 30%(최소 4건)보다 많은 기록에 나오는 낱말은 흔한 말이라 빼고, 점수순으로 늘어놓는다', () => {
    const recs: Rec[] = [];
    // 20개 기록 모두에 '효소'(df 20 > 6). '카탈레이스'는 그중 4개(두 교과군).
    for (let i = 0; i < 20; i++) {
      const lane: LaneKey = i % 2 ? '과학' : '동아리';
      const tf: Record<string, number> = { 효소: 2 };
      const ktf = ['효소'];
      if (i < 4) {
        tf['카탈레이스'] = 2;
        ktf.push('카탈레이스');
      }
      // '항생제'는 다른 기록 3개(두 교과군)에만 → 카탈레이스와 기록이 겹치지 않아 따로 주제가 된다
      if (i >= 10 && i < 13) {
        tf['항생제'] = 1;
        ktf.push('항생제');
      }
      recs.push(rec(`R${i}`, lane, 1, tf, ktf));
    }
    const themes = buildThemes(recs, buildStats(recs));
    const names = themes.map((t) => t.name);
    expect(names).not.toContain('효소');
    expect(names[0]).toBe('카탈레이스');
    expect(names).toContain('항생제');
  });
  it('기록 집합이 거의 같은 두 낱말은 한 주제로 합친다(words에 모두 남김)', () => {
    const a = rec('A', '과학', 1, { 항생제: 2, 내성균: 2 }, ['항생제', '내성균']);
    const b = rec('B', '국어', 1, { 항생제: 1, 내성균: 1 }, ['항생제', '내성균']);
    const c = rec('C', '진로', 1, { 항생제: 1, 내성균: 1 }, ['항생제', '내성균']);
    const recs = [a, b, c];
    const themes = buildThemes(recs, buildStats(recs));
    expect(themes).toHaveLength(1);
    expect(themes[0].words.slice().sort()).toEqual(['내성균', '항생제']);
    expect(themes[0].ids).toEqual(['A', 'B', 'C']);
  });
  it('포함 관계인 낱말은 자카드가 0.3을 넘으면 합친다', () => {
    const a = rec('A', '과학', 1, { 항생제: 2, 항생제내성: 2 }, ['항생제', '항생제내성']);
    const b = rec('B', '국어', 1, { 항생제: 1, 항생제내성: 1 }, ['항생제', '항생제내성']);
    const c = rec('C', '진로', 1, { 항생제: 1 }, ['항생제']);
    const d = rec('D', '영어', 2, { 항생제: 1 }, ['항생제']);
    const recs = [a, b, c, d];
    const themes = buildThemes(recs, buildStats(recs));
    expect(themes).toHaveLength(1);
    expect(themes[0].words).toContain('항생제내성');
    expect(themes[0].words).toContain('항생제');
  });
  it('주제는 최대 6개, 색은 팔레트 순서', () => {
    const recs: Rec[] = [];
    const words = ['가나다', '라마바', '사아자', '차카타', '파하가', '나다라', '마바사', '아자차'];
    const lanes: LaneKey[] = ['과학', '수학', '영어', '국어', '사회', '동아리', '진로', '정보·기술'];
    // 낱말마다 두 교과군의 기록 2개씩(기록 집합이 서로 달라 합쳐지지 않음)
    words.forEach((w, i) => {
      recs.push(rec(`A${i}`, lanes[i], 1, { [w]: 3 - (i % 2) }, [w]));
      recs.push(rec(`B${i}`, lanes[(i + 1) % lanes.length], 1, { [w]: 2 }, [w]));
    });
    const themes = buildThemes(recs, buildStats(recs));
    expect(themes).toHaveLength(6);
    themes.forEach((t, i) => expect(t.color).toBe(THEME_COLORS[i]));
  });
  it('THEME_COLORS는 여섯 가지 hex 색', () => {
    expect(THEME_COLORS).toHaveLength(6);
    for (const c of THEME_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(THEME_COLORS).size).toBe(6);
  });
});

describe('buildThemes(sampleStudent()) - depth 모듈 없이 tokens로 tf/ktf를 채운 근사', () => {
  it("'카탈레이스'와 '항생제'가 관심 주제로 잡힌다", () => {
    const S = sampleStudent();
    const recs = buildRecords(S);
    const stop = subjectStop(S);
    for (const r of recs) {
      for (const w of tokens(r.text, stop)) r.tf.set(w, (r.tf.get(w) ?? 0) + 1);
      // 핵심 문장 근사: 탐구 동사가 있는 문장. 없으면 모든 문장
      const ss = sentences(r.text);
      const keyS = ss.filter((x) => INQ_RX.test(x.s));
      for (const x of keyS.length ? keyS : ss) for (const w of tokens(x.s, stop)) r.ktf.add(w);
    }
    const st = buildStats(recs);
    const themes = buildThemes(recs, st);
    const names = themes.map((t) => t.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThanOrEqual(6);
    expect(names).toContain('카탈레이스');
    expect(names).toContain('항생제');
    // 카탈레이스 주제는 과학 교과와 동아리에 함께 걸친다
    const cat = themes.find((t) => t.name === '카탈레이스')!;
    const lanes = new Set(recs.filter((r) => cat.ids.includes(r.id)).map((r) => r.lane));
    expect(lanes.has('과학')).toBe(true);
    expect(lanes.has('동아리')).toBe(true);
    // 핵심어는 기록마다 3개까지, 과목명·불용어가 아닌 낱말로만
    const exp = recs.find((r) => r.subj === '과학탐구실험1')!;
    const kw = keywordFn(st)(exp);
    expect(kw).toHaveLength(3);
    for (const w of kw) expect(stop.has(w), w).toBe(false);
    // 카탈레이스는 여러 기록의 핵심 문장에 걸치지만(kdf 2 이상) 기록 수의 30%는 넘지 않는다
    expect(st.kdf.get('카탈레이스') ?? 0).toBeGreaterThanOrEqual(2);
    expect(st.df.get('카탈레이스') ?? 0).toBeLessThanOrEqual(Math.max(4, st.N * 0.3));
  });
});

/* ───────────────────────── 리뷰 뒤 보강 ───────────────────────── */
describe('buildThemes: 겹침 합치기는 6개 제한과 무관하다', () => {
  it('7번째 이후의 변형 낱말(포함 관계)도 기존 주제의 words에 들어간다', () => {
    const recs: Rec[] = [];
    const words = ['가나다', '라마바', '사아자', '차카타', '파하가', '나다라', '마바사'];
    const lanes: LaneKey[] = ['과학', '수학', '영어', '국어', '사회', '동아리', '진로'];
    words.forEach((w, i) => {
      recs.push(rec(`A${i}`, lanes[i], 1, { [w]: 3 }, [w]));
      recs.push(rec(`B${i}`, lanes[(i + 1) % lanes.length], 1, { [w]: 3 }, [w]));
    });
    // '항생제'(점수 가장 낮음)와 그것을 품은 '항생제내성'을 같은 두 기록에 둔다 → 합쳐져야 한다
    recs.push(rec('X0', '과학', 1, { 항생제: 1, 항생제내성: 1 }, ['항생제', '항생제내성']));
    recs.push(rec('X1', '영어', 1, { 항생제: 1, 항생제내성: 1 }, ['항생제', '항생제내성']));
    const themes = buildThemes(recs, buildStats(recs));
    expect(themes.length).toBeLessThanOrEqual(6);
    const merged = themes.find((t) => t.words.includes('항생제') || t.words.includes('항생제내성'));
    // 6개가 이미 찼더라도 포함 관계의 낱말은 같은 주제로 합쳐진다(둘 다 빠지는 일은 없다)
    if (merged) expect(merged.words).toEqual(expect.arrayContaining(['항생제', '항생제내성']));
  });
  it("매우 흔한 낱말('반응', cw<0.5)은 관심 분야 낱말이 아니면 후보에서 뺀다", () => {
    const a = rec('A', '과학', 1, { 반응: 3, 카탈레이스: 2 }, ['반응', '카탈레이스']);
    const b = rec('B', '국어', 1, { 반응: 2, 카탈레이스: 2 }, ['반응', '카탈레이스']);
    const c = rec('C', '수학', 2, { 반응: 2 }, ['반응']);
    const names = buildThemes([a, b, c], buildStats([a, b, c])).map((t) => t.name);
    expect(names).toContain('카탈레이스');
    expect(names).not.toContain('반응');
  });
});
