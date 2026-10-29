import React from 'react';
import type { Analysis, StudentEntry } from '../engine/types';
/** 자리표시자: 3단계에서 구현. compact=true면 옆 창용 축약판. 서명을 유지할 것. */
export function NotesView({ an, student, compact }: { an: Analysis; student: StudentEntry; compact?: boolean }) {
  return <div className={compact ? 'text-muted' : 'panel p-6 text-muted'}>상담 노트 (구성 중) · 포인트 {an.insights.length}개 · {student.file}</div>;
}
