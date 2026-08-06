import json, io

SC_NOTE = (" || 2026-08-06 재시도5차(최종): 동일 시각 타 학교(율천고 2024/2025, 면목고 2023/2024) 4회 모두 200 정상 "
           "→ 도구·백엔드 정상 확인. 경기북과학고만 year:2025 all:true / 2026 all:true / 2023 all:true / 2024 all:true "
           "4회 전부 origin_bad_gateway 502. 첨부 목록만 반환하는 all:true도 연도 불문 502 → 이 학교 항목 자체의 "
           "원서버 처리 실패(첨부 PDF 변환 포함)로 확정. 회수 불가로 종결.")

JG_NOTE = (" || 2026-08-06 재시도5차(최종): year:2023 공시를 all:true·subject:'학교교육계획'+full:true로 200 회수 성공. "
           "첨부는 '2023학년도 학교교육계획(면목고).hwp' 1건이고 '2. 학교 교육과정의 편제 및 이수 단위 배정' 절 아래 "
           "'2023 입학생(고1) 3개년 교육과정'=image_017.bmp, '2022 입학생(고2)'=image_018.bmp, '2021 입학생(고3)'=image_019.bmp "
           "로 편제표가 전부 이미지 → 2023 입학생 표 대체 수집도 불가. 2024 공시(all:true 재확인)는 여전히 "
           "'2024학년도 선택 교육과정 편성·운영 계획.hwp' 1건(수강신청 추진일정표만). "
           "2023~2026 공시 전 연도에서 텍스트 편제표 부재로 확정. named 과제라 교체하지 않음.")

targets = [("SC-A.jsonl", "경기북과학고등학교", SC_NOTE),
           ("JG-A.jsonl", "면목고등학교", JG_NOTE)]

for base in ["/tmp/claude-0/-home-user--/dbb2d001-af23-5f7b-950b-82e2c5cc5bf4/scratchpad/audit/census400/",
             "/home/user/-/audit/census400/"]:
    for fn, school, note in targets:
        path = base + fn
        with io.open(path, encoding="utf-8") as f:
            lines = f.read().split("\n")
        n = 0
        for i, l in enumerate(lines):
            if not l.strip():
                continue
            o = json.loads(l)
            if "error" in o and o["error"].startswith(school):
                o["error"] += note
                lines[i] = json.dumps(o, ensure_ascii=False)
                n += 1
        assert n == 1, (path, n)
        with io.open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        with io.open(path, encoding="utf-8") as f:
            cnt = 0
            for l in f:
                if l.strip():
                    json.loads(l); cnt += 1
        print("ok", path, cnt)
