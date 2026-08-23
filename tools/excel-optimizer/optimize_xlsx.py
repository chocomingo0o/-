#!/usr/bin/env python3
"""xlsx 용량 최적화 도구.

원본 워크북의 데이터·수식·서식·차트를 그대로 유지하면서 파일 크기를 줄인다.
openpyxl 재저장은 폼 컨트롤·차트·메모·데이터 유효성 확장을 유실시키므로
ZIP/XML 수준에서만 수술적으로 수정한다.

수행 항목
  1. EMF 이미지 → PNG 변환 (LibreOffice Draw 필요; 없으면 건너뜀)
  2. xl/calcChain.xml 제거 (Excel이 다음 열기에서 자동 재생성)
  3. 전체 파트를 deflate 최고 압축(level 9)으로 재패킹
  4. (선택) --freeze "시트명:셀" 로 틀 고정 추가

사용법
  python3 optimize_xlsx.py 입력.xlsx 출력.xlsx [--freeze "3월:E6" --freeze "5월:E6" ...]
"""
import argparse
import glob
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile

CALC_CHAIN_OVERRIDE = (
    '<Override PartName="/xl/calcChain.xml" ContentType='
    '"application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/>'
)
EMF_DEFAULT = '<Default Extension="emf" ContentType="image/x-emf"/>'
PNG_DEFAULT = '<Default Extension="png" ContentType="image/png"/>'


def emf_pixel_bounds(path):
    """EMF 헤더의 rclBounds에서 디바이스 픽셀 크기를 읽는다."""
    with open(path, "rb") as f:
        header = f.read(24)
    left, top, right, bottom = struct.unpack("<4i", header[8:24])
    return right - left, bottom - top


def convert_emf_to_png(emf_path, out_dir, scale=1):
    """LibreOffice Draw로 EMF를 원본 해상도(×scale) PNG로 렌더링한다."""
    w, h = emf_pixel_bounds(emf_path)
    opts = json.dumps({
        "PixelWidth": {"type": "long", "value": w * scale},
        "PixelHeight": {"type": "long", "value": h * scale},
    })
    result = subprocess.run(
        ["soffice", "--headless",
         "--convert-to", f"png:draw_png_Export:{opts}",
         emf_path, "--outdir", out_dir],
        capture_output=True, text=True, timeout=300,
    )
    png = os.path.join(out_dir, os.path.splitext(os.path.basename(emf_path))[0] + ".png")
    if not os.path.exists(png):
        raise RuntimeError(f"EMF 변환 실패: {emf_path}\n{result.stderr}")
    return png


def col_to_index(cell_ref):
    """'E6' → (열 번호 5, 행 번호 6)."""
    m = re.fullmatch(r"([A-Z]+)(\d+)", cell_ref)
    col = 0
    for ch in m.group(1):
        col = col * 26 + (ord(ch) - 64)
    return col, int(m.group(2))


def add_freeze_pane(sheet_xml, cell_ref):
    """sheetView에 틀 고정 pane을 삽입한다. 이미 pane이 있으면 그대로 둔다."""
    col, row = col_to_index(cell_ref)
    pane = (f'<pane xSplit="{col - 1}" ySplit="{row - 1}" topLeftCell="{cell_ref}" '
            f'activePane="bottomRight" state="frozen"/>')
    selection = f'<selection pane="bottomRight" activeCell="{cell_ref}" sqref="{cell_ref}"/>'
    m = re.search(r"(<sheetView\b[^>]*>)(.*?)(</sheetView>)", sheet_xml, re.S)
    if m is None or "<pane" in m.group(2):
        return sheet_xml, False
    open_tag = re.sub(r'\s*topLeftCell="[^"]*"', "", m.group(1))
    body = re.sub(r"<selection[^/]*/>", "", m.group(2))
    return (sheet_xml[: m.start()] + open_tag + pane + selection + body
            + "</sheetView>" + sheet_xml[m.end():]), True


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--freeze", action="append", default=[],
                        metavar="시트명:셀", help='예: --freeze "3월:E6"')
    parser.add_argument("--emf-scale", type=int, default=1,
                        help="EMF→PNG 렌더링 배율 (텍스트 위주 이미지는 2 권장)")
    args = parser.parse_args()

    work = tempfile.mkdtemp(prefix="xlsxopt_")
    root = os.path.join(work, "parts")
    with zipfile.ZipFile(args.input) as z:
        z.extractall(root)

    # 1. EMF → PNG
    emfs = glob.glob(os.path.join(root, "xl", "media", "*.emf"))
    if emfs and shutil.which("soffice"):
        png_dir = os.path.join(work, "png")
        os.makedirs(png_dir, exist_ok=True)
        for emf in emfs:
            png = convert_emf_to_png(emf, png_dir, args.emf_scale)
            shutil.copy(png, os.path.splitext(emf)[0] + ".png")
            os.remove(emf)
        for rels in glob.glob(os.path.join(root, "xl", "drawings", "_rels", "*.rels")):
            with open(rels) as f:
                s = f.read()
            s = re.sub(r'(Target="\.\./media/[^"]+)\.emf"', r'\1.png"', s)
            with open(rels, "w") as f:
                f.write(s)
        print(f"EMF→PNG 변환: {len(emfs)}개")
    elif emfs:
        print("경고: soffice 없음 — EMF 변환 건너뜀", file=sys.stderr)

    # 2. Content_Types 정리 + calcChain 제거
    ct_path = os.path.join(root, "[Content_Types].xml")
    with open(ct_path) as f:
        ct = f.read()
    if not glob.glob(os.path.join(root, "xl", "media", "*.emf")):
        ct = ct.replace(EMF_DEFAULT, "")
    if PNG_DEFAULT not in ct and glob.glob(os.path.join(root, "xl", "media", "*.png")):
        ct = ct.replace("<Default Extension=", PNG_DEFAULT + "<Default Extension=", 1)
    calc_chain = os.path.join(root, "xl", "calcChain.xml")
    if os.path.exists(calc_chain):
        os.remove(calc_chain)
        ct = ct.replace(CALC_CHAIN_OVERRIDE, "")
        rels_path = os.path.join(root, "xl", "_rels", "workbook.xml.rels")
        with open(rels_path) as f:
            wr = f.read()
        wr = re.sub(r'<Relationship [^>]*Target="calcChain\.xml"[^>]*/>', "", wr)
        with open(rels_path, "w") as f:
            f.write(wr)
        print("calcChain.xml 제거")
    with open(ct_path, "w") as f:
        f.write(ct)

    # 3. 틀 고정 (시트명 → sheetN.xml 매핑은 workbook.xml + rels로 해석)
    if args.freeze:
        with open(os.path.join(root, "xl", "workbook.xml")) as f:
            wb = f.read()
        with open(os.path.join(root, "xl", "_rels", "workbook.xml.rels")) as f:
            wr = f.read()
        rid_to_file = dict(re.findall(
            r'<Relationship Id="(rId\d+)"[^>]*Target="(worksheets/[^"]+)"', wr))
        name_to_rid = dict(re.findall(r'<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"', wb))
        for spec in args.freeze:
            sheet_name, cell = spec.rsplit(":", 1)
            target = rid_to_file.get(name_to_rid.get(sheet_name, ""), None)
            if target is None:
                print(f"경고: 시트 '{sheet_name}' 없음 — 건너뜀", file=sys.stderr)
                continue
            path = os.path.join(root, "xl", target)
            with open(path) as f:
                s = f.read()
            s, added = add_freeze_pane(s, cell)
            with open(path, "w") as f:
                f.write(s)
            print(f"틀 고정 {'추가' if added else '이미 있음/실패'}: {sheet_name} @ {cell}")

    # 4. 최고 압축으로 재패킹
    entries = []
    for dirpath, _, files in os.walk(root):
        for name in files:
            full = os.path.join(dirpath, name)
            entries.append(os.path.relpath(full, root))
    entries.sort(key=lambda a: (a != "[Content_Types].xml", a != "_rels/.rels", a))
    with zipfile.ZipFile(args.output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for arc in entries:
            z.write(os.path.join(root, arc), arc)
    shutil.rmtree(work)

    before = os.path.getsize(args.input)
    after = os.path.getsize(args.output)
    print(f"{before / 1e6:.2f}MB → {after / 1e6:.2f}MB ({(1 - after / before) * 100:.0f}% 감소)")


if __name__ == "__main__":
    main()
