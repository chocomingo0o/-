import json, io, os

DIRS = [
    "/tmp/claude-0/-home-user--/dbb2d001-af23-5f7b-950b-82e2c5cc5bf4/scratchpad/audit/census400",
    "/home/user/-/audit/census400",
]

COMMON = (" || 2026-08-06 재시도3차: 사전 헬스체크(대광고 year:2024 기본호출)부터 502로 실패. "
          "코디네이터 우회안내(PDF 첨부 변환 시 502·hwp/hwpx/xlsx는 정상)에 따라 year:2025 재조회 + all:true(첨부목록·확장자 확인) + full:true "
          "경로를 6개교 2바퀴, 총 12회 순차 시도했으나 전부 origin_bad_gateway 502(마지막 1회는 60초 타임아웃). "
          "문서 변환 없이 첨부 목록만 반환하는 all:true 호출도 동일하게 502 → 실패 지점이 문서 변환 이전(항목 조회) 단계로 보이며 "
          "'2024 공시가 PDF라서 502'라는 가설로는 이번 관측이 설명되지 않음. year:2025 우회도 동일 실패. "
          "동일 시각 search_school(대광고 S010000407)은 정상 200 응답 → MCP 서버는 가동 중이나 get_curriculum_plan 백엔드 장애 지속. 복구 미확인.")

FLA_EXTRA = (" 한영외고 이미지-only 여부의 확정 재검증은 이번에도 불가(all:true 첨부목록 조회 자체가 502). "
             "따라서 근거는 1차 조사 결과(첨부 2건 모두 pdf, '1. 2024학년도 교육과정 편성' 절이 image_001~003.png)에 한정되며 미확정 상태로 유지.")

# (파일, 매칭 키워드, 추가문구)
TARGETS = [
    ("JS-C.jsonl", "대광고등학교", ""),
    ("JS-A.jsonl", "선덕고등학교", ""),
    ("FL-A.jsonl", "한영외국어고등학교", FLA_EXTRA),
    ("FL-B.jsonl", "충남외국어고등학교", ""),
    ("FL-B.jsonl", "김해외국어고등학교", ""),
    ("SC-A.jsonl", "경기북과학고등학교", ""),
]

for d in DIRS:
    per_file = {}
    for fn, kw, extra in TARGETS:
        per_file.setdefault(fn, []).append((kw, extra))

    for fn, kws in per_file.items():
        path = os.path.join(d, fn)
        with io.open(path, encoding="utf-8") as fh:
            lines = fh.read().split("\n")
        trailing_nl = lines and lines[-1] == ""
        if trailing_nl:
            lines = lines[:-1]
        n_before = len(lines)
        hits = 0
        for i, line in enumerate(lines):
            s = line.strip()
            if not s:
                continue
            rec = json.loads(s)
            if "error" not in rec:
                continue
            for kw, extra in kws:
                if kw in rec["error"] or kw == rec.get("school"):
                    if "재시도3차" in rec["error"]:
                        continue
                    rec["error"] = rec["error"] + COMMON + extra
                    lines[i] = json.dumps(rec, ensure_ascii=False)
                    hits += 1
                    break
        assert len(lines) == n_before, "line count changed"
        out = "\n".join(lines) + ("\n" if trailing_nl else "")
        with io.open(path, "w", encoding="utf-8") as fh:
            fh.write(out)
        print(d, fn, "patched:", hits, "lines:", n_before)
