import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from './state/store';
import { useAnalysis, dropAnalysisCache } from './hooks/useAnalysis';
import { ingestFiles } from './lib/files';
import { download, makeWorkFile, mergeUserDict, todayStamp } from './lib/storage';
import { isDark, restoreTheme, toggleTheme } from './lib/theme';
import { blindName, uid } from './lib/utils';
import { sampleStudent } from './fixtures/sample';
import type { StudentEntry } from './engine/types';
import { semLabel } from './engine/analyze';
import { LANE } from './engine/dict/subjects';
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
  const [dark, setDark] = useState(false);
  /** 직접 입력 창에 적은 내용이 있는지(창을 닫기 전 확인용). ManualInput이 알려 준다. */
  const manualDirty = useRef(false);

  useEffect(() => { restoreTheme(); setDark(isDark()); }, []);

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

  /** 직접 입력 창 닫기. 적은 내용이 있으면 확인을 받는다(한글 입력 중 Esc, 바깥 클릭으로 내용이 사라지지 않게). */
  const closeManual = useCallback(() => {
    if (manualDirty.current && !confirm('직접 입력 창에 적은 내용이 있습니다. 닫으면 사라집니다. 닫을까요?')) return;
    manualDirty.current = false;
    dispatch({ type: 'closeSide' });
  }, [dispatch]);

  // Esc: 옆 창 닫기 → 관심 주제 강조 해제 → 넓게 보기 해제. 한글 조합 중(IME) Esc는 글자 취소이므로 건너뛴다.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return;
      if (state.side === 'manual') closeManual();
      else if (state.side) dispatch({ type: 'closeSide' });
      else if (state.theme) dispatch({ type: 'setTheme', theme: null });
      else if (state.wide) dispatch({ type: 'toggleWide', value: false });
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [state.side, state.theme, state.wide, dispatch, closeManual]);

  const toast = useCallback((text: string) => dispatch({ type: 'toast', text }), [dispatch]);

  const handleFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    dispatch({ type: 'setBusy', text: '학생부를 읽는 중입니다' });
    try {
      const res = await ingestFiles(files, (t) => dispatch({ type: 'setBusy', text: t }));
      if (res.dicts.length) {
        let dict = state.userDict;
        for (const d of res.dicts) dict = mergeUserDict(dict, d);
        // 새 표현이 없으면(작업 파일에 든 사전이 이미 있는 것과 같으면) 바꾸지 않는다. 그래야 불러오기만 해도 '저장하지 않은 메모' 확인이 뜨지 않는다.
        if (JSON.stringify(dict) !== JSON.stringify(state.userDict)) {
          dropAnalysisCache();
          dispatch({ type: 'setUserDict', dict });
        }
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
    // 공백만 남은 기록 메모는 저장하지 않는다
    const students = state.students.map((s) => ({ ...s, recMemo: Object.fromEntries(Object.entries(s.recMemo || {}).filter(([, t]) => t.trim())) }));
    download(`탐구분석지도_작업_${todayStamp(now)}.json`, JSON.stringify(makeWorkFile(students, state.userDict, now)));
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
    manualDirty.current = false;
    dispatch({ type: 'addStudents', entries: [entry], dirty: true });
    toast('직접 입력한 기록을 분석했습니다.');
  }, [dispatch, toast]);
  const onManualDirty = useCallback((d: boolean) => { manualDirty.current = d; }, []);
  const manualInput = <ManualInput onDone={manualDone} onCancel={closeManual} onDirty={onManualDirty} />;

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
          <div className="fixed inset-0 z-50 flex justify-end bg-scrim" onClick={closeManual}>
            {/* flex로 감싸 옆 창이 화면 아래까지 늘어나게 한다(md 이상에서 aside는 static) */}
            <div onClick={(e) => e.stopPropagation()} className="flex h-full max-w-full">
              <SideDrawer open kicker="붙여 넣기" title="직접 입력" onClose={closeManual} defaultWidth={620}>
                {manualInput}
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
  // 이름 가리기는 옆 창 머리글에도 적용한다(파일 이름은 StudentHead가 따로 가린다)
  const shownName = state.blind ? blindName(student.data.meta.name || '') : (student.data.meta.name || '');
  const sideTitle: Record<string, { kicker: string; title: string; width?: number }> = {
    rec: { kicker: selRec ? `${selRec.kind} · ${LANE[selRec.lane]?.label ?? selRec.lane} · ${semLabel(selRec)}` : '', title: selRec?.subj || '' },
    mlist: { kicker: '근거 문장', title: '탐구 방법', width: Math.max(360, Math.min(620, Math.round(window.innerWidth * 0.42))) },
    dict: { kicker: shownName, title: '표현 사전' },
    note: { kicker: shownName, title: '상담 노트' },
    manual: { kicker: '붙여 넣기', title: '직접 입력', width: 620 },
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
          dark={dark}
          onSelect={(i) => dispatch({ type: 'selectStudent', index: i })}
          onView={(v) => dispatch({ type: 'setView', view: v })}
          onAddFiles={() => fileInput.current?.click()}
          onDict={() => dispatch(state.side === 'dict' ? { type: 'closeSide' } : { type: 'openSide', side: 'dict' })}
          onNotes={() => dispatch(state.side === 'note' ? { type: 'closeSide' } : { type: 'openSide', side: 'note' })}
          onBlind={() => dispatch({ type: 'toggleBlind' })}
          onSave={saveWork}
          onPrint={() => setTimeout(() => window.print(), 60)}
          onWipe={wipe}
          onTheme={() => setDark(toggleTheme() === 'dark')}
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
          <SideDrawer open kicker={side.kicker} title={side.title} defaultWidth={side.width} onClose={state.side === 'manual' ? closeManual : () => dispatch({ type: 'closeSide' })}>
            {state.side === 'rec' && state.sel ? <RecordDrawer an={an} student={student} id={state.sel} /> : null}
            {state.side === 'mlist' && state.mSel ? <MethodList an={an} student={student} sel={state.mSel} /> : null}
            {state.side === 'dict' ? <DictPanel an={an} student={student} /> : null}
            {state.side === 'note' ? <NotesView an={an} student={student} compact /> : null}
            {state.side === 'manual' ? manualInput : null}
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
  const rm = Object.entries(student.recMemo || {}).filter(([id, t]) => t.trim() && an.recs.some((r) => r.id === id));
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
