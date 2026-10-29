import React from 'react';
import type { Analysis, StudentEntry } from '../engine/types';
/** 자리표시자: 3단계에서 구현. 서명을 유지할 것. kicker/title은 부모 SideDrawer가 아니라 이 컴포넌트가 useApp으로 직접 그려도 됨. */
export function RecordDrawer({ an, student, id }: { an: Analysis; student: StudentEntry; id: string }) {
  const r = an.recs.find((x) => x.id === id);
  return <div className="text-muted">기록 상세 (구성 중) · {r?.subj} · {student.file}</div>;
}
