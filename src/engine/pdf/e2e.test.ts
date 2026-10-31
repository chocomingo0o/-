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
import { nos } from '../parser/cells';
import { analyze } from '../analyze/index';
import { sampleStudent2 } from '../../fixtures/sample2';
import type { Course, StudentRecord } from '../types';

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
  /** 테두리만 있는 칸 + 글자(여러 줄 가능). 글자 기준선은 칸 위에서 lead(기본 12)씩 내려간다. */
  const box = (x: number, y: number, w: number, h: number, text: string | string[] = '', size = 9, lead = 12) => {
    page.drawRectangle({ x, y, width: w, height: h, borderWidth: 0.5, borderColor: rgb(0, 0, 0) });
    const lines = Array.isArray(text) ? text : text ? [text] : [];
    lines.forEach((ln, i) => page.drawText(ln, { x: x + 3, y: y + h - lead - i * lead, size, font }));
  };
  const text = (s: string, x: number, y: number, size = 9) => page.drawText(s, { x, y, size, font });
  const rowOf = (cols: [number, number][], y: number, h: number, vals: (string | string[])[], size = 8, lead = 12) =>
    cols.forEach(([x, w], i) => box(x, y, w, h, vals[i] ?? '', size, lead));
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

/** pdf-lib 문서에 Noto Sans KR을 심는다 */
async function newDoc(): Promise<{ doc: PDFDocument; font: PDFFont }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(require('@pdf-lib/fontkit'));
  const fontPath = require.resolve('@expo-google-fonts/noto-sans-kr/400Regular/NotoSansKR_400Regular.ttf');
  const font = await doc.embedFont(readFileSync(fontPath), { subset: true });
  return { doc, font };
}

async function buildPdf(): Promise<Uint8Array> {
  const { doc, font } = await newDoc();
  drawStudent(doc, font, '김가상', '대한고등학교');
  drawStudent(doc, font, '이가상', '한국고등학교');
  return doc.save();
}

/* ───────────── 두 번째 가상 학생(sample2)의 일부로 만든 학생부 ───────────── */

/**
 * NEIS처럼 W글자마다 줄을 바꾼다. 공백도 한 글자로 세고, 줄이 바뀌는 자리에 걸린 공백 하나는 지운다
 * (줄 끝에 오면 그 줄에서, 다음 줄 첫머리에 오면 다음 줄에서). 그래서 어떤 줄도 공백으로 시작하거나 끝나지 않는다.
 */
function neisWrap(t: string, W: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < t.length) {
    let line = t.slice(i, i + W);
    i += W;
    if (line.endsWith(' ')) line = line.slice(0, -1);
    else if (t[i] === ' ') i++;
    out.push(line);
  }
  return out;
}

/** 공백이 아닌 글자 수 */
const nsLen = (s: string): number => nos(s).length;

/** 공백 자리: k번째(1부터) 공백 아닌 글자 바로 앞에 공백이 있으면 k를 넣는다 */
function spaceSlots(s: string): Set<number> {
  const out = new Set<number>();
  let k = 0;
  for (const ch of s) {
    if (/\s/.test(ch)) { if (k > 0) out.add(k); } else k++;
  }
  return out;
}

/**
 * 줄로 나눈 덩어리(머리 + 본문)에서 본문 기준 줄 경계 자리. 자리는 그 경계 앞에 있는 본문의 공백 아닌 글자 수로 적는다.
 * 머리('통합과학: ', '(생명실험탐구반)(34시간) ')는 파서가 떼어 내므로 빼고 센다.
 */
function breakSlots(head: string, lines: string[]): number[] {
  const out: number[] = [];
  let k = -nsLen(head);
  for (let j = 0; j < lines.length - 1; j++) {
    k += nsLen(lines[j]);
    if (k > 0) out.push(k);
  }
  return out;
}

/** 파싱한 본문과 원문의 띄어쓰기 비교: 줄 경계에서 맞은 수, 경계 수, 줄 경계가 아닌 자리에서 어긋난 수 */
function spacingAgreement(parsed: string, truth: string, breaks: number[]): { ok: number; n: number; offBreak: number } {
  const p = spaceSlots(parsed);
  const t = spaceSlots(truth);
  const at = new Set(breaks);
  let ok = 0;
  for (const k of breaks) if (p.has(k) === t.has(k)) ok++;
  let offBreak = 0;
  for (const k of new Set([...p, ...t])) if (!at.has(k) && p.has(k) !== t.has(k)) offBreak++;
  return { ok, n: breaks.length, offBreak };
}

const S2 = sampleStudent2();
/** 세특 한 줄 글자 수: 폭 535 칸(글자 영역 529)에 9pt 한글이 58자 들어간다 */
const W_SETEUK = 58;
/** 창체 특기사항 한 줄 글자 수: 폭 375 칸(글자 영역 369)에 9pt 한글 40자 */
const W_CC = 40;
/** 행동특성 한 줄 글자 수: 폭 495 칸(글자 영역 489)에 9pt 한글 54자 */
const W_BEH = 54;

const s2Seteuk = (name: string) => S2.seteuk.find((s) => s.year === 1 && s.names[0] === name)!;
const s2Changche = (year: number, area: string) => S2.changche.find((c) => c.year === year && c.area === area)!;
/** 1학년 성적표(석차등급이 있는 일반 과목, 1학기와 2학기)와 3학년 진로 선택 과목 */
const MAIN1: Course[] = S2.courses.filter((c) => c.year === 1 && c.kind === 'main');
const CAREER3: Course[] = S2.courses.filter((c) => c.year === 3 && c.kind === 'career');
/** 세특 세 덩어리: 과목 두 개와 학교자율과정. 줄머리는 NEIS 출력본 꼴 그대로 */
const SETEUK_BLOCKS: { head: string; name: string; text: string }[] = [
  { head: '통합과학: ', name: '통합과학', text: s2Seteuk('통합과학').text },
  { head: '정보: ', name: '정보', text: s2Seteuk('정보').text },
  { head: '학교자율과정 : ', name: '학교자율과정', text: s2Seteuk('학교자율과정').text },
];
/**
 * 동아리활동 특기사항 한 칸에 동아리 두 개. 가상 학생은 학년마다 동아리가 하나뿐이어서,
 * 한 칸에 두 동아리가 적힌 꼴을 만들려고 3학년 과학저널읽기반 기록을 1학년 칸에 함께 적는다.
 */
const CLUB_BLOCKS: { club: string; hours: number; text: string }[] = [
  { club: '생명실험탐구반', hours: 34, text: s2Changche(1, '동아리활동(생명실험탐구반)').text },
  { club: '과학저널읽기반', hours: 17, text: s2Changche(3, '동아리활동(과학저널읽기반)').text },
];
const clubHead = (b: { club: string; hours: number }): string => `(${b.club})(${b.hours}시간) `;
/** 앞 두 문장만 쓴다(한 쪽에 창체 표를 다 담으려고) */
const firstTwo = (t: string): string => t.split(/(?<=\.)\s/).slice(0, 2).join(' ');
const AUTO1 = firstTwo(s2Changche(1, '자율활동').text);
const CAREER1 = firstTwo(s2Changche(1, '진로활동').text);
const BEH1 = S2.behavior.find((b) => b.year === 1)!.text;

const fmt = (v: number | null): string => (v === null ? '' : String(v));
/** 좁은 칸의 긴 글자를 n글자씩 접는다('사회(역사/도덕포함)' → '사회(역사/', '도덕포함)') */
const fold = (s: string, n: number): string[] => s.match(new RegExp(`.{1,${n}}`, 'g')) ?? [];
/**
 * 성적표 한 줄. 교과 이름과 분포비율은 NEIS처럼 칸 안에서 여러 줄로 접는다.
 * 접지 않으면 긴 교과 이름이 옆 과목 칸까지 넘쳐 pdf.js가 두 글자 묶음을 하나로 합친다.
 */
function courseRow(c: Course, career: boolean): (string | string[])[] {
  const dist = c.dist.split(' ');
  const cut = Math.ceil(dist.length / 2);
  const distCell = [dist.slice(0, cut).join(' '), dist.slice(cut).join(' ')].filter(Boolean);
  const raw = `${fmt(c.raw)}/${fmt(c.avg)}${c.sd === null ? '' : `(${c.sd})`}`;
  const ach = `${c.ach}(${c.n})`;
  const group = fold(c.group, 7);
  return career
    ? [String(c.sem), group, c.name, String(c.credit), raw, ach, distCell, '']
    : [String(c.sem), group, c.name, String(c.credit), raw, ach, distCell, String(c.rank), ''];
}

/** 일반 과목 표 열(9칸)과 진로 선택 과목 표 열(8칸, 석차등급 없음) */
const MAIN_COLS: [number, number][] = GCOLS;
const MAIN_HEAD: (string | string[])[] = ['학기', '교과', '과목', '학점수', ['원점수/과목평균', '(표준편차)'], ['성취도', '(수강자수)'], ['성취도별', '분포비율'], '석차등급', '비고'];
const CAREER_COLS: [number, number][] = [[30, 30], [60, 50], [110, 90], [200, 30], [230, 95], [325, 60], [385, 140], [525, 40]];
/** 학점 칸 머리글이 옆 칸까지 넘쳐 '학점수 원점수/과목평균'이 한 칸에 찍히고, 원점수 칸 머리글은 비어 있는 출력본 */
const CAREER_HEAD: (string | string[])[] = ['학기', '교과', '과목', '학점수 원점수/과목평균', '', ['성취도', '(수강자수)'], ['성취도별', '분포비율'], '비고'];

async function buildPdf2(): Promise<Uint8Array> {
  const { doc, font } = await newDoc();
  const N = 4;
  // 1쪽: 인적·학적사항, 창체(1학년)
  {
    const pg = doc.addPage([595, 842]);
    const { box, text, rowOf } = sheet(pg, font);
    box(30, 800, 535, 18, '1. 인적·학적사항');
    box(30, 776, 535, 22, `성명 : ${S2.meta.name}`);
    box(30, 754, 80, 22, '학적사항'); box(110, 754, 455, 22, '2024년 03월 04일 한빛고등학교 제1학년 입학');
    box(30, 720, 535, 18, '6. 창의적 체험활동상황');
    rowOf([[30, 40], [70, 80], [150, 40], [190, 375]], 696, 22, ['학년', '영역', '시간', '특기사항'], 9);
    const rows: [string, string, string[]][] = [
      ['자율활동', '42', neisWrap(AUTO1, W_CC)],
      ['동아리활동', String(CLUB_BLOCKS.reduce((a, b) => a + b.hours, 0)), CLUB_BLOCKS.flatMap((b) => neisWrap(clubHead(b) + b.text, W_CC))],
      ['진로활동', '16', neisWrap(CAREER1, W_CC)],
    ];
    let y = 696;
    for (const [area, hour, lines] of rows) {
      const h = lines.length * 12 + 8;
      y -= h;
      box(70, y, 80, h, area, 8); box(150, y, 40, h, hour); box(190, y, 375, h, lines);
    }
    y -= 22;
    box(70, y, 80, 22, '희망분야'); box(150, y, 415, 22, S2.hopes[0].text);
    box(30, y, 40, 696 - y, '1');
    expect(y).toBeGreaterThan(80);
    text(`1 / ${N}`, 280, 20);
  }
  // 2쪽: 교과학습발달상황 1학년 성적표
  {
    const pg = doc.addPage([595, 842]);
    const { box, text, rowOf } = sheet(pg, font);
    box(30, 800, 535, 18, '7. 교과학습발달상황');
    box(30, 780, 60, 16, '[1학년]');
    rowOf(MAIN_COLS, 740, 36, MAIN_HEAD, 7);
    MAIN1.forEach((c, i) => rowOf(MAIN_COLS, 710 - i * 30, 30, courseRow(c, false), 6, 9));
    const last = 710 - (MAIN1.length - 1) * 30;
    box(30, last - 22, 535, 22, `이수학점 합계 ${MAIN1.reduce((a, c) => a + c.credit, 0)}`);
    text(`2 / ${N}`, 280, 20);
  }
  // 3쪽: 1학년 세특(통합과학, 정보, 학교자율과정)
  {
    const pg = doc.addPage([595, 842]);
    const { box, text } = sheet(pg, font);
    box(30, 778, 535, 22, '과목 세부능력 및 특기사항');
    const lines = SETEUK_BLOCKS.flatMap((b) => neisWrap(b.head + b.text, W_SETEUK));
    const h = lines.length * 12 + 8;
    box(30, 778 - h, 535, h, lines);
    expect(778 - h).toBeGreaterThan(80);
    text(`3 / ${N}`, 280, 20);
  }
  // 4쪽: 3학년 진로 선택 과목 표, 행동특성 및 종합의견(1학년)
  {
    const pg = doc.addPage([595, 842]);
    const { box, text, rowOf } = sheet(pg, font);
    box(30, 800, 60, 16, '[3학년]');
    box(30, 780, 120, 16, '<진로 선택 과목>');
    rowOf(CAREER_COLS, 740, 36, CAREER_HEAD, 7);
    CAREER3.forEach((c, i) => rowOf(CAREER_COLS, 710 - i * 30, 30, courseRow(c, true), 6, 9));
    box(30, 640, 535, 18, '9. 행동특성 및 종합의견');
    box(30, 616, 40, 22, '학년'); box(70, 616, 495, 22, '행동특성 및 종합의견');
    const lines = neisWrap(BEH1, W_BEH);
    const h = lines.length * 12 + 8;
    box(30, 616 - h, 40, h, '1'); box(70, 616 - h, 495, h, lines);
    text(`4 / ${N}`, 280, 20);
  }
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

describe('두 번째 가상 학생으로 만든 NEIS 비슷한 PDF(4쪽)', () => {
  let S: StudentRecord;
  let pages2: ExtractedPage[];
  beforeAll(async () => {
    pages2 = await extractPages(new Uint8Array(await buildPdf2()), pdfjs);
    const groups = splitStudents(pages2);
    expect(groups).toHaveLength(1);
    S = parseStudent(groups[0]);
  });

  it('줄바꿈 흉내: 어떤 줄도 공백으로 시작하거나 끝나지 않고, 마지막 줄 말고는 W글자(지운 공백 하나 차이)이며, 공백을 지운 글자는 원문과 같다', () => {
    const blocks: [string, number][] = [
      ...SETEUK_BLOCKS.map((b): [string, number] => [b.head + b.text, W_SETEUK]),
      ...CLUB_BLOCKS.map((b): [string, number] => [clubHead(b) + b.text, W_CC]),
      [AUTO1, W_CC], [CAREER1, W_CC], [BEH1, W_BEH],
    ];
    for (const [t, W] of blocks) {
      const lines = neisWrap(t, W);
      for (const ln of lines) expect(ln).toBe(ln.trim());
      expect(lines.slice(0, -1).every((ln) => ln.length === W || ln.length === W - 1)).toBe(true);
      expect(nos(lines.join(''))).toBe(nos(t));
    }
  });

  it('쪽수로 한 학생 4쪽을 묶고 인적사항을 읽는다', () => {
    expect(pages2).toHaveLength(4);
    expect(splitStudents(pages2).map((g) => g.length)).toEqual([4]);
    expect(S.warnings).toEqual([]);
    expect(S.meta.name).toBe('정하람');
    expect(S.meta.entry).toBe(2024);
    expect(S.meta.scale).toBe(9);
    expect(S.meta.curriculum).toBe(2015);
    expect(S.hakjeok).toEqual(['2024년 03월 04일 ○○고등학교 제1학년 입학']);
    expect(S.years).toEqual([1, 3]);
  });

  it('1학년 일반 과목 성적표를 가상 학생 성적과 똑같이 읽는다', () => {
    const pick = (c: Course) => ({ year: c.year, sem: c.sem, group: c.group, name: c.name, credit: c.credit, raw: c.raw, avg: c.avg, sd: c.sd, ach: c.ach, dist: c.dist, rank: c.rank, n: c.n, kind: c.kind });
    const main = S.courses.filter((c) => c.year === 1);
    expect(main.map(pick)).toEqual(MAIN1.map(pick));
    const career = S.courses.filter((c) => c.year === 3);
    expect(career.map(pick)).toEqual(CAREER3.map(pick));
  });

  it("진로 선택 과목 표: 학점 칸 머리글이 '학점수 원점수/과목평균'이고 원점수 칸 머리글이 비어도 학점과 원점수를 제 열에서 읽는다", () => {
    const chem = S.courses.find((c) => c.name === '화학Ⅱ')!;
    const bio = S.courses.find((c) => c.name === '생명과학Ⅱ')!;
    expect(chem).toMatchObject({ year: 3, sem: 1, kind: 'career', credit: 3, raw: 93, avg: 72.5, sd: null, ach: 'A', n: 57, rank: null });
    expect(bio).toMatchObject({ year: 3, sem: 1, kind: 'career', credit: 3, raw: 95, avg: 74.0, sd: null, ach: 'A', n: 59, rank: null });
    expect(chem.dist).toBe('A(38.6) B(40.4) C(21.1)');
  });

  it('세특 세 덩어리를 과목 둘과 학교자율과정으로 나누고, 공백을 뺀 본문은 원문과 같다', () => {
    expect(S.seteuk.map((s) => [s.year, s.sem, s.names])).toEqual([
      [1, null, ['통합과학']],
      [1, null, ['정보']],
      [1, null, ['학교자율과정']],
    ]);
    SETEUK_BLOCKS.forEach((b, i) => expect(nos(S.seteuk[i].text), b.name).toBe(nos(b.text)));
    // 학교자율과정은 과목이 아니므로 성적표에 없고, 분석에서는 융합(자율과정) 줄에 놓인다
    expect(S.courses.some((c) => c.name === '학교자율과정')).toBe(false);
    const rec = analyze(S).recs.find((r) => r.subj === '학교자율과정');
    expect(rec?.lane).toBe('융합(자율과정)');
  });

  /** 세 세특의 줄 경계 띄어쓰기 비교를 모은다 */
  const seteukSpacing = (): { ok: number; n: number; offBreak: number } => {
    const sum = { ok: 0, n: 0, offBreak: 0 };
    SETEUK_BLOCKS.forEach((b, i) => {
      const r = spacingAgreement(S.seteuk[i].text, b.text, breakSlots(b.head, neisWrap(b.head + b.text, W_SETEUK)));
      sum.ok += r.ok;
      sum.n += r.n;
      sum.offBreak += r.offBreak;
    });
    return sum;
  };

  it('줄 안쪽의 띄어쓰기는 그대로 남고, 세특 줄 경계 판단은 현재 측정값(27곳 중 25곳)보다 나빠지지 않는다', () => {
    const r = seteukSpacing();
    expect(r.offBreak).toBe(0);
    expect(r.n).toBeGreaterThanOrEqual(25);
    expect(r.n - r.ok).toBeLessThanOrEqual(2);
    // 동아리 본문도 줄 안쪽 띄어쓰기는 그대로다
    const clubs = S.changche.filter((c) => c.area.startsWith('동아리활동('));
    CLUB_BLOCKS.forEach((b, i) => {
      const c = spacingAgreement(clubs[i].text, b.text, breakSlots(clubHead(b), neisWrap(clubHead(b) + b.text, W_CC)));
      expect(c.offBreak, b.club).toBe(0);
    });
  });

  // 목표는 줄 경계의 95% 이상이지만 아직 못 미친다(27곳 중 25곳, 92.6%. 처음 잴 때는 24곳이었고
  // '사이에서|하는'을 붙이던 문제를 고쳐 한 곳 늘었다). 남은 두 곳 '화학|결합', '개인정보|보호'는 명사와 명사가 이어지는 자리라
  // 국어사전 없이는 정할 수 없다. 줄 경계 판단이 나아져 이 테스트가 실패하면 it.fails를 it으로 바꾼다.
  it.fails('세특 줄 경계의 띄어쓰기가 95% 이상 원문과 맞는다(아직 못 미침)', () => {
    const r = seteukSpacing();
    expect(r.ok / r.n).toBeGreaterThanOrEqual(0.95);
  });

  it('동아리활동 한 칸의 두 동아리를 이름과 시간으로 나누고, 공백을 뺀 본문은 원문과 같다', () => {
    expect(S.changche.map((c) => [c.year, c.area, c.hours])).toEqual([
      [1, '자율활동', 42],
      [1, '동아리활동(생명실험탐구반)', 34],
      [1, '동아리활동(과학저널읽기반)', 17],
      [1, '진로활동', 16],
    ]);
    const clubs = S.changche.filter((c) => c.area.startsWith('동아리활동('));
    CLUB_BLOCKS.forEach((b, i) => {
      expect(nos(clubs[i].text), b.club).toBe(nos(b.text));
      // 다음 동아리 표시가 앞 동아리 본문에 남지 않는다
      expect(clubs[i].text).not.toMatch(/\(\d+시간\)/);
    });
    expect(nos(S.changche[0].text)).toBe(nos(AUTO1));
    expect(nos(S.changche[3].text)).toBe(nos(CAREER1));
    expect(S.hopes).toEqual([{ year: 1, text: '약사' }]);
    expect(S.behavior.map((b) => b.year)).toEqual([1]);
    expect(nos(S.behavior[0].text)).toBe(nos(BEH1));
  });
});
