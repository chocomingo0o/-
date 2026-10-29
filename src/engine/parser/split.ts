/**
 * 한 PDF에 여러 학생이 이어 붙어 있을 때 학생별로 나누기.
 *
 * NEIS 학생부는 쪽마다 아래쪽에 '3 / 12' 같은 쪽수를 찍는다. 학생이 바뀌면 쪽수가 다시 1부터 시작하므로,
 * 쪽수 k가 1인 쪽을 만날 때마다 새 학생으로 본다. 쪽수가 한 번도 안 보이면 전체를 한 학생으로 본다.
 */
import type { Page } from '../types';

/** 쪽 아래(y<80) 글자에서 'k / n' 쪽수를 찾는다. 없으면 null */
export function footerOf(page: Page): { k: number; n: number } | null {
  const low = page.items.filter(i => i.y < 80).sort((a, b) => a.x - b.x).map(i => i.s).join(' ');
  const m = /(\d{1,3})\s*\/\s*(\d{1,3})/.exec(low);
  return m ? { k: +m[1], n: +m[2] } : null;
}

/** 쪽 목록 → 학생별 쪽 묶음 */
export function splitStudents<P extends Page>(pages: P[]): P[][] {
  const groups: P[][] = [];
  let cur: P[] = [];
  let seen = false;
  for (const pg of pages) {
    const f = footerOf(pg);
    if (f) seen = true;
    if (f && f.k === 1 && cur.length) { groups.push(cur); cur = []; }
    cur.push(pg);
  }
  if (cur.length) groups.push(cur);
  return seen && groups.length > 1 ? groups : [pages];
}
