import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 이름 가리기: '이도윤' → '이○○' */
export function blindName(name: string): string {
  if (!name) return '이름 없음';
  return name[0] + '○'.repeat(Math.max(1, name.length - 1));
}

export function uid(prefix = 'st'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
