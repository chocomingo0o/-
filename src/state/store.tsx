/**
 * 앱 전역 상태. useReducer + Context.
 * 학생 데이터는 메모리에만 있고 창을 닫으면 사라진다(표현 사전만 localStorage).
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
  | { type: 'addStudents'; entries: StudentEntry[]; errors?: FileError[] }
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
      return { ...s, students, cur: students.length - 1, sel: null, theme: null, mSel: null, side: null, errors: a.errors ?? [], dirty: true };
    }
    case 'selectStudent':
      return { ...s, cur: a.index, sel: null, theme: null, mSel: null, side: null };
    case 'setView':
      return { ...s, view: a.view, sel: null, mSel: null, side: s.side === 'note' ? 'note' : null };
    case 'openRecord':
      return { ...s, sel: a.id, side: 'rec' };
    case 'closeSide':
      return { ...s, side: null, sel: null, mSel: null };
    case 'openSide':
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
      const recMemo = { ...(st.recMemo || {}) };
      if (a.text.trim()) recMemo[a.id] = a.text;
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
