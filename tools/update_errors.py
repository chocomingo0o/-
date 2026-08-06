#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, io, os

DIRS = [
    "/tmp/claude-0/-home-user--/dbb2d001-af23-5f7b-950b-82e2c5cc5bf4/scratchpad/audit/census400",
    "/home/user/-/audit/census400",
]

COMMON = ("동일 시각 search_school(충남외고)은 정상 응답 → MCP 서버 자체는 가동 중이나 "
          "get_curriculum_plan(문서 다운로드·변환) 백엔드만 장애 지속. 복구 미확인.")

# (파일, 매칭키워드, 덧붙일 문구)
UPDATES = [
    ("JS-A.jsonl", "선덕고등학교",
     "2026-08-06 재시도2차: 기본(502), full:true(502) 2회 모두 origin_bad_gateway. " + COMMON),
    ("JS-C.jsonl", "대광고등학교",
     "2026-08-06 재시도2차: 기본(502), all:true(502) 2회 모두 origin_bad_gateway. "
     "서울 동대문구 자사고로 대상 확정. " + COMMON),
    ("FL-A.jsonl", "한영외국어고등학교",
     "2026-08-06 재시도2차: all:true(502), subject:'편성'(502) 2회 모두 origin_bad_gateway로 "
     "첨부 목록 재확인 자체가 불가. 이미지-only 여부는 1차 조사 결과(첨부 2건 모두 pdf, "
     "'1. 2024학년도 교육과정 편성' 절이 image_001~003.png)로만 남아 있고 이번에도 확정 재검증 미완. " + COMMON),
    ("FL-B.jsonl", "충남외국어고등학교",
     "2026-08-06 재시도2차: 기본(502), all:true(프록시 'Invalid content from server'), "
     "full:true(60초 타임아웃), subject:'교육과정'(502) 4회 시도 전부 실패. "
     "all:true/full:true에서 502가 아닌 응답 이상·타임아웃이 나온 것으로 보아 원서버가 요청은 받되 "
     "문서 변환을 끝내지 못하는 상태. " + COMMON),
    ("FL-B.jsonl", "김해외국어고등학교",
     "2026-08-06 재시도2차: 기본(502), full:true(502) 2회 모두 origin_bad_gateway. " + COMMON),
    ("SC-A.jsonl", "경기북과학고등학교",
     "2026-08-06 재시도2차: 기본(502), subject:'운영계획'(502) 2회 모두 origin_bad_gateway. "
     "첨부 '2024학년도 학교 교육과정 운영계획(안).pdf' 1건 존재는 기확인, 변환 단계에서 계속 실패. " + COMMON),
]

for d in DIRS:
    for fname, key, extra in UPDATES:
        path = os.path.join(d, fname)
        with io.open(path, encoding="utf-8") as fh:
            lines = fh.read().split("\n")
        trailing_nl = lines and lines[-1] == ""
        if trailing_nl:
            lines = lines[:-1]
        n_before = len(lines)
        hits = 0
        for i, ln in enumerate(lines):
            if not ln.strip():
                continue
            obj = json.loads(ln)
            if "error" not in obj:
                continue
            if key not in obj.get("error", "") and obj.get("school") != key:
                continue
            hits += 1
            obj["error"] = obj["error"] + " || " + extra
            lines[i] = json.dumps(obj, ensure_ascii=False)
        assert hits == 1, (path, key, hits)
        out = "\n".join(lines) + ("\n" if trailing_nl else "")
        with io.open(path, "w", encoding="utf-8") as fh:
            fh.write(out)
        assert len(out.split("\n")) - (1 if trailing_nl else 0) == n_before
        print("updated", path, key)

# 최종 검증: 모든 줄 유효 JSON
for d in DIRS:
    for fname in sorted({u[0] for u in UPDATES}):
        path = os.path.join(d, fname)
        with io.open(path, encoding="utf-8") as fh:
            content = fh.read()
        rows = [l for l in content.split("\n") if l.strip()]
        for l in rows:
            json.loads(l)
        print("OK", path, len(rows), "lines valid JSON")
