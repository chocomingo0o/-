/**
 * 파일 처리 파이프라인: PDF → 글자·사각형 → 학생별 분리 → 파싱 → StudentEntry.
 * .json(작업 파일, 표현 사전)도 여기서 판별한다. 모든 처리는 브라우저 안에서만 일어난다.
 */
import { extractPages } from '../engine/pdf/extract';
import { parseStudent, curriculumOf } from '../engine/parser/parse';
import { splitStudents } from '../engine/parser/split';
import type { StudentEntry, UserDict } from '../engine/types';
import { getPdfJs } from './pdfjs';
import { parseJsonFile } from './storage';
import { uid } from './utils';

export interface IngestResult {
  entries: StudentEntry[];
  errors: { file: string; msg: string }[];
  dicts: UserDict[];          // 불러온 표현 사전(작업 파일에 담긴 것 포함)
  notes: string[];            // 안내 문구(예: 한 반 묶음 PDF를 나눴다는 알림)
}

export function fileLabel(name: string): string {
  return name.replace(/\.(pdf|json)$/i, '').replace(/^[_\s]+|[_\s]+$/g, '').replace(/_+/g, ' ').slice(0, 40);
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function ingestFiles(files: File[], onBusy?: (text: string) => void): Promise<IngestResult> {
  const out: IngestResult = { entries: [], errors: [], dicts: [], notes: [] };
  for (const f of files) {
    if (/\.json$/i.test(f.name)) {
      const parsed = parseJsonFile(await f.text());
      if (parsed.kind === 'work') {
        // id는 늘 새로 발급한다. 같은 파일을 두 번 올리거나 다른 파일에 같은 id가 있어도 학생이 섞이지 않게.
        for (const s of parsed.file.students) {
          out.entries.push({ id: uid(), file: s.file, data: s.data, memo: s.memo || '', recMemo: s.recMemo || {} });
        }
        if (parsed.file.userDict) out.dicts.push(parsed.file.userDict);
        out.notes.push(`${f.name}에서 학생 ${parsed.file.students.length}명의 작업을 불러왔습니다.`);
      } else if (parsed.kind === 'dict') {
        out.dicts.push(parsed.dict);
        out.notes.push('표현 사전을 가져왔습니다.');
      } else {
        out.errors.push({ file: f.name, msg: parsed.message });
      }
      continue;
    }
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      out.errors.push({ file: f.name, msg: 'PDF 또는 .json 파일만 올릴 수 있습니다.' });
      continue;
    }
    onBusy?.(`${f.name} 읽는 중`);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const pages = await extractPages(bytes, getPdfJs(), (p, n) => onBusy?.(`${f.name} 읽는 중 · ${p} / ${n}쪽`));
      const chars = pages.reduce((a, p) => a + p.items.reduce((b, i) => b + i.s.length, 0), 0);
      if (chars < 200) throw new Error('스캔한 이미지 PDF라 글자를 읽을 수 없습니다. NEIS에서 PDF로 다시 저장한 파일을 올려 주세요.');
      const groups = splitStudents(pages);
      if (groups.length > 1) onBusy?.(`${f.name}: ${groups.length}명의 학생부를 나누어 분석하는 중`);
      let got = 0;
      for (const [gi, g] of groups.entries()) {
        let data;
        try {
          data = parseStudent(g);
        } catch (e) {
          out.errors.push({ file: `${f.name} (${gi + 1}번째 학생)`, msg: (e as Error).message || String(e) });
          continue;
        }
        if (!data.seteuk.length && !data.changche.length) {
          if (groups.length === 1) throw new Error('세특과 창체 기록을 찾지 못했습니다. 학교생활기록부 PDF인지 확인해 주세요.');
          continue;
        }
        if (!data.meta.name) data.meta.name = groups.length > 1 ? `${fileLabel(f.name)} ${gi + 1}` : fileLabel(f.name);
        data.meta.curriculum = data.meta.curriculum || curriculumOf(data);
        data.meta.source = 'pdf';
        out.entries.push({ id: uid(), file: groups.length > 1 ? `${f.name} · ${gi + 1}번째` : f.name, data, memo: '', recMemo: {} });
        got++;
        if (gi % 3 === 2) await tick();
      }
      if (groups.length > 1) out.notes.push(`${f.name}에서 ${got}명의 학생부를 나누어 불러왔습니다.`);
    } catch (e) {
      out.errors.push({ file: f.name, msg: (e as Error).message || String(e) });
    }
  }
  return out;
}
