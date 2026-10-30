/**
 * 앱 전역 상태. useReducer + Context.
 * 학생 데이터는 메모리에만 있고 창을 닫으면 사라진다. localStorage에는 표현 사전 낱말과 밝게/어둡게 설정만 둔다.
 */
import React, { createContext, useContext, useMemo, useReducer } from 'react';
import type { LinkKind, MethodKey, StudentEntry, UserDict } from '../engine/types';
import { loadUserDict, saveUserDict } from '../lib/storage';

export type View = 'tree' | 'method' | 'note';
export type Side = null | 'rec' | 'mlist' | 'dict' | 'note' | 'manual';
export interface MethodSel { t: 'sem' | 'lane'; m: MethodKey | '*'; c: string }
export interface FileError { file: string; msg: string }

export interface AppState {
  students: StudentEntry[];
  cur: number;
  view: View;
  sel: string | null;
  theme: string | null;
  linkFilter: 'all' | LinkKind;
  whyMode: 'off' | 'brief' | 'full';
  showFaint: boolean;
  zoom: number | null;
  blind: boolean;
  side: Side;
  mSel: MethodSel | null;
  userDict: UserDict;
  errors: FileError[];
  busy: string | null;
  toast: string | null;
  dirty: boolean;
  wide: boolean;
}

export const initialState: AppState = {
  students: [],
  cur: -1,
  view: 'tree',
  sel: null,
  theme: null,
  linkFilter: 'all',
  whyMode: 'brief',
  showFaint: true,
  zoom: null,
  blind: false,
  side: null,
  mSel: null,
  userDict: {},
  errors: [],
  busy: null,
  toast: null,
  dirty: false,
  wide: false,
};

export type Action =
  /** dirty: 직접 입력처럼 사용자가 쓴 내용이 들어올 때만 true. PDF·작업 파일·예시는 다시 불러올 수 있으므로 올리지 않는다. */
  | { type: 'addStudents'; entries: StudentEntry[]; errors?: FileError[]; dirty?: boolean }
  | { type: 'selectStudent'; index: number }
  | { type: 'setView'; view: View }
  | { type: 'openRecord'; id: string }
  | { type: 'closeSide' }
  | { type: 'openSide'; side: Exclude<Side, null> }
  | { type: 'setMethodSel'; sel: MethodSel | null }
  | { type: 'setTheme'; theme: string | null }
  | { type: 'setLinkFilter'; filter: 'all' | LinkKind }
  | { type: 'setWhyMode'; mode: 'off' | 'brief' | 'full' }
  | { type: 'toggleFaint' }
  | { type: 'setZoom'; zoom: number | null }
  | { type: 'toggleBlind' }
  | { type: 'toggleWide'; value?: boolean }
  | { type: 'setMemo'; text: string }
  | { type: 'setRecMemo'; id: string; text: string }
  | { type: 'setUserDict'; dict: UserDict }
  | { type: 'setBusy'; text: string | null }
  | { type: 'toast'; text: string | null }
  | { type: 'setErrors'; errors: FileError[] }
  | { type: 'markSaved' }
  | { type: 'wipe' };

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'addStudents': {
      if (!a.entries.length) return { ...s, errors: a.errors ?? s.errors };
      const students = [...s.students, ...a.entries];
      return { ...s, students, cur: students.length - 1, sel: null, theme: null, mSel: null, side: null, zoom: null, linkFilter: 'all', errors: a.errors ?? [], dirty: s.dirty || !!a.dirty };
    }
    case 'selectStudent':
      // 학생이 바뀌면 보기 상태(선택, 관심 주제, 옆 창, 배율 맞춤, 연결 종류)를 처음으로 돌린다. 약한 기록 표시는 보기 선호로 보고 둔다.
      return { ...s, cur: a.index, sel: null, theme: null, mSel: null, side: null, zoom: null, linkFilter: 'all' };
    case 'setView': {
      // 상담 노트 옆 창은 탭을 옮겨도 남기되, 상담 노트 탭에서는 같은 내용이 두 벌 보이므로 닫는다.
      // 탐구 방법 탭의 칸 선택(mSel)은 지우지 않고, 돌아오면 근거 문장 창을 다시 연다.
      const side: Side = s.side === 'note' ? (a.view === 'note' ? null : 'note') : a.view === 'method' && s.mSel ? 'mlist' : null;
      return { ...s, view: a.view, sel: null, side };
    }
    case 'openRecord':
      return { ...s, sel: a.id, side: 'rec' };
    case 'closeSide':
      return { ...s, side: null, sel: null, mSel: null };
    case 'openSide':
      if (a.side === 'note' && s.view === 'note') return s; // 상담 노트 탭을 보는 중에는 옆 창으로 다시 열지 않는다
      return { ...s, side: a.side, sel: a.side === 'rec' ? s.sel : null };
    case 'setMethodSel':
      return { ...s, mSel: a.sel, side: a.sel ? 'mlist' : null };
    case 'setTheme':
      return { ...s, theme: a.theme, sel: null, side: s.side === 'rec' ? null : s.side };
    case 'setLinkFilter':
      return { ...s, linkFilter: a.filter };
    case 'setWhyMode':
      return { ...s, whyMode: a.mode };
    case 'toggleFaint':
      return { ...s, showFaint: !s.showFaint };
    case 'setZoom':
      return { ...s, zoom: a.zoom };
    case 'toggleBlind':
      return { ...s, blind: !s.blind };
    case 'toggleWide':
      return { ...s, wide: a.value ?? !s.wide };
    case 'setMemo': {
      const st = s.students[s.cur];
      if (!st) return s;
      const students = s.students.slice();
      students[s.cur] = { ...st, memo: a.text };
      return { ...s, students, dirty: true };
    }
    case 'setRecMemo': {
      const st = s.students[s.cur];
      if (!st) return s;
      // 입력 중인 글은 그대로 둔다(첫 글자로 공백·줄바꿈도 칠 수 있게). 빈 문자열일 때만 지우고, 공백만 남은 메모는 저장·인쇄 때 걸러낸다.
      const recMemo = { ...(st.recMemo || {}) };
      if (a.text) recMemo[a.id] = a.text;
      else delete recMemo[a.id];
      const students = s.students.slice();
      students[s.cur] = { ...st, recMemo };
      return { ...s, students, dirty: true };
    }
    case 'setUserDict':
      saveUserDict(a.dict);
      return { ...s, userDict: a.dict, dirty: true };
    case 'setBusy':
      return { ...s, busy: a.text };
    case 'toast':
      return { ...s, toast: a.text };
    case 'setErrors':
      return { ...s, errors: a.errors };
    case 'markSaved':
      return { ...s, dirty: false };
    case 'wipe':
      return { ...initialState, userDict: s.userDict };
    default:
      return s;
  }
}

interface Ctx { state: AppState; dispatch: React.Dispatch<Action> }
const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, (init) => ({ ...init, userDict: loadUserDict() }));
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppProvider 안에서만 useApp을 쓸 수 있습니다.');
  return ctx;
}

export function useCurrentStudent(): StudentEntry | null {
  const { state } = useApp();
  return state.students[state.cur] ?? null;
}
