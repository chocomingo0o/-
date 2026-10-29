/**
 * PDF E2E 테스트.
 * pdf-lib로 NEIS 학생부와 비슷한 PDF를 합성(표 칸마다 테두리 사각형 + Noto Sans KR 글자)하고,
 * pdf.js(legacy 빌드)로 읽어 extractPages → splitStudents → parseStudent 가 끝까지 도는지 확인한다.
 * 좌표는 PDF 좌표(원점 왼쪽 아래, y 위로 증가). 머리글·쪽수 제외 규칙 때문에 표는 y>=80 영역에 그린다.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { extractPages, rectsFromOperatorList, type ExtractedPage, type PdfJsLike } from './extract';
import { parseStudent } from '../parser/parse';
import { splitStudents } from '../parser/split';

const require = createRequire(import.meta.url);

/* ───────────── 합성 PDF ───────────── */
const DIST = 'A(32.1) B(25.3) C(20.1) D(12.5) E(10.0)';
const GCOLS: [number, number][] = [[30, 30], [60, 50], [110, 90], [200, 30], [230, 95], [325, 60], [385, 100], [485, 40], [525, 40]];
const GHEAD: (string | string[])[] = ['학기', '교과', '과목', '학점', ['원점수/과목평균', '(표준편차)'], ['성취도', '(수강자수)'], ['성취도별', '분포비율'], '석차등급', '비고'];
const ROWS: string[][] = [
  ['1', '과학', '통합과학1', '4', '84/71.2(14.6)', 'A(248)', DIST, '2', ''],
  ['1', '국어', '공통국어1', '4', '88/75.3(12.1)', 'A(250)', DIST, '1', ''],
  ['1', '수학', '공통수학1', '4', '79/68.4(15.2)', 'B(250)', DIST, '3', ''],
  ['', '과학', '과학탐구실험1', '1', '', 'P', '', '', ''],
  ['1', '기술·가정/정보', '정보', '2', '92/80.1(10.3)', 'A(250)', DIST, '1', ''],
];
const SETEUK_LINES = [
  '통합과학1: 전압과 전류의 관계를 알아보는 실험에서 저항을 바꾸어 가며 전류를 측정함.',
  '측정값을 그래프로 나타내고 이론값과의 차이를 오차 원인과 함께 분석함.',
  '(1학기)과학탐구실험1: 물의 전기분해 실험을 설계하고 변인을 통제하여 기체 발생량을 비교함.',
  '실험 후 보고서를 작성하여 발표함.',
];
const CC: [string, string, string[]][] = [
  ['자율·자치활동', '34', ['학급 회의에서 안건을 제안하고', '의견을 조율함.']],
  ['동아리활동', '30', ['(과학탐구반) 식물의 광합성 속도를', '측정하는 실험을 설계함.']],
  ['진로활동', '20', ['진로 탐색 활동에서 생명공학 분야를', '조사하고 발표함.']],
];

function sheet(page: PDFPage, font: PDFFont) {
  /** 테두리만 있는 칸 + 글자(여러 줄 가능). 글자 기준선은 칸 위에서 12씩 내려간다. */
  const box = (x: number, y: number, w: number, h: number, text: string | string[] = '', size = 9) => {
    page.drawRectangle({ x, y, width: w, height: h, borderWidth: 0.5, borderColor: rgb(0, 0, 0) });
    const lines = Array.isArray(text) ? text : text ? [text] : [];
    lines.forEach((ln, i) => page.drawText(ln, { x: x + 3, y: y + h - 12 - i * 12, size, font }));
  };
  const text = (s: string, x: number, y: number, size = 9) => page.drawText(s, { x, y, size, font });
  const rowOf = (cols: [number, number][], y: number, h: number, vals: (string | string[])[], size = 8) =>
    cols.forEach(([x, w], i) => box(x, y, w, h, vals[i] ?? '', size));
  return { box, text, rowOf };
}

/** 학생 한 명(3쪽)을 그린다 */
function drawStudent(doc: PDFDocument, font: PDFFont, name: string, school: string) {
  // 1쪽: 인적·학적사항, 창체
  {
    const pg = doc.addPage([595, 842]);
    const { box, text, rowOf } = sheet(pg, font);
    box(30, 800, 535, 18, '1. 인적·학적사항');
    box(30, 776, 535, 22, `성명 : ${name}`);
    box(30, 754, 80, 22, '학적사항'); box(110, 754, 455, 22, `2025년 03월 02일 ${school} 제1학년 입학`);
    box(30, 720, 535, 18, '6. 창의적 체험활동상황');
    rowOf([[30, 40], [70, 80], [150, 40], [190, 375]], 696, 22, ['학년', '영역', '시간', '특기사항'], 9);
    box(30, 494, 40, 202, '1');
    CC.forEach(([area, hour, lines], i) => {
      const y = 636 - i * 60;
      box(70, y, 80, 60, area, 8); box(150, y, 40, 60, hour); box(190, y, 375, 60, lines);
    });
    box(70, 494, 80, 22, '희망분야'); box(150, 494, 415, 22, '생명공학 연구원');
    text('1 / 3', 280, 20);
  }
  // 2쪽: 교과학습발달상황
  {
    const pg = doc.addPage([595, 842]);
    const { box, text, rowOf } = sheet(pg, font);
    box(30, 800, 535, 18, '7. 교과학습발달상황');
    box(30, 780, 60, 16, '[1학년]');
    rowOf(GCOLS, 740, 36, GHEAD, 7);
    ROWS.forEach((r, i) => rowOf(GCOLS, 718 - i * 22, 22, r.map((v, k) => (k === 6 ? v : v)), 6));
    box(30, 718 - ROWS.length * 22, 535, 22, '이수학점 합계 15');
    const sy = 718 - ROWS.length * 22 - 26;
    box(30, sy, 535, 22, '과목 세부능력 및 특기사항');
    const bodyH = SETEUK_LINES.length * 12 + 8;
    box(30, sy - bodyH, 535, bodyH, SETEUK_LINES);
    text('2 / 3', 280, 20);
  }
  // 3쪽: 행동특성 및 종합의견
  {
    const pg = doc.addPage([595, 842]);
    const { box, text } = sheet(pg, font);
    box(30, 800, 535, 18, '9. 행동특성 및 종합의견');
    box(30, 770, 40, 22, '학년'); box(70, 770, 495, 22, '행동특성 및 종합의견');
    box(30, 690, 40, 80, '1'); box(70, 690, 495, 80, ['책임감이 강하고 맡은 일을 끝까지 해냄.', '친구들의 의견을 경청함.']);
    text('3 / 3', 280, 20);
  }
}

async function buildPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(require('@pdf-lib/fontkit'));
  const fontPath = require.resolve('@expo-google-fonts/noto-sans-kr/400Regular/NotoSansKR_400Regular.ttf');
  const font = await doc.embedFont(readFileSync(fontPath), { subset: true });
  drawStudent(doc, font, '김가상', '대한고등학교');
  drawStudent(doc, font, '이가상', '한국고등학교');
  return doc.save();
}

/* ───────────── 테스트 ───────────── */
let pdfjs: PdfJsLike;
let bytes: Uint8Array;
let pages: ExtractedPage[];
const progress: [number, number][] = [];

beforeAll(async () => {
  pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike;
  bytes = await buildPdf();
  pages = await extractPages(new Uint8Array(bytes), pdfjs, (p, n) => progress.push([p, n]));
});

describe('extractPages (pdf.js v6)', () => {
  it('쪽마다 글자와 표 칸 사각형을 모으고 진행 알림을 보낸다', () => {
    expect(pages).toHaveLength(6);
    expect(progress).toHaveLength(6);
    expect(progress[0]).toEqual([1, 6]);
    expect(progress[5]).toEqual([6, 6]);
    // 1쪽: 제목 2 + 인적 3 + 창체 머리글 4 + 학년 1 + 영역 3×3 + 희망분야 2 = 21
    expect(pages[0].rects).toHaveLength(21);
    expect(pages[0].items.some(i => i.s.includes('김가상'))).toBe(true);
    // 변환 행렬(transform)이 적용되어 쪽 좌표로 나온다
    expect(pages[0].rects.some(r => Math.abs(r.x - 30) < 0.01 && Math.abs(r.y - 800) < 0.01 && Math.abs(r.w - 535) < 0.01 && Math.abs(r.h - 18) < 0.01)).toBe(true);
    expect(Array.isArray(pages[0].lines)).toBe(true);
  });
  it('글자 좌표는 기준선 기준 PDF 좌표', () => {
    const t = pages[0].items.find(i => i.s.startsWith('1 / 3'));
    expect(t).toBeDefined();
    expect(t!.y).toBeCloseTo(20, 1);
    expect(t!.x).toBeCloseTo(280, 1);
    expect(t!.w).toBeGreaterThan(5);
  });
});

describe('rectsFromOperatorList (연산 목록 직접 구성)', () => {
  const f32 = (a: number[]) => new Float32Array(a);
  it('v6 형식: CTM을 적용하고, 유채색 채움(형광펜)은 빼며, 가느다란 사각형과 선분은 lines로', () => {
    const O = pdfjs.OPS;
    const rectPath = (w: number, h: number) => f32([0, 0, 0, 1, 0, h, 1, w, h, 1, w, 0, 4]);
    const fnArray = [
      O.save, O.transform, O.constructPath, O.restore,                       // 테두리 칸 (50,700,200,30)
      O.save, O.setFillRGBColor, O.transform, O.constructPath, O.restore,    // 노란 채움 → 형광펜 → 제외
      O.save, O.setFillRGBColor, O.constructPath, O.restore,                 // 흰 채움 → 유지 (10,10,20,20)
      O.constructPath,                                                       // 가느다란 사각형 → 선분
      O.constructPath,                                                       // moveTo-lineTo 선분(점 중복)
      O.save, O.transform, O.constructPath, O.restore,                       // 같은 칸 다시 → 중복 제거
      O.constructPath,                                                       // 곡선 → 무시
    ];
    const argsArray: any[] = [
      null, [1, 0, 0, 1, 50, 700], [O.stroke, [rectPath(200, 30)], f32([0, 0, 200, 30])], null,
      null, ['#ffff00'], [1, 0, 0, 1, 50, 650], [O.fill, [rectPath(200, 30)], f32([0, 0, 200, 30])], null,
      null, ['#ffffff'], [O.fill, [f32([0, 10, 10, 1, 30, 10, 1, 30, 30, 1, 10, 30, 1, 10, 10])], f32([10, 10, 30, 30])], null,
      [O.fill, [f32([0, 100, 500, 1, 300, 500, 1, 300, 501, 1, 100, 501, 4])], f32([100, 500, 300, 501])],
      [O.stroke, [f32([0, 50, 600, 0, 50, 600, 1, 250, 600])], f32([50, 600, 250, 600])],
      null, [1, 0, 0, 1, 50, 700], [O.stroke, [rectPath(200, 30)], f32([0, 0, 200, 30])], null,
      [O.stroke, [f32([0, 0, 0, 2, 10, 10, 20, 20, 30, 0, 4])], f32([0, 0, 30, 20])],
    ];
    const { rects, lines } = rectsFromOperatorList({ fnArray, argsArray }, O);
    expect(rects).toEqual([{ x: 50, y: 700, w: 200, h: 30 }, { x: 10, y: 10, w: 20, h: 20 }]);
    expect(lines).toEqual([{ x1: 100, y1: 500.5, x2: 300, y2: 500.5 }, { x1: 50, y1: 600, x2: 250, y2: 600 }]);
  });
  it('구버전 형식: ops 배열 안의 OPS.rectangle과 다음 연산의 채움', () => {
    const O = pdfjs.OPS;
    const fnArray = [O.setFillRGBColor, O.constructPath, O.fill, O.setFillGray, O.constructPath, O.fill, O.setFillCMYKColor, O.constructPath, O.eoFill, O.constructPath, O.stroke];
    const argsArray: any[] = [
      [255, 255, 0], [[O.rectangle], [10, 10, 50, 20]], null,                       // 유채색 채움 → 제외
      [0.5], [[O.rectangle], [10, 100, 50, -20]], null,                              // 회색 채움, 음수 높이 → (10,80,50,20)
      [0, 0, 0, 1], [[O.rectangle, O.rectangle], [0, 0, 5, 5, 60, 60, 10, 10]], null, // 검정 CMYK → 유지(2개)
      [[O.moveTo, O.lineTo, O.lineTo, O.lineTo, O.closePath], [200, 200, 200, 240, 300, 240, 300, 200]], null, // 선으로 그린 사각형
    ];
    const { rects } = rectsFromOperatorList({ fnArray, argsArray }, O);
    expect(rects).toEqual([{ x: 10, y: 80, w: 50, h: 20 }, { x: 0, y: 0, w: 5, h: 5 }, { x: 60, y: 60, w: 10, h: 10 }, { x: 200, y: 200, w: 100, h: 40 }]);
  });
});

describe('splitStudents + parseStudent (합성 학생부 2명, 6쪽)', () => {
  it('쪽수 "1 / n"이 다시 나오면 새 학생', () => {
    const groups = splitStudents(pages);
    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.length)).toEqual([3, 3]);
  });
  it('첫 학생의 학생부를 끝까지 읽는다', () => {
    const [g1, g2] = splitStudents(pages);
    const S = parseStudent(g1);
    expect(S.warnings).toEqual([]);
    expect(S.meta.name).toBe('김가상');
    expect(S.meta.entry).toBe(2025);
    expect(S.meta.scale).toBe(5);
    expect(S.meta.curriculum).toBe(2022);
    expect(S.hakjeok).toEqual(['2025년 03월 02일 ○○고등학교 제1학년 입학']);
    // 성적표
    expect(S.courses.map(c => c.name)).toEqual(['통합과학1', '공통국어1', '공통수학1', '과학탐구실험1', '정보']);
    expect(S.courses.map(c => c.ach)).toEqual(['A', 'A', 'B', 'P', 'A']);
    expect(S.courses.map(c => c.rank)).toEqual([2, 1, 3, null, 1]);
    expect(S.courses.map(c => c.sem)).toEqual([1, 1, 1, 1, 1]);
    expect(S.courses[0]).toMatchObject({ year: 1, group: '과학', credit: 4, raw: 84, avg: 71.2, sd: 14.6, n: 248, kind: 'main' });
    expect(S.courses[4].group).toBe('기술·가정/정보');
    // 세특
    expect(S.seteuk).toHaveLength(2);
    expect(S.seteuk.map(s => s.names)).toEqual([['통합과학1'], ['과학탐구실험1']]);
    expect(S.seteuk[0].sem).toBeNull();
    expect(S.seteuk[0].text).toBe('전압과 전류의 관계를 알아보는 실험에서 저항을 바꾸어 가며 전류를 측정함. 측정값을 그래프로 나타내고 이론값과의 차이를 오차 원인과 함께 분석함.');
    expect(S.seteuk[1].sem).toBe(1);
    expect(S.seteuk[1].text).toBe('물의 전기분해 실험을 설계하고 변인을 통제하여 기체 발생량을 비교함. 실험 후 보고서를 작성하여 발표함.');
    // 창체·희망분야·행발
    expect(S.changche.map(c => [c.year, c.area, c.hours])).toEqual([[1, '자율·자치활동', 34], [1, '동아리활동', 30], [1, '진로활동', 20]]);
    expect(S.changche[1].text).toBe('(과학탐구반) 식물의 광합성 속도를 측정하는 실험을 설계함.');
    expect(S.hopes).toEqual([{ year: 1, text: '생명공학 연구원' }]);
    expect(S.behavior).toEqual([{ year: 1, text: '책임감이 강하고 맡은 일을 끝까지 해냄. 친구들의 의견을 경청함.' }]);
    expect(S.years).toEqual([1]);
    // 둘째 학생은 이름만 다르다
    const S2 = parseStudent(g2);
    expect(S2.meta.name).toBe('이가상');
    expect(S2.courses).toHaveLength(5);
    expect(S2.seteuk).toHaveLength(2);
  });
});
