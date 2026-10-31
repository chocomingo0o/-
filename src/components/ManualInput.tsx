import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ManualEntry, Sem, StudentEntry, Year } from '../engine/types';
import { fromManual } from '../engine/parser/manual';
import { CC_AREAS as ALL_CC_AREAS } from '../engine/dict/subjects';
import { cn, uid } from '../lib/utils';

/**
 * 세특·창체를 직접 붙여 넣어 분석하는 입력 폼.
 * 교사가 작성 중인 세특 초안을 바로 점검하는 용도로도 쓴다.
 * 성취도는 A~E 또는 P만, 등급은 1~9 정수만 받는다(범위 밖이면 그 항목은 분석하지 않고 알려 준다).
 */
interface Row extends ManualEntry { key: string }

const CC_AREAS = ALL_CC_AREAS.slice(0, 3); // 자율·자치, 동아리, 진로
const ACH_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'P'];
const RANK_MIN = 1;
const RANK_MAX = 9;

function newRow(prev?: Row): Row {
  return { key: uid('row'), year: prev?.year ?? 1, sem: prev?.sem ?? 1, kind: prev?.kind ?? '세특', subject: '', text: '', ach: '', rank: null };
}

/** 등급이 비었거나 1~9 정수인가 */
export function rankOk(rank: number | null | undefined): boolean {
  return rank === null || rank === undefined || (Number.isInteger(rank) && rank >= RANK_MIN && rank <= RANK_MAX);
}

/** 항목 하나에 사용자가 적은 것이 있는가(닫기 전 확인용) */
function rowHasContent(r: Row): boolean {
  return !!(r.subject.trim() || r.text.trim() || (r.ach || '').trim() || r.rank !== null);
}

export function ManualInput({ onDone, onCancel, onDirty }: { onDone: (entry: StudentEntry) => void; onCancel: () => void; onDirty?: (dirty: boolean) => void }) {
  const [name, setName] = useState('');
  const [hope1, setHope1] = useState('');
  const [hope2, setHope2] = useState('');
  const [hope3, setHope3] = useState('');
  const [rows, setRows] = useState<Row[]>([newRow()]);

  const ready = useMemo(() => rows.filter((r) => r.subject.trim() && r.text.trim().length >= 12), [rows]);
  const valid = useMemo(() => ready.filter((r) => rankOk(r.rank)), [ready]);
  const badRank = rows.filter((r) => !rankOk(r.rank)).length;

  const hasContent = !!(name.trim() || hope1.trim() || hope2.trim() || hope3.trim() || rows.some(rowHasContent));
  useEffect(() => { onDirty?.(hasContent); }, [hasContent, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  const add = () => setRows((rs) => [...rs, newRow(rs[rs.length - 1])]);

  const submit = () => {
    if (!valid.length) return;
    const hopes = [hope1, hope2, hope3].map((t, i) => ({ year: (i + 1) as Year, text: t.trim() })).filter((h) => h.text);
    const data = fromManual({
      name: name.trim() || undefined,
      hopes,
      entries: valid.map(({ key: _k, ...e }) => ({ ...e, subject: e.subject.trim(), text: e.text.trim(), ach: e.ach?.trim() || undefined, rank: e.rank ?? null })),
    });
    data.meta.source = 'manual';
    onDone({ id: uid('manual'), file: '직접 입력', data, memo: '', recMemo: {} });
  };

  return (
    <div className="space-y-5 text-[13.5px]">
      <p className="text-ink-2">
        학생부 PDF가 없어도 세특이나 창체 본문을 붙여 넣어 탐구 방법과 깊이, 기록 사이의 연결을 볼 수 있습니다.
        작성 중인 세특 초안을 점검하는 데에도 쓸 수 있습니다. 입력한 내용은 브라우저 밖으로 나가지 않습니다.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="학생 이름(선택)"><input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 가상 학생" /></Field>
        <Field label="1학년 진로 희망(선택)"><input className="inp" value={hope1} onChange={(e) => setHope1(e.target.value)} placeholder="예) 생명과학 연구원" /></Field>
        <Field label="2학년 진로 희망(선택)"><input className="inp" value={hope2} onChange={(e) => setHope2(e.target.value)} /></Field>
        <Field label="3학년 진로 희망(선택)"><input className="inp" value={hope3} onChange={(e) => setHope3(e.target.value)} /></Field>
      </div>

      <div className="space-y-4">
        {rows.map((r, i) => {
          const n = i + 1;
          const rankBad = !rankOk(r.rank);
          return (
            <fieldset key={r.key} className="rounded-md border border-hair p-3">
              <legend className="sr-only">항목 {n}</legend>
              <div className="mb-2 flex flex-wrap items-end gap-2">
                <span className="num pb-1.5 text-[12px] font-bold text-muted" aria-hidden>{n}</span>
                <select className="inp w-auto" value={r.year} onChange={(e) => update(r.key, { year: +e.target.value as Year })} aria-label={`항목 ${n} 학년`}>
                  {[1, 2, 3].map((y) => <option key={y} value={y}>{y}학년</option>)}
                </select>
                {r.kind === '세특' ? (
                  <select className="inp w-auto" value={r.sem ?? 0} onChange={(e) => update(r.key, { sem: (+e.target.value || null) as Sem | null })} aria-label={`항목 ${n} 학기`}>
                    <option value={1}>1학기</option>
                    <option value={2}>2학기</option>
                    <option value={0}>학년 전체</option>
                  </select>
                ) : null}
                <select className="inp w-auto" value={r.kind} onChange={(e) => { const kind = e.target.value as '세특' | '창체'; update(r.key, { kind, subject: '', sem: kind === '창체' ? null : (r.sem ?? 1) }); }} aria-label={`항목 ${n} 종류`}>
                  <option value="세특">세특</option>
                  <option value="창체">창체</option>
                </select>
                {r.kind === '세특' ? (
                  <input className="inp w-[180px]" value={r.subject} onChange={(e) => update(r.key, { subject: e.target.value })} placeholder="과목명 (예: 통합과학1)" aria-label={`항목 ${n} 과목명`} />
                ) : (
                  <select className="inp w-auto" value={r.subject} onChange={(e) => update(r.key, { subject: e.target.value })} aria-label={`항목 ${n} 창체 영역`}>
                    <option value="">영역 선택</option>
                    {CC_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                )}
                {r.kind === '세특' ? (
                  <>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px] leading-none text-muted">성취도</span>
                      <select className="inp w-auto" value={r.ach || ''} onChange={(e) => update(r.key, { ach: e.target.value })} aria-label={`항목 ${n} 성취도`}>
                        <option value="">없음</option>
                        {ACH_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px] leading-none text-muted">등급</span>
                      <input
                        className={cn('inp w-[64px]', rankBad && 'border-ink')}
                        type="number"
                        inputMode="numeric"
                        min={RANK_MIN}
                        max={RANK_MAX}
                        step={1}
                        value={r.rank ?? ''}
                        onChange={(e) => update(r.key, { rank: e.target.value === '' ? null : Number(e.target.value) })}
                        placeholder="1~9"
                        aria-label={`항목 ${n} 등급`}
                        aria-invalid={rankBad || undefined}
                        aria-describedby={rankBad ? `rank-hint-${r.key}` : undefined}
                      />
                    </label>
                  </>
                ) : null}
                <button type="button" className="btn ghost sm ml-auto" onClick={() => remove(r.key)} aria-label={`항목 ${n} 삭제`} disabled={rows.length === 1}><Trash2 className="h-4 w-4" /></button>
              </div>
              {rankBad ? <p id={`rank-hint-${r.key}`} className="mb-2 text-[12.5px] font-semibold text-ink">등급은 1~9 사이 정수로 적어 주세요. 고치기 전까지 이 항목은 분석하지 않습니다.</p> : null}
              <textarea
                className="inp min-h-[120px] w-full resize-y leading-[1.7]"
                value={r.text}
                onChange={(e) => update(r.key, { text: e.target.value })}
                placeholder="세특 또는 창체 특기사항 본문을 붙여 넣으세요. 여러 문장을 그대로 넣으면 됩니다."
                aria-label={`항목 ${n} 본문`}
              />
              <div className="mt-1 text-right text-[12px] text-muted">{r.text.trim().length}자</div>
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn ghost sm" onClick={add}><Plus className="h-4 w-4" /> 항목 추가</button>
        <span className="text-[12.5px] text-muted">
          과목명과 12자 이상의 본문이 있는 항목만 분석합니다. 분석할 항목 <span className="num">{valid.length}</span>개
          {badRank ? <span className="text-ink">{` (등급이 잘못된 항목 ${badRank}개 제외)`}</span> : null}
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn ghost" onClick={onCancel}>닫기</button>
          <button type="button" className="btn" onClick={submit} disabled={!valid.length}>분석하기</button>
        </div>
      </div>
      <style>{`.inp{border:1px solid var(--hair-2);background:var(--surface);border-radius:6px;padding:6px 8px;font-size:13.5px;line-height:1.4;min-width:0}.inp:focus{outline:2px solid var(--black);outline-offset:1px}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-semibold text-ink-2">{label}</span>
      {children}
    </label>
  );
}
