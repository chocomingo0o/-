/**
 * 기록 하나의 문장 점수, 방법 집계, 깊이(1~4), 핵심 문장, 활동 흐름, 후속 탐구, 과학 탐구 기능을 채운다.
 *
 * - buildCtx(S, userDict) : 사전을 한 번 컴파일해 분석 문맥(Ctx)을 만든다. 학생 한 명을 분석할 때 한 번만 만들어 모든 기록에 돌려 쓴다.
 * - analyzeRecord(r, ctx) : Rec의 분석 필드(sents, methods, methodCounts, depth, key, acts, fuCount, faint,
 *                           connectCue, tf, ktf, fields, skills, skillCounts)를 채운다. 같은 기록에 다시 불러도 결과가 같다.
 * - DEPTH_TXT             : 깊이 이름. 1 정리·참여 / 2 조사·분석 / 3 실험·자료 생산 / 4 성찰·확장
 *
 * 규칙(설계 명세 4.3)
 *  문장마다
 *   ms = 방법 탐지 결과. 평가 문장이면 '개념 분석·해석(analysis)', '개념 이해·정리(understanding)'는 뺀다.
 *        평가 문장 = EVAL_SENT에 맞거나, 평가 어휘(EVAL_WORDS)가 있고 행위 동사(ACTION_VERBS)가 없는 문장.
 *        문장 전체가 평가(EVAL_SENT)이면서 행위 동사도 없으면('비판적 사고력이 돋보임.') 평가 어휘에 걸린 1·2단계 방법
 *        (비판→비교·비평, 사고→개념 분석·해석 등)은 모두 빼고, 직접 활동의 근거가 분명한 3단계 방법만 남긴다.
 *   rf = 성찰 단서(한계, 오차, 개선, 재실험 …)가 있는지. 문장 전체가 평가(EVAL_SENT, 행위 동사 없음)이면 거짓
 *   sc = Σ(방법: 3단계면 2, 아니면 1) + (rf면 2) + (탐구 동사 있으면 1) + (따옴표 있으면 0.5, 따옴표로 주제를 밝힌 문장이면 1)
 *   fu = 첫 문장이 아니고, 평가 어휘가 없는 활동 문장이고(evalKind 'none'), 후속 단서(더 나아가, 추가로 탐구, 궁금해져 …)가 있고,
 *        sc>=1 또는 탐구 동사가 있음
 *   skills = 과학 탐구 과정 기능 탐지 결과
 *  기록
 *   methods = 문장 방법 합집합(수준 내림차순, 같은 수준이면 빈도 내림차순, 그래도 같으면 사전 순)
 *   depth   = 최고 수준이 3이면 (성찰이 붙으면 4, 아니면 3), 2면 2, 그 외 1
 *             성찰이 붙었다(rf4) = 3단계 방법 문장 가운데 rf가 있거나,
 *                                 3단계 문장이 2개 이상이고 rf이면서 2단계 이상 방법이 있는 문장이 있음
 *   key     = sc>=2 문장 상위 3개(원문 순). 하나도 없으면 최고점 문장 1개
 *   faint   = depth<=1 이고 2단계 이상 방법이 없음(주제가 핵심어 외로 잡히면 topic.ts가 해제)
 *   acts    = (sc>=2 또는 fu) 문장 중 요약이 14자 이상인 것을 점수(fu는 +1.5) 순으로 최대 5개 골라 원문 순으로.
 *             후보가 없으면 최고점 문장 1개. 첫 활동은 이어진 활동(fu)으로 보지 않는다.
 *   connectCue = 본문에 앞 기록을 끌어오는 단서(앞서, 1학년 때, 지난 학기 …)가 있는지
 *
 * 정규식은 모두 test()에만 쓰므로 'g' 없이 만든다. 혹시 'g' 정규식이 들어와도 hit()가 lastIndex를 앞뒤로 0으로 돌린다.
 * 이 파일은 DOM에 의존하지 않는다.
 */
import type { Act, MethodKey, Rec, Sent, SkillKey, StudentRecord, UserDict } from '../types';
import { METHOD, METHOD_KEYS } from '../dict/methods';
import { SKILL_KEYS } from '../dict/skills';
import { ACTION_VERBS, CONNECT_TERMS, EVAL_SENT, EVAL_WORDS, FOLLOW_TERMS, INQ_TERMS, REFLECT_TERMS, rx } from '../dict/patterns';
import { compileFields, compileMethods, compileSkills, fieldsOf, methodHits, skillHits } from './methods';
import type { CompiledMethod, CompiledSkill } from './methods';
import { sentences, summarize, tokens } from './text';
import { subjectStop } from './records';

/* ───────────────────────── 깊이 이름 ───────────────────────── */

/**
 * 깊이 1~4의 이름. 0번은 비워 두어 DEPTH_TXT[r.depth]로 바로 쓴다.
 * 3단계는 '분석·실험'이 아니라 '실험·자료 생산'으로 적어 2단계 '조사·분석'과 이름만으로 구별되게 한다
 * (3단계 = 실험·설문·코딩·제작처럼 직접 자료를 만들거나 데이터를 분석하는 방법이 있음).
 */
export const DEPTH_TXT: readonly string[] = ['', '정리·참여', '조사·분석', '실험·자료 생산', '성찰·확장'];

/* ───────────────────────── 분석 문맥 ───────────────────────── */

export interface Ctx {
  methods: CompiledMethod[];                 // 탐구 방법 17종(+교사 추가 표현)
  skills: CompiledSkill[];                   // 과학 탐구 과정 기능 8종
  fields: ReturnType<typeof compileFields>;  // 관심 분야
  reflect: RegExp;                           // 성찰 단서 → Sent.rf
  follow: RegExp;                            // 후속 탐구 단서 → Sent.fu
  inq: RegExp;                               // 탐구 행위 동사·명사 → 점수 +1
  connect: RegExp;                           // 앞 기록 연결 단서 → Rec.connectCue
  evalRx: RegExp;                            // 평가·태도 어휘 → 평가 문장 판정
  subjStop: Set<string>;                     // 과목명 불용어(낱말 뽑기에서 제외)
}

/**
 * 사전을 컴파일해 분석 문맥을 만든다. 학생 한 명마다 한 번 만들어 쓴다.
 * userDict는 교사가 표현 사전 화면에서 추가한 평문 표현(방법 키 → 표현 목록)이다.
 */
export function buildCtx(S: StudentRecord, userDict?: UserDict): Ctx {
  return {
    methods: compileMethods(userDict),
    skills: compileSkills(),
    fields: compileFields(),
    reflect: rx(REFLECT_TERMS, ''),
    follow: rx(FOLLOW_TERMS, ''),
    inq: rx(INQ_TERMS, ''),
    connect: rx(CONNECT_TERMS, ''),
    evalRx: rx(EVAL_WORDS, ''),
    subjStop: subjectStop(S),
  };
}

/* ───────────────────────── 작은 도구 ───────────────────────── */

/** 정규식이 문장에 맞는지. 'g' 정규식이 들어와도 lastIndex를 앞뒤로 0으로 돌려 놓아 다음 호출에 영향이 없다. */
function hit(re: RegExp, s: string): boolean {
  re.lastIndex = 0;
  const ok = re.test(s);
  re.lastIndex = 0;
  return ok;
}

/** 따옴표가 있는 문장은 주제나 책 제목을 담고 있을 가능성이 커서 0.5점을 더한다. */
const QUOTE = /[‘'“"『]/;
/**
 * 따옴표로 탐구 주제를 밝힌 문장('‘…’를 주제로', '탐구 주제로 ‘…’를 정하고')은 0.5점 대신 1점을 더한다.
 * 맨몸 '탐구'를 개념 분석·해석으로 세던 때에는 이런 주제 문장이 늘 2점을 넘어 핵심 문장이 되었다.
 * 그 낱말을 뺀 뒤에도 주제 낱말이 핵심 문장 낱말(ktf)에 남아야 관심 주제와 연결이 흔들리지 않는다.
 */
const TOPIC_QUOTE = /[‘'“"][^’'”"]{3,60}[’'”"]\s*(?:을|를|이라는|라는)?\s*(?:탐구\s*)?주제|주제로\s*[‘'“"]/;

/** 방법 키의 수준(1~3). */
const lvOf = (k: MethodKey): number => METHOD[k].lv;

/**
 * 평가 문장 판정. 교사의 평가·태도 서술은 학생이 한 활동이 아니므로 방법으로 세지 않거나 일부만 센다.
 *  - 'none'  : 평가 문장이 아니다. 방법을 그대로 둔다.
 *  - 'soft'  : 평가 어휘가 섞인 문장. '개념 이해·정리', '개념 분석·해석'만 뺀다.
 *              (EVAL_SENT에 맞지만 행위 동사가 있는 '실험 결과를 꼼꼼히 기록하는 태도가 돋보임.'도 여기. 실험·기록은 활동이다.)
 *  - 'whole' : 문장 전체가 평가이고(EVAL_SENT) 행위 동사가 없다('비판적 사고력이 돋보임.'). 평가 어휘에 걸린
 *              1·2단계 방법('비판'→비교·비평, '사고'→개념 분석·해석)은 모두 빼고, 3단계 방법만 남긴다
 *              (3단계 표현은 '시제품을 제작', '설문을 실시'처럼 구체적인 활동이라 평가 어휘와 헷갈릴 일이 적다).
 * 행위 동사 = 실험, 측정, 조사, 분석, 설문, 제작, 설계, 코딩, 읽고, 탐구하, 비교하, 작성하, 발표하, 제안하, 관찰, 모델링, 만들, 구현 …
 * (dict/patterns.ts의 ACTION_VERBS)
 */
function evalKind(s: string, ctx: Ctx): 'none' | 'soft' | 'whole' {
  const t = s.trim();
  const whole = hit(EVAL_SENT, t);
  const action = hit(ACTION_VERBS, t);
  if (whole && !action) return 'whole';
  if (whole) return 'soft';
  return hit(ctx.evalRx, t) && !action ? 'soft' : 'none';
}

/** 평가 어휘가 섞인 문장에서 빼는 방법. 개념을 '이해했다', '분석했다'는 평가는 활동 근거가 약하다. */
const EVAL_DROP: ReadonlySet<MethodKey> = new Set<MethodKey>(['analysis', 'understanding']);

/** 활동 흐름 후보를 고를 때 쓰는 점수. 이어진 추가 탐구(fu)는 1.5점을 더해 우선 고른다. */
const actScore = (o: Sent): number => o.sc + (o.fu ? 1.5 : 0);

/** 점수가 가장 높은 문장. 같은 점수면 앞에 나온 문장. 문장이 없으면 null. */
function best(scored: Sent[]): Sent | null {
  let b: Sent | null = null;
  for (const o of scored) if (!b || o.sc > b.sc) b = o;
  return b;
}

/* ───────────────────────── 문장 점수 ───────────────────────── */

/**
 * 문장 하나를 점수 매긴다. i는 기록 안에서의 문장 순서(0부터). 첫 문장은 후속(fu)이 될 수 없다.
 */
function scoreSentence(o: { s: string; a: number; b: number }, i: number, ctx: Ctx): Sent {
  const ek = evalKind(o.s, ctx);
  let ms = methodHits(o.s, ctx.methods);
  if (ms.length) {
    if (ek === 'whole') ms = ms.filter((k) => lvOf(k) >= 3);
    else if (ek === 'soft') ms = ms.filter((k) => !EVAL_DROP.has(k));
  }
  // 문장 전체가 평가('…디버깅 습관이 돋보임')이면 그 안의 성찰 단서는 학생의 성찰 활동이 아니다
  const rf = ek !== 'whole' && hit(ctx.reflect, o.s);
  const inq = hit(ctx.inq, o.s);
  const sc = ms.reduce((acc, k) => acc + (lvOf(k) >= 3 ? 2 : 1), 0) + (rf ? 2 : 0) + (inq ? 1 : 0) + (TOPIC_QUOTE.test(o.s) ? 1 : QUOTE.test(o.s) ? 0.5 : 0);
  // 후속 탐구는 평가 어휘가 없는 활동 문장에서만. '관련 자료를 찾아 발표하는 데 익숙함' 같은 총평은 추가 탐구가 아니다
  const fu = i > 0 && ek === 'none' && hit(ctx.follow, o.s) && (sc >= 1 || inq);
  const skills = skillHits(o.s, ctx.skills);
  return { s: o.s, a: o.a, b: o.b, ms, rf, sc, fu, skills };
}

/* ───────────────────────── 기록 분석 ───────────────────────── */

/**
 * 기록의 분석 필드를 채운다. 주제(topic, kw, summary)와 관심 주제(themes)는 다른 모듈(topic.ts, themes.ts)이 뒤에서 채운다.
 */
export function analyzeRecord(r: Rec, ctx: Ctx): void {
  const scored: Sent[] = sentences(r.text).map((o, i) => scoreSentence(o, i, ctx));
  r.sents = scored;

  // 방법 집계: 문장마다 한 번씩 센다(한 문장에 같은 방법이 여러 번 나와도 1).
  const mc = new Map<MethodKey, number>();
  for (const o of scored) for (const k of o.ms) mc.set(k, (mc.get(k) ?? 0) + 1);
  r.methodCounts = Object.fromEntries(mc) as Partial<Record<MethodKey, number>>;
  r.methods = [...mc.entries()]
    .sort((x, y) => lvOf(y[0]) - lvOf(x[0]) || y[1] - x[1] || METHOD_KEYS.indexOf(x[0]) - METHOD_KEYS.indexOf(y[0]))
    .map((e) => e[0]);

  // 깊이. 3단계 방법이 있는 문장(s3)에 성찰이 붙으면 4단계.
  const s3 = scored.filter((o) => o.ms.some((k) => lvOf(k) >= 3));
  const rf4 = s3.some((o) => o.rf) || (s3.length >= 2 && scored.some((o) => o.rf && o.ms.some((k) => lvOf(k) >= 2)));
  const top = r.methods.reduce((m, k) => Math.max(m, lvOf(k)), 0);
  r.depth = top >= 3 ? (rf4 ? 4 : 3) : top === 2 ? 2 : 1;

  // 핵심 문장: sc>=2 가운데 상위 3개를 원문 순으로. 없으면 최고점 1개.
  const strong = scored.filter((o) => o.sc >= 2);
  r.key = strong.slice().sort((x, y) => y.sc - x.sc).slice(0, 3).sort((x, y) => x.a - y.a);
  if (!r.key.length) {
    const b = best(scored);
    r.key = b ? [b] : [];
  }

  // 약한 기록: 1단계이고 2단계 이상 방법이 하나도 없음. 주제가 따옴표나 패턴으로 잡히면 topic.ts가 해제한다.
  r.faint = r.depth <= 1 && !r.methods.some((k) => lvOf(k) >= 2);

  // 앞 기록을 끌어오는 단서
  r.connectCue = hit(ctx.connect, r.text);

  // 낱말 빈도(tf)와 핵심 문장 낱말(ktf). 과목명은 빼고 센다.
  const tf = new Map<string, number>();
  for (const t of tokens(r.text, ctx.subjStop)) tf.set(t, (tf.get(t) ?? 0) + 1);
  r.tf = tf;
  const ktf = new Set<string>();
  for (const o of strong) for (const t of tokens(o.s, ctx.subjStop)) ktf.add(t);
  r.ktf = ktf;

  // 관심 분야
  r.fields = fieldsOf(r.text, ctx.fields);

  // 활동 흐름: 의미 있는 문장(sc>=2 또는 fu) 중 요약이 14자 이상인 것. 점수 순 상위 5개를 원문 순으로.
  const pool = scored.filter((o) => (o.sc >= 2 || o.fu) && summarize(o.s, 200).length >= 14);
  let cands: Sent[] = pool;
  if (!cands.length) {
    const b = best(scored);
    cands = b ? [b] : [];
  }
  const chosen = cands.slice().sort((x, y) => actScore(y) - actScore(x)).slice(0, 5).sort((x, y) => x.a - y.a);
  r.acts = chosen.map<Act>((o, i) => ({ text: summarize(o.s, 140), ms: o.ms, rf: o.rf, sc: o.sc, fu: i > 0 && o.fu }));
  r.fuCount = r.acts.filter((a) => a.fu).length;

  // 과학 탐구 과정 기능: 문장마다 한 번씩 세고 빈도 내림차순(같으면 사전 순).
  const sk = new Map<SkillKey, number>();
  for (const o of scored) for (const k of o.skills) sk.set(k, (sk.get(k) ?? 0) + 1);
  r.skillCounts = Object.fromEntries(sk) as Partial<Record<SkillKey, number>>;
  r.skills = [...sk.entries()]
    .sort((x, y) => y[1] - x[1] || SKILL_KEYS.indexOf(x[0]) - SKILL_KEYS.indexOf(y[0]))
    .map((e) => e[0]);
}
