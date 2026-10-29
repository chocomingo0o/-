/** 밝게/어둡게 전환. data-theme 속성으로 CSS 토큰이 바뀝니다. */
import { THEME_KEY } from './storage';

export type Theme = 'light' | 'dark' | null;

export function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : null;
}

export function isDark(): boolean {
  const t = currentTheme();
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(t: Theme): void {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  try {
    if (t) localStorage.setItem(THEME_KEY, t);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    /* 무시 */
  }
}

export function toggleTheme(): Theme {
  const next: Theme = isDark() ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

export function restoreTheme(): void {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark') applyTheme(t);
  } catch {
    /* 무시 */
  }
}
