import React from 'react';
import { Check, NotebookPen } from 'lucide-react';
import type { Analysis, LaneKey, MethodKey, SlotStat, StudentEntry } from '../../engine/types';
import { semLabel } from '../../engine/analyze';
import { METHOD, METHODS } from '../../engine/dict/methods';
import { LANE } from '../../engine/dict/subjects';
import { useApp } from '../../state/store';
import { Empty, MethodChip, SectionTitle } from '../common';
import { cn } from '../../lib/utils';

/**
 * 결손 지도.
 *  1) 학기 카드: 기록 수, 쓴 방법 수, 3단계 방법이 든 기록 비율, 평균 깊이, 아직 안 쓴 3단계 방법. '기록 보기'로 옆 창 열기.
 *  2) 교과군별 기대 방법: 기대 방법 가운데 쓴 것은 실선 칩, 아직 안 쓴 것은 점선 칩. 교과군 이름을 누르면 그 교과군 기록 목록.
 *  3) 제안 문장: '방향'(d) 또는 '점검'(g) 표. '메모에 넣기'로 상담 메모 끝에 덧붙인다.
 * 숫자는 분석 결과(an.gaps)를 그대로 보여 주고 과장하지 않는다. 표는 모두 table 요소.
 */
export function GapPanel({ an, student }: { an: Analysis; student: StudentEntry }) {
  const { state, dispatch } = useApp();
  const g = an.gaps;
  const lv3All = METHODS.filter((m) => m.lv === 3).length;
  const trend = g.trend.filter((t) => !/과학 탐구 과정 기능 표는 전체 기록으로/.test(t) && !/분석할 기록이 없습니다/.test(t));

  const openSlot = (s: SlotStat) => {
    const c = String(s.slot);
    const same = state.mSel && state.mSel.t === 'sem' && state.mSel.m === '*' && state.mSel.c === c;
    dispatch({ type: 'setMethodSel', sel: same ? null : { t: 'sem', m: '*', c } });
  };
  const openLane = (lane: LaneKey) => {
    const same = state.mSel && state.mSel.t === 'lane' && state.mSel.m === '*' && state.mSel.c === lane;
    dispatch({ type: 'setMethodSel', sel: same ? null : { t: 'lane', m: '*', c: lane } });
  };
  const addMemo = (text: string) => {
    const memo = student.memo || '';
    if (memo.includes(text)) {
      dispatch({ type: 'toast', text: '이미 상담 메모에 있는 문장입니다.' });
      return;
    }
    const base = memo.trimEnd();
    dispatch({ type: 'setMemo', text: base ? `${base}\n- ${text}` : `- ${text}` });
    dispatch({ type: 'toast', text: '상담 메모에 넣었습니다. 상담 노트에서 확인할 수 있습니다.' });
  };

  if (!g.slots.length) return <Empty>탐구가 드러난 기록이 없어 결손 지도를 그릴 수 없습니다.</Empty>;

  return (
    <div className="space-y-6">
      {/* 1) 학기 카드 */}
      <section>
        <SectionTitle sub="학기마다 기록 수와 방법 수, 3단계 방법(직접 자료를 만들거나 분석하는 방법)이 든 기록 비율, 평균 깊이를 보여 줍니다. 학기 구분이 없는 창체 기록은 그 학년의 두 학기에 모두 들어갑니다.">학기별 흐름</SectionTitle>
        <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {g.slots.map((s) => {
            const used = Object.keys(s.methodCounts).length;
            const on = state.mSel?.t === 'sem' && state.mSel.m === '*' && state.mSel.c === String(s.slot);
            const n = s.recIds.length;
            return (
              <li key={s.slot} className={cn('rounded-md border bg-surface p-3', on ? 'border-ink' : 'border-hair')}>
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-[15px] font-bold">{semLabel(s)}</h4>
                  <button type="button" className="btn ghost sm" onClick={() => openSlot(s)} aria-pressed={on} aria-label={`${semLabel(s)} 기록 보기`}>기록 보기</button>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
                  <div><dt className="text-muted">기록</dt><dd className="num text-[18px] font-bold leading-tight">{n}<span className="ml-0.5 text-[12px] font-normal text-muted">건</span></dd></div>
                  <div><dt className="text-muted">쓴 방법</dt><dd className="num text-[18px] font-bold leading-tight">{used}<span className="ml-0.5 text-[12px] font-normal text-muted">가지</span></dd></div>
                  <div title="3단계 방법이 하나라도 든 기록의 비율"><dt className="text-muted">3단계 방법 비율</dt><dd className="num text-[18px] font-bold leading-tight">{Math.round(s.lv3Share * 100)}<span className="ml-0.5 text-[12px] font-normal text-muted">%</span></dd></div>
                  <div><dt className="text-muted">평균 깊이</dt><dd className="num text-[18px] font-bold leading-tight">{s.avgDepth.toFixed(1)}<span className="ml-0.5 text-[12px] font-normal text-muted">/ 4</span></dd></div>
                </dl>
                <div className="mt-2 border-t border-hair pt-2 text-[12.5px] text-ink-2">
                  {s.missingLv3.length ? (
                    <>
                      <div className="mb-1 text-muted">아직 안 쓴 3단계 방법 {s.missingLv3.length}가지</div>
                      <div className="flex flex-wrap gap-1">{s.missingLv3.map((k) => <GapChip key={k} label={METHOD[k].label} />)}</div>
                    </>
                  ) : (
                    <div className="inline-flex items-center gap-1 text-ink-2"><Check className="h-3.5 w-3.5" aria-hidden /> 3단계 방법 {lv3All}가지를 모두 썼습니다</div>
                  )}
                  {n < 2 ? <div className="mt-1 text-muted">기록이 1건이라 비율은 참고만 하세요.</div> : null}
                </div>
              </li>
            );
          })}
        </ul>
        {trend.length ? (
          <ul className="mt-3 list-disc space-y-0.5 pl-5 text-[13px] text-ink-2">
            {trend.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        ) : null}
      </section>

      {/* 2) 교과군별 기대 방법 */}
      <section>
        <SectionTitle sub="교과 특성상 나올 법한 방법을 기대 방법으로 두고, 기록에서 한 번도 드러나지 않은 것을 점선으로 표시합니다. 창체 줄(진로, 동아리, 자율·자치)은 진로 희망 분야와 맞는 방법만 제안에 넣습니다.">교과군별 기대 방법</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <caption className="sr-only">교과군별 기대 방법 사용 여부</caption>
            <thead>
              <tr className="text-left text-ink-2">
                <th scope="col" className="border-b border-hair px-2 py-1.5 font-semibold">교과군</th>
                <th scope="col" className="border-b border-hair px-2 py-1.5 text-right font-semibold">기록</th>
                <th scope="col" className="border-b border-hair px-2 py-1.5 text-right font-semibold">쓴 방법</th>
                <th scope="col" className="border-b border-hair px-2 py-1.5 font-semibold">기대 방법 <span className="font-normal text-muted">(점선은 아직 없음)</span></th>
              </tr>
            </thead>
            <tbody>
              {g.lanes.map((l) => {
                const on = state.mSel?.t === 'lane' && state.mSel.m === '*' && state.mSel.c === l.lane;
                const missing = new Set<MethodKey>(l.missing);
                return (
                  <tr key={l.lane} className="align-top">
                    <th scope="row" className="whitespace-nowrap border-b border-hair p-0 text-left font-semibold">
                      <button
                        type="button"
                        className={cn('block w-full px-2 py-1.5 text-left hover:bg-plane', on && 'underline underline-offset-4')}
                        onClick={() => openLane(l.lane)}
                        aria-pressed={on}
                        aria-label={`${LANE[l.lane]?.label ?? l.lane} 기록 보기`}
                      >
                        {LANE[l.lane]?.label ?? l.lane}
                      </button>
                    </th>
                    <td className="num border-b border-hair px-2 py-1.5 text-right">{l.recCount}건</td>
                    <td className="num border-b border-hair px-2 py-1.5 text-right">{l.used.length}가지</td>
                    <td className="border-b border-hair px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {l.expected.map((k) => (missing.has(k) ? <GapChip key={k} label={METHOD[k].label} /> : <MethodChip key={k} label={METHOD[k].label} />))}
                        {!l.expected.length ? <span className="text-muted">기대 방법 없음</span> : null}
                        {l.missing.length > 0 && l.recCount < 2 ? <span className="ml-1 text-[12px] text-muted">기록 1건이라 결손으로 보지 않음</span> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3) 제안 */}
      <section>
        <SectionTitle sub="교사가 학생에게 그대로 말해도 되는 문장입니다. '메모에 넣기'를 누르면 상담 메모 끝에 덧붙입니다.">제안</SectionTitle>
        {g.suggestions.length ? (
          <ul className="space-y-2">
            {g.suggestions.map((s, i) => {
              const inMemo = (student.memo || '').includes(s.text);
              return (
                <li key={i} className="flex flex-col gap-2 rounded-md border border-hair bg-surface p-3 sm:flex-row sm:items-start">
                  <TagChip tg={s.tg} />
                  <p className="min-w-0 flex-1 text-[15px] leading-relaxed">{s.text}</p>
                  <button type="button" className="btn ghost sm shrink-0 self-start" onClick={() => addMemo(s.text)} disabled={inMemo} aria-label={inMemo ? '이미 메모에 넣은 문장' : '이 문장을 상담 메모에 넣기'}>
                    <NotebookPen className="h-3.5 w-3.5" aria-hidden /> {inMemo ? '메모에 있음' : '메모에 넣기'}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>기대 방법과 3단계 방법이 고루 드러나 따로 제안할 결손이 없습니다. 위의 표에서 방법 분포를 직접 살펴보세요.</Empty>
        )}
      </section>
    </div>
  );
}

/** 아직 안 쓴 방법 칩(점선) */
export function GapChip({ label, className }: { label: string; className?: string }) {
  return <em className={cn('inline-block rounded-full border border-dashed border-hair-2 px-2 py-[1px] text-[12px] not-italic font-medium leading-[1.5] text-muted', className)} title="아직 드러나지 않은 방법">{label}</em>;
}

/** 제안 표: 방향(연보라) / 점검(노랑). 색과 이름을 항상 함께 둔다. */
export function TagChip({ tg }: { tg: 'd' | 'g' }) {
  const d = tg === 'd';
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center rounded border px-1.5 text-[12px] font-bold leading-none', d ? 'border-note-lavender-ink text-note-lavender-ink' : 'border-note-yellow-ink text-note-yellow-ink')}>
      {d ? '방향' : '점검'}
    </span>
  );
}
