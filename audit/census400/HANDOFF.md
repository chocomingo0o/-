# 400개교 편제표 수집 — 인수인계 (2026-08-05)

## 목표
학교알리미 편제표 표본 400개교 (일반고+특목고+자사고+자공고+예체능고).
커넥터: 커스텀 MCP https://mcp.gomdori.app/school (schoolinfo-mcp).
도구: search_school / find_school / get_curriculum_plan(year=2024).

## 현재 상태
- 기존 45개교: scratchpad/audit/curriculum_survey_*.json (12개 파일, 집계 curriculum_survey_agg45.json)
- 신규 수집: 이 폴더 *.jsonl (에이전트가 직접 기록) — SEL-A 8완료, JS-A 7, GG-A ~8, SEL-B 3(중단), JS-B 2(중단)
- 남은 과제: queue.json의 43개 중 SEL-A/GG-A/JS-A/SEL-B/JS-B 제외 38개 + SEL-B/JS-B 잔여

## 수집 방법 (검증된 절차)
1. 과제(큐 항목)당 에이전트 1개, 동시 3개까지만 (서버 502 방지)
2. 에이전트 수칙: 순차 호출 / 502는 건너뛰고 마지막 1회 재시도 / 이미지 편제표는 교체 / 결과는 이 폴더 {ID}.jsonl에 heredoc으로 직접 append / 최종 답변은 "ID: 성공n 실패m" 한 줄
3. 스키마: curriculum_survey_agg45.json 참조 + "유형" 필드(일반고/자사고/외고·국제고/과학고/예술·체육고/자공고)
4. 백오프 대기로 멈춘 에이전트는 SendMessage로 "기다리지 말고 즉시 재시도 후 보고" 지시

## 완료 후
1. 전체 JSONL + 기존 45 통합 집계 (유형별 분리 통계 필수 — 특목·자사는 일반고와 편제 다름)
2. 일반고 중앙값으로 시뮬레이터 transcriptTemplate 갱신 (recompute_core.js TEMPLATE + HTML prediction-data transcriptTemplate + 정리 문서 11절)
3. 유형별 차이는 별도 기록 (일반고 틀에 혼합 금지)
4. certify.js 인증 + 사본 4개 동기화
