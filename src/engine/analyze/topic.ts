/**
 * 기록의 탐구 주제 뽑기.
 *
 * - topicOf      : 기록 하나의 주제 문구와 종류를 정한다
 *                  ('q' 따옴표 | 'p' 패턴 | 'b' 책 | 's' 핵심 문장 | 'k' 핵심어)
 * - assignTopics : 모든 기록에 topic, topicKind, kw, summary, summaryFu를 채우고
 *                  주제가 핵심어 외로 잡힌 기록은 faint(약한 기록) 표시를 푼다
 *
 * 규칙은 docs/DESIGN.md 4.4를 따른다. 우선순위가 높은 것부터 차례로 시도한다.
 *  ① ‘…’ 뒤에 주제/질문/탐구/보고서        → q
 *  ② ‘…’에 참여 / ‘…’ 프로젝트 / ‘…’를 주제로  → q
 *  ③ ‘…’(이)라는 제목                     → q
 *  ④ 주제로 … 선정/설정                    → p
 *  ⑤ 핵심 문장 안의 '…에 미치는 영향', '…의 상관관계' 같은 명사구 → p
 *  ⑥ '…인가/일까?'라는 질문               → q
 *  ⑦ '…에 관한 보고서/발표'               → p
 *  ⑧ '…을 주제로', '…에 대해 탐구/조사'    → p
 *  ⑧' 수행평가/프로젝트/활동 ‘…’ (활동 이름, 본문 전체) → q
 *  ⑨ 핵심 문장 안의 아무 따옴표(책이면 b)   → q | b
 *  ⑩ 핵심어 3개                            → k
 *
 * 따옴표 안의 문구(①②③⑨)는 교사가 제목으로 적은 것이므로 validTopic보다 느슨한 validQuoted로 검사한다.
 * (‘책상 위 공간을 넓히는 정리함’처럼 명사가 '함'으로 끝나도 문장 조각이 아니다.)
 *
 * 정규식에 'g' 플래그를 쓰지 않으므로 lastIndex 걱정 없이 exec()를 반복해도 된다.
 * 이 파일은 DOM에 의존하지 않는다.
 */
import type { Act, Rec, Sent, TopicKind } from '../types';
import { cleanTopic, nos, stripAuthor, summarize, validTopic } from './text';

export interface TopicResult {
  text: string;
  kind: TopicKind;
}

/* ───────────────────────── 따옴표 ───────────────────────── */
// 여는 따옴표와 닫는 따옴표. 홑낫표·겹낫표도 받는다. 곧은 따옴표(' ")는 양쪽에 다 쓰인다.
const OPEN = '[‘\'“"「『]';
const CLOSE = '[’\'”"」』]';
const INNER = '[^’\'”"」』]'; // 따옴표 안쪽 글자(닫는 따옴표가 나오면 끝)

/* ───────────────────────── 본문 전체에 적용하는 패턴 ───────────────────────── */

/** ① ‘…’(을/를/이라는/에 대해) 주제|질문|탐구|문제|물음|의문|보고서|심화 탐구 */
const Q_TOPIC = new RegExp(
  `${OPEN}(${INNER}{4,60})${CLOSE}\\s*(?:이?라는|을|를|의|에\\s*대해|에\\s*대한)?\\s*(?:주제|질문|탐구|문제|물음|의문|보고서|심화\\s*탐구)`,
);

/** ② ‘…’에 참여 / ‘…’ 프로젝트에 / ‘…’ 활동에 참여 / ‘…’를 주제로 */
const Q_JOIN = new RegExp(`${OPEN}(${INNER}{5,60})${CLOSE}\\s*(?:에\\s*참여|프로젝트에|활동에\\s*참여|를\\s*주제로|을\\s*주제로)`);

/** ③ ‘…’(이)라는 제목, ‘…’의 제목 */
const Q_TITLE = new RegExp(`${OPEN}(${INNER}{3,50})${CLOSE}\\s*(?:이?라는|의)\\s*제목`);

/**
 * ⑧' 활동 이름 바로 뒤의 따옴표. '함수 단원 수행평가 ‘주변의 변화를 함수로 나타내기’에서 …'처럼
 * 세특은 수행평가·프로젝트·활동 이름을 따옴표로 적는 일이 많고, 그 이름이 곧 탐구 주제다.
 * 끝에 (저자)가 붙은 책 제목('독서 활동 ‘…(저자)’')은 ⑨에서 책으로 다룬다.
 */
const Q_ACTIVITY = new RegExp(`(?:수행평가|프로젝트|과제|활동|대회|행사|탐구|발표)\\s*${OPEN}(${INNER}{5,60})${CLOSE}`);

/** ④ 주제로 ‘…’을 선정/정하/정해/설정 */
const P_SELECT = new RegExp(`주제로\\s*${OPEN}?([^’'”"」』.,]{3,40}?)${CLOSE}?\\s*(?:을|를)\\s*(?:선정|정하|정해|설정)`);

/** ‘제목 (저자)’처럼 끝에 괄호가 붙은 것은 책이므로 ②에서는 주제로 보지 않는다 */
const AUTHOR_TAIL = /\([가-힣\s]{2,12}\)$/;

/* ───────────────────────── 핵심 문장에 적용하는 패턴 ───────────────────────── */

/** ⑤ 탐구 주제답게 끝나는 명사구. '…에 미치는 영향', '…의 상관관계', '…의 원리', '…해결 방안' 등 */
const P_NOUN = new RegExp(
  '([^,.‘’\'"]{4,44}?(?:에\\s*미치는\\s*영향|의\\s*상관관계|와의\\s*관계|과의\\s*관계|의\\s*원리|의\\s*효과|의\\s*실태|의\\s*필요성|' +
    '개선\\s*방안|해결\\s*방안|의\\s*차이|의\\s*변화|의\\s*역할|의\\s*문제점|의\\s*한계와\\s*가능성|의\\s*메커니즘|의\\s*작용\\s*기전|' +
    '의\\s*활용\\s*방안|에\\s*따른\\s*[가-힣]{2,6}\\s*변화))',
);
/** ⑤의 명사구에서 꼬리를 떼면 앞머리(탐구 대상)가 남는다. 앞머리가 두 낱말 이상이어야 주제로 본다. */
const P_NOUN_TAIL = /(?:에\s*미치는\s*영향|의\s*[가-힣]+|개선\s*방안|해결\s*방안|에\s*따른.*)$/;
/** 앞머리가 이런 말로 시작하면 주제가 아니라 활동 설명이다 */
const P_NOUN_BAD_HEAD = /^(?:실질적|구체적|발생|학교생활|다양한|여러|각|이|그)/;
/**
 * ⑤의 명사구 앞에 붙은 앞 절을 뗀다. '훈민정음 창제 과정을 조사해 집현전 학자들의 역할' → '집현전 학자들의 역할'.
 * cleanTopic이 '하여/하고/하며' 꼴은 떼 주므로 여기서는 '…해', '…고', '…아/어' 꼴의 흔한 활동 동사만 본다
 * (한 글자 어미만으로 자르면 '분해', '이해', '참여' 같은 명사까지 잘려 나가므로 동사를 하나씩 적는다).
 */
const P_NOUN_CLAUSE =
  /.*(?:조사해|탐구해|분석해|비교해|정리해|관찰해|측정해|실험해|확인해|활용해|이용해|적용해|제작해|설계해|작성해|발표해|설명해|해결해|듣고|보고|읽고|찾아|살펴|구해|세워|만들어|나누어|모아|거쳐|마치고|배운\s*뒤|마친\s*뒤)\s+/;

/** ⑥ '…인가/일까/는가/을까?'(이)라는 질문|의문|물음|궁금증 */
const Q_QUESTION = /([^.?]{4,50}?(?:인가|일까|는가|을까|ㄹ까|\?))\s*(?:라는|이라는)?\s*(?:질문|의문|물음|궁금증)/;

/** ⑦ '…에 관한 보고서|발표|탐구|연구|칼럼|글|기사|자료|토론|에세이' */
const P_ABOUT = /([^.,]{3,50}?)에\s*관한\s*(?:보고서|발표|탐구|연구|칼럼|글|기사|자료|토론|에세이)/;

/** ⑦ '…을 (탐구) 주제로 삼아|설정|선정|정하' */
const P_AS_TOPIC = /([^.,]{3,50}?)(?:을|를)\s*(?:탐구\s*)?주제로\s*(?:삼아|설정|선정|정하)/;

/** ⑧ '…을 주제로' */
const P_TOPIC_LOOSE = /([^.]{3,60}?)(?:을|를)\s*주제로/;

/** ⑧ '…에 대해|대하여|관해|관하여|대한 (심화) 탐구|조사|분석|실험|연구|보고서' */
const P_ABOUT_LOOSE = /([^.]{3,60}?)에\s*(?:대해|대하여|관해|관하여|대한)\s*(?:심화\s*)?(?:탐구|조사|분석|실험|연구|보고서)/;

/** ⑨ 핵심 문장 안의 아무 따옴표 */
const Q_ANY = new RegExp(`${OPEN}(${INNER}{4,48})${CLOSE}`);
/** 따옴표 안이 '제목 (저자)' 꼴이면 책 */
const BOOK_PAREN = /\([가-힣A-Za-z.\s]{2,20}\)$/;
/** 따옴표 바로 뒤에 이런 말이 오면 책 */
const BOOK_NEAR = /(읽고|완독|탐독|도서|책)/;

/** 앞뒤 따옴표 찌꺼기 떼기 */
const stripQuotes = (s: string): string => s.replace(/^[‘'“"「『]+|[’'”"」』]+$/g, '').trim();

/** 따옴표 안 문구가 조사로 끝나면(‘…을’) 잘린 인용이므로 주제로 쓰지 않는다. */
const QUOTED_BAD_END = /(?:을|를|의|에|에서|으로|로|와|과|및|등|이며|하고|하여|위해|통해)$/;

/**
 * 따옴표 안의 문구가 주제로 쓸 만한지. 교사가 직접 따옴표로 묶은 제목은 문장 조각일 가능성이 낮으므로
 * validTopic보다 느슨하게 본다: 3~44자, 한글이나 영문 포함, 괄호 짝, 9어절 이하, 조사로 끝나지 않음.
 * '함', '음'으로 끝나는 명사(정리함, 모음)나 '활동', '결과'로 끝나는 제목도 받는다.
 */
function validQuoted(p: string): boolean {
  if (validTopic(p)) return true;
  const t = (p ?? '').trim();
  if (t.length < 3 || t.length > 44) return false;
  if (!/[가-힣A-Za-z]/.test(t)) return false;
  if (/^[)\]\/,.·\-~]/.test(t)) return false;
  if ((t.match(/\(/g) || []).length !== (t.match(/\)/g) || []).length) return false;
  if (t.split(/\s+/).length > 9) return false;
  if (QUOTED_BAD_END.test(t)) return false;
  return true;
}

/* ───────────────────────── 핵심어뿐일 때의 보정 패턴(assignTopics) ───────────────────────── */

/**
 * 활동 요약문에서 '…을 탐구/분석/측정/…' 앞의 명사구를 주제로 삼는다.
 * 예: '온도별 카탈레이스 활성을 측정하여 …' → '온도별 카탈레이스 활성'
 * 명사구는 낱말 경계에서 시작해야 한다. 그렇지 않으면 46자 제한 때문에 '…네 개의 값을 …' 같은 문장 중간
 * ('개의 값을 되풀이한다는 …')에서 잘려 시작한 조각이 주제가 된다. 앞에 붙은 활동 절('…을 정리해 ')은 P_NOUN_CLAUSE로 뗀다.
 */
const ACT_OBJECT = /(?:^|(?<=\s))([^,.]{4,46}?)(?:을|를)\s*(?:주제로|탐구|분석|조사|비교|설명|정리|제작|설계|측정|실험|발표|제안|해석|모델링|근사|연구|살펴|알아|탐색|규명|고찰)/;

/** 핵심 문장을 주제로 쓸 때 첫 절만 남기기 위한 구분점(쉼표, '…하며 ', '…하고 ' 등) */
const CLAUSE_SPLIT = /,|(?:하며|하고|하여|하면서|으며|이며)\s/;

/** 's' 주제 앞머리의 지시어('그 원인을 …' → '원인을 …'). 앞 문장을 가리키는 말은 카드에서 뜻이 없다. */
const LEAD_PRONOUN = /^(?:그|이|저|이러한|그러한|이런|그런)\s+/;

/* ───────────────────────── topicOf ───────────────────────── */

/** 핵심 문장을 점수 내림차순으로. 점수가 같으면 원문 순서를 지킨다. */
function keysByScore(r: Rec): Sent[] {
  return (r.key ?? []).slice().sort((x, y) => y.sc - x.sc);
}

/**
 * 기록 하나의 주제. 우선순위는 파일 머리의 ①~⑩.
 * kw는 핵심어 함수(themes.ts의 keywordFn 결과). 마지막 수단으로 쓴다.
 */
export function topicOf(r: Rec, kw: (r: Rec) => string[]): TopicResult {
  const text = r.text ?? '';
  const keys = keysByScore(r);

  // ① ‘…’를 주제로 / ‘…’라는 질문 / ‘…’ 탐구 보고서
  let m = Q_TOPIC.exec(text);
  if (m) {
    const c = stripAuthor(m[1]);
    if (validQuoted(c)) return { text: c, kind: 'q' };
  }

  // ② ‘…’에 참여, ‘…’ 프로젝트. 끝에 (저자)가 붙은 책 제목은 제외
  m = Q_JOIN.exec(text);
  if (m && !AUTHOR_TAIL.test(m[1].trim())) {
    const c = stripAuthor(m[1]);
    if (validQuoted(c)) return { text: c, kind: 'q' };
  }

  // ③ ‘…’라는 제목
  m = Q_TITLE.exec(text);
  if (m && validQuoted(m[1].trim())) return { text: m[1].trim(), kind: 'q' };

  // ④ 주제로 … 선정
  m = P_SELECT.exec(text);
  if (m) {
    const c = cleanTopic(m[1]);
    if (validTopic(c)) return { text: c, kind: 'p' };
  }

  // ⑤ 핵심 문장 안의 '…에 미치는 영향' 같은 명사구
  for (const ks of keys) {
    const hm = P_NOUN.exec(ks.s);
    if (!hm) continue;
    const c = cleanTopic(hm[1]).replace(P_NOUN_CLAUSE, '').trim();
    const pre = c.replace(P_NOUN_TAIL, '').trim();
    if (
      c.length >= 12 &&
      c.length <= 46 &&
      pre.split(/\s+/).length >= 2 &&
      !P_NOUN_BAD_HEAD.test(pre) &&
      /^[가-힣A-Za-z]/.test(c)
    ) {
      return { text: c, kind: 'p' };
    }
  }

  // ⑥ 질문형, ⑦ '에 관한 보고서', '을 주제로 삼아'
  for (const ks of keys) {
    let mm = Q_QUESTION.exec(ks.s);
    if (mm) {
      const c = stripQuotes(cleanTopic(mm[1]));
      // 물음표로 끝나는 문구는 validTopic이 어미 검사에서 떨어뜨릴 수 있어 길이만 본다
      if (validTopic(c) || (/\?$/.test(c) && c.length <= 44)) return { text: c, kind: 'q' };
    }
    mm = P_ABOUT.exec(ks.s);
    if (mm) {
      const c = cleanTopic(mm[1]);
      if (validTopic(c)) return { text: c, kind: 'p' };
    }
    mm = P_AS_TOPIC.exec(ks.s);
    if (mm) {
      const c = stripQuotes(cleanTopic(mm[1]));
      if (validTopic(c)) return { text: c, kind: 'p' };
    }
  }

  // ⑧ '…을 주제로', '…에 대해 탐구'
  for (const ks of keys) {
    m = P_TOPIC_LOOSE.exec(ks.s);
    if (m) {
      const c = stripQuotes(cleanTopic(m[1]));
      if (validTopic(c)) return { text: c, kind: 'p' };
    }
    m = P_ABOUT_LOOSE.exec(ks.s);
    if (m) {
      const c = cleanTopic(m[1]);
      if (validTopic(c)) return { text: c, kind: 'p' };
    }
  }

  // ⑧' 수행평가 ‘…’, 프로젝트 ‘…’ 같은 활동 이름(본문 전체). 책 제목(저자 괄호)은 제외.
  //    활동 이름은 '인물 탐구 보고서'처럼 두루뭉술할 수 있어 ④~⑧의 구체적인 명사구보다 뒤에 둔다.
  m = Q_ACTIVITY.exec(text);
  if (m && !AUTHOR_TAIL.test(m[1].trim())) {
    const c = m[1].trim();
    if (validQuoted(c)) return { text: c, kind: 'q' };
  }

  // ⑨ 핵심 문장 안의 아무 따옴표. '제목 (저자)'이거나 바로 뒤에 '읽고' 등이 오면 책
  for (const ks of keys) {
    const q = Q_ANY.exec(ks.s);
    if (!q) continue;
    const raw = q[1].trim();
    const after = ks.s.slice(q.index, q.index + q[0].length + 12);
    const isBook = BOOK_PAREN.test(raw) || BOOK_NEAR.test(after);
    const c = stripAuthor(raw);
    if (validQuoted(c)) return { text: c, kind: isBook ? 'b' : 'q' };
  }

  // ⑩ 핵심어. 그것도 없으면 가장 점수 높은 핵심 문장(없으면 본문) 앞부분
  const words = kw(r);
  if (words.length) return { text: words.join(', '), kind: 'k' };
  const fallback = keys[0] ? keys[0].s : text;
  return { text: summarize(fallback, 36), kind: 'k' };
}

/* ───────────────────────── assignTopics ───────────────────────── */

/**
 * 모든 기록에 주제와 요약을 붙인다.
 *
 * 1. topicOf로 topic, topicKind를 정하고 kw(핵심어 3개)를 채운다.
 *    주제가 핵심어 외('q', 'p', 'b')로 잡힌 기록은 faint(약한 기록) 표시를 푼다.
 * 2. 주제가 핵심어뿐('k')이고 활동 흐름(acts)이 있으면 활동 요약에서 주제를 다시 고른다.
 *    - 활동 요약 안의 '…을 탐구/분석/측정…' 앞 명사구(6자 이상, 앞의 활동 절은 뗀 뒤)가 있으면 그것을 'p'로
 *    - 없으면 점수가 가장 높은 활동 요약의 첫 절(8~48자)을, 길이가 맞지 않으면 44자로 줄인 요약을 's'로.
 *      앞머리의 지시어('그 ', '이 ')는 뗀다
 *    이 보정은 주제 문구를 읽기 좋게 할 뿐이므로 faint는 풀지 않는다
 *    (풀면 활동 흐름이 있는 모든 기록이 약한 기록에서 벗어나 표시의 의미가 없어진다).
 * 3. summary: 주제로 쓴 활동이 아니고 주제 앞 8자를 품지 않은 활동 가운데,
 *    후속 탐구(fu)가 있으면 그것을(summaryFu=true), 없으면 점수가 가장 높고 14자 이상인 것을 80자로 요약한다.
 */
export function assignTopics(recs: Rec[], kw: (r: Rec) => string[]): void {
  for (const r of recs) {
    const tp = topicOf(r, kw);
    r.topic = tp.text;
    r.topicKind = tp.kind;
    r.kw = kw(r);
    if (tp.kind !== 'k') r.faint = false;

    const acts: Act[] = r.acts ?? [];
    const byScore = acts.slice().sort((x, y) => y.sc - x.sc);
    let used: Act | null = null;

    if (tp.kind === 'k' && byScore[0]) {
      used = byScore[0];
      let np: string | null = null;
      for (const a of byScore) {
        const mm = ACT_OBJECT.exec(a.text);
        if (!mm) continue;
        const c = cleanTopic(mm[1]).replace(P_NOUN_CLAUSE, '').trim();
        if (validTopic(c) && c.length >= 6) {
          np = c;
          used = a;
          break;
        }
      }
      if (np) {
        r.topic = np;
        r.topicKind = 'p';
      } else {
        const cl = used.text.split(CLAUSE_SPLIT)[0].trim().replace(LEAD_PRONOUN, '');
        r.topic = cl.length >= 8 && cl.length <= 48 ? cl : summarize(used.text, 44).replace(LEAD_PRONOUN, '');
        r.topicKind = 's';
      }
    }

    // 주제와 겹치지 않는 활동을 요약으로. 후속 탐구가 있으면 그것을 먼저 고른다.
    const core = nos(r.topic).replace(/…$/, '').slice(0, 8);
    const overlaps = (a: Act): boolean => core.length > 0 && nos(a.text).includes(core);
    const fuAct = acts.find((a) => a.fu && a !== used && !overlaps(a));
    const pick = fuAct ?? byScore.find((a) => a !== used && a.text.length >= 14 && !overlaps(a));
    r.summary = pick ? summarize(pick.text, 80) : '';
    r.summaryFu = !!fuAct;
  }
}
