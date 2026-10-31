import React from 'react';
import type { Analysis, StudentEntry } from '../engine/types';
import { blindName } from '../lib/utils';
import { Pill } from './common';

/** 학생 머리글: 이름, 교육과정, 진로 희망, 관심 분야, 통계 */
export function StudentHead({ an, student, blind }: { an: Analysis; student: StudentEntry; blind: boolean }) {
  const S = student.data;
  const name = blind ? blindName(S.meta.name || '') : (S.meta.name || '이름 없음');
  const real = an.recs.filter((r) => !r.faint);
  const hopes = (S.hopes || []).filter((h) => h.text).map((h) => `${h.year}학년 ${h.text}`).join(' → ');
  const fields = fieldProfile(an);
  // 이름 가리기 중에는 파일 이름도 감춘다(NEIS PDF 파일 이름에는 보통 학생 이름이 들어 있다)
  const fileLabel = blind && /\.(pdf|json)\b/i.test(student.file) ? '파일 이름 가림' : student.file;
  const stats = [
    { n: real.length, l: '탐구가 드러난 기록' },
    // 도구줄의 '모든 연결'은 같은 시기까지 센 값이라 라벨에 밝혀 둔다
    { n: an.links.filter((l) => l.rel !== '동시').length, l: '이어진 연결(같은 시기 제외)' },
    { n: new Set(an.recs.flatMap((r) => r.methods)).size, l: '쓴 탐구 방법' },
    { n: an.themes.length, l: '관통하는 관심 주제' },
  ];
  return (
    <section className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-hair pb-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[22px] font-bold tracking-[-0.01em]">{name}</h2>
          <Pill>{S.meta.curriculum || 2015} 개정 교육과정</Pill>
          {S.meta.scale ? <Pill>{S.meta.scale}등급제</Pill> : null}
          {S.meta.sample ? <Pill className="border-note-lavender-ink text-note-lavender-ink">가상 예시</Pill> : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
          <span className="text-muted">{fileLabel}</span>
          {hopes ? <span><b className="font-semibold text-ink">진로 희망</b> {hopes}</span> : null}
          {fields.length ? <span><b className="font-semibold text-ink">관심 분야</b> {fields.join(', ')}</span> : null}
          {S.warnings?.length ? <span className="text-note-yellow-ink">{S.warnings[0]}</span> : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:flex-wrap">
        {stats.map((s) => (
          <div key={s.l} className="sm:min-w-[88px]">
            <dt className="text-[12px] text-muted">{s.l}</dt>
            <dd className="text-[22px] font-bold leading-none">{s.n}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function fieldProfile(an: Analysis): string[] {
  const sc: Record<string, number> = {};
  an.recs.filter((r) => !r.faint).forEach((r) => (r.fields || []).forEach((f, i) => { sc[f.k] = (sc[f.k] || 0) + (3 - i); }));
  return Object.entries(sc).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
}
