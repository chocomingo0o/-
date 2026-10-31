/**
 * 브라우저용 pdf.js 로더.
 * 워커 파일을 번들에 포함해(new URL) 외부 CDN 요청 없이 동작합니다.
 */
import * as pdfjs from 'pdfjs-dist';
import type { PdfJsLike } from '../engine/pdf/extract';

let ready = false;

export function getPdfJs(): PdfJsLike {
  if (!ready) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    ready = true;
  }
  return pdfjs as unknown as PdfJsLike;
}
