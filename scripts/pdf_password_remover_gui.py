#!/usr/bin/env python3
"""PDF 비밀번호 해제 GUI 프로그램.

scripts/remove_pdf_password.py의 핵심 로직을 그대로 사용하는 tkinter 앱입니다.
파일을 선택하고 비밀번호를 입력하면 잠금이 해제된 사본을 만들어 줍니다.

실행:
    python scripts/pdf_password_remover_gui.py

배포용 실행 파일(.exe) 만들기:
    pip install pyinstaller
    pyinstaller --onefile --windowed --name "PDF잠금해제" scripts/pdf_password_remover_gui.py
"""

from __future__ import annotations

import queue
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from remove_pdf_password import (
    EXIT_NOT_ENCRYPTED,
    EXIT_WRONG_PASSWORD,
    PasswordRemovalError,
    default_output_path,
    remove_pdf_password,
)

PAD = {"padx": 12, "pady": 6}


class PdfUnlockerApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        root.title("PDF 비밀번호 해제")
        root.resizable(False, False)

        self.result_queue: queue.Queue[tuple[bool, str]] = queue.Queue()
        self.worker: threading.Thread | None = None

        frame = ttk.Frame(root, padding=16)
        frame.grid(sticky="nsew")

        # --- 입력 파일 ---
        ttk.Label(frame, text="암호화된 PDF 파일").grid(row=0, column=0, sticky="w")
        self.input_var = tk.StringVar()
        self.input_var.trace_add("write", self._on_input_changed)
        ttk.Entry(frame, textvariable=self.input_var, width=48).grid(
            row=1, column=0, sticky="we", **PAD
        )
        ttk.Button(frame, text="찾아보기…", command=self.browse_input).grid(
            row=1, column=1, **PAD
        )

        # --- 비밀번호 ---
        ttk.Label(frame, text="비밀번호").grid(row=2, column=0, sticky="w")
        self.password_var = tk.StringVar()
        self.password_entry = ttk.Entry(
            frame, textvariable=self.password_var, width=48, show="•"
        )
        self.password_entry.grid(row=3, column=0, sticky="we", **PAD)
        self.show_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            frame, text="표시", variable=self.show_var, command=self.toggle_password
        ).grid(row=3, column=1, **PAD)

        # --- 출력 파일 ---
        ttk.Label(frame, text="저장할 위치").grid(row=4, column=0, sticky="w")
        self.output_var = tk.StringVar()
        ttk.Entry(frame, textvariable=self.output_var, width=48).grid(
            row=5, column=0, sticky="we", **PAD
        )
        ttk.Button(frame, text="변경…", command=self.browse_output).grid(
            row=5, column=1, **PAD
        )

        # --- 실행 버튼 + 상태 ---
        self.run_button = ttk.Button(
            frame, text="비밀번호 해제", command=self.start_unlock
        )
        self.run_button.grid(row=6, column=0, columnspan=2, sticky="we", **PAD)

        self.status_var = tk.StringVar(
            value="PDF 파일을 선택하고 비밀번호를 입력하세요."
        )
        ttk.Label(frame, textvariable=self.status_var, wraplength=420).grid(
            row=7, column=0, columnspan=2, sticky="w", **PAD
        )

        self.password_entry.bind("<Return>", lambda _e: self.start_unlock())

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
            messagebox.showwarning("입력 필요", "PDF 파일을 선택하세요.")
            return
        if not password:
            messagebox.showwarning("입력 필요", "비밀번호를 입력하세요.")
            return
        if not output_path:
            output_path = str(default_output_path(Path(input_path)))
            self.output_var.set(output_path)

        if Path(output_path).exists():
            if not messagebox.askyesno(
                "덮어쓰기 확인",
                f"{Path(output_path).name} 파일이 이미 있습니다. 덮어쓸까요?",
            ):
                return

        self.run_button.config(state="disabled")
        self.status_var.set("해제 중…")

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

        self.run_button.config(state="normal")
        if ok:
            self.status_var.set(f"완료! 저장 위치: {message}")
            messagebox.showinfo("완료", f"비밀번호가 해제되었습니다.\n\n{message}")
        else:
            self.status_var.set(message)
            messagebox.showerror("실패", message)


def main() -> None:
    root = tk.Tk()
    PdfUnlockerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
