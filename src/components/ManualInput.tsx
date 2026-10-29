import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ManualEntry, Sem, StudentEntry, Year } from '../engine/types';
import { fromManual } from '../engine/parser/manual';
import { CC_AREAS as ALL_CC_AREAS } from '../engine/dict/subjects';
import { uid } from '../lib/utils';

/**
 * 세특·창체를 직접 붙여 넣어 분석하는 입력 폼.
 * 교사가 작성 중인 세특 초안을 바로 점검하는 용도로도 쓴다.
 */
interface Row extends ManualEntry { key: string }

const CC_AREAS = ALL_CC_AREAS.slice(0, 3); // 자율·자치, 동아리, 진로

function newRow(prev?: Row): Row {
  return { key: uid('row'), year: prev?.year ?? 1, sem: prev?.sem ?? 1, kind: prev?.kind ?? '세특', subject: '', text: '', ach: '', rank: null };
}

export function ManualInput({ onDone, onCancel }: { onDone: (entry: StudentEntry) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [hope1, setHope1] = useState('');
  const [hope2, setHope2] = useState('');
  const [hope3, setHope3] = useState('');
  const [rows, setRows] = useState<Row[]>([newRow()]);

  const valid = useMemo(() => rows.filter((r) => r.subject.trim() && r.text.trim().length >= 12), [rows]);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  const add = () => setRows((rs) => [...rs, newRow(rs[rs.length - 1])]);

  const submit = () => {
    if (!valid.length) return;
    const hopes = [hope1, hope2, hope3].map((t, i) => ({ year: (i + 1) as Year, text: t.trim() })).filter((h) => h.text);
    const data = fromManual({
      name: name.trim() || undefined,
      hopes,
      entries: valid.map(({ key: _k, ...e }) => ({ ...e, subject: e.subject.trim(), text: e.text.trim(), ach: e.ach?.trim() || undefined, rank: e.rank || null })),
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
        <Field label="진로 희망 1학년(선택)"><input className="inp" value={hope1} onChange={(e) => setHope1(e.target.value)} placeholder="예) 생명과학 연구원" /></Field>
        <Field label="진로 희망 2학년(선택)"><input className="inp" value={hope2} onChange={(e) => setHope2(e.target.value)} /></Field>
        <Field label="진로 희망 3학년(선택)"><input className="inp" value={hope3} onChange={(e) => setHope3(e.target.value)} /></Field>
      </div>

      <div className="space-y-4">
        {rows.map((r, i) => (
          <div key={r.key} className="rounded-md border border-hair p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-bold text-muted">{i + 1}</span>
              <select className="inp w-auto" value={r.year} onChange={(e) => update(r.key, { year: +e.target.value as Year })} aria-label="학년">
                {[1, 2, 3].map((y) => <option key={y} value={y}>{y}학년</option>)}
              </select>
              {r.kind === '세특' ? (
                <select className="inp w-auto" value={r.sem ?? 0} onChange={(e) => update(r.key, { sem: (+e.target.value || null) as Sem | null })} aria-label="학기">
                  <option value={1}>1학기</option>
                  <option value={2}>2학기</option>
                  <option value={0}>학년 전체</option>
                </select>
              ) : null}
              <select className="inp w-auto" value={r.kind} onChange={(e) => { const kind = e.target.value as '세특' | '창체'; update(r.key, { kind, subject: '', sem: kind === '창체' ? null : (r.sem ?? 1) }); }} aria-label="종류">
                <option value="세특">세특</option>
                <option value="창체">창체</option>
              </select>
              {r.kind === '세특' ? (
                <input className="inp w-[180px]" value={r.subject} onChange={(e) => update(r.key, { subject: e.target.value })} placeholder="과목명 (예: 통합과학1)" aria-label="과목명" />
              ) : (
                <select className="inp w-auto" value={r.subject} onChange={(e) => update(r.key, { subject: e.target.value })} aria-label="창체 영역">
                  <option value="">영역 선택</option>
                  {CC_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
              {r.kind === '세특' ? (
                <>
                  <input className="inp w-[76px]" value={r.ach || ''} onChange={(e) => update(r.key, { ach: e.target.value.toUpperCase() })} placeholder="성취도" aria-label="성취도" maxLength={1} />
                  <input className="inp w-[76px]" type="number" min={1} max={9} value={r.rank ?? ''} onChange={(e) => update(r.key, { rank: e.target.value ? +e.target.value : null })} placeholder="등급" aria-label="등급" />
                </>
              ) : null}
              <button type="button" className="btn ghost sm ml-auto" onClick={() => remove(r.key)} aria-label="이 항목 삭제" disabled={rows.length === 1}><Trash2 className="h-4 w-4" /></button>
            </div>
            <textarea
              className="inp min-h-[120px] w-full resize-y leading-[1.7]"
              value={r.text}
              onChange={(e) => update(r.key, { text: e.target.value })}
              placeholder="세특 또는 창체 특기사항 본문을 붙여 넣으세요. 여러 문장을 그대로 넣으면 됩니다."
              aria-label="본문"
            />
            <div className="mt-1 text-right text-[12px] text-muted">{r.text.trim().length}자</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn ghost sm" onClick={add}><Plus className="h-4 w-4" /> 항목 추가</button>
        <span className="text-[12.5px] text-muted">과목명과 12자 이상의 본문이 있는 항목만 분석합니다. ({valid.length}개 준비됨)</span>
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
