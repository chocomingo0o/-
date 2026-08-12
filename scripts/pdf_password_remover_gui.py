#!/usr/bin/env python3
"""PDF 비밀번호 해제 GUI 프로그램 — 레트로 파스텔 디자인.

scripts/remove_pdf_password.py의 핵심 로직을 그대로 사용하는 tkinter 앱입니다.
파일을 선택하고 비밀번호를 입력하면 잠금이 해제된 사본을 만들어 줍니다.

디자인 원칙 (SOMLUTION 디자인 시스템 레퍼런스):
    레트로 파스텔 · 무광 · 1px 선 · 순검정 없음 · radius 8 · 레트로 오프셋 그림자

실행:
    python scripts/pdf_password_remover_gui.py

배포용 실행 파일(.exe) 만들기:
    pip install pyinstaller
    pyinstaller --onefile --windowed --icon scripts/app_icon.ico \
        --add-data "scripts/fonts;fonts" \
        --name "PDF잠금해제" scripts/pdf_password_remover_gui.py
"""

from __future__ import annotations

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

try:
    from _icon_data import ICON_PNG_B64
except ImportError:  # 아이콘 없이도 동작
    ICON_PNG_B64 = ""

# ---------------------------------------------------------------- 디자인 토큰
# 서피스
PAGE = "#eceef8"
CARD = "#fffdf2"
PANEL = "#f4f6fd"
WHITE = "#ffffff"
# 파스텔
SKY = "#d9e8fb"
PERI = "#cbcff4"
ROSE = "#fbd5e8"
BLUSH = "#ffe4ec"
BUTTER = "#fff9dc"
MINT = "#cdeedd"
LILAC = "#e3dcf8"
CANDY = "#f2c6d4"
PLAYHEAD = "#f2aab8"
# 잉크 · 스트로크 (순검정 없음)
INK = "#74747f"
INK_SOFT = "#8b8b95"
MUTED = "#a3a3ad"
STROKE = "#c9cad6"
SHADOW = "#d8daea"
DISABLED_FILL = "#ececf1"

RADIUS = 8


def load_bundled_fonts() -> None:
    """exe에 내장된 Pretendard를 설치 없이 이 프로세스에서만 사용하도록 등록.

    PyInstaller onefile은 sys._MEIPASS에 데이터를 풀어 놓는다. Windows에서는
    AddFontResourceExW(FR_PRIVATE)로 프로세스 전용 폰트로 올린다. 다른 OS는
    시스템에 설치된 폰트를 그대로 쓴다.
    """
    if sys.platform != "win32":
        return
    fonts_dir = Path(getattr(sys, "_MEIPASS", Path(__file__).parent)) / "fonts"
    if not fonts_dir.is_dir():
        return
    import ctypes
    FR_PRIVATE = 0x10
    for ttf in fonts_dir.glob("*.ttf"):
        ctypes.windll.gdi32.AddFontResourceExW(str(ttf), FR_PRIVATE, 0)


def pick_korean_font(root: tk.Tk) -> str:
    families = set(tkfont.families(root))
    for name in ("Pretendard", "Pretendard SemiBold",
                 "Malgun Gothic", "맑은 고딕", "NanumGothic", "Nanum Gothic",
                 "Noto Sans CJK KR", "AppleGothic"):
        if name in families:
            return name
    return tkfont.nametofont("TkDefaultFont").actual("family")


def rounded_rect_points(x1: float, y1: float, x2: float, y2: float, r: float):
    """smooth polygon용 둥근 사각형 좌표 (모서리마다 점을 겹쳐 곡률 고정)."""
    return [
        x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r, x2, y2 - r, x2, y2,
        x2 - r, y2, x1 + r, y2, x1, y2, x1, y2 - r, x1, y1 + r, x1, y1,
    ]


class RoundButton(tk.Canvas):
    """무광 파스텔 + 1px 선 + radius 8 버튼. hover = 색 반전(진한 톤)."""

    def __init__(self, parent, text: str, fill: str, hover: str, outline: str,
                 command=None, width: int = 96, height: int = 32,
                 font=None, fg: str = INK, radius: int = RADIUS):
        super().__init__(parent, width=width, height=height,
                         bg=parent["bg"], highlightthickness=0, bd=0,
                         cursor="hand2")
        self._fill, self._hover, self._outline, self._fg = fill, hover, outline, fg
        self._command = command
        self._enabled = True
        self._shape = self.create_polygon(
            rounded_rect_points(1, 1, width - 2, height - 2, radius),
            smooth=True, splinesteps=24, fill=fill, outline=outline, width=1)
        self._label = self.create_text(width // 2, height // 2, text=text,
                                       fill=fg, font=font)
        self.bind("<Button-1>", self._on_click)
        self.bind("<Enter>", lambda _e: self._paint(self._hover))
        self.bind("<Leave>", lambda _e: self._paint(self._fill))

    def _paint(self, color: str) -> None:
        if self._enabled:
            self.itemconfig(self._shape, fill=color)

    def _on_click(self, _e) -> None:
        if self._enabled and self._command:
            self._command()

    def set_enabled(self, enabled: bool) -> None:
        self._enabled = enabled
        self.itemconfig(self._shape, fill=self._fill if enabled else DISABLED_FILL,
                        outline=self._outline if enabled else STROKE)
        self.itemconfig(self._label, fill=self._fg if enabled else MUTED)
        self.config(cursor="hand2" if enabled else "arrow")


class Chip(tk.Canvas):
    """READY · 해제 중 · 완료 · 실패 상태 칩 (pill)."""

    STYLES = {
        "ready": (MINT, "#b2dcc6", "READY"),
        "busy": (BUTTER, "#eadf9e", "해제 중"),
        "done": (MINT, "#b2dcc6", "완료"),
        "fail": (BLUSH, "#eeb3c4", "실패"),
    }

    def __init__(self, parent, font, width: int = 64, height: int = 22):
        super().__init__(parent, width=width, height=height, bg=parent["bg"],
                         highlightthickness=0, bd=0)
        self._shape = self.create_polygon(
            rounded_rect_points(1, 1, width - 2, height - 2, height // 2 - 1),
            smooth=True, splinesteps=24, fill=MINT, outline="#b2dcc6", width=1)
        self._label = self.create_text(width // 2, height // 2, text="READY",
                                       fill=INK, font=font)
        self.set_state("ready")

    def set_state(self, state: str) -> None:
        fill, outline, text = self.STYLES[state]
        self.itemconfig(self._shape, fill=fill, outline=outline)
        self.itemconfig(self._label, text=text)


# ------------------------------------------------------- 파스텔 모달 대화상자
# (테스트에서 이 모듈 함수들을 패치할 수 있도록 시임으로 분리)

def _dialog(root, title: str, message: str, kind: str, ask: bool = False) -> bool:
    accent = {"info": MINT, "error": CANDY, "warning": BUTTER, "ask": SKY}[kind]
    body_font = (root.app_font, 10)
    small_bold = (root.app_font, 9, "bold")

    win = tk.Toplevel(root, bg=PAGE)
    win.title(title)
    win.resizable(False, False)
    win.transient(root)

    holder = tk.Frame(win, bg=SHADOW)
    holder.pack(padx=16, pady=16)
    card = tk.Frame(holder, bg=CARD, highlightthickness=1,
                    highlightbackground=STROKE)
    card.pack(padx=(0, 4), pady=(0, 4))

    head = tk.Frame(card, bg=PANEL)
    head.pack(fill="x")
    tk.Frame(head, bg=accent, width=10, height=10,
             highlightthickness=1, highlightbackground=STROKE).pack(
        side="left", padx=(12, 8), pady=10)
    tk.Label(head, text=title, bg=PANEL, fg=INK, font=small_bold).pack(
        side="left", pady=8)
    tk.Frame(card, bg=STROKE, height=1).pack(fill="x")

    tk.Label(card, text=message, bg=CARD, fg=INK_SOFT, font=body_font,
             wraplength=320, justify="left").pack(padx=20, pady=16)

    result = {"ok": False}
    btn_row = tk.Frame(card, bg=CARD)
    btn_row.pack(pady=(0, 16))

    def close(ok: bool):
        result["ok"] = ok
        win.destroy()

    if ask:
        RoundButton(btn_row, "예", CANDY, PLAYHEAD, "#e3a8bb",
                    command=lambda: close(True), width=88, font=small_bold
                    ).pack(side="left", padx=4)
        RoundButton(btn_row, "아니요", SKY, "#c5dcf8", "#b9cfec",
                    command=lambda: close(False), width=88, font=small_bold
                    ).pack(side="left", padx=4)
    else:
        RoundButton(btn_row, "확인", CANDY, PLAYHEAD, "#e3a8bb",
                    command=lambda: close(True), width=120, font=small_bold
                    ).pack()

    win.update_idletasks()
    x = root.winfo_rootx() + (root.winfo_width() - win.winfo_width()) // 2
    y = root.winfo_rooty() + (root.winfo_height() - win.winfo_height()) // 3
    win.geometry(f"+{max(x, 0)}+{max(y, 0)}")
    win.grab_set()
    win.wait_window()
    return result["ok"]


def show_info(root, title: str, message: str) -> None:
    _dialog(root, title, message, "info")


def show_error(root, title: str, message: str) -> None:
    _dialog(root, title, message, "error")


def show_warning(root, title: str, message: str) -> None:
    _dialog(root, title, message, "warning")


def ask_yes_no(root, title: str, message: str) -> bool:
    return _dialog(root, title, message, "ask", ask=True)


# ------------------------------------------------------------------- 메인 앱
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

        self.result_queue: queue.Queue[tuple[bool, str]] = queue.Queue()
        self.worker: threading.Thread | None = None

        # ---- 카드 + 레트로 오프셋 그림자 -----------------------------------
        outer = tk.Frame(root, bg=PAGE)
        outer.pack(padx=20, pady=20)
        holder = tk.Frame(outer, bg=SHADOW)
        holder.pack()
        card = tk.Frame(holder, bg=CARD, highlightthickness=1,
                        highlightbackground=STROKE)
        card.pack(padx=(0, 4), pady=(0, 4))

        # ---- 헤더 바 (연파랑 패널 + 파스텔 사각형) --------------------------
        head = tk.Frame(card, bg=PANEL)
        head.pack(fill="x")
        tk.Frame(head, bg=PERI, width=12, height=12, highlightthickness=1,
                 highlightbackground=STROKE).pack(side="left", padx=(14, 8), pady=12)
        tk.Label(head, text="PDF 잠금해제", bg=PANEL, fg=INK,
                 font=self.f_title).pack(side="left", pady=8)
        for c in (CANDY, MINT, BUTTER):  # 우상단 파스텔 스퀘어 3종
            tk.Frame(head, bg=c, width=10, height=10, highlightthickness=1,
                     highlightbackground=STROKE).pack(side="right",
                                                      padx=(0, 6), pady=13)
        tk.Frame(card, bg=STROKE, height=1).pack(fill="x")

        # ---- 본문 ----------------------------------------------------------
        body = tk.Frame(card, bg=CARD)
        body.pack(padx=22, pady=(16, 10))
        body.columnconfigure(0, minsize=330)

        def section(row: int, text: str, bullet: str):
            wrap = tk.Frame(body, bg=CARD)
            wrap.grid(row=row, column=0, columnspan=2, sticky="w", pady=(8, 4))
            tk.Frame(wrap, bg=bullet, width=8, height=8, highlightthickness=1,
                     highlightbackground=STROKE).pack(side="left", padx=(0, 6))
            tk.Label(wrap, text=text, bg=CARD, fg=INK_SOFT,
                     font=self.f_label).pack(side="left")

        def entry(var: tk.StringVar, show: str = "") -> tk.Entry:
            return tk.Entry(body, textvariable=var, font=self.f_body, fg=INK,
                            bg=WHITE, insertbackground=INK, relief="flat",
                            show=show, highlightthickness=1,
                            highlightbackground=STROKE, highlightcolor=PERI)

        # 입력 파일
        section(0, "암호화된 PDF 파일", SKY)
        self.input_var = tk.StringVar()
        self.input_var.trace_add("write", self._on_input_changed)
        entry(self.input_var).grid(row=1, column=0, sticky="we", ipady=5)
        RoundButton(body, "찾아보기", SKY, "#c5dcf8", "#b9cfec",
                    command=self.browse_input, font=self.f_label
                    ).grid(row=1, column=1, padx=(10, 0))

        # 비밀번호
        section(2, "비밀번호", ROSE)
        self.password_var = tk.StringVar()
        self.password_entry = entry(self.password_var, show="•")
        self.password_entry.grid(row=3, column=0, sticky="we", ipady=5)
        self.show_var = tk.BooleanVar(value=False)
        tk.Checkbutton(body, text="표시", variable=self.show_var,
                       command=self.toggle_password, bg=CARD,
                       activebackground=CARD, fg=INK_SOFT, font=self.f_label,
                       selectcolor=WHITE, relief="flat", highlightthickness=0
                       ).grid(row=3, column=1, padx=(10, 0))

        # 저장 위치
        section(4, "저장할 위치", MINT)
        self.output_var = tk.StringVar()
        entry(self.output_var).grid(row=5, column=0, sticky="we", ipady=5)
        RoundButton(body, "변경", LILAC, "#d4c9f3", "#c9bcec",
                    command=self.browse_output, font=self.f_label
                    ).grid(row=5, column=1, padx=(10, 0))

        # 실행 버튼
        self.run_button = RoundButton(
            body, "비밀번호 해제", CANDY, PLAYHEAD, "#e3a8bb",
            command=self.start_unlock, width=436, height=38, font=self.f_label)
        self.run_button.grid(row=6, column=0, columnspan=2, pady=(18, 6))

        # 상태 칩 + 상태 텍스트
        status_row = tk.Frame(body, bg=CARD)
        status_row.grid(row=7, column=0, columnspan=2, sticky="we", pady=(4, 2))
        self.chip = Chip(status_row, font=(fam, 8, "bold"))
        self.chip.pack(side="left", padx=(0, 8), anchor="n")
        self.status_var = tk.StringVar(
            value="PDF 파일을 선택하고 비밀번호를 입력하세요.")
        tk.Label(status_row, textvariable=self.status_var, bg=CARD,
                 fg=INK_SOFT, font=self.f_small, wraplength=350,
                 justify="left").pack(side="left")

        # 푸터 (레터스페이스 캡션)
        tk.Label(card, text="R E T R O · P A S T E L · P D F  U N L O C K",
                 bg=CARD, fg=MUTED, font=self.f_tiny).pack(pady=(0, 10))

        self.password_entry.bind("<Return>", lambda _e: self.start_unlock())

        root.update_idletasks()
        x = (root.winfo_screenwidth() - root.winfo_reqwidth()) // 2
        y = (root.winfo_screenheight() - root.winfo_reqheight()) // 3
        root.geometry(f"+{max(x, 0)}+{max(y, 0)}")

    # ------------------------------------------------------------------ UI 동작
    def browse_input(self) -> None:
        path = filedialog.askopenfilename(
            title="암호화된 PDF 선택",
            filetypes=[("PDF 파일", "*.pdf"), ("모든 파일", "*.*")],
        )
        if path:
            self.input_var.set(path)

    def browse_output(self) -> None:
        current = self.output_var.get()
        path = filedialog.asksaveasfilename(
            title="저장할 위치",
            defaultextension=".pdf",
            initialfile=Path(current).name if current else "unlocked.pdf",
            filetypes=[("PDF 파일", "*.pdf")],
        )
        if path:
            self.output_var.set(path)

    def toggle_password(self) -> None:
        self.password_entry.config(show="" if self.show_var.get() else "•")

    def _on_input_changed(self, *_args) -> None:
        """입력 파일이 바뀌면 저장 위치를 <이름>_unlocked.pdf로 자동 제안."""
        raw = self.input_var.get().strip()
        if raw:
            self.output_var.set(str(default_output_path(Path(raw))))

    # ------------------------------------------------------------------ 해제 실행
    def start_unlock(self) -> None:
        if self.worker and self.worker.is_alive():
            return

        input_path = self.input_var.get().strip()
        password = self.password_var.get()
        output_path = self.output_var.get().strip()

        if not input_path:
            show_warning(self.root, "입력 필요", "PDF 파일을 선택하세요.")
            return
        if not password:
            show_warning(self.root, "입력 필요", "비밀번호를 입력하세요.")
            return
        if not output_path:
            output_path = str(default_output_path(Path(input_path)))
            self.output_var.set(output_path)

        if Path(output_path).exists():
            if not ask_yes_no(
                self.root, "덮어쓰기 확인",
                f"{Path(output_path).name} 파일이 이미 있습니다. 덮어쓸까요?",
            ):
                return

        self.run_button.set_enabled(False)
        self.chip.set_state("busy")
        self.status_var.set("잠금을 해제하고 있습니다…")

        # 큰 PDF에서도 창이 멈추지 않도록 백그라운드 스레드에서 처리
        self.worker = threading.Thread(
            target=self._unlock_worker,
            args=(input_path, output_path, password),
            daemon=True,
        )
        self.worker.start()
        self.root.after(100, self._poll_result)

    def _unlock_worker(self, input_path: str, output_path: str, password: str) -> None:
        try:
            written = remove_pdf_password(
                input_path, output_path, password, overwrite=True
            )
        except PasswordRemovalError as exc:
            if exc.exit_code == EXIT_WRONG_PASSWORD:
                message = "비밀번호가 올바르지 않습니다."
            elif exc.exit_code == EXIT_NOT_ENCRYPTED:
                message = "이 PDF는 암호화되어 있지 않습니다."
            else:
                message = str(exc)
            self.result_queue.put((False, message))
        except Exception as exc:  # 예상 못 한 오류도 창은 살아 있어야 함
            self.result_queue.put((False, f"오류가 발생했습니다: {exc}"))
        else:
            self.result_queue.put((True, str(written)))

    def _poll_result(self) -> None:
        try:
            ok, message = self.result_queue.get_nowait()
        except queue.Empty:
            self.root.after(100, self._poll_result)
            return

        self.run_button.set_enabled(True)
        if ok:
            self.chip.set_state("done")
            self.status_var.set(f"저장 위치: {message}")
            show_info(self.root, "완료", f"비밀번호가 해제되었습니다.\n\n{message}")
        else:
            self.chip.set_state("fail")
            self.status_var.set(message)
            show_error(self.root, "실패", message)


def main() -> None:
    load_bundled_fonts()
    root = tk.Tk()
    PdfUnlockerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
