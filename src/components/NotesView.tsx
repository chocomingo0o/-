import React, { useMemo, useState } from 'react';
import { Copy, Eraser, GitBranch, NotebookPen, SquareArrowOutUpRight } from 'lucide-react';
import type { Analysis, Insight, Rec, StudentEntry } from '../engine/types';
import { semLabel } from '../engine/analyze';
import { useApp } from '../state/store';
import { Empty, Pill, SectionTitle } from './common';
import { cn } from '../lib/utils';

/**
 * 상담 노트.
 *  - compact=false(상담 노트 탭, 전체 화면): 두 열. 왼쪽 상담 포인트, 오른쪽 상담 메모와 기록별 메모. 폰 너비에서는 한 열.
 *  - compact=true(옆 창): 한 열. 메모 → 기록별 메모 → 상담 포인트.
 * 상담 포인트는 분석 결과(an.insights)를 그대로 보여 준다. 표(강점·점검·질문·방향)는 색과 이름을 항상 함께 둔다.
 *  '기록 보기'는 계보도로 가서 그 기록의 상세 창을 열고, '계보도에서 보기'는 관심 주제를 강조한다.
 *  '메모에 넣기'는 상담 메모 끝에 '- 문장'으로 덧붙인다(이미 있으면 알림만).
 * 메모는 학생 항목(student.memo, student.recMemo)에 저장되고 작업 파일에 함께 담긴다.
 */
export function NotesView({ an, student, compact }: { an: Analysis; student: StudentEntry; compact?: boolean }) {
  const { dispatch } = useApp();
  const memo = student.memo || '';

  const toast = (text: string) => dispatch({ type: 'toast', text });

  const addMemo = (text: string) => {
    if (memo.includes(text)) {
      toast('이미 상담 메모에 있는 문장입니다.');
      return;
    }
    const base = memo.trimEnd();
    dispatch({ type: 'setMemo', text: base ? `${base}\n- ${text}` : `- ${text}` });
    toast('상담 메모에 넣었습니다.');
  };
  const openRec = (id: string) => {
    dispatch({ type: 'setView', view: 'tree' });
    dispatch({ type: 'openRecord', id });
  };
  const showTheme = (name: string) => {
    dispatch({ type: 'setView', view: 'tree' });
    dispatch({ type: 'setTheme', theme: name });
    toast(`계보도에서 ‘${name}’ 관심 주제를 강조합니다.`);
  };

  const points = <Points an={an} memo={memo} compact={!!compact} onAdd={addMemo} onOpen={openRec} onTheme={showTheme} />;
  const memoBox = <MemoBox memo={memo} compact={!!compact} onChange={(t) => dispatch({ type: 'setMemo', text: t })} onToast={toast} />;
  const recMemos = <RecMemos an={an} student={student} onOpen={openRec} />;

  if (compact) {
    return (
      <div className="space-y-7 text-[15px] text-ink">
        {memoBox}
        {recMemos}
        {points}
      </div>
    );
  }

  return (
    <div className="grid gap-6 text-[15px] text-ink lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <section className="panel min-w-0 p-4 md:p-5">{points}</section>
      <div className="min-w-0 space-y-6">
        <section className="panel p-4 md:p-5">{memoBox}</section>
        <section className="panel p-4 md:p-5">{recMemos}</section>
      </div>
    </div>
  );
}

/* ───────────────────────── 상담 포인트 ───────────────────────── */

type Tag = Insight['tg'];
const TAG_ORDER: Tag[] = ['s', 'g', 'q', 'd'];
const TAG_LABEL: Record<Tag, string> = { s: '강점', g: '점검', q: '질문', d: '방향' };
const TAG_DESC: Record<Tag, string> = {
  s: '기록에서 뚜렷하게 드러난 강점',
  g: '상담 전에 확인해 볼 점',
  q: '학생에게 직접 물어볼 질문',
  d: '다음 탐구의 방향 제안',
};
/** 강점 민트, 점검 노랑, 질문 연보라, 방향 검정 테두리. 색만으로 구분하지 않고 이름을 항상 함께 쓴다. */
const TAG_CLASS: Record<Tag, string> = {
  s: 'border-note-mint-ink text-note-mint-ink',
  g: 'border-note-yellow-ink text-note-yellow-ink',
  q: 'border-note-lavender-ink text-note-lavender-ink',
  d: 'border-ink text-ink',
};

export function InsightTag({ tg, className }: { tg: Tag; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center rounded border px-1.5 text-[12px] font-bold leading-none', TAG_CLASS[tg], className)} title={TAG_DESC[tg]}>
      {TAG_LABEL[tg]}
    </span>
  );
}

function Points({ an, memo, compact, onAdd, onOpen, onTheme }: {
  an: Analysis; memo: string; compact: boolean;
  onAdd: (t: string) => void; onOpen: (id: string) => void; onTheme: (name: string) => void;
}) {
  const [filter, setFilter] = useState<Tag | 'all'>('all');
  const counts = useMemo(() => {
    const c: Record<Tag, number> = { s: 0, g: 0, q: 0, d: 0 };
    for (const p of an.insights) c[p.tg]++;
    return c;
  }, [an.insights]);
  const list = filter === 'all' ? an.insights : an.insights.filter((p) => p.tg === filter);
  const byId = (id: string): Rec | undefined => an.recs.find((r) => r.id === id);

  return (
    <div>
      <SectionTitle sub="분석 결과에서 뽑은 상담 거리입니다. 문장은 근거가 되는 기록과 함께 확인하고, 필요한 것만 메모에 옮기세요.">
        상담 포인트 <span className="num ml-1 text-[13px] font-normal text-muted">{an.insights.length}개</span>
      </SectionTitle>

      {an.insights.length ? (
        <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="상담 포인트 종류로 거르기">
          <FilterBtn on={filter === 'all'} onClick={() => setFilter('all')}>모두 <span className="num text-muted">{an.insights.length}</span></FilterBtn>
          {TAG_ORDER.map((t) => (
            <FilterBtn key={t} on={filter === t} onClick={() => setFilter(filter === t ? 'all' : t)} disabled={!counts[t]} title={TAG_DESC[t]}>
              <i className={cn('inline-block h-2.5 w-2.5 rounded-full border-2', TAG_CLASS[t])} aria-hidden />
              {TAG_LABEL[t]} <span className="num text-muted">{counts[t]}</span>
            </FilterBtn>
          ))}
        </div>
      ) : null}

      {list.length ? (
        <ul className="space-y-2.5">
          {list.map((p, i) => {
            const rec = p.go ? byId(p.go) : undefined;
            const inMemo = memo.includes(p.t);
            return (
              <li key={`${p.tg}-${i}`} className="rounded-md border border-hair bg-surface p-3">
                <div className="flex items-start gap-2.5">
                  <InsightTag tg={p.tg} className="mt-[2px]" />
                  <p className="min-w-0 flex-1 leading-relaxed">{p.t}</p>
                </div>
                <div className={cn('mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1', compact ? '' : 'pl-[42px]')}>
                  {rec ? (
                    <button type="button" className="btn ghost sm" onClick={() => onOpen(rec.id)} aria-label={`${rec.subj} ${semLabel(rec)} 기록 보기`} title={`${rec.subj} · ${semLabel(rec)}`}>
                      <SquareArrowOutUpRight className="h-3.5 w-3.5" aria-hidden /> 기록 보기
                      <span className="max-w-[160px] truncate font-normal text-muted">{rec.subj}</span>
                    </button>
                  ) : null}
                  {p.th ? (
                    <button type="button" className="btn ghost sm" onClick={() => onTheme(p.th!)} aria-label={`계보도에서 ‘${p.th}’ 관심 주제 보기`}>
                      <GitBranch className="h-3.5 w-3.5" aria-hidden /> 계보도에서 보기
                      <Pill className="border-note-mint-ink/60 font-normal">{p.th}</Pill>
                    </button>
                  ) : null}
                  <button type="button" className="btn ghost sm" onClick={() => onAdd(p.t)} disabled={inMemo} aria-label={inMemo ? '이미 메모에 넣은 문장' : '이 문장을 상담 메모에 넣기'}>
                    <NotebookPen className="h-3.5 w-3.5" aria-hidden /> {inMemo ? '메모에 있음' : '메모에 넣기'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>{an.insights.length ? '이 종류의 상담 포인트가 없습니다.' : '상담 포인트를 뽑을 만한 기록이 아직 없습니다. 세특과 창체 기록이 더 쌓이면 다시 확인해 보세요.'}</Empty>
      )}
    </div>
  );
}

function FilterBtn({ on, onClick, disabled, title, children }: { on: boolean; onClick: () => void; disabled?: boolean; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={on}
      className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium leading-none disabled:opacity-40', on ? 'border-ink bg-ink text-surface [&_.text-muted]:text-surface/70' : 'border-hair-2 text-ink-2 hover:border-ink')}
    >
      {children}
    </button>
  );
}

/* ───────────────────────── 상담 메모 ───────────────────────── */

function MemoBox({ memo, compact, onChange, onToast }: { memo: string; compact: boolean; onChange: (t: string) => void; onToast: (t: string) => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(memo);
      onToast('상담 메모를 복사했습니다.');
    } catch {
      onToast('복사하지 못했습니다. 메모를 직접 선택해 복사해 주세요.');
    }
  };
  const clear = () => {
    if (confirm('상담 메모를 모두 지울까요? 되돌릴 수 없습니다.')) {
      onChange('');
      onToast('상담 메모를 지웠습니다.');
    }
  };
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <SectionTitle className="mb-0" sub="이 화면에서만 보관되며 작업 저장(.json)에 함께 담깁니다. 인쇄하면 메모도 함께 나옵니다.">상담 메모</SectionTitle>
        <div className="flex gap-1">
          <button type="button" className="btn ghost sm" onClick={() => void copy()} disabled={!memo.trim()} aria-label="상담 메모 복사"><Copy className="h-3.5 w-3.5" aria-hidden /> 복사</button>
          <button type="button" className="btn ghost sm" onClick={clear} disabled={!memo.trim()} aria-label="상담 메모 모두 지우기"><Eraser className="h-3.5 w-3.5" aria-hidden /> 지우기</button>
        </div>
      </div>
      <textarea
        value={memo}
        onChange={(e) => onChange(e.target.value)}
        rows={compact ? 7 : 12}
        placeholder={'상담에서 짚을 점, 학생에게 할 질문, 다음 학기 탐구 방향을 적어 두세요.\n상담 포인트의 ‘메모에 넣기’를 누르면 이곳에 덧붙습니다.'}
        aria-label="상담 메모"
        className="mt-2 w-full resize-y rounded-md border border-hair-2 bg-surface px-3 py-2 text-[14.5px] leading-[1.7] placeholder:text-muted"
      />
      <div className="num mt-1 text-right text-[12px] text-muted">{memo.length}자</div>
    </div>
  );
}

/* ───────────────────────── 기록별 메모 ───────────────────────── */

function RecMemos({ an, student, onOpen }: { an: Analysis; student: StudentEntry; onOpen: (id: string) => void }) {
  const items = useMemo(() => {
    const rm = student.recMemo || {};
    return an.recs
      .filter((r) => (rm[r.id] || '').trim())
      .sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
      .map((r) => ({ r, text: rm[r.id].trim() }));
  }, [an.recs, student.recMemo]);

  return (
    <div>
      <SectionTitle sub="기록 상세 창에서 적은 메모입니다. 누르면 그 기록으로 갑니다.">
        기록별 메모 <span className="num ml-1 text-[13px] font-normal text-muted">{items.length}개</span>
      </SectionTitle>
      {items.length ? (
        <ul className="divide-y divide-hair">
          {items.map(({ r, text }) => (
            <li key={r.id}>
              <button type="button" onClick={() => onOpen(r.id)} className="block w-full rounded px-1 py-2 text-left hover:bg-plane" aria-label={`${r.subj} ${semLabel(r)} 기록 보기`}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{r.subj}</span>
                  <span className="text-[12.5px] text-muted">{r.kind} · {semLabel(r)}</span>
                </div>
                <p className="mt-0.5 text-[14px] leading-snug text-ink-2">{text.length > 80 ? `${text.slice(0, 80)}…` : text}</p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>아직 기록별 메모가 없습니다. 계보도에서 카드를 누르고 상세 창 아래의 메모란에 적어 보세요.</Empty>
      )}
    </div>
  );
}
