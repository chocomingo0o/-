import { useMemo } from 'react';
import { analyze } from '../engine/analyze';
import type { Analysis, StudentEntry, UserDict } from '../engine/types';

const cache = new Map<string, { dict: UserDict; an: Analysis }>();

/** 현재 학생의 분석 결과. 같은 학생·같은 사전이면 캐시를 쓴다. */
export function useAnalysis(student: StudentEntry | null, userDict: UserDict): Analysis | null {
  return useMemo(() => {
    if (!student) return null;
    const hit = cache.get(student.id);
    if (hit && hit.dict === userDict) return hit.an;
    const an = analyze(student.data, userDict);
    cache.set(student.id, { dict: userDict, an });
    return an;
  }, [student, userDict]);
}

export function dropAnalysisCache(id?: string) {
  if (id) cache.delete(id);
  else cache.clear();
}
