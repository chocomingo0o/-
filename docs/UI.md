# 화면 구현 계획

스택: React 19, Tailwind 4(`src/index.css`의 토큰과 유틸리티), lucide-react 아이콘. 애니메이션 라이브러리와 차트 라이브러리는 쓰지 않는다(표와 SVG로 충분).
양식 규칙은 `docs/DESIGN.md` 5.1(단순한 팔레트)을 따른다.

## 상태 (`src/state/store.tsx`)

```ts
type View = 'tree' | 'method' | 'note';
type Side = null | 'rec' | 'mlist' | 'dict' | 'note' | 'manual';
interface MethodSel { t: 'sem' | 'lane'; m: MethodKey | '*'; c: string }   // c: 학기 칸 번호(문자열) 또는 교과군 키 또는 '*'
interface AppState {
  students: StudentEntry[]; cur: number;            // cur = -1 이면 첫 화면
  view: View; sel: string | null;                   // 선택한 기록 id
  theme: string | null;                             // 강조한 관심 주제 이름
  linkFilter: 'all' | LinkKind; whyMode: 'off' | 'brief' | 'full'; showFaint: boolean; zoom: number | null;
  blind: boolean; side: Side; mSel: MethodSel | null;
  userDict: UserDict; errors: { file: string; msg: string }[];
  busy: string | null; toast: string | null; dirty: boolean;
  wide: boolean;                                    // 넓게 보기(위쪽 메뉴 숨김)
}
```
- `useApp()` 훅: `{ state, dispatch }`. 따로 묶은 actions 객체는 없고 `dispatch`로 액션을 보낸다.
  액션 종류: `addStudents`, `selectStudent`, `setView`, `openRecord`, `closeSide`, `openSide`, `setMethodSel`, `setTheme`, `setLinkFilter`,
  `setWhyMode`, `toggleFaint`, `setZoom`, `toggleBlind`, `toggleWide`, `setMemo`, `setRecMemo`, `setUserDict`, `setBusy`, `toast`, `setErrors`,
  `markSaved`, `wipe`.
- `useAnalysis()` 훅: 현재 학생 + userDict로 `analyze()`를 `useMemo`. 학생별 캐시(Map<id, Analysis>)는 userDict가 바뀌면 비운다.

## 파일 흐름 (`src/lib/files.ts`)
- `ingestFiles(files: File[], onBusy?: (text: string) => void)`: `.json`이면 작업 파일/사전 판별, `.pdf`면 `extractPages(bytes, getPdfJs(), onProgress)` → 글자 수 200 미만이면 스캔본 오류 → `splitStudents` → 각 그룹 `parseStudent` → 세특·창체가 없으면 오류 → 이름 없으면 파일 이름 → `curriculumOf` → StudentEntry. 3명마다 한 번 `await new Promise(r => setTimeout(r, 0))`.
- 오류는 `{file, msg}` 배열로 모아 첫 화면 또는 상단 안내에 표시.

## 구성 요소
| 파일 | 역할 |
|---|---|
| `App.tsx` | Provider, 첫 화면/작업 화면 전환, 전역 단축키(Esc), 끌어다 놓기, beforeunload |
| `components/Landing.tsx` | 큰 제목, 설명 두 줄, 드롭존(파일 선택·끌어다 놓기), 버튼 3개(학생부 PDF 올리기 / 예시 학생 보기 / 직접 입력), 개인정보 안내(외부 전송 없음), 오류 상자 |
| `components/ManualInput.tsx` | 직접 입력: 이름(선택), 진로 희망(학년별), 항목 목록(학년, 학기, 세특/창체, 과목 또는 영역, 성취도, 등급, 본문 textarea). 추가/삭제, 분석하기. `fromManual` 사용 |
| `components/TopBar.tsx` | 학생 선택(select), 탭 3개, 버튼(PDF 더 올리기, 표현 사전, 상담 노트, 이름 가리기, 작업 저장, 인쇄, 모두 지우기, 밝게/어둡게) |
| `components/StudentHead.tsx` | 이름(가리기 반영), 교육과정 표시, 진로 희망, 관심 분야 3개, 통계 4개(탐구 기록, 연결, 쓴 방법, 관심 주제) |
| `components/tree/TreeToolbar.tsx` | 연결 종류 필터(모든 연결/심화/확장/전환/반복/같은 시기, 개수), 이유 표시(숨김/한 줄/자세히), 약한 기록 토글, 확대·축소(－/맞춤/＋), 범례, 넓게 보기 |
| `components/tree/TreeBoard.tsx` | CSS grid: 첫 열 줄 이름(sticky), 이후 학기 칸(기록 있는 학년만, 학년당 2칸). 줄마다 기록을 겹치지 않게 행 배치(참고: 칸 점유 집합). 진로 희망 줄. 관심 주제 칩 줄. 카드 클릭 → openRecord. 카드 DOM 위치로 `LinkLayer` 갱신(ResizeObserver, resize, zoom) |
| `components/tree/RecordCard.tsx` | 과목, 세특/창체 태그, 깊이 막대(4칸), 메모 표시, 추가 탐구 ↳n, 성취도·등급 칩, 주제(핵심어면 '핵심어' 표시, 책이면 『』), 요약(추가 탐구면 ↳), 연결 이유(whyMode), 방법 칩 2개, 관심 주제 점. faint면 흐리게·작게 |
| `components/tree/LinkLayer.tsx` | SVG 곡선(가로 연결은 C 베지어, 세로는 위아래), 색/점선은 종류·교과군 건너감, 끝점 원. 선 가운데 종류 칩(HTML 라벨, 겹침 피하기). 선택 기록의 계보(lineage)만 밝게, 나머지 흐리게. 관심 주제 강조 |
| `components/RecordDrawer.tsx` | 오른쪽 창(너비 조절 손잡이, Esc 닫기): 원문(highlightSegments로 형광펜 + 핵심 문장 점선), 주제·핵심어, 활동 흐름(acts, ↳ 추가 탐구), 기록 메모, 성적·방법·깊이·과학 탐구 기능·관심 분야·관심 주제·계보 수, 이어받은 기록/같은 시기/이어진 기록 카드(종류, 설명 문장, 근거 줄, 상담 힌트, 클릭 이동) |
| `components/method/MethodView.tsx` | 머리글 + 표 3개 + 결손 지도. 칸 클릭 → mSel → 옆 창에 `MethodList` |
| `components/method/Heatmap.tsx` | 범용 표: 행/열 머리글, 칸 값(0은 비움), 값 크기 → `--seq-*` 배경, 행·열 머리글 클릭 지원, 선택 칸 테두리, 접근성(role=button, tabIndex) |
| `components/method/GapPanel.tsx` | 결손 지도: 학기별 카드(기록 수, 쓴 방법, 수준 3 방법 비율, 평균 깊이, 아직 안 쓴 수준 3 방법), 교과군별 표(기대 방법 가운데 쓴 것은 실선 칩을 먼저, 아직 없는 것은 점선 칩에 '없음' 글자를 붙여 뒤에 둠), 과학 탐구 기능 8칸 체크, 제안 문장 목록(메모에 넣기 버튼). 방법의 '수준'(1~3)과 기록의 탐구 '깊이'(1~4단계)는 다른 척도라 화면 문구에서 이름을 나눠 쓴다 |
| `components/method/MethodList.tsx` | 선택한 칸의 기록 목록: 번호, 과목, 학기, 깊이, 주제, 방법 칩, 근거 문장(해당 방법 표현 노랑 형광), 이전/다음 이동, 번호 칩 |
| `components/NotesView.tsx` | 상담 포인트(강점/점검/질문/방향 태그, 기록 보기·계보도에서 보기·메모에 넣기), 상담 메모, 기록별 메모 목록 |
| `components/DictPanel.tsx` | 찾은 비율, 추가한 표현 목록(삭제), 직접 추가(표현 + 방법 select), 내보내기/가져오기/모두 지우기, 방법을 못 찾은 활동 문장(추천 표현 입력 + 방법 select + 연결) |
| `components/common/*` | `DepthBars`, `GradeChips`, `MethodChip`, `KindChip`(연결 종류), `Toast`, `Busy`, `Pill`, `SectionTitle` |
| `components/SideDrawer.tsx` | 오른쪽 옆 창 틀(제목, 닫기, 너비 조절 손잡이, Esc). 기록 상세 창, 근거 문장 목록, 표현 사전, 상담 노트, 직접 입력이 이 틀 안에 열린다. md 이상에서는 상단 바 아래(`--topbar-h`, TopBar가 ResizeObserver로 잰 높이)에 붙어 화면 높이만큼만 차지하고 안쪽만 스크롤된다. 폰 너비에서는 화면 위에 뜨는 대화 상자 |
| `App.tsx` 안 `PrintNotes` | 인쇄 전용 메모 영역(따로 파일을 두지 않음) |

## 동작 세부
- 계보도 보드 최소 너비 = 128 + 칸 수 × 232px. `zoom`이 null이면 보드가 화면에 맞도록 CSS `zoom` 계산(0.6~1).
- 카드 클릭 시 같은 카드를 다시 누르면 닫기. 옆 창이 열리면 보드 너비가 줄어드니 다시 맞춤.
- `blind`가 켜지면 이름을 '이○○'로.
- 작업 저장: `makeWorkFile` → `download('탐구분석지도_작업_YYYYMMDD.json')`. 불러오기: 첫 화면 드롭존 또는 'PDF 더 올리기'에서 .json 허용.
- 인쇄: `@media print`에서 상단 바·옆 창 숨김, 보드를 A4 가로 폭(약 1040px)에 맞춰 축소(`--pz`), 메모 영역 출력.
- 모든 문자열은 한국어. 접근성: 버튼 aria-label, 표 칸 role=button, Esc로 닫기, 포커스 표시.
