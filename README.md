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

## PDF 비밀번호 해제 · 복구

생활기록부처럼 비밀번호가 걸린 PDF의 잠금을 풀어 줍니다. **비밀번호를 아는
경우**뿐 아니라 **모르는 경우**(잊어버린 내 문서)도 처리합니다.

> ⚠️ **본인이 소유했거나 해제 권한이 있는 문서에만 사용하세요.** 타인의 문서를
> 무단으로 해제하는 것은 불법일 수 있습니다.

PDF 비밀번호는 두 종류이고 접근이 다릅니다.

| 유형 | 증상 | 해제 방법 |
| --- | --- | --- |
| **권한 비밀번호(owner)** | 파일은 열리는데 인쇄·복사·편집만 막힘 | 대입 없이 **즉시 해제** |
| **열기 비밀번호(user)** | 파일 자체가 안 열림 | 후보를 **찾아서** 해제 (사전·PIN·생년월일·무차별) |

**Prerequisites:** Python 3.9+, `pip install -r scripts/requirements.txt`

### 비밀번호를 아는 경우 — 즉시 제거

[scripts/remove_pdf_password.py](scripts/remove_pdf_password.py):

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

### 비밀번호를 모르는 경우 — 복구

[scripts/pdf_recover_cli.py](scripts/pdf_recover_cli.py)는 유형을 자동 판별해,
권한 잠금이면 즉시 해제하고 열기 비밀번호면 후보를 대입해 찾습니다.

```bash
# 유형만 확인
python scripts/pdf_recover_cli.py locked.pdf --classify

# 사전 + 숫자PIN(4~6) + 생년월일로 찾기 (기본값)
python scripts/pdf_recover_cli.py locked.pdf -o unlocked.pdf

# 내 사전 파일 추가 + 무차별(소문자+숫자 1~4자리)
python scripts/pdf_recover_cli.py locked.pdf -w mywords.txt --brute
```

복구 엔진([scripts/pdf_password_recovery.py](scripts/pdf_password_recovery.py))은
공용 사전([scripts/wordlists/common.txt](scripts/wordlists/common.txt)), 숫자 PIN,
실제 달력 기준 생년월일, 무차별 대입 후보를 생성합니다. 단, 강한 비밀번호가 걸린
AES-256 PDF는 현실적으로 대입으로 풀 수 없습니다(초당 ~170회). 자주 쓰는 비밀번호,
짧은 PIN, 생년월일 위주로만 실효성이 있습니다.

### GUI 프로그램

터미널 대신 창에서 쓰고 싶다면 GUI 버전을 실행하세요
([scripts/pdf_password_remover_gui.py](scripts/pdf_password_remover_gui.py)):

```bash
python scripts/pdf_password_remover_gui.py
```

GUI는 위 두 경우를 모두 지원합니다. PDF를 **창에 끌어다 놓으면**(드래그앤드롭)
유형을 자동 판별해, 권한 잠금이면 "즉시 해제" 버튼을, 열기 비밀번호면 복구 방법
선택 화면(사전·PIN·생년월일·무차별)과 진행률·중지 버튼을 보여줍니다.

드래그앤드롭은 `tkinterdnd2`가 있을 때 켜지고, 없으면 "찾아보기" 버튼으로
대체됩니다. 리눅스에서 tkinter가 없다면 `sudo apt install python3-tk`로 설치하세요.

배포용 실행 파일(더블클릭으로 실행되는 .exe)을 만들려면:

```bash
pip install pyinstaller tkinterdnd2
pyinstaller --onefile --windowed --icon scripts/app_icon.ico \
    --add-data "scripts/fonts;fonts" \
    --add-data "scripts/wordlists;wordlists" \
    --collect-all tkinterdnd2 \
    --name "PDF잠금해제" scripts/pdf_password_remover_gui.py
# 결과물: dist/PDF잠금해제.exe (Windows에서 빌드 시)
```

GitHub Actions로도 빌드됩니다 — Actions 탭에서 **Build Windows EXE** 워크플로를
실행하면 `pdf-unlocker-windows` 아티팩트로 GUI·해제 CLI·복구 CLI exe가
업로드됩니다 (`v*` 태그 푸시 시 자동 실행).

GUI는 레트로 파스텔 디자인 시스템(무광 · 1px 선 · 순검정 없음 · radius 8)을 따르고,
아이콘·폰트(Pretendard)는 exe에 내장됩니다.
