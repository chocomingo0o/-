/**
 * 문장과 낱말 다루기.
 *
 * - nos        : 공백 제거
 * - sentences  : 본문을 문장으로 나눈다. 각 문장은 원문 안의 시작·끝 위치(a, b)를 함께 가진다.
 * - tokens     : 본문에서 내용 낱말만 뽑는다(조사·어미 제거, 불용어 제외).
 * - summarize  : 문장을 요약용 한 줄로 다듬는다(앞머리 접속어와 평가 꼬리 제거, 길이 제한).
 * - cleanTopic : 주제 후보 문구에서 앞뒤 군더더기를 뗀다.
 * - validTopic : 주제 문구로 쓸 만한지 판정한다.
 * - stripAuthor: '제목 (저자)' → '제목'
 * - jo         : 받침에 따라 조사를 고른다.
 *
 * 이 파일은 DOM에 의존하지 않는다. 사전은 dict/stop.ts, dict/patterns.ts를 쓴다.
 */
import { GENERIC, LEAD_WORD, NOUN_OK, STOP, STOP2, SUF, VERB_END } from '../dict/stop';
import { EVAL_TAIL, LEAD_ADVERBS } from '../dict/patterns';

/** 공백(띄어쓰기, 줄바꿈 포함)을 모두 뺀다. */
export const nos = (s: string): string => (s ?? '').replace(/\s+/g, '');

/* ───────────────────────── 문장 나누기 ───────────────────────── */

/** 문장 끝 부호. 마침표, 느낌표, 물음표, 고리점. */
const END_CHARS = new Set(['.', '!', '?', '。']);
const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';
const isSpace = (ch: string): boolean => /\s/.test(ch);

/**
 * 본문을 문장으로 나눈다.
 * - `. ! ? 。` 가 문장 끝이다. 잇달아 나오면(…?!) 한 문장의 끝으로 본다.
 * - 숫자 사이의 마침표(3.5%, 7.0)는 소수점이므로 문장을 끊지 않는다.
 * - 돌려주는 s는 앞뒤 공백을 뗀 문장이고, a와 b는 그 문장이 원문에서 차지하는 구간이다
 *   (text.slice(a, b) === s). 하이라이트 위치 계산에 쓴다.
 */
export function sentences(text: string): { s: string; a: number; b: number }[] {
  const out: { s: string; a: number; b: number }[] = [];
  const t = text ?? '';
  const n = t.length;
  let start = 0;
  let i = 0;
  while (i < n) {
    const ch = t[i];
    if (END_CHARS.has(ch)) {
      // 숫자 사이의 마침표는 소수점
      if (ch === '.' && i > 0 && i + 1 < n && isDigit(t[i - 1]) && isDigit(t[i + 1])) {
        i++;
        continue;
      }
      // 잇달은 문장 부호를 모두 끝에 포함
      let j = i;
      while (j < n && END_CHARS.has(t[j])) j++;
      push(start, j);
      start = j;
      i = j;
      continue;
    }
    i++;
  }
  if (start < n) push(start, n);
  return out;

  function push(a0: number, b0: number): void {
    let a = a0;
    let b = b0;
    while (a < b && isSpace(t[a])) a++;
    while (b > a && isSpace(t[b - 1])) b--;
    if (a >= b) return;
    // 문장 부호만 남은 조각(예: 앞 문장에 붙은 '.')은 버린다
    const s = t.slice(a, b);
    if (!/[가-힣A-Za-z0-9]/.test(s)) return;
    out.push({ s, a, b });
  }
}

/* ───────────────────────── 낱말 뽑기 ───────────────────────── */

/** 낱말 경계로 보는 문장부호. 가운뎃점(·)도 끊는다('사회·문화' → '사회', '문화'). */
const PUNCT = /[‘’'“”"『』「」()\[\]{}<>〈〉《》·,.!?:;~\/\-–—=+%…]/g;

/** 조사 하나만 떼어도 되는 1글자 조사(남는 글자가 1자 이상이면 뗀다). 그 외는 2자 이상 남아야 뗀다. */
const SHORT_JOSA = new Set(['을', '를', '의', '과', '와', '가', '에']);

/**
 * 낱말 하나에서 조사·어미를 한 번 뗀다. 긴 조사부터 대조한다(SUF는 길이 내림차순).
 * NOUN_OK(온도, 에너지, 정의 …)는 끝 글자가 조사와 같아도 떼지 않는다.
 */
function stripSuffix(w: string): string {
  if (NOUN_OK.has(w)) return w;
  for (const s of SUF) {
    if (!w.endsWith(s)) continue;
    const need = SHORT_JOSA.has(s) ? s.length + 1 : s.length + 2;
    if (w.length >= need) return w.slice(0, -s.length);
  }
  return w;
}

/** 불용어 사전(STOP, STOP2, GENERIC)과 과목명(extraStop)에 있는 낱말인지. */
function isStop(t: string, extraStop?: Set<string>): boolean {
  return STOP.has(t) || STOP2.has(t) || GENERIC.has(t) || (!!extraStop && extraStop.has(t));
}

/**
 * LEAD_WORD(앞붙이 부사 '또한', '특히', '다시' …)의 부사 목록을 그대로 꺼내어, 낱말 전체가 그 부사인 경우를 버리는 정규식.
 * 사전을 한 곳(dict/stop.ts)에만 두기 위해 LEAD_WORD.source에서 목록을 뽑는다.
 * 모양이 예상과 다르면(여는 괄호가 남으면) 아무것도 맞지 않는 정규식으로 둔다.
 */
const LEAD_ALONE: RegExp = (() => {
  const inner = LEAD_WORD.source.replace(/^\^\(/, '').replace(/\)\(\?=.*$/, '');
  if (!inner || /[()^$]/.test(inner)) return /^(?!)$/;
  return new RegExp('^(?:' + inner + ')$');
})();

/**
 * 본문에서 내용 낱말을 뽑는다(중복 포함, 나온 순서대로).
 * 1. 문장부호를 공백으로 바꾸고 공백으로 나눈다.
 * 2. 낱말 앞에 붙은 부사(또한, 특히, 직접 …)를 뗀다. 뒤에 두 글자 이상 남을 때만.
 * 3. 조사·어미를 한 번 뗀다(NOUN_OK 예외).
 * 4. 2~12자만 남긴다. 숫자로 시작하는 것은 버린다.
 * 5. 불용어(STOP, STOP2, GENERIC)와 과목명(extraStop)을 버린다.
 *    조사를 떼기 전의 낱말도 대조한다. '수행평가'는 불용어인데 끝의 '가'를 조사로 떼면 '수행평'이 되어
 *    불용어 검사를 빠져나가므로, 떼기 전에 먼저 걸러야 한다.
 * 6. 용언 어미(VERB_END)로 끝나는 한글 낱말과 '…하', '…되'로 끝나는 어간을 버린다(NOUN_OK 예외).
 * 7. 낱말 전체가 앞붙이 부사(LEAD_WORD의 '다시', '특히' …)이면 버린다. 앞붙이로만 떼면 홀로 선 '다시'가 남는다.
 */
export function tokens(text: string, extraStop?: Set<string>): string[] {
  const out: string[] = [];
  const words = (text ?? '').replace(PUNCT, ' ').split(/\s+/);
  for (const w of words) {
    if (!w) continue;
    let t = w.replace(LEAD_WORD, '');
    if (isStop(t, extraStop) || LEAD_ALONE.test(t)) continue;
    t = stripSuffix(t);
    if (t.length < 2 || t.length > 12) continue;
    if (/^[0-9]/.test(t)) continue;
    if (isStop(t, extraStop)) continue;
    if (/^[가-힣]+$/.test(t) && !NOUN_OK.has(t)) {
      if (VERB_END.test(t)) continue;
      if (/(?:하|되)$/.test(t)) continue;
    }
    out.push(t);
  }
  return out;
}

/* ───────────────────────── 요약 ───────────────────────── */

/**
 * 문장을 요약용 한 줄로 다듬는다.
 * - 앞머리의 '(1학기)' 표시, 여는 괄호·따옴표 찌꺼기, 접속어(또한, 특히, 이를 바탕으로 …)를 뗀다.
 * - 끝의 평가 꼬리('…하는 태도가 돋보임')를 뗀다. 뗀 결과가 6자 미만이면 원문으로 되돌린다.
 * - 끝의 쉼표·공백·마침표를 지운다.
 * - max(기본 90자)를 넘으면 낱말 경계(공백이나 쉼표)에서 잘라 '…'를 붙인다.
 */
export function summarize(s: string, max: number = 90): string {
  let t = (s ?? '').replace(/^\s*\(\d학기\)\s*/, '').trim();
  t = t.replace(/^[)\]\s,.·'’”]+/, '');
  t = t.replace(LEAD_ADVERBS, '');
  const noTail = t.replace(EVAL_TAIL, '').trim();
  if (noTail.length >= 6) t = noTail;
  t = t.replace(/[,\s]+$/, '').replace(/\s*[.。]$/, '');
  if (t.length > max) {
    const cut = t.slice(0, max);
    const i = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf(','));
    t = (i > max * 0.6 ? cut.slice(0, i) : cut).replace(/[,\s]+$/, '') + '…';
  }
  return t;
}

/* ───────────────────────── 주제 문구 ───────────────────────── */

/** 주제 문구가 이런 어미·조사로 끝나면 문장 조각이므로 주제로 쓰지 않는다. */
const BAD_END = /(?:함|음|임|됨|며|고|여|해|하는|하여|한|된|던|을|를|의|에|에서|으로|로|와|과|및|등|이며|하고|위해|통해)$/;

/** 이런 일반 명사로 끝나면 주제가 아니라 활동 설명이다('…한 내용', '…한 결과'). */
const BAD_TAIL_NOUN = /(?:내용|결과|과정|자료|방법|활동|틀|부분|점|것|모습|태도|역할|경우|사례들)$/;

/**
 * 주제 문구 후보에서 앞쪽의 군더더기를 뗀다.
 * 앞에 붙은 절('…을 읽고 ', '…을 바탕으로 ', 쉼표 앞)을 지우고, 접속어와 관형어('통한', '위한', '대한' …)를 뗀다.
 * 낱말이 7개를 넘으면 뒤의 7개만 남긴다(주제어는 보통 뒤에 온다).
 */
const CUT = /.*(?:[,，]|(?:에서는?|평가에서|하여|하고|하며|하면서|후|뒤|중|위해|통해|바탕으로|떠올려|읽고|배운|배우고|이해한|이해하고|공부하며|느껴|가져|갖고|품고|이어|참여해)\s)/;
const LEAD_TOPIC = /^(?:이를|이에|또한|특히|그리고|이후|이어|더불어|나아가|아울러|직접|스스로|평소|최근)\s*/;
const LEAD_MODIFIER = /^(?:통한|위한|대한|따른|관한|보아|내|및|등|의|에|와|과|을|를|으로|로|하여|해|후|뒤|중|[가-힣]{1,4}(?:하여|하고|하며))\s+/;

export function cleanTopic(p: string): string {
  if (!p) return '';
  let t = p.replace(/[{}]/g, '').trim().replace(CUT, '').trim();
  t = t.replace(/^[‘'“"]+|[’'”"]+$/g, '').trim();
  t = t.replace(LEAD_TOPIC, '');
  const w = t.split(/\s+/);
  if (w.length > 7) t = w.slice(-7).join(' ');
  for (let k = 0; k < 3; k++) t = t.replace(LEAD_MODIFIER, '');
  return t.trim();
}

/**
 * 주제 문구로 쓸 만한지.
 * 3~44자, 한글이나 영문 포함, 문장부호로 시작하지 않음, 괄호 짝 맞음, 9어절 이하,
 * 어미·조사로 끝나지 않음, 일반 명사(내용, 결과 …)로 끝나지 않음, 관형절이나 대명사로 시작하지 않음.
 */
export function validTopic(p: string): boolean {
  if (!p) return false;
  const t = p.trim();
  if (t.length < 3 || t.length > 44) return false;
  if (!/[가-힣A-Za-z]/.test(t)) return false;
  if (/^[)\]\/,.·\-~]/.test(t)) return false;
  if ((t.match(/\(/g) || []).length !== (t.match(/\)/g) || []).length) return false;
  if (t.split(/\s+/).length > 9) return false;
  if (BAD_END.test(t)) return false;
  if (BAD_TAIL_NOUN.test(t)) return false;
  if (/^[가-힣]*(?:하려는|하는|되는|하던)\s/.test(t)) return false;
  if (/^(?:팀원|친구|모둠원|조원)/.test(t)) return false;
  if (/^(?:수|것|점|등|및)\s/.test(t)) return false;
  if (/^(?:이|그|저|이를|이에|또한|특히|이후|나아가|더불어)\s/.test(t)) return false;
  return true;
}

/** '제목 (저자)' → '제목'. 끝에 붙은 괄호 하나를 뗀다. */
export function stripAuthor(q: string): string {
  return (q ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/* ───────────────────────── 조사 고르기 ───────────────────────── */

/** 숫자로 끝나는 낱말의 받침(한글 읽기 기준). 0 영(ㅇ) 1 일(ㄹ) 2 이 3 삼(ㅁ) 4 사 5 오 6 육(ㄱ) 7 칠(ㄹ) 8 팔(ㄹ) 9 구 */
const DIGIT_FINAL: Record<string, number> = { '0': 21, '1': 8, '2': 0, '3': 16, '4': 0, '5': 0, '6': 1, '7': 8, '8': 8, '9': 0 };

/**
 * 받침에 따라 조사를 고른다. a는 받침 있을 때, b는 받침 없을 때 쓰는 꼴.
 * jo('전압','을','를') → '을', jo('과학','으로','로') → '으로', jo('물','으로','로') → '로'(ㄹ받침은 '로').
 * 끝의 따옴표·괄호·공백은 무시하고, 숫자로 끝나면 숫자의 읽기를 따른다. 한글도 숫자도 아니면 b를 쓴다.
 */
export function jo(word: string, a: string, b: string): string {
  const w = (word ?? '').replace(/[\s’”"'」』)\]]+$/, '');
  if (!w) return b;
  const last = w[w.length - 1];
  let final: number;
  if (last in DIGIT_FINAL) {
    final = DIGIT_FINAL[last];
  } else {
    const c = last.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) return b;
    final = c % 28;
  }
  if (a === '으로') return final === 0 || final === 8 ? '로' : '으로';
  return final ? a : b;
}
