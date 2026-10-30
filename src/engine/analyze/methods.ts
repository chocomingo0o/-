/**
 * 사전 컴파일과 탐지: 탐구 방법 17종, 과학 탐구 과정 기능 8종, 관심 분야.
 *
 * - compileMethods(userDict) : dict/methods.ts의 terms/exclude와 교사가 추가한 표현(UserDict)을 정규식으로 만든다.
 * - masked(s, cm)            : 제외 표현(exclude) 구간을 같은 길이의 공백으로 지운다(위치 보존).
 * - methodHits(s, methods)   : 문장에서 찾은 방법 키 목록(사전 순서 = 수준 내림차순).
 * - methodMarks(text, methods): 원문 하이라이트용 구간. 사용자 사전 매치는 user:true.
 * - compileSkills / skillHits / skillMarks : 과학 탐구 과정 기능(dict/skills.ts)도 같은 방식.
 * - compileFields / fieldsOf : 관심 분야(dict/fields.ts). 낱말 글자 사이에 공백을 허용하고,
 *                              서로 다른 낱말 2개 이상 또는 3회 이상 나온 분야만 인정한다(상위 3개).
 *
 * 정규식은 모두 'g' 플래그를 쓰므로 사용 직전과 직후에 lastIndex를 0으로 돌려 놓는다.
 * 이 파일은 DOM에 의존하지 않는다.
 */
import type { FieldHit, MethodDef, MethodKey, SkillDef, SkillKey, UserDict } from '../types';
import { METHOD, METHODS } from '../dict/methods';
import { SKILLS } from '../dict/skills';
import { FIELDS, FIELD_KEYS } from '../dict/fields';

/* ───────────────────────── 공통 도구 ───────────────────────── */

/** 평문을 정규식 안에 그대로 넣을 수 있게 특수문자를 이스케이프한다. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 정규식 조각 배열 → 하나의 'g' 정규식. 비어 있으면 null. */
function joinRx(parts: string[]): RegExp | null {
  const list = parts.filter((p) => p && p.trim());
  if (!list.length) return null;
  return new RegExp('(?:' + list.join('|') + ')', 'g');
}

/** ex 구간을 같은 길이의 공백으로 지운다. 위치가 그대로이므로 뒤의 매치 위치를 원문에 바로 쓸 수 있다. */
function maskWith(s: string, ex: RegExp | null): string {
  if (!ex) return s;
  ex.lastIndex = 0;
  const out = s.replace(ex, (x) => ' '.repeat(x.length));
  ex.lastIndex = 0;
  return out;
}

/** 'g' 정규식으로 한 번만 검사한다. lastIndex를 앞뒤로 초기화한다. */
function testOnce(re: RegExp, s: string): boolean {
  re.lastIndex = 0;
  const ok = re.test(s);
  re.lastIndex = 0;
  return ok;
}

/** 'g' 정규식의 모든 매치 구간. 빈 매치가 나오면 lastIndex를 한 칸 밀어 무한 루프를 막는다. */
function scan(re: RegExp, s: string): { a: number; b: number; t: string }[] {
  const out: { a: number; b: number; t: string }[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    out.push({ a: m.index, b: m.index + m[0].length, t: m[0] });
  }
  re.lastIndex = 0;
  return out;
}

/* ───────────────────────── 탐구 방법 ───────────────────────── */

export interface CompiledMethod {
  def: MethodDef;
  re: RegExp;              // terms, 'g'
  ex: RegExp | null;       // exclude, 'g'
  user: RegExp | null;     // 교사 추가 표현, 'g'
}

/**
 * 교사 추가 표현(평문)을 정규식 조각으로. 특수문자는 이스케이프하고 공백은 \s*로 바꿔 띄어쓰기 차이를 흡수한다.
 * '반응 속도 측정' → '반응\s*속도\s*측정'
 */
function userTerm(t: string): string {
  return escapeRegExp(t.trim()).replace(/\s+/g, '\\s*');
}

/** 교사 추가 표현으로 쓸 수 있는지. 공백을 뺀 길이가 2자 이상이어야 한다('측' 한 글자는 측정·예측·추측 어디에나 걸린다). */
export function isUsableUserTerm(x: unknown): x is string {
  return typeof x === 'string' && x.replace(/\s+/g, '').length >= 2;
}

/** 사전 17종과 교사 추가 표현을 합쳐 컴파일한다. 알 수 없는 키, 빈 표현, 한 글자 표현은 무시한다. */
export function compileMethods(userDict?: UserDict): CompiledMethod[] {
  const ud: Partial<Record<string, unknown>> = (userDict ?? {}) as Partial<Record<string, unknown>>;
  return METHODS.map((def) => {
    const raw = ud[def.key];
    const terms = Array.isArray(raw) ? raw.filter(isUsableUserTerm) : [];
    return {
      def,
      re: new RegExp('(?:' + def.terms.join('|') + ')', 'g'),
      ex: def.exclude && def.exclude.length ? new RegExp('(?:' + def.exclude.join('|') + ')', 'g') : null,
      user: joinRx(terms.map(userTerm)),
    };
  });
}

/** 제외 표현 구간을 같은 길이의 공백으로 지운 문장. */
export function masked(s: string, cm: CompiledMethod): string {
  return maskWith(s, cm.ex);
}

/**
 * 문장에서 찾은 방법. 사전 표현은 제외 구간을 지운 문장에, 교사 추가 표현은 원문에 적용한다
 * (교사가 직접 넣은 표현은 제외 규칙보다 우선한다).
 */
export function methodHits(s: string, methods: CompiledMethod[]): MethodKey[] {
  const out: MethodKey[] = [];
  for (const cm of methods) {
    let ok = testOnce(cm.re, masked(s, cm));
    if (!ok && cm.user) ok = testOnce(cm.user, s);
    if (ok) out.push(cm.def.key);
  }
  return out;
}

/**
 * 원문 하이라이트용 구간. 같은 방법 안에서 겹치는 구간은 넓은 것 하나만 남긴다.
 * 서로 다른 방법의 겹침은 그대로 두고, 화면에 그릴 때(index.ts의 highlightSegments) 정리한다.
 */
export function methodMarks(text: string, methods: CompiledMethod[]): { a: number; b: number; key: MethodKey; user: boolean }[] {
  const out: { a: number; b: number; key: MethodKey; user: boolean }[] = [];
  for (const cm of methods) {
    const marks: { a: number; b: number; key: MethodKey; user: boolean }[] = [];
    for (const m of scan(cm.re, masked(text, cm))) marks.push({ a: m.a, b: m.b, key: cm.def.key, user: false });
    if (cm.user) for (const m of scan(cm.user, text)) marks.push({ a: m.a, b: m.b, key: cm.def.key, user: true });
    out.push(...dedupe(marks));
  }
  return out.sort((x, y) => x.a - y.a || y.b - x.b);
}

/** 같은 키 안에서 다른 구간에 완전히 포함되는 구간을 버린다. 넓은 구간부터 본다. */
function dedupe<T extends { a: number; b: number }>(marks: T[]): T[] {
  const sorted = marks.slice().sort((x, y) => x.a - y.a || y.b - x.b);
  const kept: T[] = [];
  for (const m of sorted) {
    if (kept.some((k) => k.a <= m.a && m.b <= k.b)) continue;
    kept.push(m);
  }
  return kept;
}

/* ───────────────────────── 과학 탐구 과정 기능 ───────────────────────── */

export interface CompiledSkill {
  def: SkillDef;
  re: RegExp;
  ex: RegExp | null;
}

export function compileSkills(): CompiledSkill[] {
  return SKILLS.map((def) => ({
    def,
    re: new RegExp('(?:' + def.terms.join('|') + ')', 'g'),
    ex: def.exclude && def.exclude.length ? new RegExp('(?:' + def.exclude.join('|') + ')', 'g') : null,
  }));
}

/** 문장에서 찾은 과학 탐구 과정 기능(사전 순서). */
export function skillHits(s: string, skills: CompiledSkill[]): SkillKey[] {
  const out: SkillKey[] = [];
  for (const cs of skills) if (testOnce(cs.re, maskWith(s, cs.ex))) out.push(cs.def.key);
  return out;
}

/** 원문 하이라이트용 구간(기능). */
export function skillMarks(text: string, skills: CompiledSkill[]): { a: number; b: number; key: SkillKey }[] {
  const out: { a: number; b: number; key: SkillKey }[] = [];
  for (const cs of skills) {
    const marks = scan(cs.re, maskWith(text, cs.ex)).map((m) => ({ a: m.a, b: m.b, key: cs.def.key }));
    out.push(...dedupe(marks));
  }
  return out.sort((x, y) => x.a - y.a || y.b - x.b);
}

/* ───────────────────────── 관심 분야 ───────────────────────── */

/**
 * 분야별 정규식. 낱말의 글자 사이에 \s*를 넣어 '항생제 내성'과 '항생제내성'을 같게 본다.
 * 긴 낱말을 앞에 두어 같은 자리에서는 긴 낱말이 먼저 맞는다('화학반응'이 '화학'보다 먼저).
 * 두 글자 낱말('내과', '안과')은 글자 사이 공백을 허용하지 않고 앞에 한글이 붙어 있으면 맞지 않게 한다.
 * 그렇지 않으면 '국내 과학'에서 '내과'가, '소아과학'에서 '아과'가 걸린다.
 */
export function compileFields(): { k: string; re: RegExp }[] {
  return FIELD_KEYS.map((k) => {
    const words = (FIELDS[k] ?? []).filter((w) => w && w.length >= 2).slice().sort((x, y) => y.length - x.length);
    const parts = words.map((w) =>
      w.length === 2 ? '(?<![가-힣])' + escapeRegExp(w) : w.split('').map(escapeRegExp).join('\\s*'),
    );
    return { k, re: new RegExp('(?:' + parts.join('|') + ')', 'g') };
  });
}

/**
 * 본문에서 관심 분야를 찾는다.
 * 1. 모든 분야의 매치 구간을 모은다.
 * 2. 구간이 겹치면 더 긴 낱말만 센다(분야가 달라도 마찬가지. '화학' 안에 '화학'이 든 '생화학'이 있으면 긴 쪽만).
 * 3. 분야마다 서로 다른 낱말 수(u)와 전체 횟수(n)를 세어, u>=2 또는 n>=3이면 인정한다.
 * 4. u 내림차순, n 내림차순으로 상위 3개. words는 서로 다른 낱말(공백 제거) 최대 6개.
 */
export function fieldsOf(text: string, fields: ReturnType<typeof compileFields>): FieldHit[] {
  const all: { k: string; a: number; b: number; w: string }[] = [];
  for (const f of fields) {
    for (const m of scan(f.re, text)) all.push({ k: f.k, a: m.a, b: m.b, w: m.t.replace(/\s+/g, '') });
  }
  // 긴 구간부터 두고, 이미 둔 구간과 겹치면 버린다
  all.sort((x, y) => (y.b - y.a) - (x.b - x.a) || x.a - y.a);
  const kept: typeof all = [];
  for (const m of all) {
    if (kept.some((k) => m.a < k.b && m.b > k.a)) continue;
    kept.push(m);
  }
  const by = new Map<string, { n: number; words: Set<string> }>();
  for (const m of kept) {
    const e = by.get(m.k) ?? { n: 0, words: new Set<string>() };
    e.n++;
    e.words.add(m.w);
    by.set(m.k, e);
  }
  const out: FieldHit[] = [];
  for (const f of fields) {
    const e = by.get(f.k);
    if (!e) continue;
    if (e.words.size >= 2 || e.n >= 3) out.push({ k: f.k, n: e.n, u: e.words.size, words: [...e.words].slice(0, 6) });
  }
  return out.sort((x, y) => y.u - x.u || y.n - x.n).slice(0, 3);
}

/** 방법 키가 사전에 있는지(사용자 사전 검사용). */
export function isMethodKey(k: string): k is MethodKey {
  return Object.prototype.hasOwnProperty.call(METHOD, k);
}
