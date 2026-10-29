import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

describe('smoke', () => {
  it('pdf-lib writes Korean text and pdfjs legacy reads it back with rects', async () => {
    const require = createRequire(import.meta.url);
    const fontPath = require.resolve('@expo-google-fonts/noto-sans-kr/400Regular/NotoSansKR_400Regular.ttf');
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(readFileSync(fontPath), { subset: true });
    const page = doc.addPage([595, 842]);
    page.drawRectangle({ x: 50, y: 700, width: 200, height: 30, borderColor: undefined, color: undefined, borderWidth: 0.5 });
    page.drawRectangle({ x: 50, y: 700, width: 200, height: 30, borderWidth: 0.5 });
    page.drawText('통합과학1 : 전압을 측정함.', { x: 55, y: 710, size: 10, font });
    const bytes = await doc.save();
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, isEvalSupported: false, disableFontFace: true });
    const pdf = await task.promise;
    const pg = await pdf.getPage(1);
    const tc = await pg.getTextContent();
    const text = tc.items.map((i: any) => i.str).join('');
    const ol = await pg.getOperatorList();
    const OPS = pdfjs.OPS;
    let rects = 0;
    for (let i = 0; i < ol.fnArray.length; i++) if (ol.fnArray[i] === OPS.constructPath) { const ops = ol.argsArray[i][0]; rects += ops.filter((o: number) => o === OPS.rectangle).length; }
    console.log('TEXT=', text, 'RECTS=', rects, 'items=', tc.items.length);
    expect(text).toContain('통합과학1');
    expect(text).toContain('측정');
    expect(rects).toBeGreaterThan(0);
  });
});
