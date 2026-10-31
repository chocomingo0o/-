/**
 * 셀 만들기 단위 테스트: 글자와 사각형을 손으로 만든 Page로 cellText / joinLines / buildCells / 격자 fallback을 검증한다.
 * 줄 경계 띄어쓰기(decideJoin)는 가상 학생 데이터를 NEIS처럼 글자 단위로 줄바꿈해 오류율로도 검증한다.
 */
import { describe, expect, it } from 'vitest';
import type { Page, TextItem } from '../types';
import type { Line } from '../pdf/extract';
import { sampleStudent } from '../../fixtures/sample';
import { buildCells, buildJoinLexicon, cellText, decideJoin, gridCellsFromLines, joinLines } from './cells';

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

describe('buildJoinLexicon', () => {
  it('줄의 첫 낱말과 끝 낱말은 잘린 조각일 수 있어 빼고, 앞뒤 문장부호를 뗀 꼴로 센다', () => {
    const lex = buildJoinLexicon(['오늘 교과서 내용을 정리함.', '첫 줄 (탐구) 끝', '한낱말']);
    expect([...lex.whole.entries()]).toEqual([['교과서', 1], ['내용을', 1], ['줄', 1], ['탐구', 1]]);
    expect(lex.inner).toBe(' 교과서 내용을 줄 탐구 ');
  });
});

describe('decideJoin (줄 경계에서 띄우면 true)', () => {
  const J = (a: string, b: string) => joinLines([a, b]);
  it('다음 줄 첫 낱말이 조사나 어미 조각이면 붙인다', () => {
    expect(J('보고서', '를 작성함.')).toBe('보고서를 작성함.');
    expect(J('꼼꼼', '한 태도로 정리함.')).toBe('꼼꼼한 태도로 정리함.');
    expect(J('실력을 향상', '시킬 방법을 찾음.')).toBe('실력을 향상시킬 방법을 찾음.');
  });
  it("'한' 뒤에 세는 말이 오면 관형사로 보고 띄운다", () => {
    expect(J('실험을', '한 번 더 반복함.')).toBe('실험을 한 번 더 반복함.');
  });
  it("'이'는 명사 뒤면 조사로 붙이고, 연결 어미 뒤면 관형사로 띄운다", () => {
    expect(J('탐구 과정', '이 체계적임.')).toBe('탐구 과정이 체계적임.');
    expect(J('실험을 마치고', '이 결과를 정리함.')).toBe('실험을 마치고 이 결과를 정리함.');
    expect(J('정리함.', '이 과정에서 오차를 찾음.')).toBe('정리함. 이 과정에서 오차를 찾음.');
  });
  it("홀로 쓰이는 '후, 중, 등, 및'은 두 글자 이상 낱말 뒤에서 띄우고, 한 글자 뒤에서는 붙인다", () => {
    expect(J('수업', '후 정리함.')).toBe('수업 후 정리함.');
    expect(J('실험', '및 분석을 수행함.')).toBe('실험 및 분석을 수행함.');
    expect(J('그 이', '후 실험을 이어감.')).toBe('그 이후 실험을 이어감.');
  });
  it("조사로 끝난 낱말 뒤의 '하는, 함'은 따로 쓰는 동사라 띄운다", () => {
    expect(J('두 집단 사이에서', '하는 역할을 맡음.')).toBe('두 집단 사이에서 하는 역할을 맡음.');
    expect(J('모둠의 자료 정리를', '함.')).toBe('모둠의 자료 정리를 함.');
    expect(J('지역 주민을 대상으로', '한 설문을 설계함.')).toBe('지역 주민을 대상으로 한 설문을 설계함.');
    // 조사가 없으면 그대로 붙인다
    expect(J('결과를 정리', '함.')).toBe('결과를 정리함.');
  });
  it('날짜는 붙이고, 기간 표시 - 앞뒤는 띄운다', () => {
    expect(J('기간: 2024.', '03.28. - 2024.07.19.')).toBe('기간: 2024.03.28. - 2024.07.19.');
    expect(J('(2024.03.28. -', '2024.07.19.)')).toBe('(2024.03.28. - 2024.07.19.)');
  });
  it("동아리 이름 뒤의 '(N시간)'은 붙인다", () => {
    expect(J('(과학탐구부)', '(34시간) 효소 실험을 설계함.')).toBe('(과학탐구부)(34시간) 효소 실험을 설계함.');
  });
  it('영어 소문자 뒤에 대문자로 시작하는 낱말이 오면 띄운다', () => {
    expect(J("원서 'The", "Selfish Gene'을 읽음.")).toBe("원서 'The Selfish Gene'을 읽음.");
  });
  it("세 글자 이상 낱말이 '로', '적', 연결형 '해'로 끝나면 띄우되 '분해'처럼 '해'로 끝나는 명사는 붙인다", () => {
    expect(J('같은 주제로', '실험을 설계함.')).toBe('같은 주제로 실험을 설계함.');
    expect(J('매우 자발적', '태도를 보임.')).toBe('매우 자발적 태도를 보임.');
    expect(J('그래프에 비유해', '설명함.')).toBe('그래프에 비유해 설명함.');
    expect(J('녹말의 가수분해', '효소를 조사함.')).toBe('녹말의 가수분해효소를 조사함.');
  });
  it("한 글자 '전'은 관형사로 보지 않고 다음 글자와 붙인다('전|공' → 전공)", () => {
    expect(J('희망 전', '공 분야를 탐색함.')).toBe('희망 전공 분야를 탐색함.');
  });
  it('같은 문서의 낱말 사전이 있으면 그것을 먼저 근거로 쓴다', () => {
    // 사전 없이는 '교과'가 조사 '과'로 끝나 띄우지만, 문서 안에 '교과서'가 있으면 붙인다
    expect(J('교과', '서에 나온 실험')).toBe('교과 서에 나온 실험');
    const lex = buildJoinLexicon(['오늘 교과서 내용을 정리함.', '앞 단원 정리 내용을 다시 봄.']);
    expect(joinLines(['교과', '서에 나온 실험'], lex)).toBe('교과서에 나온 실험');
    // 앞뒤 모두 온전한 낱말로 쓰였으면 띄운다
    expect(decideJoin('단원', '정리 내용', lex)).toBe(true);
  });
});

/** NEIS처럼 W글자마다 줄을 바꾸고(공백도 한 글자) 줄이 바뀌는 자리의 공백은 지운다 */
function neisWrap(t: string, W: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < t.length) {
    const line = t.slice(i, i + W);
    i += W;
    if (t[i] === ' ') i++;
    out.push(line.replace(/\s+$/, ''));
  }
  return out;
}

describe('joinLines: NEIS 줄바꿈 흉내(가상 학생 데이터)', () => {
  const S = sampleStudent();
  const texts = [...S.seteuk, ...S.changche, ...S.behavior].map(r => r.text.replace(/\s+/g, ' ').trim());
  for (const W of [46, 59, 62]) {
    it(`폭 ${W}글자: 줄 경계 판단 오류가 8% 미만이다`, () => {
      const wrapped = texts.map(t => neisWrap(t, W));
      const lex = buildJoinLexicon(wrapped.flat());
      let breaks = 0, errors = 0;
      wrapped.forEach((lines, k) => {
        let pos = 0;
        for (let j = 0; j < lines.length - 1; j++) {
          pos += lines[j].length;
          const truth = texts[k][pos] === ' ';
          if (truth) pos++;
          breaks++;
          if (decideJoin(lines[j], lines[j + 1], lex) !== truth) errors++;
        }
      });
      expect(breaks).toBeGreaterThan(200);
      expect(errors / breaks).toBeLessThan(0.08);
    });
  }
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
