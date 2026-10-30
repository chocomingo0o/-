import React, { useEffect, useMemo, useRef } from 'react';
import type { Act, Analysis, Link, Rec, StudentEntry } from '../engine/types';
import { DEPTH_TXT, highlightSegments, LINK_KINDS, lineage, semLabel } from '../engine/analyze';
import type { HighlightSegment } from '../engine/analyze';
import { METHOD } from '../engine/dict/methods';
import { SKILL } from '../engine/dict/skills';
import { useApp } from '../state/store';
import { DepthBars, Empty, GradeChips, KindChip, MethodChip, Pill, SectionTitle } from './common';

/**
 * 기록 상세 창의 본문. 머리글(과목·학기)은 App의 SideDrawer가 그린다.
 * 위에서 아래로: 원문(형광펜) → 주제·핵심어 → 탐구 흐름 → 기록 메모 → 정보 표 → 이어받은/같은 시기/이어진 기록.
 */
export function RecordDrawer({ an, student, id }: { an: Analysis; student: StudentEntry; id: string }) {
  const { state, dispatch } = useApp();
  const r = an.recs.find((x) => x.id === id);
  const rootRef = useRef<HTMLDivElement>(null);
  const jumpRef = useRef(false);

  const segs = useMemo(() => (r ? highlightSegments(r, an, state.userDict) : []), [r, an, state.userDict]);
  const body = useMemo(() => (r ? renderText(r.text, segs, r.key) : null), [r, segs]);

  // 창 안의 다른 기록 버튼으로 옮겨 왔을 때만 맨 위로 되돌린다.
  // 폰 너비에서는 옆 창 본문이 스크롤되고, 넓은 화면에서는 페이지 전체가 스크롤되므로 둘 다 다룬다.
  useEffect(() => {
    if (!jumpRef.current) return;
    jumpRef.current = false;
    let el: HTMLElement | null = rootRef.current?.parentElement ?? null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) { el.scrollTop = 0; return; }
      el = el.parentElement;
    }
    window.scrollTo({ top: 0 });
  }, [id]);

  if (!r) return <Empty>기록을 찾지 못했습니다. 다른 카드를 눌러 보세요.</Empty>;

  const open = (rid: string) => {
    jumpRef.current = true;
    dispatch({ type: 'openRecord', id: rid });
  };
  const byId = (rid: string) => an.recs.find((x) => x.id === rid);

  const counts = { method: 0, theme: 0, skill: 0 };
  for (const s of segs) counts[s.kind]++;

  const inbound = an.links.filter((l) => l.to === id && l.rel !== '동시');
  const together = an.links.filter((l) => l.rel === '동시' && (l.from === id || l.to === id));
  const outbound = an.links.filter((l) => l.from === id && l.rel !== '동시');
  const lin = lineage(an.links, id);
  const memo = student.recMemo?.[id] ?? '';
  const topicTitle = TOPIC_TITLE[r.topicKind];
  // 주제가 핵심어뿐('k')이면 주제 줄에 이미 핵심어가 나오므로 따로 적지 않는다
  const showKw = r.kw.length > 0 && r.topicKind !== 'k';

  return (
    <div ref={rootRef} className="space-y-7 text-[15px] text-ink">
      {r.faint ? (
        <p className="text-[13px] text-muted">탐구 방법이 뚜렷하지 않아 계보도에서 흐리게 표시되는 기록입니다.</p>
      ) : null}

      {/* 1. 원문 */}
      <section>
        <SectionTitle sub={`방법 표현 ${counts.method}곳 · 관심 주제 ${counts.theme}곳 · 과학 탐구 기능 ${counts.skill}곳 · 핵심 문장 ${r.key.length}개`}>생기부 원문</SectionTitle>
        <ul className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted" aria-label="형광펜 범례">
          <li><mark className="m">방법 표현</mark></li>
          <li><mark className="t">관심 주제</mark></li>
          <li><mark className="k">과학 탐구 기능</mark></li>
          <li><span className="keysent">핵심 문장</span></li>
        </ul>
        <p className="whitespace-pre-wrap break-words leading-[1.8]">{body}</p>
      </section>

      {/* 2. 주제·핵심어 */}
      <section>
        <SectionTitle sub={r.topicKind === 's' ? '주제를 따로 적지 않아 핵심 문장으로 대신합니다.' : undefined}>{topicTitle}</SectionTitle>
        <p className="font-semibold">{r.topicKind === 'b' ? `『${r.topic}』` : r.topic || '주제를 찾지 못했습니다.'}</p>
        {showKw ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] text-muted">핵심어</span>
            {r.kw.map((k) => <Pill key={k}>{k}</Pill>)}
          </div>
        ) : null}
      </section>

      {/* 3. 탐구 흐름 */}
      <section>
        <SectionTitle sub={r.acts.length ? `활동 ${r.acts.length}개${r.fuCount ? ` · 추가 탐구 ${r.fuCount}회` : ''}` : undefined}>이 기록 안의 탐구 흐름</SectionTitle>
        {r.acts.length ? (
          <ol className="space-y-2">
            {r.acts.map((a, i) => <ActItem key={i} a={a} n={i + 1} />)}
          </ol>
        ) : (
          <Empty>탐구 활동으로 볼 문장이 없습니다.</Empty>
        )}
      </section>

      {/* 4. 기록 메모 */}
      <section>
        <SectionTitle sub="입력한 내용은 상담 노트와 작업 파일에 함께 담깁니다.">이 기록에 대한 상담 메모</SectionTitle>
        <textarea
          value={memo}
          onChange={(e) => dispatch({ type: 'setRecMemo', id, text: e.target.value })}
          rows={3}
          placeholder="상담에서 짚을 점, 학생에게 물을 질문을 적어 두세요."
          aria-label={`${r.subj} 기록 메모`}
          className="w-full resize-y rounded-md border border-hair-2 bg-surface px-3 py-2 text-[14px] leading-[1.6] placeholder:text-muted"
        />
      </section>

      {/* 5. 정보 표 */}
      <section>
        <SectionTitle>기록 정보</SectionTitle>
        <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[14px]">
          <Row label="성적">
            {r.grades.length ? <GradeChips grades={r.grades} /> : <span className="text-muted">{r.kind === '세특' ? '표시된 성적 없음' : '해당 없음'}</span>}
          </Row>
          <Row label="탐구 방법">
            {r.methods.length ? (
              <div className="flex flex-wrap gap-1">
                {r.methods.map((m) => (
                  <MethodChip key={m} label={METHOD[m].label} on={METHOD[m].lv >= 3} />
                ))}
              </div>
            ) : <span className="text-muted">드러난 방법 없음</span>}
          </Row>
          <Row label="탐구 깊이">
            <span className="inline-flex items-center gap-2"><DepthBars d={r.depth} /> <span>{r.depth}단계 · {DEPTH_TXT[r.depth]}</span></span>
          </Row>
          <Row label="과학 탐구 기능">
            {r.skills.length ? (
              <div className="flex flex-wrap gap-1">
                {r.skills.map((k) => {
                  const c = r.skillCounts[k] ?? 0;
                  return <Pill key={k} className="border-note-lavender-ink/60">{SKILL[k].label}{c > 1 ? <span className="num ml-1 text-muted">{c}</span> : null}</Pill>;
                })}
              </div>
            ) : <span className="text-muted">드러난 기능 없음</span>}
          </Row>
          <Row label="관심 분야">
            {r.fields.length ? (
              <div className="flex flex-wrap gap-1">
                {r.fields.map((f) => <Pill key={f.k} className="cursor-help"><span title={`근거 낱말: ${f.words.join(', ')}`}>{f.k}</span></Pill>)}
              </div>
            ) : <span className="text-muted">뚜렷한 관심 분야 없음</span>}
          </Row>
          <Row label="관심 주제">
            {r.themes.length ? (
              <div className="flex flex-wrap gap-1">
                {r.themes.map((t) => <Pill key={t} className="border-note-mint-ink/60">{t}</Pill>)}
              </div>
            ) : <span className="text-muted">관통하는 관심 주제 없음</span>}
          </Row>
          <Row label="계보">
            <span>앞선 {lin.up.size}개 · 뒤이은 {lin.down.size}개</span>
          </Row>
        </dl>
      </section>

      {/* 6. 연결 */}
      <section>
        <SectionTitle>이 탐구가 이어받은 기록</SectionTitle>
        {inbound.length ? (
          <ul className="space-y-3">
            {inbound.map((l) => { const o = byId(l.from); return o ? <LinkItem key={l.from + l.to} l={l} other={o} onOpen={open} /> : null; })}
          </ul>
        ) : (
          <Empty>앞선 기록과 뚜렷한 연결이 없습니다. 이 탐구의 출발점일 수 있습니다.</Empty>
        )}
      </section>

      {together.length ? (
        <section>
          <SectionTitle>같은 시기에 함께 다룬 기록</SectionTitle>
          <ul className="space-y-3">
            {together.map((l) => { const o = byId(l.from === id ? l.to : l.from); return o ? <LinkItem key={l.from + l.to} l={l} other={o} onOpen={open} /> : null; })}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionTitle>이 탐구에서 이어진 기록</SectionTitle>
        {outbound.length ? (
          <ul className="space-y-3">
            {outbound.map((l) => { const o = byId(l.to); return o ? <LinkItem key={l.from + l.to} l={l} other={o} onOpen={open} /> : null; })}
          </ul>
        ) : (
          <Empty>뒤이은 탐구가 보이지 않습니다. 후속 탐구를 함께 설계해 볼 지점입니다.</Empty>
        )}
      </section>
    </div>
  );
}

/* ───────────────────────── 부분 ───────────────────────── */

const TOPIC_TITLE: Record<Rec['topicKind'], string> = { q: '탐구 주제', p: '탐구 주제', b: '읽은 책', s: '탐구 내용', k: '핵심어' };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="pt-[2px] text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/** 탐구 흐름의 활동 하나. 추가 탐구(fu)면 위에 이어짐 문구를 붙인다. */
function ActItem({ a, n }: { a: Act; n: number }) {
  return (
    <li className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-2">
      {a.fu ? <div className="col-span-2 -mb-1 pl-[30px] text-[13px] text-note-lavender-ink">↳ 추가 탐구로 이어짐</div> : null}
      <span className="num pt-[1px] text-[13px] font-semibold text-muted">{n}</span>
      <div className="min-w-0">
        <p>{a.text}</p>
        {a.ms.length || a.rf ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {a.ms.map((m) => <MethodChip key={m} label={METHOD[m].label} />)}
            {a.rf ? <Pill className="border-note-yellow-ink/70 text-note-yellow-ink">한계·개선</Pill> : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** 연결 하나: 종류 칩 + 상대 기록 버튼 + 종류 설명 + 설명 문장 + 근거 줄 + 상담 포인트 */
function LinkItem({ l, other, onOpen }: { l: Link; other: Rec; onOpen: (id: string) => void }) {
  const k = LINK_KINDS[l.rel];
  return (
    <li className="panel p-3">
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <KindChip kind={l.rel} className="mt-[3px]" />
        <button
          type="button"
          onClick={() => onOpen(other.id)}
          aria-label={`${other.subj} ${semLabel(other)} 기록 보기`}
          className="min-w-0 flex-1 text-left hover:underline underline-offset-2"
        >
          <span className="font-semibold">{other.subj}</span>
          <span className="ml-1.5 text-[13px] text-muted">{other.kind} · {semLabel(other)}</span>
          <span className="block text-[14px] text-ink-2">{other.topicKind === 'b' ? `『${other.topic}』` : other.topic}</span>
        </button>
      </div>
      <p className="mt-1 text-[13px] text-muted">{k.desc}{l.cross ? ' · 교과군을 건너감' : ''}</p>
      {l.sent ? <p className="mt-1.5 text-[14px]">{l.sent}</p> : null}
      {l.lines.length ? (
        <ul className="mt-1.5 space-y-0.5 text-[13px] text-ink-2">
          {l.lines.map((s, i) => <li key={i} className="flex gap-1.5"><span aria-hidden className="text-muted">·</span><span className="min-w-0">{s}</span></li>)}
        </ul>
      ) : null}
      <p className="mt-2 border-t border-hair pt-2 text-[13px] text-ink-2"><b className="font-semibold text-ink">상담 포인트: </b>{k.hint}</p>
    </li>
  );
}

/* ───────────────────────── 원문 형광펜 ───────────────────────── */

const MARK_CLS: Record<HighlightSegment['kind'], string> = { method: 'm', theme: 't', skill: 'k' };

/**
 * 원문을 형광펜 구간(겹침 없음, 원문 순)과 핵심 문장 범위(a/b)로 잘라 React 노드로 만든다.
 * 핵심 문장 안에 형광펜이 들어갈 수 있으므로, 조각마다 '핵심 문장 안인지'를 따로 두고 같은 상태의 조각을 .keysent로 묶는다.
 */
function renderText(text: string, segs: HighlightSegment[], keys: { a: number; b: number }[]): React.ReactNode[] {
  const n = text.length;
  const cuts = new Set<number>([0, n]);
  for (const s of segs) { cuts.add(clamp(s.a, n)); cuts.add(clamp(s.b, n)); }
  for (const k of keys) { cuts.add(clamp(k.a, n)); cuts.add(clamp(k.b, n)); }
  const pts = [...cuts].sort((x, y) => x - y);

  interface Piece { a: number; b: number; seg: HighlightSegment | null; key: boolean }
  const pieces: Piece[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (b <= a) continue;
    const seg = segs.find((s) => s.a <= a && b <= s.b) ?? null;
    const key = keys.some((k) => k.a <= a && b <= k.b);
    pieces.push({ a, b, seg, key });
  }

  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < pieces.length) {
    const key = pieces[i].key;
    const inner: React.ReactNode[] = [];
    let j = i;
    while (j < pieces.length && pieces[j].key === key) {
      const p = pieces[j];
      const s = text.slice(p.a, p.b);
      inner.push(p.seg ? <mark key={p.a} className={MARK_CLS[p.seg.kind]} title={p.seg.label}>{s}</mark> : <React.Fragment key={p.a}>{s}</React.Fragment>);
      j++;
    }
    out.push(key ? <span key={`k${pieces[i].a}`} className="keysent" title="핵심 문장">{inner}</span> : <React.Fragment key={`f${pieces[i].a}`}>{inner}</React.Fragment>);
    i = j;
  }
  return out;
}

const clamp = (v: number, n: number): number => Math.max(0, Math.min(n, v));
