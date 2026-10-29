/**
 * 탐구 방법 17종 사전.
 * 3단계(직접 자료를 만들거나 분석) 여섯 가지는 methods.part1.ts에,
 * 2단계(조사·분석·적용) 일곱 가지와 1단계(정리·참여) 네 가지는 methods.part2.ts에 있다.
 * 교사가 추가한 표현(UserDict)은 analyze/methods.ts의 compileMethods가 합친다.
 */
import type { MethodDef, MethodKey } from '../types';
import { METHODS_LV3 } from './methods.part1';
import { METHODS_LV12 } from './methods.part2';

/** 17개. 수준 내림차순(3 → 2 → 1). */
export const METHODS: MethodDef[] = [...METHODS_LV3, ...METHODS_LV12];

export const METHOD: Record<MethodKey, MethodDef> = Object.fromEntries(METHODS.map((m) => [m.key, m])) as Record<MethodKey, MethodDef>;

export const METHOD_KEYS: MethodKey[] = METHODS.map((m) => m.key);

/** 수준 이름 */
export const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: '정리·참여', 2: '조사·분석', 3: '직접 자료 생산·분석' };
