import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Analysis, MethodKey, Rec, Sent, SlotIndex, StudentEntry } from '../../engine/types';
import { SLOTS } from '../../engine/types';
import { compileMethods, semLabel, slotIdx } from '../../engine/analyze';
import { methodMarks } from '../../engine/analyze/methods';
import { METHOD } from '../../engine/dict/methods';
import { LANE, LANES } from '../../engine/dict/subjects';
import type { MethodSel } from '../../state/store';
import { useApp } from '../../state/store';
import { DepthBars, Empty, GradeChips, MethodChip, Pill } from '../common';
import { cn } from '../../lib/utils';

/**
 * 옆 창: 탐구 방법 표에서 고른 칸의 기록 목록과 근거 문장.
 *  - sel.t 'sem'  → c가 학기 칸 번호(문자열). '*'면 모든 학기.
 *  - sel.t 'lane' → c가 교과군 키. '*'면 모든 교과군.
 *  - sel.m        → 방법 키. '*'면 방법이 하나라도 있는 기록 전부.
 * 머리글: '어디 · 무엇 · 기록 n건', 이전/다음 버튼, 번호 칩(누르면 그 기록으로 스크롤).
 * ↑↓ 키는 초점이 옆 창 안에 있을 때만 이전/다음 기록으로 넘긴다(본문에서는 화면 스크롤을 그대로 둔다).
 * 기록으로 옮길 때는 머리글 높이(번호 칩 줄 수에 따라 바뀜)를 재어 그만큼 띄워 멈춘다.
 * 기록마다 번호, 과목(누르면 계보도로 가서 기록 상세 창), 학기, 교과군, 깊이, 성적, 주제, 방법 칩(고른 방법은 켜짐),
 * 근거 문장 최대 3개(고른 방법의 표현을 노란 형광펜 mark.m로).
 */
export function MethodList({ an, student, sel }: { an: Analysis; student: StudentEntry; sel: MethodSel }) {
  const { state, dispatch } = useApp();
  const cm = useMemo(() => compileMethods(state.userDict), [state.userDict]);

  const recs = useMemo(() => {
    const slot = sel.t === 'sem' && sel.c !== '*' ? (Number(sel.c) as SlotIndex) : null;
    const laneOrder = (r: Rec) => LANES.findIndex((l) => l.key === r.lane);
    return an.recs
      .filter((r) => {
        if (sel.m === '*' ? !r.methods.length : !r.methods.includes(sel.m)) return false;
        if (sel.c === '*') return true;
        if (sel.t === 'sem') return slot != null && slotIdx(r).includes(slot);
        return r.lane === sel.c;
      })
      .sort((a, b) => a.t - b.t || laneOrder(a) - laneOrder(b) || a.id.localeCompare(b.id));
  }, [an.recs, sel]);

  const where = sel.t === 'sem'
    ? (sel.c === '*' ? '모든 학기' : slotLabel(sel.c))
    : (sel.c === '*' ? '모든 교과군' : (LANE[sel.c as keyof typeof LANE]?.label ?? sel.c));
  const what = sel.m === '*' ? '모든 방법' : METHOD[sel.m].label;

  const [cur, setCur] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  // 기록으로 옮길 때 띄울 높이 = 붙어 있는 머리글 높이 + 스크롤 상자의 위쪽 안쪽 여백(sticky는 그 여백만큼 내려와 붙는다).
  const [headH, setHeadH] = useState(120);
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const padTop = () => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowY)) return parseFloat(cs.paddingTop) || 0;
      }
      return 0;
    };
    const measure = () => setHeadH(Math.round(el.getBoundingClientRect().height + padTop()));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const selKey = `${sel.t}|${sel.m}|${sel.c}`;
  useEffect(() => { setCur(0); }, [selKey]);

  const go = (i: number, focus = false) => {
    if (!recs.length) return;
    const n = Math.max(0, Math.min(recs.length - 1, i));
    setCur(n);
    const el = items.current[n];
    if (el) {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      if (focus) el.focus({ preventScroll: true });
    }
  };

  // ↑↓ 키로 이전/다음 기록. 초점이 옆 창(이 목록을 담은 aside) 안에 있을 때만 쓰고, 입력란에 초점이 있으면 건드리지 않는다.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      const scope = rootRef.current?.closest('aside') ?? rootRef.current;
      if (!t || !scope || !scope.contains(t)) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      e.preventDefault();
      go(cur + (e.key === 'ArrowDown' ? 1 : -1));
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  });

  const openRec = (id: string) => {
    dispatch({ type: 'setView', view: 'tree' });
    dispatch({ type: 'openRecord', id });
  };

  const total = recs.length;
  const blind = state.blind;

  return (
    <div ref={rootRef} className="-mt-4 pt-4">
      {/* 머리글(스크롤해도 위에 붙어 있음) */}
      <div ref={headRef} className="sticky top-0 z-10 -mx-4 -ml-5 border-b border-hair bg-surface px-4 pb-2 pl-5 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-[13px] text-ink-2">
            <span className="font-semibold text-ink">{where}</span>
            <span className="mx-1 text-muted">·</span>
            <span className="font-semibold text-ink">{what}</span>
            <span className="mx-1 text-muted">·</span>
            <span className="num">기록 {total}건</span>
          </div>
          {total > 1 ? (
            <div className="flex items-center gap-1">
              <button type="button" className="btn ghost sm" onClick={() => go(cur - 1, true)} disabled={cur <= 0} aria-label="이전 기록"><ChevronUp className="h-4 w-4" aria-hidden /> 이전</button>
              <button type="button" className="btn ghost sm" onClick={() => go(cur + 1, true)} disabled={cur >= total - 1} aria-label="다음 기록">다음 <ChevronDown className="h-4 w-4" aria-hidden /></button>
            </div>
          ) : null}
        </div>
        {total > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="기록 번호로 이동">
            {recs.map((r, i) => (
              <button
                key={r.id}
                type="button"
                className={cn('num h-6 min-w-6 rounded border px-1 text-[12px] leading-none', i === cur ? 'border-ink bg-ink text-surface' : 'border-hair-2 text-ink-2 hover:border-ink')}
                onClick={() => go(i, true)}
                aria-label={`${i + 1}번 기록으로 이동: ${r.subj}`}
                aria-current={i === cur ? 'true' : undefined}
                title={`${r.subj} · ${semLabel(r)}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        ) : null}
        <p className="mt-1 text-[12px] text-muted">{total > 1 ? <span className="hidden md:inline">옆 창 안에서는 ↑↓ 키로도 넘길 수 있습니다. </span> : null}과목 이름을 누르면 계보도의 기록 상세 창으로 갑니다.{blind ? ' (이름 가리기 중)' : ''}</p>
      </div>

      {!total ? (
        <div className="pt-4"><Empty>이 칸에 해당하는 기록이 없습니다. 다른 칸을 눌러 보세요.</Empty></div>
      ) : (
        <ol className="space-y-3 pt-3">
          {recs.map((r, i) => (
            <li
              key={r.id}
              ref={(el) => { items.current[i] = el; }}
              tabIndex={-1}
              className={cn('rounded-md border bg-surface p-3 outline-none', i === cur ? 'border-ink' : 'border-hair')}
              style={{ scrollMarginTop: headH + 8 }}
              onFocus={() => setCur(i)}
              aria-label={`${i + 1}번 기록 ${r.subj}`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="num inline-flex h-5 min-w-5 items-center justify-center rounded bg-ink px-1 text-[11.5px] font-bold leading-none text-surface" aria-hidden>{i + 1}</span>
                <button type="button" className="text-[15px] font-bold underline-offset-4 hover:underline" onClick={() => openRec(r.id)} aria-label={`${r.subj} 기록 상세 보기`}>{r.subj}</button>
                <span className="text-[12px] text-muted">{r.kind}</span>
                <span className="text-[13px] text-ink-2">{semLabel(r)}</span>
                <Pill>{LANE[r.lane]?.label ?? r.lane}</Pill>
                <DepthBars d={r.depth} className="ml-auto" />
              </div>
              <GradeChips grades={r.grades} className="mt-1.5" />
              <p className="mt-1.5 text-[15px] font-semibold leading-snug">
                {r.topicKind === 'b' ? `『${r.topic}』` : r.topic}
                {r.topicKind === 'k' ? <span className="ml-1.5 text-[12px] font-normal text-muted">핵심어</span> : null}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {r.methods.map((k) => <MethodChip key={k} label={METHOD[k].label} on={k === sel.m} />)}
              </div>
              <Evidence r={r} m={sel.m} cm={cm} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 학기 칸 번호(문자열) → '1학년 1학기' */
function slotLabel(c: string): string {
  const s = SLOTS[Number(c)];
  return s ? semLabel({ year: s[0], sem: s[1] }) : c;
}

/* ───────────────────────── 근거 문장 ───────────────────────── */

type Marks = ReturnType<typeof methodMarks>;

/** 고른 방법이 든 문장 가운데 점수 높은 순으로 3개를 골라 원문 순으로 보여 준다. 해당 방법 표현은 mark.m. */
function Evidence({ r, m, cm }: { r: Rec; m: MethodKey | '*'; cm: ReturnType<typeof compileMethods> }) {
  const picked = useMemo(() => {
    const hit = (s: Sent) => (m === '*' ? s.ms.length > 0 : s.ms.includes(m));
    return r.sents.filter(hit).sort((a, b) => b.sc - a.sc || a.a - b.a).slice(0, 3).sort((a, b) => a.a - b.a);
  }, [r, m]);
  const marks = useMemo<Marks>(() => {
    if (!picked.length) return [];
    const all = methodMarks(r.text, cm);
    return m === '*' ? all : all.filter((x) => x.key === m);
  }, [r, cm, m, picked.length]);

  if (!picked.length) return <p className="mt-2 text-[13px] text-muted">근거 문장을 찾지 못했습니다.</p>;
  return (
    <ul className="mt-2 space-y-1 border-t border-hair pt-2 text-[13.5px] leading-relaxed text-ink-2">
      {picked.map((s) => <li key={s.a} className="pl-3 -indent-3">{renderSent(r.text, s, marks)}</li>)}
    </ul>
  );
}

/** 문장 범위 [a, b)에 걸친 방법 표현만 잘라 <mark class="m">로 감싼다. 앞뒤 공백은 뺀다. */
function renderSent(text: string, s: Sent, marks: Marks): React.ReactNode[] {
  let a = s.a;
  let b = s.b;
  while (a < b && /\s/.test(text[a])) a++;
  while (b > a && /\s/.test(text[b - 1])) b--;
  const inRange = marks
    .filter((x) => x.b > a && x.a < b)
    .map((x) => ({ a: Math.max(a, x.a), b: Math.min(b, x.b), key: x.key, user: x.user }))
    .sort((x, y) => x.a - y.a || y.b - x.b);
  const out: React.ReactNode[] = [];
  let pos = a;
  for (const x of inRange) {
    if (x.a < pos) continue;
    if (x.a > pos) out.push(<React.Fragment key={`t${pos}`}>{text.slice(pos, x.a)}</React.Fragment>);
    out.push(<mark key={`m${x.a}`} className="m" title={METHOD[x.key].label + (x.user ? ' (추가한 표현)' : '')}>{text.slice(x.a, x.b)}</mark>);
    pos = x.b;
  }
  if (pos < b) out.push(<React.Fragment key={`t${pos}`}>{text.slice(pos, b)}</React.Fragment>);
  return out;
}
