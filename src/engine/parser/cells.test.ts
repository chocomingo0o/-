/**
 * 셀 만들기 단위 테스트: 글자와 사각형을 손으로 만든 Page로 cellText / joinLines / buildCells / 격자 fallback을 검증한다.
 */
import { describe, expect, it } from 'vitest';
import type { Page, TextItem } from '../types';
import type { Line } from '../pdf/extract';
import { buildCells, cellText, gridCellsFromLines, joinLines } from './cells';

const T = (s: string, x: number, y: number, w = s.length * 5): TextItem => ({ s, x, y, w });

describe('cellText', () => {
  it('y가 2.6 이내면 같은 줄로 묶고, 줄은 위에서 아래, 줄 안은 왼쪽부터 잇는다', () => {
    const items = [T('나', 20, 100), T('가', 10, 100), T('다', 30, 98.5), T('라', 10, 88)];
    expect(cellText(items)).toEqual(['가나다', '라']);
  });
  it('공백을 정규화하고 빈 줄은 버린다', () => {
    expect(cellText([T('가', 10, 50), T(' ', 15, 50), T(' ', 17, 50), T('나', 20, 50), T('  ', 10, 30)])).toEqual(['가 나']);
  });
  it('입력 배열의 순서를 바꾸지 않는다', () => {
    const items = [T('나', 20, 100), T('가', 10, 100)];
    cellText(items);
    expect(items[0].s).toBe('나');
  });
});

describe('joinLines', () => {
  it('줄 끝이 조사·어미·문장부호면 띄어서 잇는다', () => {
    expect(joinLines(['실험을', '진행함.'])).toBe('실험을 진행함.');
    expect(joinLines(['결과를 정리함.', '이후 발표함.'])).toBe('결과를 정리함. 이후 발표함.');
  });
  it('한글 낱말이 줄 끝에서 끊기면 붙여 잇는다', () => {
    expect(joinLines(['탐구', '보고서'])).toBe('탐구보고서');
  });
  it('다음 줄이 문장부호로 시작하면 붙여 잇는다', () => {
    expect(joinLines(['측정함', '.'])).toBe('측정함.');
    expect(joinLines(['(가설', ')을 세움'])).toBe('(가설)을 세움');
  });
  it('줄 끝에 공백이 있으면 그대로 잇고 공백을 정규화한다', () => {
    expect(joinLines(['결과 ', '분석'])).toBe('결과 분석');
    expect(joinLines([])).toBe('');
  });
});

describe('buildCells', () => {
  // 바깥 사각형(A, B, C 세 개를 품음) + 셀 A 안에 작은 셀 D
  const page: Page = {
    rects: [
      { x: 10, y: 100, w: 300, h: 100 },      // 바깥 사각형 → 제외
      { x: 10, y: 150, w: 150, h: 50 },       // A
      { x: 160, y: 150, w: 150, h: 50 },      // B
      { x: 10, y: 100, w: 300, h: 50 },       // C
      { x: 20, y: 160, w: 50, h: 20 },        // D (A 안)
      { x: 10, y: 100, w: 300, h: 2 },        // 가느다란 선 → 셀 아님
      { x: 10, y: 10, w: 100, h: 10 },        // 쪽수 영역(y<26) → 제외
      { x: 10, y: 40, w: 100, h: 15 },        // 머리글 영역(y<64, h<22) → 제외
      { x: 10, y: 40, w: 100, h: 30 },        // y<64 이지만 h>=22 → 유지
    ],
    items: [
      T('가', 25, 165),   // D(가장 작은 셀)
      T('나', 100, 160),  // A
      T('다', 170, 170),  // B
      T('라', 50, 120),   // C
      T('마', 400, 120),  // 어느 셀에도 없음
      T('바', 20, 60),    // 유지되는 아래쪽 셀(h=30)에만 들어감. 제외되는 h=15 셀에 들어간 글자는 함께 버려진다
      T('사', 20, 45),    // h=15 셀(제외됨)에 들어가므로 결과에 안 나옴
    ],
  };
  const { cells, free } = buildCells(page, 3);
  const at = (x: number, y: number) => cells.find(c => c.x === x && c.y === y);

  it('바깥 사각형과 가느다란 사각형, 머리글·쪽수 영역 셀을 뺀다', () => {
    expect(cells).toHaveLength(5);
    expect(at(10, 100)?.w === 300 && at(10, 100)?.h === 50).toBe(true);
    expect(cells.some(c => c.h === 100)).toBe(false);
    expect(cells.some(c => c.y === 10)).toBe(false);
    expect(cells.some(c => c.y === 40 && c.h === 15)).toBe(false);
  });
  it('글자는 자기를 품는 가장 작은 셀에 들어간다', () => {
    expect(at(20, 160)?.text).toBe('가');
    expect(at(10, 150)?.text).toBe('나');
    expect(at(160, 150)?.text).toBe('다');
    expect(at(10, 100)?.text).toBe('라');
    expect(at(10, 40)?.text).toBe('바');
    expect(cells.some(c => c.text.includes('사'))).toBe(false);
  });
  it('셀 밖 글자는 free로 돌려준다', () => {
    expect(free.map(i => i.s)).toEqual(['마']);
  });
  it('top = y + h, page는 인자로 받은 값', () => {
    expect(at(10, 150)?.top).toBe(200);
    expect(at(10, 150)?.page).toBe(3);
  });
  it('여러 줄 글자는 lines로 나뉘고 text는 공백으로 이어진다', () => {
    const pg: Page = {
      rects: [{ x: 10, y: 100, w: 200, h: 40 }],
      items: [T('첫째 줄', 12, 128), T('둘째 줄', 12, 112)],
    };
    const c = buildCells(pg).cells[0];
    expect(c.lines).toEqual(['첫째 줄', '둘째 줄']);
    expect(c.text).toBe('첫째 줄 둘째 줄');
  });
  it('글자 판정 y는 글자 y+2 (셀 아래 경계 바로 밑의 글자도 셀 안으로)', () => {
    const pg: Page = { rects: [{ x: 10, y: 100, w: 100, h: 20 }], items: [T('가', 12, 98.5)] };
    expect(buildCells(pg).cells[0].text).toBe('가');
  });
});

describe('gridCellsFromLines', () => {
  // 3열 × 2행 표. 아래 행의 2~3열은 병합(가운데 세로선 없음). 윗변은 칸마다 따로 그린 선분 3개.
  const lines: Line[] = [
    { x1: 10, y1: 200, x2: 110, y2: 200 }, { x1: 110, y1: 200, x2: 210, y2: 200 }, { x1: 210, y1: 200, x2: 310, y2: 200 },
    { x1: 10, y1: 150, x2: 310, y2: 150 },
    { x1: 10, y1: 100, x2: 310, y2: 100 },
    { x1: 10, y1: 100, x2: 10, y2: 200 },
    { x1: 110, y1: 100, x2: 110, y2: 200 },
    { x1: 210, y1: 150, x2: 210, y2: 200 },   // 윗 행에만 있는 세로선
    { x1: 310, y1: 100, x2: 310, y2: 200 },
  ];
  it('가장 작은 닫힌 칸을 찾고 병합 칸도 하나로 잡는다', () => {
    const cells = gridCellsFromLines(lines).sort((a, b) => b.y - a.y || a.x - b.x);
    expect(cells).toEqual([
      { x: 10, y: 150, w: 100, h: 50 }, { x: 110, y: 150, w: 100, h: 50 }, { x: 210, y: 150, w: 100, h: 50 },
      { x: 10, y: 100, w: 100, h: 50 }, { x: 110, y: 100, w: 200, h: 50 },
    ]);
  });
  it('buildCells는 사각형이 거의 없고 선분이 많으면 격자에서 셀을 되살린다', () => {
    const page: Page & { lines?: Line[] } = {
      rects: [],
      lines,
      items: [T('가', 15, 170), T('나', 115, 170), T('다', 215, 170), T('라', 15, 120), T('마', 250, 120)],
    };
    const { cells, free } = buildCells(page);
    expect(cells).toHaveLength(5);
    expect(free).toHaveLength(0);
    const merged = cells.find(c => c.w === 200);
    expect(merged?.text).toBe('마');
  });
  it('선분이 적으면 fallback을 쓰지 않는다', () => {
    const page: Page & { lines?: Line[] } = { rects: [], lines: lines.slice(0, 3), items: [T('가', 15, 170)] };
    const { cells, free } = buildCells(page);
    expect(cells).toHaveLength(0);
    expect(free).toHaveLength(1);
  });
});
