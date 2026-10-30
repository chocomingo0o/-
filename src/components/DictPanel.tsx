import React, { useMemo, useRef, useState } from 'react';
import { Download, Link2, Plus, Trash2, Upload, X } from 'lucide-react';
import type { Analysis, MethodKey, Rec, Sent, StudentEntry, UserDict } from '../engine/types';
import { semLabel, summarize } from '../engine/analyze';
import { jo } from '../engine/analyze/text';
import { LEVEL_LABEL, METHOD, METHODS } from '../engine/dict/methods';
import { useApp } from '../state/store';
import { dropAnalysisCache } from '../hooks/useAnalysis';
import { download, mergeUserDict, parseJsonFile } from '../lib/storage';
import { Empty, MethodChip, SectionTitle } from './common';
import { cn } from '../lib/utils';

/**
 * 표현 사전(옆 창).
 *  1) 찾은 비율: 15자 이상 문장(평가 문장 제외) 가운데 탐구 방법이 하나라도 잡힌 비율.
 *  2) 선생님이 추가한 표현: 방법별 표현 칩과 삭제.
 *  3) 직접 추가: 표현 + 방법.
 *  4) 내보내기 / 가져오기 / 모두 지우기.
 *  5) 방법을 찾지 못한 활동 문장(최대 60개): 추천 표현을 다듬어 방법에 연결.
 * 사전이 바뀌면 dropAnalysisCache()를 부르고 setUserDict로 새 객체를 넣어 모든 학생을 다시 분석하게 한다.
 * 사전에는 낱말만 저장되고(localStorage) 학생 정보는 저장되지 않는다.
 */
export function DictPanel({ an, student }: { an: Analysis; student: StudentEntry }) {
  const { state, dispatch } = useApp();
  const dict = state.userDict;
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = (text: string) => dispatch({ type: 'toast', text });

  const commit = (next: UserDict) => {
    dropAnalysisCache();
    dispatch({ type: 'setUserDict', dict: next });
  };

  /** 표현 하나를 방법에 넣는다. 성공하면 true. */
  const addTerm = (key: MethodKey, raw: string): boolean => {
    const term = raw.replace(/\s+/g, ' ').trim();
    const label = METHOD[key].label;
    if (term.length < 2) { toast('표현은 2자 이상 적어 주세요.'); return false; }
    if (term.length > 40) { toast('표현이 너무 깁니다. 40자 안으로 줄여 주세요.'); return false; }
    const cur = dict[key] || [];
    if (cur.includes(term)) { toast(`‘${term}’${jo(term, '은', '는')} 이미 ${label}에 들어 있습니다.`); return false; }
    const next: UserDict = { ...dict, [key]: [...cur, term] };
    commit(next);
    toast(`‘${term}’${jo(term, '을', '를')} ${label}에 연결했습니다. 기록을 다시 분석합니다.`);
    return true;
  };

  const removeTerm = (key: MethodKey, term: string) => {
    const cur = (dict[key] || []).filter((t) => t !== term);
    const next: UserDict = { ...dict };
    if (cur.length) next[key] = cur;
    else delete next[key];
    commit(next);
    toast(`‘${term}’${jo(term, '을', '를')} 사전에서 지웠습니다.`);
  };

  const total = countTerms(dict);

  const exportDict = () => {
    if (!total) { toast('내보낼 표현이 없습니다.'); return; }
    download('탐구분석지도_표현사전.json', JSON.stringify({ app: 'tamgu-map-dict', ver: 1, dict }, null, 2));
    toast(`표현 ${total}개를 파일로 내보냈습니다.`);
  };

  const importDict = async (f: File) => {
    const parsed = parseJsonFile(await f.text());
    const add = parsed.kind === 'dict' ? parsed.dict : parsed.kind === 'work' ? parsed.file.userDict : null;
    if (!add) { toast(parsed.kind === 'error' ? parsed.message : '표현 사전이 담긴 파일이 아닙니다.'); return; }
    const next = mergeUserDict(dict, add);
    const added = countTerms(next) - total;
    if (!added) { toast('새로 추가된 표현이 없습니다. 이미 모두 들어 있습니다.'); return; }
    commit(next);
    toast(`표현 ${added}개를 가져왔습니다. 기록을 다시 분석합니다.`);
  };

  const clearAll = () => {
    if (!total) return;
    if (confirm(`추가한 표현 ${total}개를 모두 지울까요?\n이 브라우저에 저장된 사전이 비워지며 되돌릴 수 없습니다. 먼저 내보내기로 보관해 두는 것을 권합니다.`)) {
      commit({});
      toast('추가한 표현을 모두 지웠습니다.');
    }
  };

  /* 1) 찾은 비율 */
  const ratio = useMemo(() => {
    let n = 0; let hit = 0;
    for (const r of an.recs) for (const s of r.sents) {
      if (!isActivity(s.s)) continue;
      n++;
      if (s.ms.length) hit++;
    }
    return { n, hit, pct: n ? Math.round((hit / n) * 100) : 0 };
  }, [an.recs]);

  /* 5) 방법을 찾지 못한 활동 문장 */
  const unmatched = useMemo(() => {
    const out: { r: Rec; si: number; s: Sent }[] = [];
    const recs = an.recs.slice().sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
    for (const r of recs) r.sents.forEach((s, si) => { if (!s.ms.length && isActivity(s.s)) out.push({ r, si, s }); });
    return out;
  }, [an.recs]);
  const shown = unmatched.slice(0, 60);

  return (
    <div className="space-y-7 text-[15px] text-ink">
      <p className="rounded-md border border-hair bg-plane px-3 py-2 text-[13px] text-ink-2">
        사전에는 낱말만 저장되고 학생 정보는 저장되지 않습니다. 이 브라우저에 보관되며, 불러온 모든 학생의 분석에 바로 적용됩니다.
      </p>

      {/* 1) 찾은 비율 */}
      <section>
        <SectionTitle sub="15자 이상인 활동 문장 가운데 탐구 방법이 하나라도 잡힌 비율입니다. 평가만 적힌 문장(‘…태도가 돋보임’ 등)은 빼고 셉니다.">
          이 학생부에서 방법을 찾은 비율
        </SectionTitle>
        {ratio.n ? (
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="num text-[28px] font-bold leading-none">{ratio.pct}<span className="ml-0.5 text-[15px] font-normal text-muted">%</span></span>
              <span className="num text-[13px] text-ink-2">{ratio.n}문장 가운데 {ratio.hit}문장</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-hair" role="img" aria-label={`방법을 찾은 문장 ${ratio.pct}%`}>
              <div className="h-full bg-ink" style={{ width: `${ratio.pct}%` }} />
            </div>
            <p className="mt-1.5 text-[13px] text-muted">
              {ratio.pct >= 70 ? '대부분의 활동 문장에서 방법을 찾았습니다.' : '방법을 찾지 못한 문장은 아래 목록에서 표현을 연결해 비율을 높일 수 있습니다.'}
            </p>
          </div>
        ) : (
          <Empty>{student.file}에는 셀 만한 활동 문장이 없습니다.</Empty>
        )}
      </section>

      {/* 2) 추가한 표현 */}
      <section>
        <SectionTitle sub="기본 사전에 없는 학교의 표현을 방법에 연결해 둔 것입니다. 지우면 다시 분석됩니다.">
          선생님이 추가한 표현 <span className="num ml-1 text-[13px] font-normal text-muted">{total}개</span>
        </SectionTitle>
        {total ? (
          <ul className="space-y-2.5">
            {METHODS.filter((m) => (dict[m.key] || []).length).map((m) => (
              <li key={m.key} className="flex flex-wrap items-start gap-x-2 gap-y-1">
                <MethodChip label={m.label} on={m.lv >= 3} className="mt-[1px]" />
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {(dict[m.key] || []).map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded border border-hair-2 bg-surface pl-2 text-[13px] leading-[1.6]">
                      <mark className="m">{t}</mark>
                      <button type="button" onClick={() => removeTerm(m.key, t)} className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-plane hover:text-ink" aria-label={`‘${t}’ 지우기`}>
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>아직 추가한 표현이 없습니다. 아래에서 직접 추가하거나, 방법을 찾지 못한 문장에서 표현을 골라 연결해 보세요.</Empty>
        )}
      </section>

      {/* 3) 직접 추가 */}
      <section>
        <SectionTitle sub="띄어쓰기 차이는 무시하고 찾습니다(‘설문 조사’는 ‘설문조사’도 찾음). 너무 짧거나 흔한 낱말은 다른 문장까지 잡으니 피해 주세요.">직접 추가</SectionTitle>
        <AddForm onAdd={addTerm} />
      </section>

      {/* 4) 파일 */}
      <section>
        <SectionTitle sub="동료 교사와 사전 파일(.json)을 주고받을 수 있습니다. 가져오면 지금 사전에 합쳐집니다(중복 제외). 작업 파일에 담긴 사전도 가져올 수 있습니다.">사전 파일</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn ghost sm" onClick={exportDict} disabled={!total}><Download className="h-3.5 w-3.5" aria-hidden /> 내보내기</button>
          <button type="button" className="btn ghost sm" onClick={() => fileInput.current?.click()}><Upload className="h-3.5 w-3.5" aria-hidden /> 가져오기</button>
          <button type="button" className="btn ghost sm" onClick={clearAll} disabled={!total}><Trash2 className="h-3.5 w-3.5" aria-hidden /> 모두 지우기</button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importDict(f); }}
          />
        </div>
      </section>

      {/* 5) 못 찾은 문장 */}
      <section>
        <SectionTitle sub="문장 끝의 ‘…을 ~함’에서 표현을 미리 뽑아 두었습니다. 표현을 다듬고 방법을 골라 ‘연결’을 누르면 사전에 들어가고 바로 다시 분석됩니다.">
          방법을 찾지 못한 활동 문장 <span className="num ml-1 text-[13px] font-normal text-muted">{unmatched.length}개{unmatched.length > 60 ? ' 중 60개' : ''}</span>
        </SectionTitle>
        {shown.length ? (
          <ul className="space-y-2.5">
            {shown.map(({ r, si, s }) => <UnmatchedRow key={`${r.id}:${si}`} r={r} s={s} onLink={addTerm} />)}
          </ul>
        ) : (
          <Empty>{ratio.n ? '모든 활동 문장에서 방법을 찾았습니다.' : '활동 문장이 없어 보여 줄 것이 없습니다.'}</Empty>
        )}
        {unmatched.length > 60 ? <p className="mt-2 text-[12.5px] text-muted">앞의 60개만 보여 줍니다. 연결하면 목록이 줄어듭니다.</p> : null}
      </section>
    </div>
  );
}

/* ───────────────────────── 부분 ───────────────────────── */

function AddForm({ onAdd }: { onAdd: (key: MethodKey, term: string) => boolean }) {
  const [term, setTerm] = useState('');
  const [m, setM] = useState<MethodKey | ''>('');
  const ok = term.trim().length >= 2 && !!m;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok || !m) return;
    if (onAdd(m, term)) setTerm('');
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap gap-1.5">
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="표현 (예: 데이터를 시각화)"
        aria-label="추가할 표현"
        className="min-w-[160px] flex-1 rounded-md border border-hair-2 bg-surface px-2.5 py-1.5 text-[14px] placeholder:text-muted"
      />
      <MethodSelect value={m} onChange={setM} />
      <button type="submit" className="btn sm" disabled={!ok}><Plus className="h-3.5 w-3.5" aria-hidden /> 추가</button>
    </form>
  );
}

function UnmatchedRow({ r, s, onLink }: { r: Rec; s: Sent; onLink: (key: MethodKey, term: string) => boolean }) {
  const [term, setTerm] = useState(() => suggestTerm(s.s));
  const [m, setM] = useState<MethodKey | ''>('');
  const ok = term.trim().length >= 2 && !!m;
  return (
    <li className="rounded-md border border-hair bg-surface p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-muted">
        <b className="text-[13px] font-semibold text-ink">{r.subj}</b>
        <span>{r.kind} · {semLabel(r)}</span>
      </div>
      <p className="mt-1 text-[14px] leading-snug text-ink-2">{summarize(s.s, 160)}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="문장에서 쓸 표현"
          aria-label={`${r.subj} 문장에서 쓸 표현`}
          className={cn('min-w-[140px] flex-1 rounded-md border bg-surface px-2.5 py-1.5 text-[14px] placeholder:text-muted', term.trim().length >= 2 ? 'border-hair-2' : 'border-dashed border-hair-2')}
        />
        <MethodSelect value={m} onChange={setM} />
        <button type="button" className="btn sm" disabled={!ok} onClick={() => { if (m) onLink(m, term); }} aria-label="이 표현을 고른 방법에 연결">
          <Link2 className="h-3.5 w-3.5" aria-hidden /> 연결
        </button>
      </div>
    </li>
  );
}

function MethodSelect({ value, onChange }: { value: MethodKey | ''; onChange: (k: MethodKey | '') => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as MethodKey | '')}
      aria-label="탐구 방법"
      className={cn('rounded-md border border-hair-2 bg-surface px-2 py-1.5 text-[14px]', value ? 'text-ink' : 'text-muted')}
    >
      <option value="">방법 고르기</option>
      {([3, 2, 1] as const).map((lv) => (
        <optgroup key={lv} label={`${lv}단계 · ${LEVEL_LABEL[lv]}`}>
          {METHODS.filter((d) => d.lv === lv).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/* ───────────────────────── 규칙 ───────────────────────── */

/** 평가만 적힌 문장의 끝 표현. 이런 문장은 방법을 찾을 대상이 아니므로 비율과 목록에서 뺀다. */
const EVAL_END = /(?:돋보임|인상적|보임|보여줌|학생임|참여함|기여함|노력함|기대됨|우수함|탁월함|이수함|성실|태도|발휘함|모습)(?:임|함)?[\s.!?。’”'")\]]*$/;

/** 방법을 찾을 대상이 되는 활동 문장인지: 15자 이상이고 평가 문장이 아님. */
function isActivity(s: string): boolean {
  const t = (s ?? '').trim();
  return t.length >= 15 && !EVAL_END.test(t);
}

/** 문장 끝의 서술 어미. 이 앞부분이 ‘무엇을 어떻게 했는지’를 담은 명사구다. */
const END_RE = /(?:함|하였음|했음|하였다|했다|하였고|하고|하며|하면서|해\s*봄|해\s*냄)$/;
const OBJ_RE = /[을를]$/;

/**
 * 문장 끝 ‘…을 ~함’ 꼴에서 사전에 넣을 만한 2~12자 명사구를 뽑는다. 못 찾으면 빈 문자열.
 *  - 어미(함, 하였음 …)를 떼고 뒤에서부터 어절을 붙여 가며 12자 안에서 가장 긴 후보를 고른다.
 *    목적어(을/를)가 들어오면 거기서 멈춘다. 예) ‘…실습 평가를 통과함’ → ‘평가를 통과’, ‘…산소임을 확인함’ → ‘산소임을 확인’
 *  - ‘…을 함’, ‘…을 하였음’처럼 동사가 ‘하다’뿐이면 목적어 명사만 돌려준다. 예) ‘토론을 함’ → ‘토론’
 *  - 한 어절뿐이고 2자(‘확인’, ‘제시’)면 너무 흔해 다른 문장까지 잡으므로 추천하지 않는다.
 */
function suggestTerm(sentence: string): string {
  const t = (sentence ?? '').replace(/[\s.!?。’”'")\]]+$/, '');
  if (!END_RE.test(t)) return '';
  const words = t.replace(END_RE, '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const last = words[words.length - 1];
  if (OBJ_RE.test(last)) {
    const noun = clean(last.replace(OBJ_RE, ''));
    return noun.length >= 2 && noun.length <= 12 ? noun : '';
  }
  let best = '';
  for (let n = 1; n <= 4 && n <= words.length; n++) {
    const cand = clean(words.slice(-n).join(' '));
    if (cand.length > 12) break;
    if (cand.length >= 2 && /[가-힣A-Za-z]/.test(cand)) best = cand;
    if (OBJ_RE.test(words[words.length - n])) break;
  }
  if (best && !best.includes(' ') && best.length <= 2) return '';
  return best;
}

function clean(w: string): string {
  return w.replace(/\s+/g, ' ').replace(/^[‘’'"“”(\[]+|[’”'")\],]+$/g, '').trim();
}

function countTerms(d: UserDict): number {
  return Object.values(d).reduce((a, arr) => a + (arr?.length || 0), 0);
}
