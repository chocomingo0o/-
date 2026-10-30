import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from './state/store';
import { useAnalysis, dropAnalysisCache } from './hooks/useAnalysis';
import { ingestFiles } from './lib/files';
import { download, makeWorkFile, mergeUserDict, todayStamp } from './lib/storage';
import { restoreTheme, toggleTheme } from './lib/theme';
import { uid } from './lib/utils';
import { sampleStudent } from './fixtures/sample';
import type { StudentEntry } from './engine/types';
import { semLabel } from './engine/analyze';
import { Landing } from './components/Landing';
import { TopBar } from './components/TopBar';
import { StudentHead } from './components/StudentHead';
import { SideDrawer } from './components/SideDrawer';
import { TreeBoard } from './components/tree/TreeBoard';
import { RecordDrawer } from './components/RecordDrawer';
import { MethodView } from './components/method/MethodView';
import { MethodList } from './components/method/MethodList';
import { NotesView } from './components/NotesView';
import { DictPanel } from './components/DictPanel';
import { ManualInput } from './components/ManualInput';
import { Busy, Toast } from './components/common';

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { state, dispatch } = useApp();
  const student = state.students[state.cur] ?? null;
  const an = useAnalysis(student, state.userDict);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => { restoreTheme(); }, []);

  // 알림은 2.6초 뒤 사라짐
  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: 'toast', text: null }), 2600);
    return () => clearTimeout(t);
  }, [state.toast, dispatch]);

  // 저장하지 않은 메모가 있으면 창 닫기 전에 확인
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (state.dirty && state.students.length) { e.preventDefault(); } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [state.dirty, state.students.length]);

  // Esc: 옆 창 닫기 → 넓게 보기 해제
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (state.side) dispatch({ type: 'closeSide' });
      else if (state.wide) dispatch({ type: 'toggleWide', value: false });
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [state.side, state.wide, dispatch]);

  const toast = useCallback((text: string) => dispatch({ type: 'toast', text }), [dispatch]);

  const handleFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    dispatch({ type: 'setBusy', text: '학생부를 읽는 중입니다' });
    try {
      const res = await ingestFiles(files, (t) => dispatch({ type: 'setBusy', text: t }));
      if (res.dicts.length) {
        let dict = state.userDict;
        for (const d of res.dicts) dict = mergeUserDict(dict, d);
        dropAnalysisCache();
        dispatch({ type: 'setUserDict', dict });
      }
      dispatch({ type: 'addStudents', entries: res.entries, errors: res.errors });
      if (res.errors.length) toast(`${res.errors.length}개 파일을 읽지 못했습니다. 화면의 안내를 확인해 주세요.`);
      else if (res.notes.length) toast(res.notes[res.notes.length - 1]);
      else if (res.entries.length > 1) toast(`${res.entries.length}명의 학생부를 불러왔습니다.`);
      else if (res.entries.length === 1) toast('학생부를 불러왔습니다.');
    } finally {
      dispatch({ type: 'setBusy', text: null });
    }
  }, [dispatch, state.userDict, toast]);

  const addSample = useCallback(() => {
    const entry: StudentEntry = { id: uid('sample'), file: '가상 예시', data: sampleStudent(), memo: '', recMemo: {} };
    dispatch({ type: 'addStudents', entries: [entry] });
  }, [dispatch]);

  const saveWork = useCallback(() => {
    if (!state.students.length) return;
    const now = new Date();
    download(`탐구분석지도_작업_${todayStamp(now)}.json`, JSON.stringify(makeWorkFile(state.students, state.userDict, now)));
    dispatch({ type: 'markSaved' });
    toast('작업 파일을 저장했습니다. 학생 개인정보가 담긴 파일이니 학교 지침에 따라 안전하게 보관해 주세요.');
  }, [state.students, state.userDict, dispatch, toast]);

  const wipe = useCallback(() => {
    if (confirm('불러온 학생부, 분석 결과, 상담 메모를 이 화면에서 모두 지울까요?\n저장하지 않은 메모는 되돌릴 수 없습니다.')) {
      dropAnalysisCache();
      dispatch({ type: 'wipe' });
    }
  }, [dispatch]);

  // 끌어다 놓기(화면 전체)
  useEffect(() => {
    let n = 0;
    const enter = (e: DragEvent) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { n++; setDragging(true); } };
    const leave = () => { n = Math.max(0, n - 1); if (!n) setDragging(false); };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault(); n = 0; setDragging(false);
      const fs = [...(e.dataTransfer?.files || [])].filter((f) => /\.(pdf|json)$/i.test(f.name) || f.type === 'application/pdf');
      if (fs.length) void handleFiles(fs);
    };
    document.addEventListener('dragenter', enter);
    document.addEventListener('dragleave', leave);
    document.addEventListener('dragover', over);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragenter', enter);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('dragover', over);
      document.removeEventListener('drop', drop);
    };
  }, [handleFiles]);

  const manualDone = useCallback((entry: StudentEntry) => {
    dispatch({ type: 'addStudents', entries: [entry] });
    toast('직접 입력한 기록을 분석했습니다.');
  }, [dispatch, toast]);

  const hiddenInput = (
    <input ref={fileInput} type="file" accept=".pdf,.json,application/pdf" multiple hidden onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; void handleFiles(fs); }} />
  );

  if (!student || !an) {
    return (
      <>
        <Landing
          onFiles={(fs) => void handleFiles(fs)}
          onSample={addSample}
          onManual={() => dispatch({ type: 'openSide', side: 'manual' })}
          errors={state.errors}
          onClearErrors={() => dispatch({ type: 'setErrors', errors: [] })}
        />
        {state.side === 'manual' ? (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => dispatch({ type: 'closeSide' })}>
            <div onClick={(e) => e.stopPropagation()} className="h-full">
              <SideDrawer open kicker="붙여 넣기" title="세특 직접 입력" onClose={() => dispatch({ type: 'closeSide' })} defaultWidth={620}>
                <ManualInput onDone={manualDone} onCancel={() => dispatch({ type: 'closeSide' })} />
              </SideDrawer>
            </div>
          </div>
        ) : null}
        {dragging ? <DropHint /> : null}
        <Busy text={state.busy} />
        <Toast text={state.toast} />
        {hiddenInput}
      </>
    );
  }

  const selRec = state.sel ? an.recs.find((r) => r.id === state.sel) : null;
  const sideTitle: Record<string, { kicker: string; title: string; width?: number }> = {
    rec: { kicker: selRec ? `${selRec.kind} · ${selRec.lane} · ${semLabel(selRec)}` : '', title: selRec?.subj || '' },
    mlist: { kicker: '근거 문장', title: '탐구 방법', width: Math.max(360, Math.min(620, Math.round(window.innerWidth * 0.42))) },
    dict: { kicker: student.data.meta.name || '', title: '표현 사전' },
    note: { kicker: student.data.meta.name || '', title: '상담 노트' },
    manual: { kicker: '붙여 넣기', title: '세특 직접 입력', width: 620 },
  };
  const side = state.side ? sideTitle[state.side] : null;

  return (
    <div className="flex min-h-screen flex-col">
      {!state.wide ? (
        <TopBar
          students={state.students}
          cur={state.cur}
          view={state.view}
          side={state.side}
          blind={state.blind}
          onSelect={(i) => dispatch({ type: 'selectStudent', index: i })}
          onView={(v) => dispatch({ type: 'setView', view: v })}
          onAddFiles={() => fileInput.current?.click()}
          onDict={() => dispatch(state.side === 'dict' ? { type: 'closeSide' } : { type: 'openSide', side: 'dict' })}
          onNotes={() => dispatch(state.side === 'note' ? { type: 'closeSide' } : { type: 'openSide', side: 'note' })}
          onBlind={() => dispatch({ type: 'toggleBlind' })}
          onSave={saveWork}
          onPrint={() => setTimeout(() => window.print(), 60)}
          onWipe={wipe}
          onTheme={() => toggleTheme()}
        />
      ) : null}
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 px-4 py-4 md:px-6">
          {state.errors.length ? (
            <div className="noprint mb-3 rounded-md border border-note-yellow-ink/40 bg-note-yellow/20 px-4 py-2 text-[13px]">
              {state.errors.map((e, i) => <div key={i}><b>{e.file}</b>: {e.msg}</div>)}
              <button className="btn ghost sm mt-1" type="button" onClick={() => dispatch({ type: 'setErrors', errors: [] })}>닫기</button>
            </div>
          ) : null}
          {!state.wide ? <StudentHead an={an} student={student} blind={state.blind} /> : null}
          {state.view === 'tree' ? <TreeBoard an={an} student={student} /> : null}
          {state.view === 'method' ? <MethodView an={an} student={student} /> : null}
          {state.view === 'note' ? <NotesView an={an} student={student} /> : null}
          <PrintNotes an={an} student={student} />
        </main>
        {side ? (
          <SideDrawer open kicker={side.kicker} title={side.title} defaultWidth={side.width} onClose={() => dispatch({ type: 'closeSide' })}>
            {state.side === 'rec' && state.sel ? <RecordDrawer an={an} student={student} id={state.sel} /> : null}
            {state.side === 'mlist' && state.mSel ? <MethodList an={an} student={student} sel={state.mSel} /> : null}
            {state.side === 'dict' ? <DictPanel an={an} student={student} /> : null}
            {state.side === 'note' ? <NotesView an={an} student={student} compact /> : null}
            {state.side === 'manual' ? <ManualInput onDone={manualDone} onCancel={() => dispatch({ type: 'closeSide' })} /> : null}
          </SideDrawer>
        ) : null}
      </div>
      {dragging ? <DropHint /> : null}
      <Busy text={state.busy} />
      <Toast text={state.toast} />
      {hiddenInput}
    </div>
  );
}

function DropHint() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[65] flex items-center justify-center border-4 border-dashed border-ink bg-surface/70 text-[18px] font-bold">
      여기에 학생부 PDF를 놓으세요
    </div>
  );
}

/** 인쇄 전용: 상담 메모와 기록별 메모 */
function PrintNotes({ an, student }: { an: ReturnType<typeof useAnalysis> & object; student: StudentEntry }) {
  const rm = Object.entries(student.recMemo || {}).filter(([id]) => an.recs.some((r) => r.id === id));
  if (!(student.memo || '').trim() && !rm.length) return null;
  return (
    <section className="hidden print:block mt-6 text-[12px]">
      <h2 className="text-[15px] font-bold">상담 메모</h2>
      {(student.memo || '').trim() ? <p className="whitespace-pre-wrap">{student.memo}</p> : null}
      {rm.length ? (
        <ul className="list-disc pl-5">
          {rm.map(([id, t]) => { const r = an.recs.find((x) => x.id === id)!; return <li key={id}><b>{r.subj} ({semLabel(r)})</b> {t}</li>; })}
        </ul>
      ) : null}
    </section>
  );
}
