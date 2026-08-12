<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f4052d04-be48-4ff2-9f56-5780f7d057f3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Remove a PDF password

생활기록부 PDF는 비밀번호가 걸린 경우가 많아 업로드 전에 잠금을 풀어야 합니다.
[scripts/remove_pdf_password.py](scripts/remove_pdf_password.py)가 암호화된 PDF의
잠금을 해제한 사본을 만들어 줍니다.

**Prerequisites:** Python 3.9+, `pip install -r scripts/requirements.txt`

```bash
# writes protected_unlocked.pdf next to the input, prompting for the password
python scripts/remove_pdf_password.py protected.pdf

# or pass the password and output path explicitly
python scripts/remove_pdf_password.py protected.pdf -o unlocked.pdf -p your_password
```

The password can also come from the `PDF_PASSWORD` environment variable. The
script never overwrites the input, and refuses to overwrite an existing output
unless `--force` is given. Exit codes: `0` success, `1` error, `2` wrong
password, `3` input was not encrypted.

### GUI 프로그램

터미널 대신 창에서 쓰고 싶다면 GUI 버전을 실행하세요
([scripts/pdf_password_remover_gui.py](scripts/pdf_password_remover_gui.py)):

```bash
python scripts/pdf_password_remover_gui.py
```

파일을 선택하고 비밀번호를 입력하면 `<이름>_unlocked.pdf`로 저장됩니다.
tkinter(파이썬 기본 포함)만 있으면 되고, 추가 설치는 필요 없습니다.
리눅스에서 tkinter가 없다면 `sudo apt install python3-tk`로 설치하세요.

배포용 실행 파일(더블클릭으로 실행되는 .exe)을 만들려면:

```bash
pip install pyinstaller
pyinstaller --onefile --windowed --name "PDF잠금해제" scripts/pdf_password_remover_gui.py
# 결과물: dist/PDF잠금해제.exe (Windows에서 빌드 시)
```
