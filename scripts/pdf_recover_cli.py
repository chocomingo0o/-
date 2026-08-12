#!/usr/bin/env python3
"""PDF 비밀번호 복구 CLI — 비밀번호를 모르는 PDF의 잠금을 찾아서 푼다.

⚠️  본인이 소유했거나 해제 권한이 있는 문서에만 사용하세요.

예)
    # 유형만 확인
    python scripts/pdf_recover_cli.py locked.pdf --classify

    # 사전 + 숫자PIN(4~6) + 생년월일로 찾기 (기본값)
    python scripts/pdf_recover_cli.py locked.pdf -o unlocked.pdf

    # 내 사전 파일 추가 + 무차별(소문자+숫자 1~4자리)
    python scripts/pdf_recover_cli.py locked.pdf -w mywords.txt --brute
"""

from __future__ import annotations

import argparse
import itertools
import sys
from pathlib import Path

import pdf_password_recovery as R
from remove_pdf_password import default_output_path, remove_pdf_password

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_NOT_FOUND = 2
EXIT_NOT_ENCRYPTED = 3


def _force_utf8_output() -> None:
    """한글 출력이 영문 Windows 콘솔(cp1252)에서 깨지지 않도록 UTF-8로 전환."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # Python 3.7+
        except Exception:
            pass


def bundled_wordlist() -> Path:
    return Path(getattr(sys, "_MEIPASS", Path(__file__).parent)) / "wordlists" / "common.txt"


def build_candidates(args) -> itertools.chain:
    chains = []
    for w in args.wordlist or []:
        chains.append(R.from_wordlists([w]))
    if not args.no_dict:
        chains.append(R.from_wordlists([bundled_wordlist()]))
    if not args.no_date:
        chains.append(R.date_passwords())
    if not args.no_pin:
        chains.append(R.numeric_pins(args.pin_min, args.pin_max))
    if args.brute:
        chains.append(R.brute_force(R.CHARSET_ALNUM, 1, args.brute_len))
    return itertools.chain(*chains)


def main(argv=None) -> int:
    _force_utf8_output()
    p = argparse.ArgumentParser(description="PDF 비밀번호 복구 (본인 문서 전용).")
    p.add_argument("input", type=Path, help="잠긴 PDF")
    p.add_argument("-o", "--output", type=Path, help="해제본 저장 경로 (기본: <이름>_unlocked.pdf)")
    p.add_argument("--classify", action="store_true", help="유형만 판별하고 종료")
    p.add_argument("-w", "--wordlist", action="append", help="추가 사전 파일 (여러 번 지정 가능)")
    p.add_argument("--no-dict", action="store_true", help="기본 공용 사전 사용 안 함")
    p.add_argument("--no-date", action="store_true", help="생년월일 후보 사용 안 함")
    p.add_argument("--no-pin", action="store_true", help="숫자 PIN 후보 사용 안 함")
    p.add_argument("--pin-min", type=int, default=4)
    p.add_argument("--pin-max", type=int, default=6)
    p.add_argument("--brute", action="store_true", help="무차별 대입(소문자+숫자) 추가")
    p.add_argument("--brute-len", type=int, default=4, help="무차별 최대 길이 (기본 4)")
    p.add_argument("--limit", type=int, help="최대 시도 횟수 (안전장치)")
    p.add_argument("-f", "--force", action="store_true", help="출력 파일 덮어쓰기 허용")
    args = p.parse_args(argv)

    if not args.input.is_file():
        print(f"오류: 파일을 찾을 수 없습니다: {args.input}", file=sys.stderr)
        return EXIT_ERROR

    try:
        kind = R.classify_pdf(args.input)
    except Exception as exc:
        print(f"오류: PDF를 읽을 수 없습니다: {exc}", file=sys.stderr)
        return EXIT_ERROR

    label = {R.NOT_ENCRYPTED: "암호화 아님",
             R.OWNER_ONLY: "권한 잠금(비밀번호 없이 즉시 해제 가능)",
             R.USER_LOCKED: "열기 비밀번호(복구 필요)"}[kind]
    print(f"유형: {label}")
    if args.classify:
        return EXIT_OK

    output = args.output or default_output_path(args.input)
    if output.exists() and not args.force:
        print(f"오류: 출력 파일이 이미 있습니다: {output} (--force로 덮어쓰기)", file=sys.stderr)
        return EXIT_ERROR

    if kind == R.NOT_ENCRYPTED:
        print("암호화되어 있지 않아 해제할 것이 없습니다.")
        return EXIT_NOT_ENCRYPTED

    if kind == R.OWNER_ONLY:
        written = remove_pdf_password(args.input, output, "", overwrite=True)
        print(f"권한 잠금 즉시 해제 완료 → {written}")
        return EXIT_OK

    # USER_LOCKED — 후보 대입
    def progress(attempts, candidate, rate):
        print(f"\r시도 {attempts:,}회 · {rate:.0f}회/초 · 현재 {candidate}      ",
              end="", file=sys.stderr, flush=True)

    result = R.recover_password(args.input, build_candidates(args),
                                progress=progress, progress_every=200, limit=args.limit)
    print("", file=sys.stderr)
    if not result.found:
        print(f"비밀번호를 찾지 못했습니다. ({result.attempts:,}회 시도)", file=sys.stderr)
        return EXIT_NOT_FOUND

    written = remove_pdf_password(args.input, output, result.password, overwrite=True)
    print(f"비밀번호 찾음: '{result.password}'  ({result.attempts:,}회 시도)")
    print(f"해제본 저장 → {written}")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
