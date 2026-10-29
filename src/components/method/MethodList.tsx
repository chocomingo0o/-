import React from 'react';
import type { Analysis, StudentEntry } from '../../engine/types';
import type { MethodSel } from '../../state/store';
/** 자리표시자: 3단계에서 구현. 서명을 유지할 것. */
export function MethodList({ an, student, sel }: { an: Analysis; student: StudentEntry; sel: MethodSel }) {
  return <div className="text-muted">근거 문장 목록 (구성 중) · {sel.t} {sel.m} {sel.c} · {an.recs.length} · {student.file}</div>;
}
