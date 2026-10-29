import React from 'react';
import type { Analysis, StudentEntry } from '../engine/types';
/** 자리표시자: 3단계에서 구현. 서명을 유지할 것. */
export function DictPanel({ an, student }: { an: Analysis; student: StudentEntry }) {
  return <div className="text-muted">표현 사전 (구성 중) · {an.recs.length} · {student.file}</div>;
}
