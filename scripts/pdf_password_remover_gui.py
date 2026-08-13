#!/usr/bin/env python3
"""PDF 비밀번호 해제 · 복구 GUI — 레트로 파스텔 디자인.

두 가지 상황을 모두 처리합니다.
    1) 비밀번호를 아는 경우      → 입력하면 즉시 암호화를 제거합니다.
    2) 비밀번호를 모르는 경우    → 자동으로 유형을 판별해,
        - 권한 잠금(owner) 이면 대입 없이 즉시 해제하고,
        - 열기 비밀번호(user) 이면 사전·숫자PIN·생년월일·무차별 대입으로
          비밀번호를 찾아 해제합니다.

PDF는 파일 선택 버튼뿐 아니라 창에 끌어다 놓아(drag & drop) 열 수 있습니다.
(드래그앤드롭은 tkinterdnd2가 있을 때 활성화되고, 없으면 버튼으로 대체됩니다.)

⚠️  본인이 소유했거나 해제 권한이 있는 문서에만 사용하세요.

실행:
    python scripts/pdf_password_remover_gui.py

배포용 실행 파일(.exe) 만들기:
    pip install pyinstaller tkinterdnd2
    pyinstaller --onefile --windowed --icon scripts/app_icon.ico \
        --add-data "scripts/fonts;fonts" \
        --add-data "scripts/wordlists;wordlists" \
        --collect-all tkinterdnd2 \
        --name "PDF잠금해제" scripts/pdf_password_remover_gui.py
"""

from __future__ import annotations

import itertools
import queue
import sys
import threading
import tkinter as tk
import tkinter.font as tkfont
from pathlib import Path
from tkinter import filedialog

from remove_pdf_password import (
    EXIT_NOT_ENCRYPTED,
    EXIT_WRONG_PASSWORD,
    PasswordRemovalError,
    default_output_path,
    remove_pdf_password,
)
import pdf_password_recovery as recovery

try:
    from _icon_data import ICON_PNG_B64
except ImportError:
    ICON_PNG_B64 = ""

# tkinterdnd2 (드래그앤드롭) — 없어도 앱은 정상 동작
try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    _DND_AVAILABLE = True
except Exception:
    _DND_AVAILABLE = False

# 제작자 카피라이트 (창 하단 표시)
APP_COPYRIGHT = "© 2026 ahn_6945. All rights reserved."

# ---------------------------------------------------------------- 디자인 토큰
PAGE = "#eceef8"
CARD = "#fffdf2"
PANEL = "#f4f6fd"
WHITE = "#ffffff"
SKY = "#d9e8fb"
PERI = "#cbcff4"
ROSE = "#fbd5e8"
BLUSH = "#ffe4ec"
BUTTER = "#fff9dc"
MINT = "#cdeedd"
LILAC = "#e3dcf8"
CANDY = "#f2c6d4"
PLAYHEAD = "#f2aab8"
INK = "#74747f"
INK_SOFT = "#8b8b95"
MUTED = "#a3a3ad"
STROKE = "#c9cad6"
SHADOW = "#d8daea"
DISABLED_FILL = "#ececf1"
RADIUS = 8


def resource_dir() -> Path:
    """번들 데이터(fonts/wordlists) 위치. PyInstaller onefile은 _MEIPASS에 풂."""
    return Path(getattr(sys, "_MEIPASS", Path(__file__).parent))


def load_bundled_fonts() -> None:
    if sys.platform != "win32":
        return
    fonts_dir = resource_dir() / "fonts"
    if not fonts_dir.is_dir():
        return
    import ctypes
    for ttf in fonts_dir.glob("*.ttf"):
        ctypes.windll.gdi32.AddFontResourceExW(str(ttf), 0x10, 0)


def pick_korean_font(root: tk.Tk) -> str:
    families = set(tkfont.families(root))
    for name in ("Pretendard", "Pretendard SemiBold", "Malgun Gothic", "맑은 고딕",
                 "NanumGothic", "Nanum Gothic", "Noto Sans CJK KR", "AppleGothic"):
        if name in families:
            return name
    return tkfont.nametofont("TkDefaultFont").actual("family")


def rounded_rect_points(x1, y1, x2, y2, r):
    return [x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r, x2, y2 - r, x2, y2,
            x2 - r, y2, x1 + r, y2, x1, y2, x1, y2 - r, x1, y1 + r, x1, y1]


class RoundButton(tk.Canvas):
    def __init__(self, parent, text, fill, hover, outline, command=None,
                 width=96, height=32, font=None, fg=INK, radius=RADIUS):
        super().__init__(parent, width=width, height=height, bg=parent["bg"],
                         highlightthickness=0, bd=0, cursor="hand2")
        self._fill, self._hover, self._outline, self._fg = fill, hover, outline, fg
        self._command = command
        self._enabled = True
        self._shape = self.create_polygon(
            rounded_rect_points(1, 1, width - 2, height - 2, radius),
            smooth=True, splinesteps=24, fill=fill, outline=outline, width=1)
        self._label = self.create_text(width // 2, height // 2, text=text, fill=fg, font=font)
        self.bind("<Button-1>", self._on_click)
        self.bind("<Enter>", lambda _e: self._paint(self._hover))
        self.bind("<Leave>", lambda _e: self._paint(self._fill))

    def _paint(self, color):
        if self._enabled:
            self.itemconfig(self._shape, fill=color)

    def _on_click(self, _e):
        if self._enabled and self._command:
            self._command()

    def set_text(self, text):
        self.itemconfig(self._label, text=text)

    def set_enabled(self, enabled):
        self._enabled = enabled
        self.itemconfig(self._shape, fill=self._fill if enabled else DISABLED_FILL,
                        outline=self._outline if enabled else STROKE)
        self.itemconfig(self._label, fill=self._fg if enabled else MUTED)
        self.config(cursor="hand2" if enabled else "arrow")


class Chip(tk.Canvas):
    STYLES = {
        "ready": (MINT, "#b2dcc6", "READY"),
        "info": (SKY, "#b9cfec", "정보"),
        "busy": (BUTTER, "#eadf9e", "진행 중"),
        "done": (MINT, "#b2dcc6", "완료"),
        "fail": (BLUSH, "#eeb3c4", "실패"),
        "owner": (LILAC, "#c9bcec", "권한 잠금"),
        "user": (CANDY, "#e3a8bb", "열기 잠금"),
    }

    def __init__(self, parent, font, width=74, height=22):
        super().__init__(parent, width=width, height=height, bg=parent["bg"],
                         highlightthickness=0, bd=0)
        self._font = font
        self._shape = self.create_polygon(
            rounded_rect_points(1, 1, width - 2, height - 2, height // 2 - 1),
            smooth=True, splinesteps=24, fill=MINT, outline="#b2dcc6", width=1)
        self._label = self.create_text(width // 2, height // 2, text="READY", fill=INK, font=font)
        self.set_state("ready")

    def set_state(self, state, text=None):
        fill, outline, default = self.STYLES[state]
        self.itemconfig(self._shape, fill=fill, outline=outline)
        self.itemconfig(self._label, text=text or default)


def _dialog(root, title, message, kind, ask=False):
    accent = {"info": MINT, "error": CANDY, "warning": BUTTER, "ask": SKY}[kind]
    body_font = (root.app_font, 10)
    small_bold = (root.app_font, 9, "bold")
    win = tk.Toplevel(root, bg=PAGE)
    win.title(title)
    win.resizable(False, False)
    win.transient(root)
    holder = tk.Frame(win, bg=SHADOW)
    holder.pack(padx=16, pady=16)
    card = tk.Frame(holder, bg=CARD, highlightthickness=1, highlightbackground=STROKE)
    card.pack(padx=(0, 4), pady=(0, 4))
    head = tk.Frame(card, bg=PANEL)
    head.pack(fill="x")
    tk.Frame(head, bg=accent, width=10, height=10, highlightthickness=1,
             highlightbackground=STROKE).pack(side="left", padx=(12, 8), pady=10)
    tk.Label(head, text=title, bg=PANEL, fg=INK, font=small_bold).pack(side="left", pady=8)
    tk.Frame(card, bg=STROKE, height=1).pack(fill="x")
    tk.Label(card, text=message, bg=CARD, fg=INK_SOFT, font=body_font,
             wraplength=340, justify="left").pack(padx=20, pady=16)
    result = {"ok": False}
    row = tk.Frame(card, bg=CARD)
    row.pack(pady=(0, 16))

    def close(ok):
        result["ok"] = ok
        win.destroy()

    if ask:
        RoundButton(row, "예", CANDY, PLAYHEAD, "#e3a8bb", command=lambda: close(True),
                    width=88, font=small_bold).pack(side="left", padx=4)
        RoundButton(row, "아니요", SKY, "#c5dcf8", "#b9cfec", command=lambda: close(False),
                    width=88, font=small_bold).pack(side="left", padx=4)
    else:
        RoundButton(row, "확인", CANDY, PLAYHEAD, "#e3a8bb", command=lambda: close(True),
                    width=120, font=small_bold).pack()
    win.update_idletasks()
    x = root.winfo_rootx() + (root.winfo_width() - win.winfo_width()) // 2
    y = root.winfo_rooty() + (root.winfo_height() - win.winfo_height()) // 3
    win.geometry(f"+{max(x, 0)}+{max(y, 0)}")
    win.grab_set()
    win.wait_window()
    return result["ok"]


def show_info(root, title, message):
    _dialog(root, title, message, "info")


def show_error(root, title, message):
    _dialog(root, title, message, "error")


def show_warning(root, title, message):
    _dialog(root, title, message, "warning")


def ask_yes_no(root, title, message):
    return _dialog(root, title, message, "ask", ask=True)


# 워커 → GUI 메시지 (스레드 안전 큐로 전달)
MSG_PROGRESS = "progress"
MSG_RESULT = "result"


class PdfUnlockerApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        root.title("PDF 잠금해제")
        root.resizable(False, False)
        root.configure(bg=PAGE)

        fam = pick_korean_font(root)
        root.app_font = fam
        self.f_title = (fam, 11, "bold")
        self.f_label = (fam, 9, "bold")
        self.f_body = (fam, 10)
        self.f_small = (fam, 8)
        self.f_tiny = (fam, 7)

        if ICON_PNG_B64:
            try:
                self._icon = tk.PhotoImage(data=ICON_PNG_B64)
                root.iconphoto(True, self._icon)
            except tk.TclError:
                pass

        self.msg_queue: queue.Queue = queue.Queue()
        self.worker: threading.Thread | None = None
        self.cancel_event = threading.Event()
        self.pdf_kind: str | None = None

        outer = tk.Frame(root, bg=PAGE)
        outer.pack(padx=20, pady=20)
        holder = tk.Frame(outer, bg=SHADOW)
        holder.pack()
        card = tk.Frame(holder, bg=CARD, highlightthickness=1, highlightbackground=STROKE)
        card.pack(padx=(0, 4), pady=(0, 4))

        # 헤더
        head = tk.Frame(card, bg=PANEL)
        head.pack(fill="x")
        tk.Frame(head, bg=PERI, width=12, height=12, highlightthickness=1,
                 highlightbackground=STROKE).pack(side="left", padx=(14, 8), pady=12)
        tk.Label(head, text="PDF 잠금해제", bg=PANEL, fg=INK, font=self.f_title).pack(
            side="left", pady=8)
        for c in (CANDY, MINT, BUTTER):
            tk.Frame(head, bg=c, width=10, height=10, highlightthickness=1,
                     highlightbackground=STROKE).pack(side="right", padx=(0, 6), pady=13)
        tk.Frame(card, bg=STROKE, height=1).pack(fill="x")

        body = tk.Frame(card, bg=CARD)
        body.pack(padx=22, pady=(14, 10))
        body.columnconfigure(0, minsize=340)

        # 드롭 영역 (파일)
        self._section(body, 0, "PDF 파일  ·  여기로 끌어다 놓기", SKY)
        self.input_var = tk.StringVar()
        self.input_entry = self._entry(body, self.input_var)
        self.input_entry.grid(row=1, column=0, sticky="we", ipady=5)
        RoundButton(body, "찾아보기", SKY, "#c5dcf8", "#b9cfec",
                    command=self.browse_input, font=self.f_label).grid(
            row=1, column=1, padx=(10, 0))

        # 상태 칩 + 상태 텍스트
        status_row = tk.Frame(body, bg=CARD)
        status_row.grid(row=2, column=0, columnspan=2, sticky="we", pady=(10, 2))
        self.chip = Chip(status_row, font=(fam, 8, "bold"))
        self.chip.pack(side="left", padx=(0, 8), anchor="n")
        self.status_var = tk.StringVar(
            value="PDF를 끌어다 놓거나 '찾아보기'로 선택하세요.")
        tk.Label(status_row, textvariable=self.status_var, bg=CARD, fg=INK_SOFT,
                 font=self.f_small, wraplength=360, justify="left").pack(side="left")

        # 동적 영역: 유형에 따라 내용이 바뀜
        self.dynamic = tk.Frame(body, bg=CARD)
        self.dynamic.grid(row=3, column=0, columnspan=2, sticky="we", pady=(8, 2))
        self.dynamic.columnconfigure(0, weight=1)
        self._build_password_panel()
        self._build_recovery_panel()

        # 저장 위치
        self._section(body, 4, "저장할 위치", MINT)
        self.output_var = tk.StringVar()
        self._entry(body, self.output_var).grid(row=5, column=0, sticky="we", ipady=5)
        RoundButton(body, "변경", LILAC, "#d4c9f3", "#c9bcec",
                    command=self.browse_output, font=self.f_label).grid(
            row=5, column=1, padx=(10, 0))

        # 진행 표시줄 (복구 중)
        self.progress_wrap = tk.Frame(body, bg=CARD)
        self.progress_wrap.grid(row=6, column=0, columnspan=2, sticky="we", pady=(8, 0))
        self.progress_wrap.grid_remove()
        self.bar = _MarqueeBar(self.progress_wrap, width=436, height=10)
        self.bar.pack(fill="x")
        self.progress_var = tk.StringVar(value="")
        tk.Label(self.progress_wrap, textvariable=self.progress_var, bg=CARD,
                 fg=INK_SOFT, font=self.f_small).pack(anchor="w", pady=(4, 0))

        # 합법 사용 경고
        tk.Label(card,
                 text="본인이 소유했거나 해제 권한이 있는 문서에만 사용하세요.",
                 bg=CARD, fg=MUTED, font=self.f_tiny).pack(pady=(6, 2))
        tk.Label(card, text="R E T R O · P A S T E L · P D F  U N L O C K",
                 bg=CARD, fg=MUTED, font=self.f_tiny).pack(pady=(0, 2))
        # 제작자 카피라이트
        tk.Label(card, text=APP_COPYRIGHT,
                 bg=CARD, fg=INK_SOFT, font=self.f_tiny).pack(pady=(0, 10))

        self.input_var.trace_add("write", self._on_input_changed)
        self._register_dnd()
        self._show_dynamic(None)

        root.update_idletasks()
        x = (root.winfo_screenwidth() - root.winfo_reqwidth()) // 2
        y = (root.winfo_screenheight() - root.winfo_reqheight()) // 4
        root.geometry(f"+{max(x, 0)}+{max(y, 0)}")

    # ---------------------------------------------------------------- 위젯 헬퍼
    def _section(self, parent, row, text, bullet):
        wrap = tk.Frame(parent, bg=CARD)
        wrap.grid(row=row, column=0, columnspan=2, sticky="w", pady=(8, 4))
        tk.Frame(wrap, bg=bullet, width=8, height=8, highlightthickness=1,
                 highlightbackground=STROKE).pack(side="left", padx=(0, 6))
        tk.Label(wrap, text=text, bg=CARD, fg=INK_SOFT, font=self.f_label).pack(side="left")

    def _entry(self, parent, var, show=""):
        return tk.Entry(parent, textvariable=var, font=self.f_body, fg=INK, bg=WHITE,
                        insertbackground=INK, relief="flat", show=show,
                        highlightthickness=1, highlightbackground=STROKE, highlightcolor=PERI)

    def _check(self, parent, text, var):
        return tk.Checkbutton(parent, text=text, variable=var, bg=CARD, activebackground=CARD,
                              fg=INK_SOFT, font=self.f_small, selectcolor=WHITE, relief="flat",
                              highlightthickness=0, anchor="w")

    # ---------------------------------------------------------------- 패널 구성
    def _build_password_panel(self):
        """비밀번호를 아는 경우 / 권한 잠금 즉시 해제."""
        self.pw_panel = tk.Frame(self.dynamic, bg=CARD)
        self.pw_hint = tk.Label(self.pw_panel, bg=CARD, fg=INK_SOFT, font=self.f_small,
                                wraplength=430, justify="left", text="")
        self.pw_hint.grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 4))
        self.password_var = tk.StringVar()
        self.password_entry = self._entry(self.pw_panel, self.password_var, show="•")
        self.password_entry.grid(row=1, column=0, sticky="we", ipady=5)
        self.pw_panel.columnconfigure(0, weight=1)
        self.show_var = tk.BooleanVar(value=False)
        self._check(self.pw_panel, "표시", self.show_var).grid(row=1, column=1, padx=(8, 0))
        self.show_var.trace_add("write", lambda *_: self.password_entry.config(
            show="" if self.show_var.get() else "•"))
        self.unlock_btn = RoundButton(self.pw_panel, "해제", CANDY, PLAYHEAD, "#e3a8bb",
                                      command=self.on_unlock_known, width=436, height=36,
                                      font=self.f_label)
        self.unlock_btn.grid(row=2, column=0, columnspan=2, pady=(12, 2))
        self.password_entry.bind("<Return>", lambda _e: self.on_unlock_known())

    def _build_recovery_panel(self):
        """열기 비밀번호를 모르는 경우 — 복구 방법 선택 + 시작/중지."""
        self.rec_panel = tk.Frame(self.dynamic, bg=CARD)
        self.rec_panel.columnconfigure(0, weight=1)
        tk.Label(self.rec_panel, bg=CARD, fg=INK_SOFT, font=self.f_small, justify="left",
                 wraplength=430,
                 text="열기 비밀번호가 걸려 있습니다. 아래 방법으로 찾아 해제합니다.").grid(
            row=0, column=0, sticky="w", pady=(0, 6))

        methods = tk.Frame(self.rec_panel, bg=CARD)
        methods.grid(row=1, column=0, sticky="we")
        self.m_dict = tk.BooleanVar(value=True)
        self.m_pin = tk.BooleanVar(value=True)
        self.m_date = tk.BooleanVar(value=True)
        self.m_brute = tk.BooleanVar(value=False)
        self._check(methods, "자주 쓰는 비밀번호 사전", self.m_dict).grid(row=0, column=0, sticky="w")
        self._check(methods, "숫자 PIN (4~6자리)", self.m_pin).grid(row=1, column=0, sticky="w")
        self._check(methods, "생년월일 (YYMMDD·YYYYMMDD)", self.m_date).grid(row=2, column=0, sticky="w")
        self._check(methods, "무차별 대입 (소문자+숫자, 1~4자리)", self.m_brute).grid(row=3, column=0, sticky="w")

        wl = tk.Frame(self.rec_panel, bg=CARD)
        wl.grid(row=2, column=0, sticky="we", pady=(6, 0))
        wl.columnconfigure(0, weight=1)
        self.wordlist_var = tk.StringVar()
        self._entry(wl, self.wordlist_var).grid(row=0, column=0, sticky="we", ipady=4)
        RoundButton(wl, "내 사전 추가", LILAC, "#d4c9f3", "#c9bcec",
                    command=self.browse_wordlist, font=self.f_small, width=104).grid(
            row=0, column=1, padx=(8, 0))

        btns = tk.Frame(self.rec_panel, bg=CARD)
        btns.grid(row=3, column=0, pady=(12, 2))
        self.start_btn = RoundButton(btns, "비밀번호 찾기 시작", CANDY, PLAYHEAD, "#e3a8bb",
                                     command=self.on_recover, width=280, height=36,
                                     font=self.f_label)
        self.start_btn.pack(side="left", padx=(0, 8))
        self.stop_btn = RoundButton(btns, "중지", BLUSH, "#f4c2d2", "#eeb3c4",
                                    command=self.on_cancel, width=96, height=36,
                                    font=self.f_label)
        self.stop_btn.pack(side="left")
        self.stop_btn.set_enabled(False)

    def _show_dynamic(self, kind):
        for p in (self.pw_panel, self.rec_panel):
            p.grid_remove()
        if kind == recovery.USER_LOCKED:
            self.rec_panel.grid(row=0, column=0, sticky="we")
        elif kind in (recovery.OWNER_ONLY, "known"):
            self.pw_panel.grid(row=0, column=0, sticky="we")
        # None 또는 not_encrypted → 아무 패널도 표시하지 않음

    # ---------------------------------------------------------------- 파일 로드
    def browse_input(self):
        path = filedialog.askopenfilename(
            title="PDF 선택", filetypes=[("PDF 파일", "*.pdf"), ("모든 파일", "*.*")])
        if path:
            self.input_var.set(path)

    def browse_output(self):
        current = self.output_var.get()
        path = filedialog.asksaveasfilename(
            title="저장할 위치", defaultextension=".pdf",
            initialfile=Path(current).name if current else "unlocked.pdf",
            filetypes=[("PDF 파일", "*.pdf")])
        if path:
            self.output_var.set(path)

    def browse_wordlist(self):
        path = filedialog.askopenfilename(
            title="사전 파일(.txt) 선택", filetypes=[("텍스트", "*.txt"), ("모든 파일", "*.*")])
        if path:
            self.wordlist_var.set(path)

    def _register_dnd(self):
        if not _DND_AVAILABLE:
            return
        try:
            self.root.drop_target_register(DND_FILES)
            self.root.dnd_bind("<<Drop>>", self._on_drop)
            self.input_entry.drop_target_register(DND_FILES)
            self.input_entry.dnd_bind("<<Drop>>", self._on_drop)
        except Exception:
            pass

    def _on_drop(self, event):
        data = event.data.strip()
        # tkdnd는 공백 경로를 {} 로 감쌈. 첫 번째 파일만 사용.
        if data.startswith("{"):
            path = data[1:data.index("}")] if "}" in data else data[1:]
        else:
            path = data.split()[0] if " " in data and not Path(data).exists() else data
        self.input_var.set(path)

    def _on_input_changed(self, *_args):
        raw = self.input_var.get().strip().strip("{}")
        if not raw:
            self.chip.set_state("ready")
            self.status_var.set("PDF를 끌어다 놓거나 '찾아보기'로 선택하세요.")
            self._show_dynamic(None)
            return
        path = Path(raw)
        if not path.is_file():
            self.chip.set_state("fail", "없음")
            self.status_var.set(f"파일을 찾을 수 없습니다: {path.name}")
            self._show_dynamic(None)
            return
        self.output_var.set(str(default_output_path(path)))
        self._classify_async(path)

    def _classify_async(self, path: Path):
        self.pdf_kind = None  # 새 파일 분류 전 이전 상태 초기화
        self.chip.set_state("info", "확인 중")
        self.status_var.set("파일 유형을 확인하고 있습니다…")

        def work():
            try:
                kind = recovery.classify_pdf(path)
            except Exception as exc:
                self.msg_queue.put(("classify_error", str(exc)))
            else:
                self.msg_queue.put(("classify", kind))

        threading.Thread(target=work, daemon=True).start()
        self.root.after(80, self._poll)

    def _apply_kind(self, kind: str):
        self.pdf_kind = kind
        if kind == recovery.NOT_ENCRYPTED:
            self.chip.set_state("done", "암호화 아님")
            self.status_var.set("이 PDF는 암호화되어 있지 않습니다. 해제할 필요가 없습니다.")
            self._show_dynamic(None)
        elif kind == recovery.OWNER_ONLY:
            self.chip.set_state("owner")
            self.status_var.set("권한(인쇄·복사) 잠금입니다. 비밀번호 없이 즉시 해제할 수 있습니다.")
            self.pw_hint.config(
                text="비밀번호 입력 없이 바로 해제됩니다. (필요하면 아는 비밀번호를 넣어도 됩니다.)")
            self.unlock_btn.set_text("즉시 해제")
            self._show_dynamic(recovery.OWNER_ONLY)
        elif kind == recovery.USER_LOCKED:
            self.chip.set_state("user")
            self.status_var.set("열기 비밀번호가 걸려 있습니다. 알고 있으면 입력해 해제하거나, 아래에서 찾으세요.")
            self._show_dynamic(recovery.USER_LOCKED)

    # ---------------------------------------------------------------- 실행: 해제
    def _resolve_output(self) -> str | None:
        out = self.output_var.get().strip()
        if not out:
            src = self.input_var.get().strip().strip("{}")
            out = str(default_output_path(Path(src)))
            self.output_var.set(out)
        if Path(out).exists():
            if not ask_yes_no(self.root, "덮어쓰기 확인",
                              f"{Path(out).name} 파일이 이미 있습니다. 덮어쓸까요?"):
                return None
        return out

    def on_unlock_known(self):
        if self._busy():
            return
        src = self.input_var.get().strip().strip("{}")
        if not src or not Path(src).is_file():
            show_warning(self.root, "입력 필요", "PDF 파일을 먼저 선택하세요.")
            return
        # 권한 잠금이면 빈 비밀번호로 해제, 아니면 입력값 사용
        password = self.password_var.get()
        if self.pdf_kind == recovery.OWNER_ONLY and not password:
            password = ""
        elif not password:
            show_warning(self.root, "입력 필요", "비밀번호를 입력하세요.")
            return
        out = self._resolve_output()
        if out is None:
            return
        self._run_worker(self._unlock_worker, (src, out, password))

    def _unlock_worker(self, src, out, password):
        try:
            written = remove_pdf_password(src, out, password, overwrite=True)
        except PasswordRemovalError as exc:
            if exc.exit_code == EXIT_WRONG_PASSWORD:
                msg = "비밀번호가 올바르지 않습니다."
            elif exc.exit_code == EXIT_NOT_ENCRYPTED:
                msg = "이 PDF는 암호화되어 있지 않습니다."
            else:
                msg = str(exc)
            self.msg_queue.put((MSG_RESULT, (False, msg, None)))
        except Exception as exc:
            self.msg_queue.put((MSG_RESULT, (False, f"오류: {exc}", None)))
        else:
            self.msg_queue.put((MSG_RESULT, (True, str(written), None)))

    # ---------------------------------------------------------------- 실행: 복구
    def _build_candidates(self):
        chains = []
        if self.wordlist_var.get().strip():
            chains.append(recovery.from_wordlists([self.wordlist_var.get().strip()]))
        if self.m_dict.get():
            bundled = resource_dir() / "wordlists" / "common.txt"
            chains.append(recovery.from_wordlists([bundled]))
        if self.m_date.get():
            chains.append(recovery.date_passwords())
        if self.m_pin.get():
            chains.append(recovery.numeric_pins(4, 6))
        if self.m_brute.get():
            chains.append(recovery.brute_force(recovery.CHARSET_ALNUM, 1, 4))
        return itertools.chain(*chains)

    def on_recover(self):
        if self._busy():
            return
        src = self.input_var.get().strip().strip("{}")
        if not src or not Path(src).is_file():
            show_warning(self.root, "입력 필요", "PDF 파일을 먼저 선택하세요.")
            return
        if not any((self.m_dict.get(), self.m_pin.get(), self.m_date.get(),
                    self.m_brute.get(), self.wordlist_var.get().strip())):
            show_warning(self.root, "방법 선택", "비밀번호를 찾을 방법을 하나 이상 선택하세요.")
            return
        out = self._resolve_output()
        if out is None:
            return
        self.cancel_event.clear()
        candidates = self._build_candidates()
        self.progress_wrap.grid()
        self.bar.start()
        self.progress_var.set("비밀번호를 찾는 중…  (중지 버튼으로 언제든 멈출 수 있습니다)")
        self.stop_btn.set_enabled(True)
        self.start_btn.set_enabled(False)
        self._run_worker(self._recover_worker, (src, out, candidates), toggle_ui=False)

    def _recover_worker(self, src, out, candidates):
        def on_progress(attempts, candidate, rate):
            self.msg_queue.put((MSG_PROGRESS, (attempts, candidate, rate)))

        result = recovery.recover_password(
            src, candidates, should_stop=self.cancel_event.is_set,
            progress=on_progress, progress_every=100)
        if result.cancelled:
            self.msg_queue.put((MSG_RESULT, (False, "사용자가 중지했습니다.",
                                             {"cancelled": True, "attempts": result.attempts})))
            return
        if not result.found:
            self.msg_queue.put((MSG_RESULT,
                (False, f"선택한 방법으로는 비밀번호를 찾지 못했습니다. "
                        f"({result.attempts:,}회 시도) 다른 방법이나 사전을 추가해 보세요.",
                 {"exhausted": True})))
            return
        # 찾았으면 해제된 사본 저장
        try:
            written = remove_pdf_password(src, out, result.password, overwrite=True)
        except Exception as exc:
            self.msg_queue.put((MSG_RESULT,
                (False, f"비밀번호({result.password})는 찾았지만 저장에 실패했습니다: {exc}", None)))
            return
        self.msg_queue.put((MSG_RESULT,
            (True, str(written), {"password": result.password, "attempts": result.attempts})))

    def on_cancel(self):
        self.cancel_event.set()
        self.stop_btn.set_enabled(False)
        self.progress_var.set("중지하는 중…")

    # ---------------------------------------------------------------- 워커/폴링
    def _busy(self):
        return self.worker is not None and self.worker.is_alive()

    def _run_worker(self, target, args, toggle_ui=True):
        if toggle_ui:
            self.chip.set_state("busy")
            self.status_var.set("처리 중입니다…")
        self.worker = threading.Thread(target=target, args=args, daemon=True)
        self.worker.start()
        self.root.after(80, self._poll)

    def _poll(self):
        try:
            while True:
                kind, payload = self.msg_queue.get_nowait()
                if kind == "classify":
                    self._apply_kind(payload)
                elif kind == "classify_error":
                    self.chip.set_state("fail")
                    self.status_var.set(f"파일을 읽을 수 없습니다: {payload}")
                    self._show_dynamic(None)
                elif kind == MSG_PROGRESS:
                    attempts, candidate, rate = payload
                    self.progress_var.set(
                        f"시도 {attempts:,}회  ·  {rate:.0f}회/초  ·  현재: {candidate}")
                elif kind == MSG_RESULT:
                    self._on_result(*payload)
        except queue.Empty:
            pass
        if self._busy() or not self.msg_queue.empty():
            self.root.after(80, self._poll)

    def _on_result(self, ok, message, extra):
        self.bar.stop()
        self.progress_wrap.grid_remove()
        self.start_btn.set_enabled(True)
        self.stop_btn.set_enabled(False)
        if ok:
            self.chip.set_state("done")
            if extra and extra.get("password") is not None:
                self.status_var.set(
                    f"비밀번호를 찾았습니다: '{extra['password']}'  →  저장: {message}")
                show_info(self.root, "해제 완료",
                          f"비밀번호를 찾았습니다.\n\n비밀번호: {extra['password']}\n"
                          f"시도 횟수: {extra['attempts']:,}회\n저장 위치: {message}")
            else:
                self.status_var.set(f"저장 위치: {message}")
                show_info(self.root, "완료", f"잠금을 해제했습니다.\n\n{message}")
        else:
            self.chip.set_state("fail")
            self.status_var.set(message)
            if not (extra and extra.get("cancelled")):
                show_error(self.root, "실패", message)


class _MarqueeBar(tk.Canvas):
    """진행 중임을 보여주는 파스텔 마퀴 바 (총량을 모를 때)."""

    def __init__(self, parent, width=436, height=10):
        super().__init__(parent, width=width, height=height, bg=parent["bg"],
                         highlightthickness=0, bd=0)
        self._bw, self._bh = width, height
        self.create_rounded = lambda x1, y1, x2, y2, c: self.create_polygon(
            rounded_rect_points(x1, y1, x2, y2, (y2 - y1) / 2),
            smooth=True, splinesteps=16, fill=c, outline="")
        self._track = self.create_rounded(1, 1, width - 1, height - 1, PANEL)
        self._chip = self.create_rounded(1, 1, 90, height - 1, CANDY)
        self._x = -90
        self._running = False

    def start(self):
        if not self._running:
            self._running = True
            self._animate()

    def stop(self):
        self._running = False

    def _animate(self):
        if not self._running:
            return
        self._x = (self._x + 12) % (self._bw + 90)
        x = self._x - 90
        self.coords(self._chip, *rounded_rect_points(
            max(1, x), 1, min(self._bw - 1, x + 90), self._bh - 1, (self._bh - 2) / 2))
        self.after(40, self._animate)


def main():
    load_bundled_fonts()
    root = TkinterDnD.Tk() if _DND_AVAILABLE else tk.Tk()
    PdfUnlockerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
