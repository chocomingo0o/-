import React, { useMemo } from 'react';
import { Check, Minus } from 'lucide-react';
import type { Analysis, MethodKey, StudentEntry } from '../../engine/types';
import { semLabel } from '../../engine/analyze';
import { LEVEL_LABEL, METHOD } from '../../engine/dict/methods';
import { SKILL } from '../../engine/dict/skills';
import { LANE } from '../../engine/dict/subjects';
import { useApp } from '../../state/store';
import { Empty, SectionTitle } from '../common';
import { cn } from '../../lib/utils';
import { Heatmap, HeatLegend } from './Heatmap';
import type { HeatCol, HeatRow, HeatSel } from './Heatmap';
import { GapPanel } from './GapPanel';

/**
 * 탐구 방법 화면. 머리글 + 표 3개 + 결손 지도.
 *  표 1  학기별로 쓴 탐구 방법   행 = 쓰인 방법, 열 = 기록 있는 학기, 합계. 칸·머리글 클릭 → mSel(t:'sem') → 옆 창 MethodList.
 *  표 2  교과군별 방법 구성       행 = 교과군, 열 = 쓰인 방법(짧은 이름), 기록 수. 기대 방법인데 0인 칸은 점선 + '없음'. 클릭 → mSel(t:'lane').
 *                                 짧은 열 이름은 표 아래 '열 이름 풀이'(펼침)에서 전체 이름을 볼 수 있다(마우스 없이도).
 *  표 3  과학 탐구 과정 기능      행 = 8기능 전부, 열 = 학기. 아래 8칸 체크 요약. 과학 관련 기록이 없으면 안내.
 * 같은 칸을 다시 누르면 선택을 푼다.
 * 방법의 '수준'(1~3)과 탐구 '깊이'(1~4단계)는 다른 척도이므로, 방법 쪽은 언제나 '수준 n'으로 부른다.
 */
export function MethodView({ an, student }: { an: Analysis; student: StudentEntry }) {
  const { state, dispatch } = useApp();
  const g = an.gaps;
  const slots = g.slots;

  const semCols = useMemo<HeatCol[]>(() => slots.map((s) => ({ key: String(s.slot), label: `${s.year}-${s.sem}`, title: semLabel(s) })), [slots]);
  const usedMethods = useMemo(() => g.semMatrix.filter((r) => r.total > 0), [g.semMatrix]);

  const semRows = useMemo<HeatRow[]>(() => usedMethods.map((r) => {
    const def = METHOD[r.key];
    return {
      key: r.key,
      text: def.label,
      title: `${def.label} (수준 ${def.lv}) ${def.desc}`,
      label: <><span>{def.label}</span><span className="ml-1.5 hidden whitespace-nowrap text-[11px] font-normal text-muted sm:inline">수준 {def.lv}</span></>,
      cells: slots.map((s) => r.cells[s.slot] ?? 0),
      total: r.total,
    };
  }), [usedMethods, slots]);

  const laneCols = useMemo<HeatCol[]>(() => usedMethods.map((r) => ({ key: r.key, label: METHOD[r.key].short, title: METHOD[r.key].label })), [usedMethods]);
  const shortNames = useMemo(() => usedMethods.map((r) => METHOD[r.key]).filter((m) => m.short !== m.label), [usedMethods]);
  const laneRows = useMemo<HeatRow[]>(() => g.laneMatrix.map((l) => {
    const label = LANE[l.lane]?.label ?? l.lane;
    return { key: l.lane, text: label, label, cells: usedMethods.map((r) => l.cells[r.key] ?? 0), total: l.total };
  }), [g.laneMatrix, usedMethods]);

  const skillRows = useMemo<HeatRow[]>(() => g.skillMatrix.map((r) => {
    const def = SKILL[r.key];
    return { key: r.key, text: def.label, title: def.desc, label: def.label, cells: slots.map((s) => r.cells[s.slot] ?? 0), total: r.total };
  }), [g.skillMatrix, slots]);

  const sciNote = g.trend.find((t) => /과학 탐구 과정 기능 표는 전체 기록으로/.test(t)) ?? null;
  const sciRecs = g.skillLaneMatrix.reduce((a, l) => a + l.total, 0);

  const sel = state.mSel;
  const semSel: HeatSel | null = sel && sel.t === 'sem' ? { row: sel.m, col: sel.c } : null;
  const laneSel: HeatSel | null = sel && sel.t === 'lane' ? { row: sel.c, col: sel.m } : null;

  const pickSem = (row: string, col: string) => {
    const same = sel && sel.t === 'sem' && sel.m === row && sel.c === col;
    dispatch({ type: 'setMethodSel', sel: same ? null : { t: 'sem', m: row as MethodKey | '*', c: col } });
  };
  const pickLane = (row: string, col: string) => {
    const same = sel && sel.t === 'lane' && sel.c === row && sel.m === col;
    dispatch({ type: 'setMethodSel', sel: same ? null : { t: 'lane', m: col as MethodKey | '*', c: row } });
  };
  const isLaneGap = (row: string, col: string) => (LANE[row as keyof typeof LANE]?.expected ?? []).includes(col as MethodKey);

  const lv3Used = usedMethods.filter((r) => METHOD[r.key].lv === 3).length;
  const lv3All = Object.values(METHOD).filter((m) => m.lv === 3).length;

  if (!an.recs.length || !slots.length) {
    return (
      <div className="panel p-6">
        <SectionTitle>탐구 방법</SectionTitle>
        <Empty>분석할 기록이 없습니다. 세특이나 창체 기록이 있는 학생부를 올려 주세요.</Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 머리글 */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold">탐구 방법</h2>
          <p className="mt-0.5 text-[13px] text-muted">학기와 교과군마다 어떤 탐구 방법이 드러났는지 기록 수로 셉니다. 칸이나 머리글을 누르면 근거 문장을 옆 창에서 볼 수 있습니다.</p>
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          <div><dt className="inline text-muted">쓴 방법 </dt><dd className="num inline font-bold">{usedMethods.length}<span className="font-normal text-muted">/{Object.keys(METHOD).length}가지</span></dd></div>
          <div><dt className="inline text-muted">그중 수준 3 방법 </dt><dd className="num inline font-bold">{lv3Used}<span className="font-normal text-muted">/{lv3All}가지</span></dd></div>
          <div><dt className="inline text-muted">기록 있는 학기 </dt><dd className="num inline font-bold">{slots.length}<span className="font-normal text-muted">개</span></dd></div>
        </dl>
      </header>

      {/* 표 1 */}
      <section className="panel p-4">
        <SectionTitle sub={`칸의 숫자는 그 학기에 그 방법이 드러난 기록 수입니다. 열 머리글 ‘1-1’은 1학년 1학기를 뜻합니다. 방법 이름 옆의 수준은 방법의 수준(1 ${LEVEL_LABEL[1]}, 2 ${LEVEL_LABEL[2]}, 3 ${LEVEL_LABEL[3]})으로, 기록의 탐구 깊이(1~4단계)와는 다른 척도입니다. 학기 구분이 없는 창체 기록은 그 학년의 두 학기에 모두 셉니다.`}>학기별로 쓴 탐구 방법</SectionTitle>
        <Heatmap caption="학기별로 쓴 탐구 방법 (행: 방법, 열: 학기, 칸: 기록 수)" corner={{ row: '방법', col: '학기' }} cols={semCols} rows={semRows} totalLabel="합계" selected={semSel} onPick={pickSem} colSub />
        <HeatLegend className="mt-2" />
      </section>

      {/* 표 2 */}
      <section className="panel p-4">
        <SectionTitle sub="교과군마다 어떤 방법에 기대어 탐구했는지 보여 줍니다. 열 이름은 줄인 이름이며, 전체 이름은 표 아래 ‘열 이름 풀이’에 있습니다. 기대 방법인데 한 번도 드러나지 않은 칸은 점선과 ‘없음’으로 표시합니다.">교과군별 방법 구성</SectionTitle>
        <Heatmap caption="교과군별 방법 구성 (행: 교과군, 열: 방법, 칸: 기록 수, 마지막 열: 그 교과군의 기록 수)" corner={{ row: '교과군', col: '방법' }} cols={laneCols} rows={laneRows} totalLabel="기록 수" selected={laneSel} onPick={pickLane} isGap={isLaneGap} gapText="없음" />
        <HeatLegend className="mt-2" gap />
        {shortNames.length ? (
          <details className="mt-2 text-[12.5px] text-ink-2">
            <summary className="cursor-pointer text-muted hover:text-ink">열 이름 풀이</summary>
            <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {shortNames.map((m) => (
                <div key={m.key} className="whitespace-nowrap"><dt className="inline font-semibold">{m.short}</dt><dd className="ml-1 inline text-muted">{m.label}</dd></div>
              ))}
            </dl>
          </details>
        ) : null}
      </section>

      {/* 표 3 */}
      <section className="panel p-4">
        <SectionTitle sub={sciNote ? '과학 교과나 과학 동아리 기록이 없어 전체 기록으로 계산했습니다.' : `과학 교과와 과학 동아리 기록 ${sciRecs}건을 기준으로, 2022 개정 과학과 교육과정의 탐구 기능을 8가지로 재구성해 셉니다. 기록 상세 창에서 해당 문장을 연보라 형광펜으로 볼 수 있습니다.`}>과학 탐구 과정 기능</SectionTitle>
        {sciNote ? (
          <div className="mb-3 rounded-md border border-note-yellow-ink/40 bg-note-yellow/20 px-3 py-2 text-[13px]">{sciNote}</div>
        ) : null}
        <Heatmap caption="과학 탐구 과정 기능 (행: 기능 8가지, 열: 학기, 칸: 기록 수)" corner={{ row: '기능', col: '학기' }} cols={semCols} rows={skillRows} totalLabel="합계" colSub />
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="탐구 기능 8가지 사용 여부">
          {g.skillMatrix.map((r) => {
            const on = r.total > 0;
            return (
              <li key={r.key} className={cn('inline-flex items-center gap-1 rounded border px-2 py-[2px] text-[12.5px] leading-[1.6]', on ? 'border-ink bg-ink text-surface' : 'border-dashed border-hair-2 text-muted')} title={SKILL[r.key].desc}>
                {on ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Minus className="h-3.5 w-3.5" aria-hidden />}
                <span>{SKILL[r.key].label}</span>
                <span className={cn('num text-[11.5px]', on ? 'opacity-80' : '')}>{on ? `${r.total}건` : '없음'}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[12.5px] text-muted">
          쓴 기능 {g.skillMatrix.filter((r) => r.total > 0).length}가지, 아직 드러나지 않은 기능 {g.skillMatrix.filter((r) => r.total === 0).length}가지. 공식 분류를 그대로 옮긴 것이 아니라 학생부 문장에서 구별해 읽을 수 있는 크기로 묶은 것입니다.
        </p>
      </section>

      {/* 결손 지도 */}
      <section className="panel p-4">
        <div className="mb-3 border-b border-hair pb-2">
          <h3 className="text-[16px] font-bold">결손 지도</h3>
          <p className="mt-0.5 text-[13px] text-muted">학기와 교과군에서 비어 있는 방법을 모아 다음 학기에 무엇을 넣어 볼지 정리합니다.</p>
        </div>
        <GapPanel an={an} student={student} />
      </section>
    </div>
  );
}
