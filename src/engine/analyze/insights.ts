/**
 * 상담 포인트(설계 명세 4.9).
 *
 * 분석 결과(기록, 연결, 관심 주제, 결손 분석)에서 교사가 상담 때 바로 짚어 줄 문장을 만든다.
 * 태그: 's' 강점, 'g' 점검, 'd' 방향, 'q' 학생에게 할 질문.
 *
 * 항목(만드는 순서)
 *  s  관통 주제: 관심 주제가 2개 이상 교과군에 걸쳐 이어짐(상위 3개 주제만 본다)
 *  s  가장 긴 계보: 뒤로 이어지는 연결이 없는 기록 가운데 앞으로 거슬러 올라가는 가장 긴 한 줄(같은 시기 연결은 빼고)이
 *     기록 3건 이상인 것. 조상 전체 수가 아니라 한 줄로 이어진 기록 수를 말한다
 *  g  깊이 정체: 한 관심 주제의 기록이 3개 이상인데 뒤 절반의 평균 깊이가 앞 절반보다 늘지 않음(최대 2개)
 *  g  방법 편중: gaps.ts의 methodBias(전체 6번 이상, 한 방법 30% 초과, 3단계 아님). 결손 분석과 같은 문장이므로 합칠 때 하나로 남는다
 *  d  아직 안 쓴 3단계 방법: 3단계 여섯 방법 가운데 안 쓴 것이 1~4개일 때(5개 이상이면 교과군 결손 제안이 이미 다룸)
 *  g  과학 기록에 실험·측정 없음: 과학 교과군 기록(약한 기록 제외) 2개 이상인데 실험·측정이 없음.
 *     결손 분석이 이미 과학 교과군의 실험·측정 결손을 제안했으면 겹치므로 내지 않는다
 *  d  후속 없는 깊은 탐구: 깊이 3 이상, 주제가 핵심어뿐이 아니고, 예체능이 아니고, 뒤로 이어지는 연결이 없는 기록(최대 2개).
 *     가장 최근 학기 기록은 아직 후속이 있을 수 없으므로 빼고, 3학년 기록도 뺀다.
 *     '최근'은 학기 단위(Math.floor(t))로 본다. 학기 없는 창체(t=학년×2−1.5)가 있어도 같은 학년의 마지막 학기 세특이 최근이다
 *  s  심화 연결 수(예 2개), g 반복 연결 수(예 2개), g 연결 4개 이상인데 심화가 없음
 *  s/d 진로 희망 분야와 맞닿은 기록 비율(40% 이상이면 강점, 아니면 방향). 희망 문구의 분야는 gaps.ts의 hopeFields로 판정
 *  s/q 진로 희망 변화: 분야가 같거나 문구가 비슷하면 유지(s), 아니면 바뀜(q)
 *  q  질문 2개: 가장 긴 줄기의 출발 기록과 끝 기록을 잇는 질문, 연결이 하나도 없는 깊은 탐구의 계기를 묻는 질문.
 *     둘이 안 모이면 깊이가 가장 큰 기록으로 질문을 채운다
 *  결손 분석의 제안(gaps.suggestions)은 그대로 'd'/'g'로 합친다.
 *
 * 정리: 같은 문장(공백 무시)은 하나만 남기고, s → g → d → q 순으로 묶되 묶음 안에서는 만든 순서를 지킨다.
 * 최대 14개. 묶음마다 기본 몫(s 4, g 4, d 4, q 2)을 먼저 채우고 남는 자리는 s, g, d, q 순으로 더 준다.
 *
 * 이 파일은 DOM에 의존하지 않는다.
 */
import type { GapReport, Insight, Link, MethodKey, Rec, StudentRecord, Theme } from '../types';
import { METHOD, METHODS } from '../dict/methods';
import { semLabel } from './records';
import { jo, nos } from './text';
import { hopeFields, methodBias, methodBiasText } from './gaps';

type Tag = Insight['tg'];

const MAX_INSIGHTS = 14;
const ORDER: Tag[] = ['s', 'g', 'd', 'q'];
const QUOTA: Record<Tag, number> = { s: 4, g: 4, d: 4, q: 2 };

/* ───────────────────────── 작은 도구 ───────────────────────── */

const pct = (x: number): number => Math.round(x * 100);
const f1 = (x: number): string => (Number.isFinite(x) ? x.toFixed(1) : '0.0');

/** 주제 이름. 책이면 『제목』 읽기, 주제가 비어 있으면 과목 이름으로 대신한다. */
function tname(r: Rec): string {
  const t = (r.topic ?? '').trim();
  if (!t) return `‘${r.subj}’`;
  return r.topicKind === 'b' ? `『${t}』 읽기` : `‘${t}’`;
}

/** 기록 묶음의 평균 깊이(없으면 0) */
function avgDepth(rs: Rec[]): number {
  if (!rs.length) return 0;
  return rs.reduce((a, r) => a + (r.depth || 1), 0) / rs.length;
}

/**
 * 이 기록에서 앞으로 거슬러 올라가는 가장 긴 한 줄(기록 id 목록, 뿌리부터 이 기록까지). 같은 시기 연결 '동시'는 줄기로 보지 않는다.
 * 갈라진 조상을 모두 세지 않고 한 줄의 길이만 재므로 '기록 N건이 한 줄로 이어짐'으로 말할 수 있다.
 * 연결은 앞 → 뒤(t가 같거나 커지는 방향)로만 만들어지므로 순환은 없지만, 혹시 있어도 멈추도록 방문 표시를 둔다.
 */
function longestChain(links: Link[], id: string): string[] {
  const memo = new Map<string, string[]>();
  const visiting = new Set<string>();
  const walk = (cur: string): string[] => {
    const hit = memo.get(cur);
    if (hit) return hit;
    if (visiting.has(cur)) return [cur];
    visiting.add(cur);
    let best: string[] = [];
    for (const l of links) {
      if (l.to !== cur || l.rel === '동시' || l.from === cur) continue;
      const p = walk(l.from);
      if (p.length > best.length) best = p;
    }
    visiting.delete(cur);
    const out = [...best, cur];
    memo.set(cur, out);
    return out;
  };
  return walk(id);
}

/** 기록의 시기와 이름. 창체는 학기가 없으므로 '(학년 전체)'를 붙이지 않고 '2학년 동아리활동(미생물탐구반)'으로 적는다. */
function placeOf(r: Rec): string {
  return r.sem ? `${semLabel(r)} ${r.subj}` : `${r.year}학년 ${r.subj}`;
}

/** 두 희망 문구가 비슷한지: 짧은 쪽의 두 글자 조각 가운데 하나라도 긴 쪽에 들어 있으면 비슷하다고 본다. */
function similarText(a: string, b: string): boolean {
  const x = nos(a);
  const y = nos(b);
  if (!x || !y) return false;
  const sh = x.length <= y.length ? x : y;
  const lo = sh === x ? y : x;
  if (sh.length < 2) return lo.includes(sh);
  for (let i = 0; i + 2 <= sh.length; i++) if (lo.includes(sh.slice(i, i + 2))) return true;
  return false;
}

/* ───────────────────────── 본체 ───────────────────────── */

export function buildInsights(recs: Rec[], links: Link[], themes: Theme[], gaps: GapReport, S: StudentRecord): Insight[] {
  const all = recs ?? [];
  const lk = links ?? [];
  const ths = themes ?? [];
  const out: Insight[] = [];
  const byId = new Map(all.map((r) => [r.id, r]));
  const real = all.filter((r) => !r.faint);
  // 가장 최근 학기(학기 단위). 학기 없는 창체(t=2.5)가 있어도 2학년 1학기(t=2) 세특은 최근 기록이다
  const latestSlot = all.length ? Math.floor(Math.max(...all.map((r) => r.t))) : 0;

  /* 관통 주제 */
  for (const th of ths.slice(0, 3)) {
    const rs = th.ids.map((i) => byId.get(i)).filter((r): r is Rec => !!r);
    const lanes = [...new Set(rs.map((r) => r.lane))];
    const ys = [...new Set(rs.map((r) => r.year))].sort((a, b) => a - b);
    if (lanes.length >= 2) {
      const laneList = `${lanes.slice(0, 5).join(', ')}${lanes.length > 5 ? ' 등' : ''}`;
      out.push({
        tg: 's',
        th: th.name,
        t: `‘${th.name}’ 주제가 ${ys.join('·')}학년에 걸쳐 ${laneList} ${lanes.length}개 교과군에서 이어집니다.`,
      });
    }
  }

  /* 가장 긴 계보: 뒤로 이어지지 않는 기록 가운데 거슬러 올라가는 한 줄이 가장 긴 것(기록 3건 이상) */
  let best: { r: Rec; chain: string[] } | null = null;
  for (const r of all) {
    if (lk.some((l) => l.from === r.id && l.rel !== '동시')) continue; // 뒤로 이어지는 기록이 있으면 끝이 아니다
    const chain = longestChain(lk, r.id);
    if (chain.length >= 3 && (!best || chain.length > best.chain.length)) best = { r, chain };
  }
  if (best) {
    out.push({
      tg: 's',
      go: best.r.id,
      t: `가장 긴 탐구 줄기는 기록 ${best.chain.length}건이 한 줄로 이어진 것으로, ${placeOf(best.r)}에서 끝납니다.`,
    });
  }

  /* 깊이 정체 */
  let stag = 0;
  for (const th of ths) {
    if (stag >= 2) break;
    const rs = th.ids
      .map((i) => byId.get(i))
      .filter((r): r is Rec => !!r && !r.faint)
      .sort((a, b) => a.t - b.t);
    if (rs.length < 3) continue;
    const half = Math.ceil(rs.length / 2);
    const fa = avgDepth(rs.slice(0, half));
    const la = avgDepth(rs.slice(half));
    if (la <= fa + 0.1) {
      stag++;
      out.push({
        tg: 'g',
        th: th.name,
        t: `‘${th.name}’ 주제는 반복되지만 뒤로 갈수록 탐구 깊이가 깊어지지 않습니다(${f1(fa)} → ${f1(la)}). 같은 질문을 다른 방법으로 다시 다뤄 보게 할 수 있습니다.`,
      });
    }
  }

  /* 방법 편중(결손 분석과 같은 문장) */
  const bias = methodBias(all);
  if (bias) out.push({ tg: 'g', t: methodBiasText(bias) });

  /* 아직 안 쓴 3단계 방법 */
  const usedAll = new Set<MethodKey>(all.flatMap((r) => r.methods));
  const lv3Missing = METHODS.filter((m) => m.lv === 3 && !usedAll.has(m.key));
  if (lv3Missing.length >= 1 && lv3Missing.length <= 4) {
    out.push({
      tg: 'd',
      t: `아직 쓰지 않은 3단계 방법: ${lv3Missing.map((m) => m.label).join(', ')}. 진로와 맞는 방법을 골라 다음 탐구에 넣어 볼 수 있습니다.`,
    });
  }

  /* 과학 기록에 실험·측정 없음(결손 분석이 이미 짚었으면 생략) */
  const sci = real.filter((r) => r.lane === '과학');
  const gapsHasSciExp = (gaps?.suggestions ?? []).some((s) => s.lane === '과학' && s.text.includes(METHOD.experiment.label));
  if (sci.length >= 2 && !sci.some((r) => r.methods.includes('experiment')) && !gapsHasSciExp) {
    out.push({
      tg: 'g',
      t: `과학 교과 기록 ${sci.length}건에 실험·측정이 드러나지 않습니다. 이론 정리에 그친 탐구가 있는지 확인해 보세요.`,
    });
  }

  /* 후속 없는 깊은 탐구 */
  const hasOut = (id: string): boolean => lk.some((l) => l.from === id && l.rel !== '동시');
  const tips = real
    .filter((r) => r.depth >= 3 && r.topicKind !== 'k' && r.lane !== '예체능' && r.year < 3 && Math.floor(r.t) < latestSlot && !hasOut(r.id))
    .sort((a, b) => b.depth - a.depth || a.t - b.t)
    .slice(0, 2);
  for (const r of tips) {
    out.push({
      tg: 'd',
      go: r.id,
      t: `${placeOf(r)}의 ${tname(r)} 탐구는 깊이 ${r.depth}단계인데 뒤이은 탐구가 없습니다. 후속 탐구로 발전시키기 좋은 출발점입니다.`,
    });
  }

  /* 연결 종류별 수 */
  const subjOf = (id: string): string => byId.get(id)?.subj ?? id;
  const deepL = lk.filter((l) => l.rel === '심화' && byId.has(l.from) && byId.has(l.to));
  const repL = lk.filter((l) => l.rel === '반복' && byId.has(l.from) && byId.has(l.to));
  if (deepL.length) {
    out.push({
      tg: 's',
      go: deepL[0].to,
      t: `더 깊은 방법으로 이어진 ‘심화’ 연결이 ${deepL.length}개 있습니다. 예: ${deepL.slice(0, 2).map((l) => `${subjOf(l.from)} → ${subjOf(l.to)}`).join(', ')}.`,
    });
  }
  if (repL.length) {
    const ex = repL
      .slice(0, 2)
      .map((l) => `${subjOf(l.from)} → ${subjOf(l.to)}${l.words?.[0] ? `(${l.words[0]})` : ''}`)
      .join(', ');
    out.push({
      tg: 'g',
      go: repL[0].to,
      t: `주제만 이어지고 방법과 깊이가 그대로인 ‘반복’ 연결이 ${repL.length}개 있습니다. 예: ${ex}. 다음 탐구에서 직접 근거를 만드는 방법을 더하도록 안내해 보세요.`,
    });
  }
  if (lk.length >= 4 && !deepL.length) {
    out.push({ tg: 'g', t: '연결은 있지만 깊이가 올라간 ‘심화’ 연결이 없습니다. 관심은 이어지는데 탐구 수준이 그대로인지 확인해 보세요.' });
  }

  /* 진로 희망 분야와 맞닿은 기록 비율 */
  const hopes = (S?.hopes ?? []).filter((h) => h && nos(h.text)).slice().sort((a, b) => a.year - b.year);
  const hf: string[] = [];
  for (const h of hopes) for (const k of hopeFields(h.text)) if (!hf.includes(k)) hf.push(k);
  if (hf.length && real.length) {
    const hit = real.filter((r) => (r.fields ?? []).some((f) => hf.includes(f.k))).length;
    const share = hit / real.length;
    out.push({
      tg: share >= 0.4 ? 's' : 'd',
      t:
        `진로 희망 분야(${hf.slice(0, 2).join(', ')})와 맞닿은 탐구 기록이 ${real.length}건 중 ${hit}건(${pct(share)}%)입니다.` +
        (share < 0.4 ? ' 진로와 연결된 탐구를 늘려 볼 여지가 있습니다.' : ''),
    });
  }

  /* 진로 희망 변화 */
  if (hopes.length >= 2) {
    const texts = hopes.map((h) => h.text.trim());
    const uniq = texts.filter((t, i) => i === 0 || nos(t) !== nos(texts[i - 1]));
    const last = uniq[uniq.length - 1];
    if (uniq.length === 1) {
      out.push({
        tg: 's',
        t: `진로 희망이 ${hopes[0].year}학년부터 ${hopes[hopes.length - 1].year}학년까지 ‘${last}’${jo(last, '으로', '로')} 한결같습니다. 학년이 오를수록 탐구 주제가 이 진로 안에서 좁고 깊어졌는지 계보도에서 확인하세요.`,
      });
    } else {
      const fsets = uniq.map((t) => new Set(hopeFields(t)));
      const fieldSame = fsets.every((f) => f.size > 0) && [...fsets[0]].some((k) => fsets.every((f) => f.has(k)));
      const textSame = uniq.every((t) => similarText(t, uniq[0]));
      const changed = !fieldSame && !textSame;
      const chain = `${uniq.join(' → ')}${jo(last, '으로', '로')}`;
      out.push(
        changed
          ? { tg: 'q', t: `진로 희망이 ${chain} 바뀌었습니다. 바뀐 계기가 탐구 기록에서 드러나는지 학생에게 직접 물어보세요.` }
          : { tg: 's', t: `진로 희망이 ${chain} 한 방향을 유지합니다. 학년이 오를수록 탐구 주제가 이 진로 안에서 좁고 깊어졌는지 계보도에서 확인하세요.` },
      );
    }
  }

  /* 학생에게 할 질문 */
  const questions: Insight[] = [];
  const usedQ = new Set<string>();
  if (best) {
    // 줄기의 출발점: 가장 긴 한 줄의 뿌리부터 차례로, 주제가 핵심어뿐이 아닌 첫 기록
    const start = best.chain
      .slice(0, -1)
      .map((i) => byId.get(i))
      .find((r): r is Rec => !!r && r.topicKind !== 'k');
    if (start) {
      usedQ.add(start.id);
      questions.push({
        tg: 'q',
        go: start.id,
        t: `“${start.year}학년 ${start.subj}에서 한 ${tname(start)} 탐구가 ${best.r.year}학년 ${best.r.subj} 탐구로 어떻게 이어졌는지 설명해 볼래?”`,
      });
    }
  }
  // 연결이 하나도 없는 깊은 탐구. 깊이가 큰 것, 같으면 앞선 것부터
  const iso = real
    .filter((r) => r.depth >= 3 && r.topicKind !== 'k' && r.lane !== '예체능' && !lk.some((l) => l.from === r.id || l.to === r.id) && !usedQ.has(r.id))
    .sort((a, b) => b.depth - a.depth || a.t - b.t);
  if (iso.length) {
    usedQ.add(iso[0].id);
    questions.push({
      tg: 'q',
      go: iso[0].id,
      t: `“${iso[0].subj}에서 ${tname(iso[0])} 탐구를 하게 된 계기는 뭐였어? 다른 과목 탐구와 연결되는 점이 있었니?”`,
    });
  }
  // 질문이 둘이 안 되면 깊이가 가장 큰 기록(최근 것 먼저)으로 채운다
  if (questions.length < 2) {
    const pool = real
      .filter((r) => r.topicKind !== 'k' && r.lane !== '예체능' && !usedQ.has(r.id))
      .sort((a, b) => b.depth - a.depth || b.t - a.t);
    const templates = [
      (r: Rec) => `“${r.subj}에서 한 ${tname(r)} 탐구에서 가장 어려웠던 점은 뭐였고, 다시 한다면 무엇을 바꿔 볼래?”`,
      (r: Rec) => `“${tname(r)} 탐구를 하고 나서 새로 생긴 궁금한 점이 있었니? 그걸 어떤 방법으로 알아볼 수 있을까?”`,
    ];
    for (const r of pool) {
      if (questions.length >= 2) break;
      usedQ.add(r.id);
      questions.push({ tg: 'q', go: r.id, t: templates[questions.length % templates.length](r) });
    }
  }
  out.push(...questions);

  /* 결손 분석 제안 합치기 */
  for (const s of gaps?.suggestions ?? []) out.push({ tg: s.tg, t: s.text });

  return arrange(out);
}

/* ───────────────────────── 정리 ───────────────────────── */

/** 같은 문장은 하나만, s → g → d → q 순으로, 묶음 안에서는 만든 순서. 최대 MAX_INSIGHTS개. */
function arrange(items: Insight[]): Insight[] {
  const seen = new Set<string>();
  const groups: Record<Tag, Insight[]> = { s: [], g: [], d: [], q: [] };
  for (const it of items) {
    const k = nos(it.t ?? '');
    if (!k || seen.has(k)) continue;
    seen.add(k);
    (groups[it.tg] ?? groups.g).push(it);
  }
  const take: Record<Tag, number> = { s: 0, g: 0, d: 0, q: 0 };
  let used = 0;
  for (const tg of ORDER) {
    take[tg] = Math.min(groups[tg].length, QUOTA[tg]);
    used += take[tg];
  }
  for (const tg of ORDER) {
    while (used < MAX_INSIGHTS && take[tg] < groups[tg].length) {
      take[tg]++;
      used++;
    }
  }
  return ORDER.flatMap((tg) => groups[tg].slice(0, take[tg]));
}
