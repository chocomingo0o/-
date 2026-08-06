import json, io, os

rec = {
 "school":"율천고등학교","sido":"경기도","sgg":"수원시 팔달구","유형":"일반고","year_used":2024,
 "공통_국어":4,"공통_수학":4,"공통_영어":4,
 "한국사_학기당":3,"한국사_학년":"1",
 "통합사회_학기당":3,"통합과학_학기당":3,"과탐실_학기당":1,
 "y2_국어단위":3.5,"y2_수학단위":4,"y2_영어단위":3.5,
 "y2_탐구_과목수":3,"y2_탐구_학기당단위":3,
 "y3_국어단위":None,"y3_수학단위":None,"y3_영어단위":None,
 "y3_선택_과목수":10,"y3_선택_학기당단위":3,"y3_진로선택_있음":True,
 "비고":"2025공시 '학교교육과정 편성운영(정보공시 1차).hwp'의 '2024학년도 입학생 교육과정 편제표' 사용 — 학점표(2024입학생, 교과174/창체18/총192, 2015개정). 2024공시 첨부에는 편제표 없음(창체계획·학사일정만). 이전 수집분(2025입학생 2022개정 표)을 교체. 2학년 학교지정 국어 4·3, 영어 3·4로 학기별 상이 → 평균 기재(수학 4·4). 3학년은 국·수·영 학교지정 없음(전면선택, 지정과목은 스포츠 생활2·한문Ⅰ2). y3_선택_과목수=10 = 택1(국어3학점군)+택3(수학·영어군)+택2(사회·과학군)+택1(음악/미술2)+택1(제2외국어2)+택1(교양1)+택1(융합2)"
}
line = json.dumps(rec, ensure_ascii=False)

for path in ["/tmp/claude-0/-home-user--/dbb2d001-af23-5f7b-950b-82e2c5cc5bf4/scratchpad/audit/census400/GG-A.jsonl",
             "/home/user/-/audit/census400/GG-A.jsonl"]:
    with io.open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    n = 0
    for i, l in enumerate(lines):
        if '"율천고등학교"' in l:
            lines[i] = line
            n += 1
    assert n == 1, (path, n)
    with io.open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    # validate
    with io.open(path, encoding="utf-8") as f:
        for l in f:
            if l.strip():
                json.loads(l)
    print("ok", path, len([x for x in lines if x.strip()]))
