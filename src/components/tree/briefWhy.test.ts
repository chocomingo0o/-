import { describe, expect, it } from 'vitest';
import type { Link, Rec } from '../../engine/types';
import { briefWhy } from './RecordCard';

const from = { year: 1, subj: '통합과학1' } as Rec;
const link = (rel: Link['rel'], why: string): Link => ({ rel, why } as Link);

describe('briefWhy (카드 안 연결 이유 한 줄)', () => {
  it('앞 기록과 엔진 why를 " / "로 잇고 종류 이름은 넣지 않는다(KindChip이 보여 준다)', () => {
    const s = briefWhy(link('심화', '카탈레이스 / 깊이 2→3'), from);
    expect(s).toBe('← 1학년 통합과학1 / 카탈레이스 / 깊이 2→3');
    expect(s).not.toContain('심화');
    expect(s).not.toContain(' · ');
  });
  it('why가 비어 있으면 앞 기록만 적는다', () => {
    expect(briefWhy(link('동시', ''), from)).toBe('← 1학년 통합과학1');
  });
  it('엔진 why 형식이 바뀌어도 토막을 자르거나 다시 잇지 않는다(그대로 보여 준다)', () => {
    expect(briefWhy(link('반복', '생명과학 / 깊이 2→2'), from)).toBe('← 1학년 통합과학1 / 생명과학 / 깊이 2→2');
  });
});
