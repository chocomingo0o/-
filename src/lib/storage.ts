/**
 * 브라우저 저장: 교사가 추가한 표현 사전(localStorage)과 작업 파일(.json) 내보내기/불러오기.
 * 학생 정보는 localStorage에 저장하지 않습니다(표현 사전 낱말만 저장).
 */
import type { StudentEntry, UserDict, WorkFile } from '../engine/types';

export const DICT_KEY = 'tamguMap.userDict.v1';
export const THEME_KEY = 'tamguMap.theme';

export function loadUserDict(): UserDict {
  try {
    const raw = localStorage.getItem(DICT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as UserDict) : {};
  } catch {
    return {};
  }
}

export function saveUserDict(dict: UserDict): void {
  try {
    localStorage.setItem(DICT_KEY, JSON.stringify(dict));
  } catch {
    /* 사생활 보호 모드 등에서는 저장이 막힐 수 있음 */
  }
}

/** 두 사전을 합칩니다(중복 제거). */
export function mergeUserDict(base: UserDict, add: UserDict | undefined | null): UserDict {
  const out: UserDict = { ...base };
  for (const [k, arr] of Object.entries(add || {})) {
    if (!Array.isArray(arr)) continue;
    const key = k as keyof UserDict;
    const cur = new Set(out[key] || []);
    for (const t of arr) if (typeof t === 'string' && t.trim().length >= 2) cur.add(t.trim());
    out[key] = [...cur];
  }
  return out;
}

export function download(name: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

export function makeWorkFile(students: StudentEntry[], userDict: UserDict, now: Date): WorkFile {
  return { app: 'tamgu-map', ver: 1, saved: now.toISOString(), userDict, students };
}

export function todayStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export type LoadedFile =
  | { kind: 'work'; file: WorkFile }
  | { kind: 'dict'; dict: UserDict }
  | { kind: 'error'; message: string };

/** .json 파일 내용을 판별합니다. 작업 파일 또는 표현 사전 파일. */
export function parseJsonFile(text: string): LoadedFile {
  try {
    const j = JSON.parse(text);
    if (j && j.app === 'tamgu-map' && Array.isArray(j.students)) return { kind: 'work', file: j as WorkFile };
    if (j && j.app === 'tamgu-map-dict' && j.dict) return { kind: 'dict', dict: j.dict as UserDict };
    // 참고 앱(모두의 탐구의 맥)의 표현 사전 파일도 받아 줍니다(방법 이름이 같으면 라벨→키로 바꿔야 하므로 UI에서 처리).
    if (j && (j.app === 'inquiry-dict' || j.app === 'inquiry-tree')) return { kind: 'error', message: '다른 앱의 파일입니다. 이 도구의 작업 파일(.json)만 불러올 수 있습니다.' };
    return { kind: 'error', message: '이 도구의 작업 파일이 아닙니다.' };
  } catch {
    return { kind: 'error', message: 'JSON 파일을 읽지 못했습니다.' };
  }
}
