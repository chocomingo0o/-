import React from 'react';
import type { Analysis, StudentEntry } from '../../engine/types';
/** 자리표시자: 3단계에서 구현. 서명을 유지할 것. */
export function TreeBoard({ an, student }: { an: Analysis; student: StudentEntry }) {
  return <div className="panel p-6 text-muted">탐구 계보도 (구성 중) · 기록 {an.recs.length}개 · {student.file}</div>;
}
