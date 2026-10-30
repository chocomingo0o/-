import { useMemo } from 'react';
import { analyze } from '../engine/analyze';
import type { Analysis, StudentEntry, UserDict } from '../engine/types';

const cache = new Map<string, { data: StudentEntry['data']; dict: UserDict; an: Analysis }>();

/** 현재 학생의 분석 결과. 같은 학생(id와 자료 객체가 같음)·같은 사전이면 캐시를 쓴다. id가 겹쳐도 다른 학생의 결과를 돌려주지 않는다. */
export function useAnalysis(student: StudentEntry | null, userDict: UserDict): Analysis | null {
  return useMemo(() => {
    if (!student) return null;
    const hit = cache.get(student.id);
    if (hit && hit.dict === userDict && hit.data === student.data) return hit.an;
    const an = analyze(student.data, userDict);
    cache.set(student.id, { data: student.data, dict: userDict, an });
    return an;
  }, [student, userDict]);
}

export function dropAnalysisCache(id?: string) {
  if (id) cache.delete(id);
  else cache.clear();
}
