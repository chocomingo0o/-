import React, { useCallback, useRef, useState } from 'react';
import { Upload, FileText, PenLine, Sparkles, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import type { FileError } from '../state/store';

interface Props {
  onFiles: (files: File[]) => void;
  onSample: () => void;
  onManual: () => void;
  errors: FileError[];
  onClearErrors: () => void;
}

/** 첫 화면: 올리기, 예시, 직접 입력, 개인정보 안내 */
export function Landing({ onFiles, onSample, onManual, errors, onClearErrors }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const pick = useCallback((list: FileList | null) => {
    if (!list) return;
    const files = [...list].filter((f) => /\.(pdf|json)$/i.test(f.name) || f.type === 'application/pdf');
    if (files.length) onFiles(files);
  }, [onFiles]);

  return (
    <main className="mx-auto w-full max-w-[1080px] px-4 py-10 md:py-16">
      <header className="mb-10">
        <div className="mb-3 inline-flex items-center gap-2 text-[13px] font-semibold text-ink-2">
          <span className="inline-block h-3 w-3 rounded-[3px] bg-note-lavender" /> 교사용 탐구 상담 도구
        </div>
        <h1 className="text-[34px] font-bold leading-[1.25] tracking-[-0.02em] md:text-[44px]">탐구분석지도</h1>
        <p className="mt-3 max-w-[640px] text-[16px] leading-[1.7] text-ink-2">
          학생부 PDF를 올리면 세특과 창체 속 탐구가 어디서 시작해 어디로 이어졌는지 한 장의 계보도로 보여 줍니다.
          학기별, 교과별로 어떤 탐구 방법을 썼고 무엇이 비어 있는지도 함께 확인할 수 있습니다.
        </p>
      </header>

      <section
        className={cn('panel flex flex-col items-center justify-center gap-4 px-6 py-12 text-center transition-colors', drag && 'border-ink bg-plane')}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-note-yellow">
          <Upload className="h-5 w-5 text-ink" />
        </div>
        <div>
          <p className="text-[16px] font-semibold">학교생활기록부 PDF를 여기에 놓으세요</p>
          <p className="mt-1 text-[13.5px] text-muted">여러 명, 한 반 묶음 PDF도 됩니다. 이전에 저장한 작업 파일(.json)도 올릴 수 있습니다.</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <button className="btn" type="button" onClick={() => inputRef.current?.click()}>
            <FileText className="h-4 w-4" /> 학생부 PDF 올리기
          </button>
          <button className="btn ghost" type="button" onClick={onSample}>
            <Sparkles className="h-4 w-4" /> 예시 학생 보기
          </button>
          <button className="btn ghost" type="button" onClick={onManual}>
            <PenLine className="h-4 w-4" /> 세특 직접 입력
          </button>
        </div>
        <input ref={inputRef} type="file" accept=".pdf,.json,application/pdf" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
      </section>

      {errors.length ? (
        <div className="mt-4 rounded-md border border-note-yellow-ink/40 bg-note-yellow/20 px-4 py-3 text-[13.5px]">
          <div className="mb-1 flex items-center justify-between">
            <b>읽지 못한 파일</b>
            <button className="btn ghost sm" type="button" onClick={onClearErrors}>닫기</button>
          </div>
          <ul className="list-disc pl-5">
            {errors.map((e, i) => (
              <li key={i}><b>{e.file}</b>: {e.msg}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="mt-10 grid gap-6 md:grid-cols-3">
        <Feature title="탐구 계보도" color="bg-note-lavender">
          가로는 학기, 세로는 창체와 교과군. 카드는 기록 하나, 선은 이어진 탐구입니다. 연결마다 심화, 확장, 전환, 반복 가운데 무엇인지와 그 이유를 보여 줍니다.
        </Feature>
        <Feature title="탐구 방법 측정" color="bg-note-yellow">
          학기별, 교과군별로 17가지 탐구 방법과 8가지 과학 탐구 과정 기능을 세어 표로 보여 주고, 비어 있는 방법을 결손 지도로 짚어 줍니다.
        </Feature>
        <Feature title="상담 노트" color="bg-note-mint">
          강점, 점검할 점, 학생에게 할 질문, 다음 탐구 방향을 자동으로 정리합니다. 메모는 작업 파일로 저장할 수 있습니다.
        </Feature>
      </section>

      <section className="mt-10 rounded-md border border-hair bg-surface px-5 py-4 text-[13.5px] leading-[1.7] text-ink-2">
        <div className="mb-1 flex items-center gap-2 font-semibold text-ink"><ShieldCheck className="h-4 w-4" /> 개인정보 안내</div>
        <ul className="list-disc pl-5">
          <li>학생부 PDF는 선생님의 브라우저 안에서만 읽고 분석합니다. 서버, 클라우드, AI 서비스로 보내지 않습니다.</li>
          <li>분석 결과와 메모는 창을 닫으면 사라집니다. 브라우저에는 선생님이 추가한 표현 사전 낱말만 저장됩니다.</li>
          <li>작업 저장 파일(.json)과 인쇄물에는 학생 개인정보가 들어 있으니 학교 지침에 따라 보관하고 파기해 주세요.</li>
          <li>판단은 문장에 쓰인 표현을 근거로 한 참고 자료입니다. 원문과 함께 보고 학생에게 직접 확인해 주세요.</li>
        </ul>
      </section>
    </main>
  );
}

function Feature({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-ink pt-3">
      <div className="mb-1 flex items-center gap-2 text-[15px] font-bold">
        <span className={cn('inline-block h-3 w-3 rounded-[3px]', color)} /> {title}
      </div>
      <p className="text-[13.5px] leading-[1.7] text-ink-2">{children}</p>
    </div>
  );
}
