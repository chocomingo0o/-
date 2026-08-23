#!/usr/bin/env python3
"""NAVI 수시상담 엑셀 워크북 → 단일 HTML 변환기.

엑셀의 시트 구성을 탭으로 재현하고, 각 시트를 성격에 맞는 블록으로 렌더링한다.
  - doc   : 안내문 시트 (텍스트 문서)
  - grid  : 병합 셀을 그대로 살린 소형 패널 (학생 정보, 산출 패널 등)
  - table : 대형 데이터 표 — 지연 렌더링 + 검색 + 열 필터 + 고정 머리글
  - imgs  : 차트 이미지 (EMF에서 변환한 PNG를 data URI로 내장)

숨김 행/열, 병합 표시(앵커만 표시), 표시 형식(General/%, 소수 자리)을 원본과
동일하게 반영한다. 데이터가 전혀 없는 열은 표에서 제외한다.

사용법:
  python3 build_html.py 입력.xlsx 출력.html [--images-dir PNG디렉터리]
"""
import argparse
import base64
import html as htmlmod
import json
import os
import re
import sys
import warnings
import zipfile
from datetime import datetime, date, time

warnings.filterwarnings("ignore")
import openpyxl  # noqa: E402


# ---------------------------------------------------------------- 유틸
def col_letter(n):
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def col_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n


def esc(v):
    return htmlmod.escape(str(v), quote=True)


def fmt_value(v, numfmt):
    """엑셀 표시 형식을 근사 적용해 표시 문자열과 숫자 여부를 돌려준다."""
    if v is None:
        return "", False
    if isinstance(v, str):
        return v.strip(), False
    if isinstance(v, bool):
        return ("TRUE" if v else "FALSE"), False
    if isinstance(v, (datetime, date)):
        f = (numfmt or "").lower()
        if isinstance(v, datetime) and v.year <= 1900 and ("h" in f or "s" in f):
            return v.strftime("%H:%M"), False
        if "y" in f or v.year > 1900:
            return f"{v.year}.{v.month:02d}.{v.day:02d}", False
        return f"{v.month:02d}.{v.day:02d}", False
    if isinstance(v, time):
        return v.strftime("%H:%M"), False
    # 숫자
    f = numfmt or "General"
    pct = "%" in f
    if pct:
        v = v * 100
    core = re.sub(r'\[[^\]]*\]|"[^"]*"|%', "", f.split(";")[0])
    m = re.search(r"[0#]\.([0#]+)", core)
    if m:
        dec = len(m.group(1))
        s = f"{v:,.{dec}f}" if "," in core else f"{v:.{dec}f}"
    elif v == int(v):
        s = f"{int(v):,}" if "," in core else str(int(v))
    else:  # General 등 — 소수 둘째 자리까지
        s = f"{round(v, 2):g}"
        if "," in core:
            s = f"{round(v, 2):,g}"
    return (s + "%" if pct else s), True


class SheetXml:
    """시트 XML에서 병합·열 너비·숨김 정보를 직접 읽는다."""

    def __init__(self, zf, part):
        s = zf.read(part).decode("utf-8")
        self.merges = []
        for m in re.finditer(r'<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"', s):
            self.merges.append((int(m.group(2)), col_index(m.group(1)),
                                int(m.group(4)), col_index(m.group(3))))
        self.width = {}
        self.hidden_cols = set()
        for m in re.finditer(r"<col ([^>]*)/>", s):
            t = m.group(1)
            mn = int(re.search(r'min="(\d+)"', t).group(1))
            mx = min(int(re.search(r'max="(\d+)"', t).group(1)), 120)
            w = re.search(r'width="([\d.]+)"', t)
            for c in range(mn, mx + 1):
                if w:
                    self.width[c] = float(w.group(1))
                if 'hidden="1"' in t:
                    self.hidden_cols.add(c)
        self.hidden_rows = {int(m.group(1)) for m in
                            re.finditer(r'<row r="(\d+)"[^>]*hidden="1"', s)}

    def anchors(self):
        """병합 범위의 앵커가 아닌 좌표 집합."""
        covered = set()
        for r1, c1, r2, c2 in self.merges:
            for r in range(r1, r2 + 1):
                for c in range(c1, c2 + 1):
                    if (r, c) != (r1, c1):
                        covered.add((r, c))
        return covered


# ---------------------------------------------------------------- 시트 구성
# grid=(r1,c1,r2,c2) / table=dict(group=그룹 머리글 행, head=[머리글 행], skip=[제외 행],
# data=(시작, 끝|None=시트 끝), cols=(c1,c2), sticky=왼쪽 고정 열 수, note_row=활용 정보 행)
CFG = [
    ("안내필독", "guide", {"doc": (2, 2, 36, 3)}),
    ("검색", "search", {"searchapp": True}),
    ("등급변환표", "convert", {
        "note_row": 2, "gradechip": True, "grids": [(10, 2, 11, 9)],
        "table": {"head": [12, 13, 14], "skip": [], "data": (15, None),
                  "cols": (2, 18), "sticky": 1}}),
    ("백분위조견표(인문)", "convert", {"note_row": 2, "imgs": "drawing2"}),
    ("백분위조견표(자연)", "convert", {"note_row": 2, "imgs": "drawing3"}),
    ("특별전형", "adm", {
        "note_row": 2,
        "table": {"group": 4, "head": [5, 6], "skip": [7], "data": (8, None),
                  "cols": (2, 26), "sticky": 3}}),
    ("모집단위", "adm", {
        "note_row": 8,
        "grids": [(4, 8, 4, 14)],
        "table2": [
            {"title": "모집단위 변화 (선택 대학)", "group": 6, "head": [7],
             "skip": [], "data": (8, None), "cols": (7, 14), "sticky": 0},
            {"title": "전공자율(무전공) 선발 (선택 대학)", "group": None, "head": [7],
             "skip": [], "data": (8, None), "cols": (33, 40), "sticky": 0}],
        "caption": "'권역별/대학명' 선택 상자는 원본 엑셀에서 동작합니다. 아래 표는 저장 시점에 선택된 대학 기준입니다."}),
    ("전공자율", "adm", {
        "note_row": 2,
        "table": {"head": [4], "skip": [5], "data": (6, None),
                  "cols": (2, 11), "sticky": 2}}),
    ("교과반영", "adm", {
        "note_row": 2,
        "table": {"group": 4, "head": [4, 5], "skip": [6], "data": (7, None),
                  "cols": (2, 22), "sticky": 3}}),
    ("수능최저", "adm", {
        "note_row": 2, "minpanel": True,
        "table": {"group": 12, "head": [13], "skip": [14], "data": (15, None),
                  "cols": (2, 25), "sticky": 2}}),
    ("종합전형", "adm", {
        "note_row": 2,
        "table": {"group": 4, "head": [5], "skip": [6], "data": (7, None),
                  "cols": (2, 21), "sticky": 2}}),
    ("논술", "adm", {
        "note_row": 2, "minpanel": True,
        "table": {"group": 12, "head": [13], "skip": [14], "data": (15, None),
                  "cols": (2, 45), "sticky": 2}}),
    ("전형일정", "adm", {
        "note_row": 2,
        "table": {"head": [4], "skip": [5], "data": (6, None),
                  "cols": (2, 8), "sticky": 1}}),
    ("내신", "score", {
        "note_row": 2,
        "table": {"group": 4, "head": [4, 5], "skip": [], "data": (6, None),
                  "cols": (1, 28), "sticky": 4}}),
]
for _m in ["3월", "5월", "6월", "7월", "9월", "10월", "11월"]:
    CFG.append((_m, "score", {
        "note_row": 2,
        "table": {"group": 4, "head": [4, 5], "skip": [], "data": (6, None),
                  "cols": (1, 31), "sticky": 4}}))

GROUPS = {
    "guide": ("안내", "#C0392B"), "search": ("검색", "#B7791F"),
    "convert": ("환산·조견", "#3F6C2E"), "adm": ("전형 자료", "#0B77A0"),
    "score": ("학생 성적", "#B54A14"),
}
# 열 필터를 붙일 머리글 이름
FILTER_HEADERS = {"지역", "세부지역", "대학", "대학명", "계열", "전형유형", "구분",
                  "유형", "전형명", "캠퍼스", "연도", "학년", "반", "통합선발여부",
                  "일괄/단계", "면접시기", "등급기준"}


def cell_grid(rows_vals, merges, r1, c1, r2, c2, widths):
    """소형 범위를 병합 그대로 재현한 HTML 표."""
    covered = set()
    span = {}
    for mr1, mc1, mr2, mc2 in merges:
        if mr1 >= r1 and mr2 <= r2 and mc1 >= c1 and mc2 <= c2:
            span[(mr1, mc1)] = (mr2 - mr1 + 1, mc2 - mc1 + 1)
            for r in range(mr1, mr2 + 1):
                for c in range(mc1, mc2 + 1):
                    if (r, c) != (mr1, mc1):
                        covered.add((r, c))
    out = ['<div class="gridwrap"><table class="grid">']
    for r in range(r1, r2 + 1):
        cells = []
        for c in range(c1, c2 + 1):
            if (r, c) in covered:
                continue
            v, isnum = rows_vals.get((r, c), ("", False))
            rs, cs = span.get((r, c), (1, 1))
            attr = (f' rowspan="{rs}"' if rs > 1 else "") + (f' colspan="{cs}"' if cs > 1 else "")
            cls = "num" if isnum else ""
            filled = "hd" if (v and not isnum and len(str(v)) < 30 and rs == 1) else ""
            cells.append(f'<td class="{cls} {filled}"{attr}>{esc(v).replace(chr(10), "<br>")}</td>')
        if any('>' in x and not x.endswith('></td>') for x in cells):
            out.append("<tr>" + "".join(cells) + "</tr>")
    out.append("</table></div>")
    return "".join(out)


def build_table(sheet_vals, sx, tcfg, last_row):
    """대형 표 블록: thead HTML + 행 데이터 배열."""
    c1, c2 = tcfg["cols"]
    covered = sx.anchors()
    head_rows = tcfg["head"]
    group_row = tcfg.get("group")
    if group_row in head_rows:
        group_row = None
    d1, d2 = tcfg["data"]
    d2 = d2 or last_row
    skip = set(tcfg.get("skip", []))

    cols = [c for c in range(c1, c2 + 1) if c not in sx.hidden_cols]

    def val(r, c):
        if (r, c) in covered:
            return "", False
        return sheet_vals.get((r, c), ("", False))

    # 데이터·머리글 모두 빈 열 제거
    keep = []
    for c in cols:
        if any(val(r, c)[0] for r in head_rows) or \
           any(val(r, c)[0] for r in range(d1, min(d1 + 400, d2 + 1))):
            keep.append(c)
    cols = keep

    rows, aligns_num = [], [0] * len(cols)
    for r in range(d1, d2 + 1):
        if r in skip or r in sx.hidden_rows:
            continue
        vals = []
        empty = True
        for i, c in enumerate(cols):
            v, isnum = val(r, c)
            if v:
                empty = False
                if isnum:
                    aligns_num[i] += 1
            vals.append(v)
        if not empty:
            rows.append(vals)
    aligns = [1 if rows and n > len(rows) * 0.5 else 0 for n in aligns_num]

    # thead: 그룹 행 + 머리글 행, 병합 colspan/rowspan 반영
    all_head = ([group_row] if group_row else []) + head_rows
    span = {}
    hcovered = set()
    for mr1, mc1, mr2, mc2 in sx.merges:
        if mr1 in all_head:
            mr2c = min(mr2, all_head[-1])
            cs = len([c for c in cols if mc1 <= c <= mc2])
            rs = len([r for r in all_head if mr1 <= r <= mr2c])
            if cs == 0:
                continue
            span[(mr1, mc1)] = (max(rs, 1), cs)
            for r in all_head:
                for c in cols:
                    if mr1 <= r <= mr2c and mc1 <= c <= mc2 and (r, c) != (mr1, mc1):
                        hcovered.add((r, c))
    thead = []
    for hr in all_head:
        cells = []
        for c in cols:
            if (hr, c) in hcovered:
                continue
            v = sheet_vals.get((hr, c), ("", False))[0]
            rs, cs = span.get((hr, c), (1, 1))
            attr = (f' rowspan="{rs}"' if rs > 1 else "") + (f' colspan="{cs}"' if cs > 1 else "")
            cls = ' class="grp"' if hr == group_row else ""
            cells.append(f"<th{attr}{cls}>{esc(v).replace(chr(10), '<br>')}</th>")
        thead.append("<tr>" + "".join(cells) + "</tr>")

    widths = []
    for c in cols:
        w = sx.width.get(c, 8.6)
        widths.append(max(46, min(420, round(w * 7.4 + 5))))

    # 열 필터 대상: 지정 이름 + 고유값 300개 미만
    header_names = []
    for i, c in enumerate(cols):
        parts = [sheet_vals.get((hr, c), ("", False))[0] for hr in head_rows]
        header_names.append(next((p.replace("\n", "") for p in parts if p), f"col{i}"))
    filters, used_names = [], set()
    for i, name in enumerate(header_names):
        base = re.sub(r"\s", "", name)
        if base in FILTER_HEADERS and base not in used_names:
            uniq = {r[i] for r in rows if r[i]}
            if 1 < len(uniq) <= 300:
                filters.append(i)
                used_names.add(base)
    return {"t": "table", "title": tcfg.get("title"), "head": "".join(thead),
            "rows": rows, "aligns": aligns, "widths": widths,
            "sticky": tcfg.get("sticky", 0), "filters": filters,
            "names": header_names}


# ---------------------------------------------------------------- 검색 엔진 추출
CALC_REF = {"$A$2": "kor", "$B$2": "mat", "$C$2": "t1", "$D$2": "t2",
            "$F$2": "tmax", "$G$2": "tavg"}


def build_calc(zf, wb):
    """25점수계산기 시트의 대학별 백분위 산출식을 AST로 컴파일한다.
    (원본 캐시값 6,442행 전수 대조로 검증된 로직)"""
    s = zf.read("xl/worksheets/sheet23.xml").decode("utf-8")
    s = re.sub(r"<c [^>]*/>", "", s)  # 자기닫힘 셀이 다음 셀 수식을 삼키지 않게
    cells, shared = {}, {}
    for m in re.finditer(r'<c r="([A-Z]+)(\d+)"[^>]*?>(.*?)</c>', s):
        col, row, inner = m.group(1), int(m.group(2)), m.group(3)
        fm = re.search(r"<f([^>]*)>(.*?)</f>", inner)
        fe = re.search(r"<f([^>]*)/>", inner)
        if fm:
            si = re.search(r'si="(\d+)"', fm.group(1))
            if si and fm.group(2):
                shared[si.group(1)] = (col, row, fm.group(2))
            cells[(col, row)] = (fm.group(2) or None, si.group(1) if si else None)
        elif fe:
            si = re.search(r'si="(\d+)"', fe.group(1))
            cells[(col, row)] = (None, si.group(1) if si else None)

    def resolve(col, row):
        v = cells.get((col, row))
        if not v:
            return None
        text, si = v
        if text:
            return text
        if si and si in shared:
            scol, srow, stext = shared[si]
            drow = row - srow

            def rep(m):
                cm = re.match(r"(\$?)([A-Z]+)(\$?)(\d+)", m.group(0))
                cpre, c, rpre, r = cm.groups()
                return f"{cpre}{c}{rpre}{int(r) if rpre else int(r) + drow}"
            return re.sub(r"\$?[A-Z]+\$?\d+", rep, stext)
        return None

    def parse_ref(tok):
        tok = tok.strip()
        if tok in CALC_REF:
            return {"r": CALC_REF[tok]}
        m = re.fullmatch(r"\$?K\$?(\d+)", tok)
        if m:
            n = int(m.group(1))
            if resolve("K", n) is None:  # 수식 없는 K = 배열 문맥에서 0
                return {"c": 0}
            return {"e": n}
        raise ValueError("ref? " + tok)

    def compile_formula(f):
        if f is None:
            return None
        toks, i = [], 0
        while i < len(f):
            ch = f[i]
            if ch in "(),":
                toks.append(ch); i += 1
            elif f[i:i + 5].upper() == "LARGE":
                toks.append("LARGE"); i += 5
            elif f[i:i + 3].upper() in ("MAX", "MIN"):
                toks.append(f[i:i + 3].upper()); i += 3
            else:
                m = re.match(r"\$?[A-Z]+\$?\d+(:\$?[A-Z]+\$?\d+)?|\d+", f[i:])
                if not m:
                    raise ValueError(f"tok? {f[i:]}")
                toks.append(m.group(0)); i += len(m.group(0))
        pos = [0]

        def peek():
            return toks[pos[0]] if pos[0] < len(toks) else None

        def eat(t=None):
            v = toks[pos[0]]; pos[0] += 1
            if t and v != t:
                raise ValueError(f"expect {t} got {v} in {f}")
            return v

        def expr():
            t = peek()
            if t == "LARGE":
                eat(); eat("(")
                if peek() == "(":
                    eat("(")
                    args = [expr()]
                    while peek() == ",":
                        eat(); args.append(expr())
                    eat(")")
                else:
                    rng = eat()
                    assert rng == "$A$2:$D$2", rng
                    args = [{"r": "kor"}, {"r": "mat"}, {"r": "t1"}, {"r": "t2"}]
                eat(",")
                k = int(eat()); eat(")")
                return {"lg": args, "k": k}
            if t in ("MAX", "MIN"):
                op = eat(); eat("(")
                args = [expr()]
                while peek() == ",":
                    eat(); args.append(expr())
                eat(")")
                return {("mx" if op == "MAX" else "mn"): args}
            return parse_ref(eat())
        node = expr()
        if pos[0] != len(toks):
            raise ValueError(f"trailing in {f}")
        return node

    ws = wb["25점수계산기"]
    grid = {}
    for r, row in enumerate(ws.iter_rows(min_row=1, max_row=572, max_col=33), 1):
        for c, cell in enumerate(row, 1):
            grid[(r, c)] = cell.value

    def gv(row, letters):
        return grid.get((row, col_index(letters)))

    codes, eng_rows = {}, set()
    for r in range(5, 573):
        a = gv(r, "A")
        if a is None:
            continue
        code = str(int(a)) if isinstance(a, (int, float)) and float(a) == int(a) else str(a)
        exprs = []
        for col in ["X", "Y", "Z", "AA"]:
            ast = compile_formula(resolve(col, r))
            exprs.append(ast)

            def collect(n):
                if not n:
                    return
                if "e" in n:
                    eng_rows.add(n["e"])
                for k in ("lg", "mx", "mn"):
                    if k in n:
                        for x in n[k]:
                            collect(x)
            collect(ast)
        ratios = []
        for col in ["AB", "AC", "AD", "AE"]:
            v = gv(r, col)
            ratios.append(float(v) if v not in (None, "") else 0.0)
        codes[code] = {"x": exprs, "w": ratios}
    eng = {str(r): [gv(r, c) for c in ["B", "C", "D", "E", "F", "G", "H", "I", "J"]]
           for r in eng_rows}
    return {"codes": codes, "eng": eng}


def extract_students(wb):
    """내신 + 월별 모의고사 시트에서 학생별 구조화 데이터를 뽑는다."""
    students = {}

    def key_of(g, b, n):
        return f"{g}-{b}-{n}"

    ws = wb["내신"]
    # 월별 시트 열: J국백 K국등 / O수백 P수등 / R영등 F한국사등 / S·V·W 탐1 / X·AA·AB 탐2
    for row in ws.iter_rows(min_row=6, max_col=28):
        g, b, n, name = (row[0].value, row[1].value, row[2].value, row[3].value)
        if name in (None, ""):
            continue
        vals = [row[i].value for i in range(4, 28)]
        naesin = {}
        for gi, gname in enumerate(["전교과", "국수영사과", "국수영사", "국수영과"]):
            seg = vals[gi * 6:gi * 6 + 6]
            naesin[gname] = [round(v, 2) if isinstance(v, (int, float)) else None for v in seg]
        students[key_of(g, b, n)] = {"g": g, "b": b, "n": n, "name": str(name),
                                     "naesin": naesin, "months": {}}
    for mn in ["3월", "5월", "6월", "7월", "9월", "10월", "11월"]:
        ws = wb[mn]
        for row in ws.iter_rows(min_row=6, max_col=31):
            g, b, n, name = (row[0].value, row[1].value, row[2].value, row[3].value)
            if name in (None, ""):
                continue
            k = key_of(g, b, n)
            if k not in students:
                students[k] = {"g": g, "b": b, "n": n, "name": str(name),
                               "naesin": {}, "months": {}}
            def num(idx):
                v = row[idx - 1].value
                return v if isinstance(v, (int, float)) else None
            def txt(idx):
                v = row[idx - 1].value
                return str(v) if v not in (None, "") else None
            rec = {"kor": [num(10), num(11)], "mat": [num(15), num(16)],
                   "eng": num(18), "hist": num(6),
                   "t1": [txt(19), num(22), num(23)], "t2": [txt(24), num(27), num(28)]}
            if any(v is not None for v in
                   [rec["kor"][0], rec["mat"][0], rec["eng"], rec["t1"][1], rec["t2"][1]]):
                students[k]["months"][mn] = rec
    order = sorted(students.values(), key=lambda s: (s.get("g") or 0, s.get("b") or 0, s.get("n") or 0))
    return order


def extract_unidb(wb):
    """숨김 data 시트 → 검색용 대학 DB (문자열 테이블 인코딩)."""
    ws = wb["data"]
    strings, sidx = [], {}

    def S(v):
        if v is None:
            v = ""
        v = str(v)
        if v not in sidx:
            sidx[v] = len(strings)
            strings.append(v)
        return sidx[v]

    cols = ["A", "B", "C", "D", "E", "F", "G", "H", "L",
            "O", "P", "Q", "R", "S", "U", "V", "W", "X", "Y",
            "AA", "AB", "AC", "AD", "AE", "AG", "AH", "AI", "AJ", "AK",
            "AM", "AN", "AO", "AP", "AQ", "AT", "AU", "AV", "AW"]
    idxs = [col_index(c) - 1 for c in cols]
    rows = []
    for row in ws.iter_rows(min_row=2, max_row=6443, max_col=55):
        vals = [row[i].value for i in idxs]
        if all(v in (None, "") for v in vals[:8]):
            continue
        enc = []
        for c, v in zip(cols, vals):
            if c == "AT":  # 정시백분위: 숫자 or null
                enc.append(round(float(v), 5) if isinstance(v, (int, float)) else None)
            elif c == "AV":  # 정시코드 정규화
                if isinstance(v, (int, float)) and float(v) == int(v):
                    enc.append(S(str(int(v))))
                else:
                    enc.append(S(v))
            elif c in ("P", "Q", "R", "S", "V", "W", "X", "Y", "AB", "AC", "AD", "AE",
                       "AH", "AI", "AJ", "AK", "AN", "AO", "AP", "AQ"):
                # 등급 컷: 숫자 or null (문자열 테이블과 섞지 않는다)
                enc.append(round(float(v), 2) if isinstance(v, (int, float)) else None)
            else:
                enc.append(S(v))
        rows.append(enc)
    return {"cols": cols, "strings": strings, "rows": rows}


def textbox_titles(zf, drawing):
    s = zf.read(f"xl/drawings/{drawing}.xml").decode("utf-8")
    boxes = []
    for m in re.finditer(r"<xdr:twoCellAnchor[^>]*>.*?</xdr:twoCellAnchor>", s, re.S):
        blk = m.group(0)
        row = int(re.search(r"<xdr:from>.*?<xdr:row>(\d+)</xdr:row>", blk, re.S).group(1))
        if "<xdr:sp " in blk or "<xdr:sp>" in blk:
            txt = "".join(re.findall(r"<a:t>([^<]*)</a:t>", blk))
            if txt.strip():
                boxes.append((row, "tb", txt.strip()))
        m2 = re.search(r'r:embed="(rId\d+)"', blk)
        if m2:
            boxes.append((row, "img", m2.group(1)))
    boxes.sort(key=lambda x: x[0])
    return boxes


def build_imgs(zf, drawing, images_dir):
    rels = zf.read(f"xl/drawings/_rels/{drawing}.xml.rels").decode("utf-8")
    rid_to_img = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="\.\./media/(image\d+)\.\w+"', rels))
    items, seen, title = [], set(), None
    for row, kind, payload in textbox_titles(zf, drawing):
        if kind == "tb":
            title = payload.splitlines()[0][:60]
        else:
            name = rid_to_img.get(payload)
            if not name or name in seen:
                continue
            seen.add(name)
            png = os.path.join(images_dir, name + ".png")
            if not os.path.exists(png):
                continue
            with open(png, "rb") as f:
                b64 = base64.b64encode(f.read()).decode()
            items.append({"title": title, "src": f"data:image/png;base64,{b64}"})
            title = None
    return {"t": "imgs", "items": items}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--images-dir", default=None)
    args = ap.parse_args()

    zf = zipfile.ZipFile(args.input)
    wbxml = zf.read("xl/workbook.xml").decode("utf-8")
    rels = zf.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    rid2file = dict(re.findall(r'<Relationship Id="(rId\d+)"[^>]*Target="(worksheets/[^"]+)"', rels))
    name2part = {}
    for m in re.finditer(r'<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"', wbxml):
        name2part[m.group(1)] = "xl/" + rid2file[m.group(2)]

    wb = openpyxl.load_workbook(args.input, read_only=True, data_only=True)
    sheets_out = []
    for name, group, cfg in CFG:
        print(f"추출: {name}", file=sys.stderr)
        sx = SheetXml(zf, name2part[name])
        ws = wb[name]
        vals = {}
        last_row = 0
        maxc = max((c2 for key in ("grids",) for (_, _, _, c2) in cfg.get(key, [])), default=0)
        if "table" in cfg:
            maxc = max(maxc, cfg["table"]["cols"][1])
        for t in cfg.get("table2", []):
            maxc = max(maxc, t["cols"][1])
        if "doc" in cfg:
            maxc = max(maxc, cfg["doc"][3])
        for r, row in enumerate(ws.iter_rows(min_col=1, max_col=max(maxc, 8)), 1):
            for c, cell in enumerate(row, 1):
                if cell.value is not None:
                    vals[(r, c)] = fmt_value(cell.value, cell.number_format)
                    last_row = max(last_row, r)
        blocks = []
        nr = cfg.get("note_row")
        if nr:
            note = vals.get((nr, 2), ("", False))[0]
            if note:
                blocks.append({"t": "note", "text": note})
        if cfg.get("searchapp"):
            blocks.append({"t": "searchapp"})
        if cfg.get("gradechip"):
            blocks.append({"t": "gradechip"})
        if cfg.get("minpanel"):
            blocks.append({"t": "minpanel"})
        if "doc" in cfg:
            r1, c1, r2, c2 = cfg["doc"]
            lines = []
            for r in range(r1, r2 + 1):
                for c in range(c1, c2 + 1):
                    v = vals.get((r, c), ("", False))[0]
                    if v:
                        lines.append(v)
            blocks.append({"t": "doc", "lines": lines})
        for g in cfg.get("grids", []):
            blocks.append({"t": "grid", "html": cell_grid(vals, sx.merges, *g, sx.width)})
        if cfg.get("caption"):
            blocks.append({"t": "cap", "text": cfg["caption"]})
        if "imgs" in cfg and args.images_dir:
            blocks.append(build_imgs(zf, cfg["imgs"], args.images_dir))
        if "table" in cfg:
            blocks.append(build_table(vals, sx, cfg["table"], last_row))
        for t in cfg.get("table2", []):
            blocks.append(build_table(vals, sx, t, last_row))
        sheets_out.append({"name": name, "group": group, "blocks": blocks})
    wb.close()

    print("검색 엔진 추출", file=sys.stderr)
    wb2 = openpyxl.load_workbook(args.input, read_only=True, data_only=True)
    calc = build_calc(zf, wb2)
    students = extract_students(wb2)
    unidb = extract_unidb(wb2)
    wb2.close()

    tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "template.html"),
               encoding="utf-8").read()
    payload = json.dumps({"sheets": sheets_out, "groups": GROUPS},
                         ensure_ascii=False, separators=(",", ":"))
    search_payload = json.dumps({"calc": calc, "students": students, "uni": unidb},
                                ensure_ascii=False, separators=(",", ":"))
    out = tpl.replace("/*__DATA__*/null", payload)
    out = out.replace("/*__SEARCH__*/null", search_payload)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"완료: {args.output} ({os.path.getsize(args.output)/1e6:.1f}MB)", file=sys.stderr)


if __name__ == "__main__":
    main()
