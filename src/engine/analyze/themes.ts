/**
 * 핵심어와 관심 주제.
 *
 * - buildStats  : 낱말 통계. 기록 문서 빈도(df), 핵심 문장 문서 빈도(kdf), idf, 흔한 낱말 가중치(cw)
 * - keywordFn   : 기록 하나의 핵심어 3개를 고르는 함수를 만든다
 * - buildThemes : 여러 기록(두 교과군 이상 또는 두 학년 이상)의 핵심 문장에 되풀이되는 드문 낱말을
 *                 관심 주제로 묶는다. 각 기록의 r.themes도 채운다.
 * - THEME_COLORS: 관심 주제 색 팔레트(고정 순서)
 *
 * 규칙은 docs/DESIGN.md 4.5를 따른다. 이 파일은 DOM에 의존하지 않는다.
 * 앞 단계(depth.ts)가 r.tf(낱말 빈도), r.ktf(핵심 문장 낱말)를 채워 두어야 한다.
 */
import type { LaneKey, Rec, Stats, Theme, Year } from '../types';
import { commonWeight } from '../dict/stop';
import { FIELD_TERMS } from '../dict/fields';

/**
 * 관심 주제 색. 연보라, 민트, 노랑의 진한 변형과 검정, 그리고 연보라·민트의 밝은 변형.
 * 화면은 색보다 이름 칩으로 주제를 구분하므로 색은 보조 표시일 뿐이다. 7번째부터는 처음으로 돌아간다.
 */
export const THEME_COLORS: string[] = ['#7a55d6', '#2f8f57', '#c48f0a', '#1a1a1a', '#9579f2', '#3faa6b'];

/* ───────────────────────── 낱말 통계 ───────────────────────── */

/**
 * 모든 기록의 낱말 통계.
 * - N   : 기록 수(기록이 없어도 1로 두어 나눗셈이 깨지지 않게 한다)
 * - df  : 낱말이 나온 기록 수(기록 안 반복은 한 번으로 센다)
 * - kdf : 낱말이 핵심 문장에 나온 기록 수
 * - idf : ln((Neff+1)/(df+0.5)). 드문 낱말일수록 크다. df가 N이어도 양수다.
 *         Neff = max(N, 8). 기록이 서너 건뿐인 학생부(1학년 1학기만 있을 때)에서는 N을 그대로 쓰면 idf가 0.2 안팎으로
 *         내려앉아 연결 점수가 문턱(5/4/2.5)에 닿지 못한다. 기록 8건짜리 학생부와 같은 눈금으로 재어
 *         '1학년 학생부만 있어도 동작한다'는 원칙을 지킨다. 순위는 바뀌지 않는다.
 * - cw  : 흔한 낱말 가중치(dict/stop.ts의 COMMON). 여러 학생부에 두루 나오는 낱말은 0.25까지 낮아진다.
 */
export const MIN_EFFECTIVE_N = 8;

export function buildStats(recs: Rec[]): Stats {
  const N = Math.max(1, recs.length);
  const Neff = Math.max(N, MIN_EFFECTIVE_N);
  const df = new Map<string, number>();
  const kdf = new Map<string, number>();
  for (const r of recs) {
    r.tf.forEach((_, t) => df.set(t, (df.get(t) ?? 0) + 1));
    r.ktf.forEach((t) => kdf.set(t, (kdf.get(t) ?? 0) + 1));
  }
  const idf = (t: string): number => Math.log((Neff + 1) / ((df.get(t) ?? 0) + 0.5));
  const cw = (t: string): number => commonWeight(t);
  return { N, df, kdf, idf, cw };
}

/* ───────────────────────── 기록 핵심어 ───────────────────────── */

/**
 * 기록 핵심어 3개를 고르는 함수.
 * 점수 = (핵심 문장에 있으면 1.6, 아니면 1) × min(3, 기록 안 빈도) × idf × cw.
 * 기록의 35%(최소 4건)보다 많은 기록에 나오는 낱말은 그 학생의 어느 기록에나 나오는 말이므로 뺀다.
 * 점수가 같으면 본문에 먼저 나온 낱말(tf의 삽입 순서)을 앞에 둔다.
 */
export function keywordFn(stats: Stats): (r: Rec) => string[] {
  const dfLimit = Math.max(4, stats.N * 0.35);
  return (r: Rec): string[] => {
    const pool: [string, number][] = [];
    r.tf.forEach((v, t) => {
      if ((stats.df.get(t) ?? 0) > dfLimit) return;
      const w = (r.ktf.has(t) ? 1.6 : 1) * Math.min(3, v) * stats.idf(t) * stats.cw(t);
      pool.push([t, w]);
    });
    pool.sort((a, b) => b[1] - a[1]);
    return pool.slice(0, 3).map((e) => e[0]);
  };
}

/* ───────────────────────── 관심 주제 ───────────────────────── */

interface Cand {
  t: string;          // 낱말
  rs: Rec[];          // 이 낱말을 핵심 문장에 쓰거나 두 번 이상 쓴 기록
  lanes: Set<LaneKey>;
  yrs: Set<Year>;
  sc: number;
}

interface Group {
  t: string;          // 대표 낱말(점수가 가장 높은 것)
  alt: string[];      // 같은 주제로 합쳐진 다른 낱말
  rs: Rec[];
}

/** 관심 주제 최대 개수 */
const MAX_THEMES = 6;

/**
 * 관심 주제 묶기.
 *
 * 후보가 되는 낱말
 * - 핵심 문장에 나온 기록(kdf)이 2건 이상
 * - 흔하지 않음: df가 기록의 30%(최소 4건) 이하
 * - 두 글자 낱말은 kdf 3건 이상일 때만(두 글자는 우연히 겹치기 쉽다)
 * - 흔한 낱말 가중치 cw가 0.5 이상(관심 분야 낱말은 예외). '반응', '결과'처럼 어느 교과에나 나오는 말은
 *   '독자의 반응'과 '화학 반응'을 한 주제로 묶어 버리므로 후보에서 뺀다
 * - 그 낱말을 핵심 문장에 쓰거나 두 번 이상 쓴 기록들이 두 교과군 이상 또는 두 학년 이상에 걸침
 *
 * 점수 = (Σmin(3, tf) + kdf×1.5 + 교과군 수×1.4 + 학년 수×1.6 + (3자 이상이면 2)) × cw × (관심 분야 낱말이면 1.3)
 *
 * 겹침 합치기(점수 높은 순으로 보면서)
 * - 기록 집합의 자카드 유사도가 0.7을 넘으면 같은 주제
 * - 한 낱말이 주제의 낱말(대표 낱말이나 합쳐진 낱말) 하나를 품고('내성균' ⊃ '내성') 자카드가 0.3을 넘으면 같은 주제
 * - 둘 다 관심 분야 사전(FIELD_TERMS) 낱말이고, 새 낱말의 기록이 3건 이상이며, 자카드가 0.4를 넘거나 새 낱말의 기록이 거의 모두(75% 이상) 기존 주제 안에 있으면
 *   같은 관심의 다른 낱말이다('세균', '감염병', '미생물학' → '항생제'). 교사에게 관심 주제가 6개로 부풀려 보이지 않게 한다.
 *   이때 그 주제의 다른 낱말이 본문에 하나도 없는 기록은 주제에 더하지 않는다('세균 수를 등비수열로'의 대수는 항생제 주제가 아니다)
 * - 위 둘이 아니면서 새 낱말의 기록(2건 이상)이 모두 기존 주제의 기록 안에 있으면 그 주제의 한 갈래로 보고 버린다
 *   ('활성', '기질' ⊂ '카탈레이스'). 따로 주제로 세우지 않고, 주제 낱말에도 넣지 않는다(형광펜과 연결 점수가 흔한 말로 넓어지지 않게)
 * 합쳐진 낱말은 words에, 기록은 ids에 더한다. 이름은 대표 낱말이되, 대표 낱말이 관심 분야 낱말이 아니면 합쳐진 관심 분야 낱말
 * (핵심 문장 기록 수 > 빈도 > 길이)을 이름으로 올린다('배출' 대신 '기후변화'). 주제는 최대 6개까지만 새로 만들되,
 * 이미 만든 주제에 합쳐지는 낱말('내성균' ⊂ '항생제내성균')은 6개가 찬 뒤에도 계속 합친다(형광펜·기록 집계에서 빠지지 않게).
 * 색은 THEME_COLORS를 순서대로 쓴다. 각 기록의 r.themes에 자기가 속한 주제 이름을 적는다.
 */
/**
 * 주제 이름. 대표 낱말(점수 1위)이 관심 분야 사전 낱말이면 그대로 쓴다.
 * 아니면('배출') 합쳐진 낱말 가운데 관심 분야 낱말('기후변화', '온실가스', '국제기구')을 이름으로 올린다.
 * 여럿이면 핵심 문장에 나온 기록 수(kdf) > 기록 안 빈도 합 > 길이 순. 교사가 알아볼 이름을 앞세우기 위한 것이다.
 */
function themeName(g: Group, kdf: Map<string, number>): string {
  if (FIELD_TERMS.has(g.t)) return g.t;
  const fieldWords = [g.t, ...g.alt].filter((w) => FIELD_TERMS.has(w));
  if (!fieldWords.length) return g.t;
  const freq = (w: string): number => g.rs.reduce((a, r) => a + Math.min(3, r.tf.get(w) ?? 0), 0);
  fieldWords.sort((a, b) => (kdf.get(b) ?? 0) - (kdf.get(a) ?? 0) || freq(b) - freq(a) || b.length - a.length);
  return fieldWords[0];
}

export function buildThemes(recs: Rec[], stats: Stats): Theme[] {
  const { N, df, kdf, cw } = stats;
  const dfLimit = Math.max(4, N * 0.3);
  const order = new Map<string, number>(recs.map((r, i) => [r.id, i]));

  const cand: Cand[] = [];
  kdf.forEach((d, t) => {
    if (d < 2) return;
    if ((df.get(t) ?? 0) > dfLimit) return;
    if (d < 3 && t.length < 3) return;
    // 관심 분야 낱말은 흔해도 받되, 어느 학생부에나 나오는 가장 흔한 말('역사', cw 0.25)은 뺀다
    if (cw(t) < 0.5 && !(FIELD_TERMS.has(t) && cw(t) > 0.25)) return;
    const rs = recs.filter((r) => r.ktf.has(t) || (r.tf.get(t) ?? 0) >= 2);
    if (!rs.length) return;
    const lanes = new Set<LaneKey>(rs.map((r) => r.lane));
    const yrs = new Set<Year>(rs.map((r) => r.year));
    if (lanes.size < 2 && yrs.size < 2) return;
    const tfs = rs.reduce((a, r) => a + Math.min(3, r.tf.get(t) ?? 1), 0);
    const sc =
      (tfs + d * 1.5 + lanes.size * 1.4 + yrs.size * 1.6 + (t.length >= 3 ? 2 : 0)) *
      cw(t) *
      (FIELD_TERMS.has(t) ? 1.3 : 1);
    cand.push({ t, rs, lanes, yrs, sc });
  });
  // 점수 내림차순. 같으면 긴 낱말(더 구체적인 말)을, 그래도 같으면 사전순을 앞에 둔다.
  cand.sort((a, b) => b.sc - a.sc || b.t.length - a.t.length || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));

  const groups: Group[] = [];
  for (const c of cand) {
    const ids = new Set(c.rs.map((r) => r.id));
    // 'word': 같은 주제의 다른 낱말로 합친다(words와 ids에 더함)
    // 'field': 관심 분야 낱말끼리의 합침. 낱말은 더하되, 그 주제의 다른 낱말이 본문에 하나도 없는 기록은 더하지 않는다
    // 'drop' : 새 낱말의 기록이 모두 기존 주제 안에 있음. 따로 주제로 세우지도, 주제 낱말로 더하지도 않는다
    let how = null as 'word' | 'field' | 'drop' | null;
    const dup = groups.find((g) => {
      const inter = g.rs.filter((r) => ids.has(r.id)).length;
      const j = inter / (g.rs.length + c.rs.length - inter);
      const gw = [g.t, ...g.alt];
      if ((gw.some((w) => w.includes(c.t) || c.t.includes(w)) && j > 0.3) || j > 0.7) {
        how = 'word';
        return true;
      }
      // 관심 분야 낱말끼리 기록이 많이 겹치면 같은 관심(세균·감염병·미생물학 → 항생제)
      const fieldWords = FIELD_TERMS.has(c.t) && gw.some((w) => FIELD_TERMS.has(w));
      // 기록 두 건짜리 낱말('세계화 단원' 두 번)은 우연히 겹치기 쉬우므로 세 건 이상일 때만 이 규칙으로 합친다
      if (fieldWords && c.rs.length >= 3 && (j > 0.4 || inter / c.rs.length >= 0.75)) {
        how = 'field';
        return true;
      }
      // 새 낱말의 기록이 모두 기존 주제 안에 있으면 그 주제의 한 갈래다('활성', '기질' ⊂ '카탈레이스')
      if (c.rs.length >= 2 && inter === c.rs.length) {
        how = 'drop';
        return true;
      }
      return false;
    });
    if (dup) {
      const g: Group = dup;
      if (how === 'drop') continue;
      const before = [g.t, ...g.alt];
      g.alt.push(c.t);
      for (const r of c.rs) {
        if (g.rs.includes(r)) continue;
        // '세균 수를 등비수열로'(수열 단원 예시)처럼 낱말 하나만 우연히 겹친 기록은 관심 분야 합침으로 끌어오지 않는다
        if (how === 'field' && !before.some((w) => r.tf.has(w))) continue;
        g.rs.push(r);
      }
      continue;
    }
    // 겹치지 않는 새 주제는 6개까지만. 그 뒤의 후보도 기존 주제에 합쳐질 수는 있으므로 break 하지 않는다
    if (groups.length >= MAX_THEMES) continue;
    groups.push({ t: c.t, alt: [], rs: c.rs.slice() });
  }

  const themes: Theme[] = groups.map((g, i) => {
    const name = themeName(g, kdf);
    return {
      name,
      words: [name, ...[g.t, ...g.alt].filter((w) => w !== name)],
      ids: g.rs
        .slice()
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
        .map((r) => r.id),
      color: THEME_COLORS[i % THEME_COLORS.length],
    };
  });

  for (const r of recs) r.themes = themes.filter((th) => th.ids.includes(r.id)).map((th) => th.name);
  return themes;
}
