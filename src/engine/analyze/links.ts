/**
 * 기록 사이의 연결(계보)과 연결 이유.
 *
 * - LINK_KINDS : 연결 종류 5가지(심화·확장·전환·반복·동시)의 색, CSS 클래스, 설명, 상담 힌트
 * - buildLinks : 뒤 기록마다 앞(또는 같은 시기) 기록을 후보로 두고 점수를 매겨 연결을 만든다
 * - lineage    : 한 기록의 위(앞선 기록들)와 아래(뒤이은 기록들) 집합. 동시 연결은 세지 않는다
 *
 * 규칙은 docs/DESIGN.md 4.6을 따른다. 앞 단계가 채워 둔 r.tf, r.ktf, r.methods, r.depth, r.fields,
 * r.themes, r.connectCue, r.faint를 읽고, 낱말 통계(Stats)는 themes.ts의 buildStats가 만든 것을 받는다.
 *
 * 연결 점수(두 기록 a → b)
 *   공유 낱말: 두 기록에 모두 나오고 2 <= df <= max(3, 0.22N)인 낱말만. 낱말마다 idf × cw를 더한다.
 *     df 상한을 넘더라도 관심 주제 낱말(Theme.words)이면 센다(그 학생의 관심 주제 낱말은 여러 기록에 나오는 것이 당연하다).
 *     strongW = cw 0.6 이상인 공유 낱말 수(흔하지 않은 낱말)
 *     inKey   = 한쪽 핵심 문장에 있는 공유 낱말 수(cw 0.45 이상)
 *     bothKey = 양쪽 핵심 문장에 모두 있는 공유 낱말 수(cw 0.45 이상)
 *   cite  : 뒤 기록 본문에 '({a.year}학년 (때|에)?)? {a 과목명} (시간|수업|에서|때 …)'이 있으면 +8 (공유 낱말이 없으면 과목명을 넣는다)
 *           과목명 뒤에 수업 맥락이 있어야 한다. '1학년의 정보를 바탕으로'의 '정보'는 과목이 아니다.
 *           학년 접두어는 기본형이 세 글자 이상인 과목('과학탐구실험', '통합과학', '공통수학')에서는 없어도 된다
 *           ('통합과학1 시간에 다루었던', '공통수학2에서 배운'). 다른 학년이 적혀 있으면('2학년 과학탐구실험1에서') 아니다.
 *           '정보', '화학', '문학'처럼 일반 명사와 같은 두 글자 과목명은 학년 접두어가 있어야 한다.
 *           창체는 '{a.year}학년 (때)? 동아리(활동)?에서|진로활동에서 …'('1학년 동아리에서 진행한'). 학년 접두어가 꼭 있어야 하고
 *           공유 낱말이 하나 이상 있어야 한다(과목명처럼 하나를 가리키지 못한다).
 *           같은 시기 쌍은 양쪽을 다 본다. 앞 기록이 뒤 기록을 언급하면(rev) b → a 연결로 놓는다.
 *   ss    : 둘 다 세특이고 과목 기본형(숫자·Ⅰ·Ⅱ 제거)이 같거나(sameBase) 같은 과목 계열(subjectFamily: 공통수학 → 대수, 통합과학 → 생명과학 …)
 *   cc    : 교과 ↔ 창체, 또는 서로 다른 창체 영역
 *   공유 낱말이 없거나 (inKey가 0이고 ss도 아님)이면 탈락
 *   + 공통 관심 주제 수 × 1.5 + (같은 교과군 1) + (뒤 기록에 연결 단서 0.8)
 *   − max(0, (b.t − a.t) − 2) × 0.4 (두 학기 넘게 떨어지면 깎음) + (진로 희망 낱말 공유 2)
 *   strong  = cite, 또는 strongW>=2이고 inKey>=1이고 (공유 3개 이상 또는 진로 희망 일치),
 *             또는 공통 관심 주제가 있고 strongW>=1이고 공유 2개 이상,
 *             또는 진로 희망 일치이고 strongW>=1이고 공유 2개 이상
 *   strong2 = strong, 또는 (ss이고 strongW>=1), 또는 (cc이고 strongW>=1이고 공유 2개 이상이고 inKey>=1)
 *   cite도 ss도 아니면 bothKey>=1, 또는 (관심 분야가 같고 inKey>=2), 또는 (관심 분야가 같고 진로 희망 일치)가 있어야 한다
 *   점수 문턱: cite가 아니면 sc >= (ss 2.5 | cc 4 | 그 외 5). ss는 통과 후 +3(같은 과목의 후속 기록을 순위에서 앞세움)
 *
 * 유지 규칙(뒤 기록 b 하나에 대해)
 *   앞선 후보(seq: 앞 시기이거나, 같은 시기라도 b가 a를 직접 언급한 것):
 *     점수 1위 + (cite 또는 같은 과목은 점수와 무관하게, cc·같은 과목 계열·같은 교과군은 1위의 55% 이상, 그 외는 1위의 75% 이상)를 최대 3개
 *     (직접 언급과 같은 과목의 후속 기록은 점수가 낮아도 교사가 보고 싶은 연결이므로 남긴다)
 *   공통 관심 주제가 있고 bothKey>=3인 교과↔창체 후보 가운데 1위는 점수와 무관하게 남긴다(창체는 +3·+1 가산을 못 받는다)
 *   같은 시기 후보(con, 직접 언급 없음): 다른 교과군, 또는 같은 교과군이라도 양쪽 핵심 문장이 세 낱말 이상 겹칠 때.
 *   점수 (cc 4 | 6) 이상을 창체면 2개, 아니면 1개
 *   rev 후보(같은 시기에 a가 b를 언급)는 b → a 연결로 따로 남긴다(b의 자리와 상대 기준에서 빼고 센다)
 *
 * 연결 방향
 *   창체(동아리·진로·자율·자치)는 학기가 없어 같은 학년 세특보다 1학기 뒤, 2학기 앞(t = 학년×2 − 1.5)에 놓인다.
 *   그래서 같은 학년의 창체 ↔ 세특은 선후를 확정할 수 없다(근거 줄에 적는다). 다만 1학기 세특 본문이 같은 학년의 창체 활동을
 *   언급하면('동아리에서 진행한 … 실험에서 본') 창체가 먼저이므로 방향을 창체 → 세특으로 뒤집는다(Link.from이 뒤 시기일 수 있다).
 *   같은 학기의 직접 언급은 언급된 기록을 앞에 둔다(통합과학1 → 과학탐구실험1, 생명과학 → 대수).
 *
 * 연결 종류
 *   같은 시기이고 직접 언급이 없으면 동시. 깊이가 오르거나 최고 방법 수준이 오르면 심화. 교과군이 바뀌면 확장.
 *   새 방법(2단계 이상, 개념 분석·해석은 제외: 2단계 기록 대부분에 나와 종류를 가르지 못한다)이 있으면 전환. 그 외 반복.
 *   심화가 아닌 종류는 깊이가 내려간 경우도 품는다(설명 문장에 적는다).
 *
 * 공통 낱말 표시 순서(words, head, why, 근거 줄): 진로 희망 낱말 > 관심 주제 이름 > 관심 주제의 다른 낱말 > 관심 분야 사전 낱말 > 3자 이상 > 그 외.
 * 같은 등급 안에서는 긴 낱말(더 구체적인 말), 그다음 드문 순(idf × cw).
 * 점수는 cw로 재지만 표시는 교사가 알아볼 낱말('기후변화')을 '부문'보다 앞세운다.
 *
 * 설명 문장의 구분자: 낱말 나열은 ', ', 항목 구분은 ' / '. 가운뎃점(·)은 방법 이름 같은 고유 라벨에만 쓴다.
 * 카드 한 줄(why)에는 연결 종류 이름을 쓰지 않는다(카드가 종류 칩을 따로 붙인다): '깊이 2→2', '사회→자율·자치'처럼 내용만 적는다.
 * 같은 과목이면 앞에 '같은 과목 / ', 계열만 같으면 '같은 계열 / '을 붙인다.
 *
 * 정규식은 test()에만 쓰므로 'g' 없이 만든다. 이 파일은 DOM에 의존하지 않는다.
 */
import type { LaneKey, Link, LinkKind, MethodKey, Rec, Stats, StudentRecord, Theme } from '../types';
import { METHOD } from '../dict/methods';
import { FIELD_TERMS } from '../dict/fields';
import { LANE, baseSubject, subjectFamily, subjectType } from '../dict/subjects';
import { DEPTH_TXT } from './depth';
import { jo, nos, tokens } from './text';

/* ───────────────────────── 연결 종류 ───────────────────────── */

export const LINK_KINDS: Record<LinkKind, { color: string; colorDark: string; cls: string; desc: string; hint: string }> = {
  심화: {
    color: '#111111',
    colorDark: '#f2f2f2',
    cls: 'deep',
    desc: '같은 주제를 더 깊은 방법으로 다시 다룸',
    hint: '앞 탐구에서 무엇이 부족해서 방법을 바꾸었는지 학생이 스스로 설명할 수 있는지 물어보세요.',
  },
  확장: {
    color: '#7a55d6',
    colorDark: '#9579f2',
    cls: 'cross',
    desc: '같은 관심을 다른 교과의 눈으로 넓힘',
    hint: '교과를 옮기면서 새로 얻은 관점이 무엇인지 물어보세요. 깊이가 그대로라면 한 교과 안에서 검증하는 단계를 더해 볼 여지가 있습니다.',
  },
  전환: {
    color: '#2f8f57',
    colorDark: '#3faa6b',
    cls: 'shift',
    desc: '같은 주제를 다른 방법으로 다룸(깊이는 올라가지 않음)',
    hint: '방법은 바뀌었지만 깊이가 올라가지 않았습니다. 앞 탐구의 결과를 뒤 탐구에서 실제로 썼는지 확인해 보세요.',
  },
  반복: {
    color: '#c48f0a',
    colorDark: '#d7a52a',
    cls: 'rep',
    desc: '주제는 이어지지만 방법과 깊이가 나아가지 않음',
    hint: '주제만 되풀이되고 있습니다. 다음 탐구에서는 실험·측정, 데이터 분석, 설문처럼 직접 근거를 만드는 방법이나 한계를 짚는 단계를 넣어 보도록 안내해 보세요.',
  },
  동시: {
    color: '#a3a3a3',
    colorDark: '#6f6f6f',
    cls: 'con',
    desc: '같은 시기에 같은 관심을 함께 다룸',
    hint: '같은 시기의 두 활동이 서로 어떤 도움이 되었는지 물어보세요.',
  },
};

/* ───────────────────────── 도움 함수 ───────────────────────── */

const lvOf = (k: MethodKey): number => METHOD[k].lv;
const labelOf = (k: MethodKey): string => METHOD[k].label;

/** 기록의 최고 방법 수준(방법이 없으면 0). */
function topLv(r: Rec): number {
  return r.methods.reduce((m, k) => Math.max(m, lvOf(k)), 0);
}

/** 창체 줄(진로·동아리·자율·자치)인지. */
const isCC = (r: Rec): boolean => !!LANE[r.lane]?.cc;

/** 정규식 특수문자 이스케이프. */
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 기록의 과목 이름들. 여러 과목이 '·'로 이어진 세특('물리학Ⅰ·화학Ⅰ')은 나눠서 보되,
 * 이름 자체에 가운뎃점이 있는 과목('기술·가정', '사회·문화')은 등록된 과목이면 통째로 쓴다.
 */
function subjectNames(subj: string): string[] {
  const whole = (subj ?? '').trim();
  if (!whole) return [];
  if (!whole.includes('·') || subjectType(whole) !== '기타') return [whole];
  return whole.split('·').map((s) => s.trim()).filter((s) => s.length > 0);
}

/** 같은 과목 계열 판정용 기본형. 첫 과목의 숫자·Ⅰ·Ⅱ·괄호를 뗀 것. */
function baseOf(r: Rec): string {
  const names = subjectNames(r.subj);
  return names.length ? baseSubject(names[0]) : '';
}

/** 과목 계열 키(공통수학 → 대수 등). 세특이 아니거나 계열 표에 없으면 null. */
function familyOf(r: Rec): string | null {
  if (r.kind !== '세특') return null;
  const names = subjectNames(r.subj);
  return names.length ? subjectFamily(names[0]) : null;
}

/**
 * 과목명 뒤에 와야 하는 수업 맥락(공백을 뺀 본문에 적용). '1학년 때 과학탐구실험1 시간에', '1학년 때 통합과학2에서 조사했던',
 * '1학년 정보 수업에서', '공통수학2에서 배운'. '정보', '화학', '문학'처럼 일반 명사와 같은 과목명이 '1학년의 정보를 바탕으로',
 * '2학년 화학 반응의 세계 수업에서'처럼 과목 아닌 쓰임에 걸리지 않게 한다.
 */
const CITE_AFTER =
  '(?:시간|수업|때|에서|세특|과목|실험|탐구|활동|발표|보고서|수행평가|프로젝트|단원|의(?:탐구|실험|활동|수업|시간|발표|보고서))';

/** 학년 접두어 꼴(공백 뺀 본문). '1학년', '1학년1학기', '1학년때', '1학년때의' */
const yearPrefix = (y: string): string => `${y}학년(?:[12]학기)?(?:때의|때|에)?`;

/** 두 글자 과목명('정보', '화학', '문학', '대수')은 일반 명사와 겹치므로 학년 접두어가 있어야 직접 언급으로 본다. */
const CITE_NEEDS_YEAR_BELOW = 3;

/**
 * 뒤 기록 본문(공백 제거)에서 앞 기록을 직접 언급하는 꼴을 찾는 정규식.
 * '({학년}학년 (1학기|2학기)? (때|에)?)? {과목명} {수업 맥락}'. 과목명은 원래 이름('과학탐구실험1')과
 * 기본형('과학탐구실험') 둘 다 잡되, 기본형 뒤에 다른 숫자가 붙으면('통합과학2'는 통합과학1이 아님) 잡지 않는다.
 * 학년 접두어는 기본형이 세 글자 이상이면 없어도 되지만, 다른 학년이 적혀 있으면('2학년 과학탐구실험1에서') 잡지 않는다.
 * 세특이 아니거나 과목명이 너무 짧으면 null.
 */
function citeRegex(a: Rec): RegExp | null {
  if (a.kind !== '세특') return null;
  const strict: string[] = [];
  const loose: string[] = [];
  for (const n of subjectNames(a.subj)) {
    const full = nos(n);
    const base = baseSubject(n);
    if (base.length < 2) continue;
    const alts: string[] = [];
    if (full !== base) alts.push(esc(full));
    alts.push(esc(base) + '(?![0-9０-９ⅠⅡⅢ])');
    (base.length < CITE_NEEDS_YEAR_BELOW ? strict : loose).push(...alts);
  }
  if (!strict.length && !loose.length) return null;
  const y = String(a.year);
  const parts: string[] = [];
  if (strict.length) parts.push(`${yearPrefix(y)}(?:${strict.join('|')})`);
  if (loose.length) parts.push(`(?:${yearPrefix(y)}|(?<!${yearPrefix('[1-3]')}))(?:${loose.join('|')})`);
  return new RegExp(`(?:${parts.join('|')})${CITE_AFTER}`);
}

/** 창체 영역을 가리키는 머리말(공백 뺀 본문). 동아리는 '동아리활동(생명과학탐구반)에서'처럼 반 이름이 붙을 수 있다. */
const CC_HEAD: Partial<Record<LaneKey, string>> = {
  동아리: '동아리(?:활동)?(?:\\([^)]{1,20}\\))?(?:에서|시간에|때|의)',
  진로: '진로(?:활동|시간|수업|탐색|특강)(?:에서|때|의)',
  '자율·자치': '(?:자율활동|자치활동|자율·자치활동|자율자치활동|학급자치활동|학급자치|학급회의|학급특색활동)(?:에서|때|의)',
};

/**
 * 뒤 기록이 앞선 학년의 창체 활동을 직접 언급하는 꼴. '1학년 동아리에서 진행한', '1학년 때 진로활동에서'.
 * 창체는 과목명이 없으므로 학년 접두어가 꼭 있어야 한다(같은 학년의 창체 언급은 ccRefRegex가 따로 본다).
 * 창체가 아니면 null.
 */
function ccCiteRegex(a: Rec): RegExp | null {
  if (!isCC(a)) return null;
  const h = CC_HEAD[a.lane];
  return h ? new RegExp(`${yearPrefix(String(a.year))}${h}`) : null;
}

/**
 * 세특 본문이 같은 학년의 창체 활동을 끌어오는 꼴(공백 뺀 본문에 적용).
 * '동아리에서 진행한 손 세정제의 세균 억제 효과 비교 실험에서 본', '진로활동에서 만난 연구원과의 면담'.
 * 다른 학년이 앞에 적혀 있으면('1학년 동아리에서 진행한') 그 학년의 창체이므로 잡지 않는다.
 */
function ccRefRegex(lane: LaneKey, year: number): RegExp | null {
  const h = CC_HEAD[lane];
  if (!h) return null;
  const verb = '(?:진행한|진행했던|했던|수행한|수행했던|다룬|다루었던|다뤘던|실시한|조사한|조사했던|제안한|만난|들은|본|한)';
  const noun = '(?:실험|탐구|조사|활동|발표|관찰|측정|프로젝트|면담|탐방|강연|특강|캠페인|안건)';
  return new RegExp(`(?:${yearPrefix(String(year))}|(?<!${yearPrefix('[1-3]')}))${h}[^.]{0,30}?${verb}[^.]{0,30}?${noun}`);
}

/* ───────────────────────── 후보 ───────────────────────── */

interface Cand {
  a: Rec;
  sc: number;
  shared: string[];   // 공유 낱말(표시 순서: 진로 희망 낱말 > 관심 주제 이름 > 관심 주제 낱말 > 관심 분야 낱말 > 3자 이상 > 긴 낱말 > 드문 순)
  shTh: string[];     // 공통 관심 주제 이름
  cite: boolean;
  same: boolean;      // 같은 시기
  ss: boolean;
  sameBase: boolean;  // ss 가운데 과목 기본형까지 같음(통합과학1 → 통합과학2). 거짓이면 계열만 같음(통합과학1 → 생명과학)
  cc: boolean;
  bothKey: number;    // 양쪽 핵심 문장에 모두 있는 공유 낱말 수
  rev: boolean;       // 같은 시기인데 앞 기록(a)의 본문이 뒤 기록(b)을 직접 언급함: b → a 순서로 놓는다
  flip: boolean;      // 같은 학년의 창체가 먼저임이 세특 본문에 드러나 방향을 뒤집음(linkReason에서 a가 창체)
}

/**
 * 모든 기록의 연결을 만든다. 뒤 기록마다 앞(또는 같은 시기) 기록을 후보로 두고 점수를 매긴 뒤 유지 규칙으로 고른다.
 * 약한 기록(faint)은 관심 주제에 속하지 않으면 연결에 끼지 않는다.
 * 돌려주는 순서는 뒤 기록(recs 순서) → 점수 높은 순이다.
 */
export function buildLinks(recs: Rec[], stats: Stats, themes: Theme[], S: StudentRecord): Link[] {
  const { N, df, idf, cw } = stats;
  const dfMax = Math.max(3, N * 0.22);
  const order = new Map<string, number>(recs.map((r, i) => [r.id, i]));
  const idx = (r: Rec): number => order.get(r.id) ?? 0;

  // 진로 희망 낱말. 공유 낱말에 있거나 두 기록 본문에 모두 들어 있으면 가산.
  const hopeSet = new Set<string>((S.hopes ?? []).flatMap((h) => tokens(h.text ?? '')));
  const hopeWords = [...hopeSet].filter((w) => w.length >= 2);
  const hopeWordIn = (a: Rec, b: Rec): string | undefined => hopeWords.find((w) => a.text.includes(w) && b.text.includes(w));

  // 공통 관심 주제: 각 기록의 r.themes와 Theme.ids 양쪽으로 확인한다. 관심 주제 낱말은 df 상한을 넘어도 공유 낱말로 센다.
  const themeIds = themes.map((th) => ({ name: th.name, ids: new Set(th.ids) }));
  const themeWords = new Set<string>(themes.flatMap((th) => th.words));
  const sharedThemes = (a: Rec, b: Rec): string[] => {
    const out = a.themes.filter((x) => b.themes.includes(x));
    for (const th of themeIds) if (th.ids.has(a.id) && th.ids.has(b.id) && !out.includes(th.name)) out.push(th.name);
    return out;
  };

  // 공유 낱말 표시 순서. 점수(cw)와 따로, 교사가 알아볼 낱말을 앞에 둔다
  const themeNames = new Set<string>(themes.map((th) => th.name));
  const rank = (t: string): number =>
    hopeSet.has(t) ? 0 : themeNames.has(t) ? 1 : themeWords.has(t) ? 2 : FIELD_TERMS.has(t) ? 3 : t.length >= 3 ? 4 : 5;
  const sortShared = (ws: string[]): void => {
    ws.sort((x, y) => rank(x) - rank(y) || y.length - x.length || idf(y) * cw(y) - idf(x) * cw(x));
  };

  // N² 루프 안에서 되풀이하지 않도록 기록마다 한 번만 계산해 둔다(공백 뺀 본문, 직접 언급 정규식, 과목 기본형·계열, 창체 언급 정규식)
  const nosText = new Map<string, string>(recs.map((r) => [r.id, nos(r.text)]));
  const citeRx = new Map<string, RegExp | null>(recs.map((r) => [r.id, citeRegex(r) ?? ccCiteRegex(r)]));
  const baseName = new Map<string, string>(recs.map((r) => [r.id, baseOf(r)]));
  const famName = new Map<string, string | null>(recs.map((r) => [r.id, familyOf(r)]));
  const ccRef = new Map<string, RegExp | null>(recs.map((r) => [r.id, isCC(r) ? ccRefRegex(r.lane, r.year) : null]));

  const links: Link[] = [];
  for (const b of recs) {
    if (b.faint && !b.themes.length) continue;
    const cands: Cand[] = [];
    const fb = new Set(b.fields.map((f) => f.k));
    const baseB = baseName.get(b.id) ?? '';
    const famB = famName.get(b.id) ?? null;
    const nb = nosText.get(b.id) ?? '';

    for (const a of recs) {
      if (a === b || a.t > b.t) continue;
      const same = a.t === b.t;
      // 같은 시기는 배열에서 앞선 기록만 '앞'으로 둔다(한 쌍이 두 번 잡히지 않게)
      if (same && idx(a) > idx(b)) continue;
      if (a.faint && !a.themes.length) continue;

      // 공유 낱말 점수
      let sc = 0;
      const shared: string[] = [];
      let inKey = 0;
      let strongW = 0;
      let bothKey = 0;
      b.tf.forEach((_, t) => {
        if (!a.tf.has(t)) return;
        const d = df.get(t) ?? 0;
        if (d < 2 || (d > dfMax && !themeWords.has(t))) return;
        const w = cw(t);
        sc += idf(t) * w;
        shared.push(t);
        if (w >= 0.6) strongW++;
        const ka = a.ktf.has(t);
        const kb = b.ktf.has(t);
        if ((ka || kb) && w >= 0.45) inKey++;
        if (ka && kb && w >= 0.45) bothKey++;
      });

      const commonF = a.fields.some((f) => fb.has(f.k));
      const shTh = sharedThemes(a, b);

      // 직접 언급, 같은 과목 계열, 교과↔창체
      // 창체 언급('1학년 동아리에서 진행한')은 과목명처럼 하나로 가리키지 못하므로 공유 낱말이 하나 이상 있어야 한다
      const citeOk = (x: Rec): boolean => x.kind === '세특' || shared.length > 0;
      const rx = citeRx.get(a.id) ?? null;
      const citeAB = !!rx && rx.test(nb) && citeOk(a);
      // 같은 시기에는 반대쪽 언급도 본다(앞 기록 본문이 뒤 기록을 언급하면 뒤 기록이 먼저다)
      const rxB = same && !citeAB ? (citeRx.get(b.id) ?? null) : null;
      const rev = !!rxB && rxB.test(nosText.get(a.id) ?? '') && citeOk(b);
      const cite = citeAB || rev;
      const baseA = baseName.get(a.id) ?? '';
      const famA = famName.get(a.id) ?? null;
      const sameBase = a.kind === '세특' && b.kind === '세특' && baseA.length >= 2 && baseA === baseB;
      const ss = sameBase || (a.kind === '세특' && b.kind === '세특' && !!famA && famA === famB);
      const cc = isCC(a) !== isCC(b) || (isCC(a) && isCC(b) && a.lane !== b.lane);

      if (cite) {
        sc += 8;
        if (!shared.length) shared.push(rev ? baseB : baseA);
        inKey++;
      }
      if (!shared.length || (!inKey && !ss)) continue;

      sc += shTh.length * 1.5;
      if (a.lane === b.lane) sc += 1;
      if (b.connectCue) sc += 0.8;
      sc -= Math.max(0, b.t - a.t - 2) * 0.4;
      const hopeHit = shared.some((t) => hopeSet.has(t)) || !!hopeWordIn(a, b);
      if (hopeHit) sc += 2;

      const strong =
        cite ||
        (strongW >= 2 && inKey >= 1 && (shared.length >= 3 || hopeHit)) ||
        (shTh.length > 0 && strongW >= 1 && shared.length >= 2) ||
        (hopeHit && strongW >= 1 && shared.length >= 2);
      let strong2 = strong || (ss && strongW >= 1) || (cc && strongW >= 1 && shared.length >= 2 && inKey >= 1);
      // 두 기록의 핵심 문장이 같은 낱말을 쓰거나 관심 분야가 같아야 잇는다(직접 언급, 같은 과목은 예외)
      if (!cite && !ss && !(bothKey >= 1 || (commonF && inKey >= 2) || (commonF && hopeHit))) strong2 = false;
      if (!strong2) continue;
      if (!cite && sc < (ss ? 2.5 : cc ? 4 : 5)) continue;

      sortShared(shared);
      cands.push({ a, sc: sc + (ss ? 3 : 0), shared, shTh, cite, same, ss, sameBase, cc, bothKey, rev, flip: false });
    }

    cands.sort((x, y) => y.sc - x.sc);
    // 같은 시기에 a가 b를 언급한 후보는 b → a 연결이다. b로 들어오는 연결이 아니므로 b의 자리(최대 3개)와 상대 기준에서 뺀다
    const revs = cands.filter((c) => c.rev);
    // 앞뒤가 정해진 후보: 앞선 시기이거나, 같은 시기라도 b가 a를 직접 언급한 것(통합과학1 → 과학탐구실험1)
    const seq = cands.filter((c) => !c.rev && (!c.same || c.cite));
    // 같은 시기(동시): 다른 교과군이거나, 같은 교과군이라도 양쪽 핵심 문장이 세 낱말 이상 겹칠 때
    const con = cands.filter((c) => c.same && !c.cite && (c.a.lane !== b.lane || c.bothKey >= 3));
    const top = seq.length ? seq[0].sc : 0;
    // 공통 관심 주제가 있는 교과↔창체 후보 가운데 1위. 창체는 같은 과목(+3)·같은 교과군(+1) 가산을 받을 수 없어
    // 직접 언급이나 같은 과목 후보가 1위이면 상대 기준(55%)에 늘 밀리므로, 따로 한 자리를 둔다(동아리 → 생명과학)
    const ccBest = seq.find((c) => c.cc && c.shTh.length > 0 && c.bothKey >= 3);
    // 같은 과목(기본형까지 같음)은 점수와 무관하게 남기고, 계열만 같은 과목(통합과학 → 화학)은 같은 교과군처럼 55% 기준으로 본다
    const keepSeq = seq
      .filter(
        (c, i) =>
          i === 0 ||
          c.cite ||
          c.sameBase ||
          c === ccBest ||
          ((c.cc || c.ss || c.a.lane === b.lane) && c.sc >= top * 0.55) ||
          c.sc >= top * 0.75,
      )
      .slice(0, 3);
    const keepCon = con.filter((c) => c.sc >= (c.cc ? 4 : 6)).slice(0, isCC(b) ? 2 : 1);

    // 같은 시기에 앞 기록(a)이 뒤 기록(b)을 직접 언급했으면 b가 먼저다
    for (const c of revs) links.push(linkReason(b, c.a, { ...c, a: b }, hopeWordIn(c.a, b) ?? null));
    for (const c of keepSeq) {
      const hw = hopeWordIn(c.a, b) ?? null;
      // 1학기 세특(a)이 같은 학년의 창체(b)에서 한 활동을 언급하면 창체가 먼저다: 방향을 창체 → 세특으로 뒤집는다
      const ref = ccRef.get(b.id) ?? null;
      const flip = !!ref && !isCC(c.a) && c.a.year === b.year && !c.cite && ref.test(nosText.get(c.a.id) ?? '');
      if (flip) links.push(linkReason(b, c.a, { ...c, a: b, flip: true }, hw));
      else links.push(linkReason(c.a, b, c, hw));
    }
    for (const c of keepCon) links.push(linkReason(c.a, b, c, hopeWordIn(c.a, b) ?? null));
  }
  return links;
}

/* ───────────────────────── 연결 이유 ───────────────────────── */

/** 라벨 목록을 ', '로 잇고 마지막 낱말의 받침에 맞는 조사를 붙인다. */
function listJo(labels: string[], a: string, b: string): string {
  if (!labels.length) return '';
  return `${labels.join(', ')}${jo(labels[labels.length - 1], a, b)}`;
}

/** 전환 판정에서 빼는 새 방법. 개념 분석·해석은 2단계 기록 대부분에 나와 '방법이 바뀌었다'고 말할 근거가 못 된다. */
const SHIFT_IGNORE: ReadonlySet<MethodKey> = new Set<MethodKey>(['analysis', 'understanding']);

/**
 * 연결 하나의 종류와 설명을 만든다.
 * - rel    : 같은 시기면 동시. 깊이가 오르거나 최고 방법 수준이 오르면 심화. 교과군이 바뀌면 확장.
 *            새 방법(2단계 이상, 개념 분석·해석 제외)이 있으면 전환. 그 외 반복.
 * - lines  : 근거 줄. 공통 낱말, 같은 관심 분야, 같은 과목, 교과↔창체, 직접 언급, 진로 희망 낱말, 창체 선후, 교과군 변화, 방법 변화, 깊이 변화
 * - sent   : 교사가 읽는 설명 문장. 조사는 jo()로 받침에 맞춘다
 * - head   : 짧은 머리(예: ‘전압, 전극’ / 과학→동아리)
 * - detail : 방법/깊이 변화 요약
 * - why    : 카드 안 한 줄. 종류 이름은 카드의 칩이 보여 주므로 넣지 않는다
 * 대표 방법(main, mainB)은 각 기록의 2단계 이상 첫 방법이다. 뒤 기록에서 새로 쓴 방법(newM)은 대표 방법과 따로 적는다
 * (대표 방법이 그대로인데 '방법이 바뀌었다'고 말하지 않도록).
 * c.flip이면 a가 같은 학년의 창체이고 b가 그 활동을 언급한 세특이다(a.t > b.t일 수 있다).
 */
function linkReason(a: Rec, b: Rec, c: Cand, hopeW: string | null): Link {
  const cross = a.lane !== b.lane;
  const ma = new Set(a.methods);
  const newM = b.methods.filter((k) => !ma.has(k) && lvOf(k) >= 2);
  const shiftM = newM.filter((k) => !SHIFT_IGNORE.has(k));
  const dd = b.depth - a.depth;
  const upLv = topLv(b) > topLv(a);

  // 같은 시기라도 한쪽이 다른 쪽을 직접 언급했으면 앞뒤가 정해진 연결이다(동시가 아님)
  const con = c.same && !c.cite;
  let kind: LinkKind;
  if (con) kind = '동시';
  else if (dd > 0 || upLv || (b.depth === 4 && a.depth < 4)) kind = '심화';
  else if (cross) kind = '확장';
  else if (shiftM.length) kind = '전환';
  else kind = '반복';

  const w = c.shared.slice(0, 3);
  // 대표 방법: 2단계 이상 가운데 첫째(수준 높은 순으로 정렬돼 있음), 없으면 첫 방법, 그것도 없으면 '정리·참여'
  const pick = (r: Rec): string => {
    const k = r.methods.find((x) => lvOf(x) >= 2) ?? r.methods[0];
    return k ? labelOf(k) : '정리·참여';
  };
  const main = pick(a);
  const mainB = pick(b);
  const sameMain = main === mainB;
  // 새로 쓴 방법 가운데 대표 방법으로 이미 적은 것은 빼고 최대 3개
  const added = newM.map(labelOf).filter((l) => l !== mainB).slice(0, 3);

  // 같은 관심 분야
  const fa = new Set(a.fields.map((f) => f.k));
  const cf = b.fields.map((f) => f.k).filter((k) => fa.has(k));

  // 같은 학년의 창체 ↔ 세특: 창체는 학기가 없어 선후를 확정할 수 없다(세특 본문이 창체를 언급한 경우는 뒤집어 놓았다)
  const ccPair = isCC(a) !== isCC(b) && a.year === b.year && !c.same;
  // 같은 과목 계열: 기본형이 같으면 '같은 과목', 계열만 같으면(통합과학1 → 생명과학) '같은 과목 계열'
  const ssName = c.sameBase ? '같은 과목' : '같은 과목 계열';

  // 근거 줄
  const lines: string[] = [];
  lines.push(`공통 낱말: ${w.join(', ')}`);
  if (cf.length) lines.push(`같은 관심 분야: ${cf.join(', ')}`);
  if (c.ss) lines.push(`같은 과목 계열의 후속 기록: ${a.subj} → ${b.subj}`);
  if (c.cc) {
    lines.push(
      isCC(a) && isCC(b)
        ? `서로 다른 창의적 체험활동 영역이 이어짐: ${a.lane} → ${b.lane}`
        : '교과 탐구와 창의적 체험활동이 이어짐',
    );
  }
  if (c.cite) lines.push(`뒤 기록이 ‘${a.year}학년 ${a.subj}’${jo(a.subj, '을', '를')} 직접 언급함`);
  if (hopeW) lines.push(`진로 희망 낱말 ‘${hopeW}’${jo(hopeW, '이', '가')} 두 기록에 모두 나옴`);
  if (c.same && c.cite) lines.push(`같은 학기 기록이지만 ${b.subj}${jo(b.subj, '이', '가')} ${a.subj}${jo(a.subj, '을', '를')} 직접 언급하므로 ${a.subj} → ${b.subj} 순서로 놓음`);
  if (c.flip) lines.push(`${b.subj} 세특이 같은 학년의 ${a.subj}에서 한 활동을 언급하므로 ${a.subj} → ${b.subj} 순서로 놓음`);
  else if (ccPair && !c.cite) lines.push('창의적 체험활동은 학기 구분이 없어 같은 학년 세특과의 선후는 확정할 수 없음(1학기 뒤, 2학기 앞에 놓고 이음)');
  if (cross) lines.push(`교과군: ${a.lane} → ${b.lane}`);
  lines.push(
    (sameMain ? `방법: ${main} 그대로` : `방법: ${main} → ${mainB}`) +
      (added.length ? ` (새로 더한 방법: ${added.join(', ')})` : ''),
  );
  lines.push(
    `탐구 깊이: ${a.depth}단계(${DEPTH_TXT[a.depth]}) → ${b.depth}단계(${DEPTH_TXT[b.depth]})` +
      (dd < 0 ? ' (앞 탐구보다 얕아짐)' : dd === 0 ? ' (같은 수준)' : ''),
  );

  // 설명 문장
  const W = w.join(', ');
  const onlyCite = c.cite && w.length === 1 && w[0] === baseOf(a);
  let sent: string;
  if (con) {
    sent = `${a.year}학년 같은 시기에 ${a.subj}${jo(a.subj, '과', '와')} ${b.subj}에서 ‘${W}’ 같은 낱말을 함께 다뤘습니다.`;
  } else {
    const first = onlyCite
      ? `${b.year}학년 ${b.subj}에서 ${a.year}학년 ${a.subj}의 탐구를 직접 언급하며 이어 갔습니다. `
      : `${a.year}학년 ${a.subj}의 ‘${W}’ 같은 낱말이 ${b.year}학년 ${b.subj}에서 다시 나옵니다. `;
    const where = cross
      ? `교과군이 ${a.lane}에서 ${b.lane}${jo(b.lane, '으로', '로')} 바뀌어 다른 관점으로 넓어졌고, `
      : c.ss
        ? `${ssName} 안에서 이어졌고, `
        : '같은 교과군 안에서 이어졌고, ';
    let how: string;
    if (sameMain && added.length) how = `방법은 ${main}${jo(main, '을', '를')} 이어 가면서 ${listJo(added, '을', '를')} 새로 더했고, `;
    else if (sameMain) how = `방법은 ${main} 그대로였고, `;
    else if (added.length) how = `방법은 ${main}에서 ${mainB}${jo(mainB, '으로', '로')} 바뀌었고(${listJo(added, '을', '를')} 새로 더함), `;
    else how = `방법은 ${main}에서 ${mainB}${jo(mainB, '으로', '로')} 바뀌었고, `;
    const deep =
      dd === 0
        ? `탐구 깊이는 ${a.depth}단계 그대로입니다.`
        : `탐구 깊이는 ${a.depth}단계에서 ${b.depth}단계로 ${dd > 0 ? '올라갔습니다' : '낮아졌습니다'}.`;
    sent = first + where + how + deep;
  }

  const methodChange = sameMain ? (added.length ? `${main}에 ${added[0]} 더함` : `${main} 그대로`) : `${main} → ${mainB}`;
  const detail = con
    ? `${cf[0] ?? `${a.lane}, ${b.lane}`} 함께 다룸`
    : `${methodChange} / 깊이 ${a.depth}→${b.depth}${cf.length ? ` / ${cf[0]}` : ''}`;

  // 카드 한 줄. 종류 이름(심화·확장·전환·반복·동시)은 카드가 칩으로 따로 붙이므로 내용만 적는다.
  // 동시는 앞 기록 이름과 낱말로 충분하고, 교과군이 다르면 두 교과군을 적는다
  const key = c.cite ? '직접 언급' : (hopeW ?? c.shTh[0] ?? w[0]);
  const short =
    kind === '심화'
      ? `${key} / 깊이 ${a.depth}→${b.depth}`
      : kind === '확장'
        ? `${key} / ${a.lane}→${b.lane}${dd < 0 ? ' / 깊이↓' : ''}`
        : kind === '전환'
          ? `${key} / ${sameMain ? `${added[0] ?? mainB} 더함` : `${main}→${mainB}`}`
          : kind === '반복'
            ? `${key} / 깊이 ${a.depth}→${b.depth}`
            : `${key}${cross ? ` / ${a.lane}, ${b.lane}` : ''}`;
  // head도 '자세히' 보기에서 카드의 종류 칩 옆에 나오므로 종류 이름('같은 시기')을 다시 적지 않는다
  const place = con ? (cross ? ` / ${a.lane}, ${b.lane}` : '') : cross ? ` / ${a.lane}→${b.lane}` : c.ss ? ` / ${ssName}` : '';
  const head = `${c.cite ? '직접 언급 / ' : ''}‘${w.slice(0, 2).join(', ')}’${place}`;
  // 같은 과목(기본형이 같음)은 '같은 과목', 계열만 같으면 '같은 계열'을 앞에 둔다(카드 폭이 좁아 줄여 적는다)
  const why = `${c.ss && kind !== '동시' ? (c.sameBase ? '같은 과목 / ' : '같은 계열 / ') : ''}${short}`;

  return {
    from: a.id,
    to: b.id,
    rel: kind,
    cross,
    ss: c.ss,
    cc: c.cc,
    cite: c.cite,
    words: w,
    theme: c.shTh[0] ?? null,
    hope: hopeW,
    sc: c.sc,
    sent,
    head,
    detail,
    why,
    lines,
    newM,
  };
}

/* ───────────────────────── 계보 ───────────────────────── */

/**
 * 한 기록의 계보. 동시 연결은 빼고, 앞선 기록들(up)과 뒤이은 기록들(down)을 끝까지 따라가 모은다.
 * 자기 자신은 넣지 않는다.
 */
export function lineage(links: Link[], id: string): { up: Set<string>; down: Set<string> } {
  const seq = links.filter((l) => l.rel !== '동시');
  const walk = (start: string, next: (l: Link, cur: string) => string | null): Set<string> => {
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop() as string;
      for (const l of seq) {
        const n = next(l, cur);
        if (n === null || n === id || seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    return seen;
  };
  const up = walk(id, (l, cur) => (l.to === cur ? l.from : null));
  const down = walk(id, (l, cur) => (l.from === cur ? l.to : null));
  return { up, down };
}
