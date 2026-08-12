#!/usr/bin/env python3
"""PDF 비밀번호 복구 엔진 — 비밀번호를 모르는 PDF의 잠금을 푼다.

⚠️  합법적 사용 전제
    본인이 소유했거나 해제 권한이 있는 문서에만 사용하세요 (예: 내가 만든
    PDF인데 비밀번호를 잊어버린 경우). 타인의 문서를 무단으로 해제하는 것은
    불법일 수 있습니다.

PDF 비밀번호는 두 종류입니다.
    - 권한 비밀번호(owner): 파일은 열리지만 인쇄·복사·편집만 제한. 빈 비밀번호로
      열리므로 대입 없이 즉시 해제할 수 있습니다.
    - 열기 비밀번호(user): 파일 자체가 안 열림. 올바른 비밀번호를 찾아야만
      해제할 수 있어 사전 공격/무차별 대입이 필요합니다.

이 모듈은 순수 계산만 하며 UI에 의존하지 않습니다. GUI(pdf_password_remover_gui)와
CLI(pdf_recover_cli) 양쪽에서 재사용합니다.
"""

from __future__ import annotations

import itertools
import string
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Callable, Iterable, Iterator

from pypdf import PdfReader

# 분류 결과
NOT_ENCRYPTED = "not_encrypted"
OWNER_ONLY = "owner_only"     # 파일은 열림, 권한만 제한 → 즉시 해제
USER_LOCKED = "user_locked"   # 열기 비밀번호 필요 → 복구 대상


def classify_pdf(path: str | Path) -> str:
    """PDF의 잠금 유형을 판별한다 (NOT_ENCRYPTED / OWNER_ONLY / USER_LOCKED)."""
    reader = PdfReader(path)
    if not reader.is_encrypted:
        return NOT_ENCRYPTED
    # 빈 문자열로 복호화되면 열기 비밀번호가 없는 것(권한 제한만) → 즉시 해제 가능
    return OWNER_ONLY if reader.decrypt("") else USER_LOCKED


# ------------------------------------------------------------------ 후보 생성기
def from_wordlists(paths: Iterable[str | Path]) -> Iterator[str]:
    """사전 파일들에서 후보를 읽어온다 (UTF-8/CP949 자동, 중복 제거)."""
    seen: set[str] = set()
    for p in paths:
        p = Path(p)
        if not p.is_file():
            continue
        for encoding in ("utf-8", "cp949", "latin-1"):
            try:
                with open(p, encoding=encoding) as f:
                    for line in f:
                        word = line.rstrip("\r\n")
                        if word and word not in seen:
                            seen.add(word)
                            yield word
                break
            except UnicodeDecodeError:
                continue


def numeric_pins(min_len: int = 4, max_len: int = 6) -> Iterator[str]:
    """숫자 PIN 후보 (앞자리 0 유지). 4자리=1만, 6자리=100만 개."""
    for length in range(min_len, max_len + 1):
        for combo in itertools.product("0123456789", repeat=length):
            yield "".join(combo)


def date_passwords(start_year: int = 1940,
                   end_year: int | None = None) -> Iterator[str]:
    """생년월일·기념일 형태의 후보. YYMMDD·YYYYMMDD·MMDD·YYYY 등 흔한 포맷.

    범위 내 실제 달력 날짜만 생성하므로 6/8자리 전수 대입보다 훨씬 빠릅니다.
    """
    if end_year is None:
        end_year = date.today().year
    seen: set[str] = set()

    def emit(s: str) -> Iterator[str]:
        if s not in seen:
            seen.add(s)
            yield s

    day = date(start_year, 1, 1)
    last = date(end_year, 12, 31)
    one = timedelta(days=1)
    while day <= last:
        yy, mm, dd = day.year % 100, day.month, day.day
        yield from emit(f"{yy:02d}{mm:02d}{dd:02d}")          # YYMMDD
        yield from emit(f"{day.year:04d}{mm:02d}{dd:02d}")    # YYYYMMDD
        yield from emit(f"{mm:02d}{dd:02d}")                  # MMDD
        yield from emit(f"{dd:02d}{mm:02d}")                  # DDMM
        day += one
    for year in range(start_year, end_year + 1):
        yield from emit(f"{year:04d}")                        # YYYY


def brute_force(charset: str, min_len: int = 1, max_len: int = 4) -> Iterator[str]:
    """주어진 문자 집합으로 만든 모든 문자열 (조합 폭발 주의)."""
    for length in range(min_len, max_len + 1):
        for combo in itertools.product(charset, repeat=length):
            yield "".join(combo)


CHARSET_DIGITS = string.digits
CHARSET_LOWER = string.ascii_lowercase
CHARSET_ALNUM = string.ascii_lowercase + string.digits
CHARSET_ALNUM_UPPER = string.ascii_letters + string.digits


# ------------------------------------------------------------------- 검색 엔진
class RecoveryResult:
    __slots__ = ("password", "attempts", "elapsed", "cancelled", "exhausted")

    def __init__(self, password: str | None, attempts: int, elapsed: float,
                 cancelled: bool, exhausted: bool):
        self.password = password
        self.attempts = attempts
        self.elapsed = elapsed
        self.cancelled = cancelled
        self.exhausted = exhausted

    @property
    def found(self) -> bool:
        return self.password is not None


def recover_password(
    path: str | Path,
    candidates: Iterable[str],
    should_stop: Callable[[], bool] | None = None,
    progress: Callable[[int, str, float], None] | None = None,
    progress_every: int = 200,
    limit: int | None = None,
) -> RecoveryResult:
    """후보들을 하나씩 대입해 열기 비밀번호를 찾는다.

    path        : 대상 PDF
    candidates  : 시도할 비밀번호 이터러블 (생성기 권장 — 메모리 절약)
    should_stop : True를 반환하면 즉시 중단 (취소 버튼용)
    progress    : (시도횟수, 현재후보, 초당시도수) 콜백 — progress_every 마다 호출
    limit       : 최대 시도 횟수 (안전장치, None=무제한)

    빈 비밀번호("")도 후보에 포함되면 권한 잠금까지 함께 처리됩니다.
    """
    reader = PdfReader(path)  # 파서를 한 번만 초기화하고 재사용 (속도 핵심)
    if not reader.is_encrypted:
        return RecoveryResult("", 0, 0.0, False, True)

    attempts = 0
    start = time.monotonic()
    for candidate in candidates:
        if should_stop and should_stop():
            return RecoveryResult(None, attempts, time.monotonic() - start,
                                  True, False)
        attempts += 1
        try:
            if reader.decrypt(candidate):
                return RecoveryResult(candidate, attempts,
                                      time.monotonic() - start, False, False)
        except Exception:
            # 깨진 후보(비ASCII 등)는 건너뛴다
            pass
        if progress and attempts % progress_every == 0:
            elapsed = time.monotonic() - start
            rate = attempts / elapsed if elapsed else 0.0
            progress(attempts, candidate, rate)
        if limit is not None and attempts >= limit:
            break
    return RecoveryResult(None, attempts, time.monotonic() - start, False, True)


def count_estimate(candidates: Iterable[str]) -> int:
    """유한 후보의 개수 (진행률 표시용). 이터레이터를 소비하므로 주의."""
    return sum(1 for _ in candidates)
