import React from 'react';
import type { StudentEntry } from '../engine/types';
/** 자리표시자: 3단계에서 구현. 서명을 유지할 것. */
export function ManualInput({ onDone, onCancel }: { onDone: (entry: StudentEntry) => void; onCancel: () => void }) {
  return (
    <div className="text-muted">
      직접 입력 (구성 중)
      <div className="mt-3 flex gap-2"><button className="btn ghost sm" type="button" onClick={onCancel}>닫기</button><button className="btn sm" type="button" disabled onClick={() => onDone(null as unknown as StudentEntry)}>분석하기</button></div>
    </div>
  );
}
