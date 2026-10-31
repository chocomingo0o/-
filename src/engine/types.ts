/**
 * 탐구분석지도 엔진 공용 타입.
 * 엔진(src/engine)은 DOM에 의존하지 않는다. 브라우저와 Node(vitest) 양쪽에서 실행된다.
 */

/* ───────────────────────── 교과군(lane) ───────────────────────── */
export type LaneKey =
  | '진로' | '동아리' | '자율·자치'
  | '국어' | '수학' | '영어' | '사회' | '과학' | '정보·기술' | '예체능' | '제2외국어·한문' | '교양·기타' | '융합(자율과정)';

export interface LaneDef {
  key: LaneKey;
  label: string;          // 화면 표시 이름 (예: '기술·가정/정보')
  color: string;          // 줄 강조색 (hex)
  cc: boolean;            // 창의적 체험활동 줄인지
  expected: MethodKey[];  // 이 교과군에서 나올 법한 탐구 방법(결손 분석 기준)
}

/* ───────────────────────── 탐구 방법 ───────────────────────── */
export type MethodKey =
  | 'experiment'    // 실험·측정 (3)
  | 'survey'        // 설문·면담 (3)
  | 'data'          // 데이터 분석 (3)
  | 'modeling'      // 수학적 모델링 (3)
  | 'coding'        // 코딩·시뮬레이션 (3)
  | 'making'        // 설계·제작 (3)
  | 'proof'         // 증명·유도 (2)
  | 'literature'    // 문헌·자료 조사 (2)
  | 'fieldtrip'     // 현장 탐방 (2)
  | 'reading'       // 독서 연계 (2)
  | 'critique'      // 비교·비평 (2)
  | 'proposal'      // 해결안 제안 (2)
  | 'analysis'      // 개념 분석·해석 (2)
  | 'understanding' // 개념 이해·정리 (1)
  | 'performance'   // 실기·창작 수행 (1)
  | 'discussion'    // 토론·발표 (1)
  | 'writing';      // 글쓰기·보고서 (1)

export type MethodLevel = 1 | 2 | 3;

export interface MethodDef {
  key: MethodKey;
  label: string;       // '실험·측정'
  short: string;       // 표 머리글용 짧은 이름 '실험'
  lv: MethodLevel;     // 1 정리·참여, 2 조사·분석, 3 직접 자료 생산·분석
  color: string;       // hex
  desc: string;        // 한 줄 설명
  terms: string[];     // 정규식 조각(소스 문자열). 공백은 \s* 로 적는다. 'g' 등 플래그 없이.
  exclude?: string[];  // 방법처럼 보이지만 아닌 표현(먼저 지움). 예: '동물\\s*실험', '가상\\s*인터뷰'
  /**
   * 조건부 표현. 기구, 시약, 생물 이름처럼 명사만으로는 학생이 직접 했는지 알 수 없는 표현이다.
   * 같은 문장(제외 구간을 지운 문장)에 cue가 맞거나 terms 가운데 하나가 맞을 때만 센다.
   * 예: '현미경'은 '현미경으로 양파 표피 세포를 관찰함'에서는 세고 '현미경의 발달 과정을 조사함'에서는 세지 않는다.
   */
  weak?: string[];
  /** weak를 세게 하는 수행 단서(정규식 소스 하나). 없으면 terms가 맞은 문장에서만 weak를 센다. */
  cue?: string;
}

/** 교사가 직접 추가한 표현 사전. 값은 평문(정규식 아님). */
export type UserDict = Partial<Record<MethodKey, string[]>>;

/* ───────────────────────── 과학 탐구 과정 기능 ───────────────────────── */
export type SkillKey =
  | 'problem'      // 문제 인식·가설 설정
  | 'design'       // 변인 통제·탐구 설계
  | 'collect'      // 자료 수집·측정
  | 'transform'    // 자료 변환·시각화
  | 'interpret'    // 자료 해석·분석
  | 'conclude'     // 결론 도출·평가·일반화
  | 'model'        // 모형 구성·활용
  | 'communicate'; // 의사소통·논증

export interface SkillDef {
  key: SkillKey;
  label: string;
  short: string;
  desc: string;
  color: string;
  terms: string[];
  exclude?: string[];
}

/* ───────────────────────── 파서 출력 ───────────────────────── */
export type Year = 1 | 2 | 3;
export type Sem = 1 | 2;

export interface Course {
  year: Year;
  sem: Sem | null;
  group: string;        // 교과 (예: '과학', '사회(역사/도덕 포함)')
  name: string;         // 과목 (예: '통합과학1')
  credit: number;
  raw: number | null;   // 원점수
  avg: number | null;   // 과목 평균
  sd: number | null;    // 표준편차
  ach: string;          // 성취도 A~E, P 또는 ''
  dist: string;         // 성취도별 분포비율 원문
  rank: number | null;  // 석차등급
  n: number | null;     // 수강자수
  note: string;
  kind: 'main' | 'career' | 'art' | 'liberal';
  pass: string;         // 이수여부
  noSeteuk?: boolean;
}

export interface Seteuk {
  year: Year;
  sem: Sem | null;      // 2022 개정은 (1학기) 표시가 있을 수 있음
  names: string[];      // 과목명(공백 제거). '자율적교육과정', '(과목 미확인)' 가능
  text: string;
}

export interface Changche {
  year: Year;
  area: string;         // '자율·자치활동' | '동아리활동' | '진로활동' | '봉사활동' 등 원문
  hours: number | null;
  text: string;
}

export interface Hope { year: Year; text: string }
export interface YearText { year: Year; text: string }

export interface StudentMeta {
  name?: string;
  entry?: number | null;        // 입학 연도
  scale?: 5 | 9;                // 등급제
  curriculum?: 2015 | 2022;
  sample?: boolean;             // 가상 예시 학생
  source?: 'pdf' | 'manual' | 'sample' | 'json';
}

export interface StudentRecord {
  meta: StudentMeta;
  courses: Course[];
  seteuk: Seteuk[];
  changche: Changche[];
  hopes: Hope[];
  behavior: YearText[];
  reading?: { year: Year; area: string; text: string }[];
  awards?: { year: Year | null; sem: Sem | null; name: string; grade: string; date: string; org: string; target: string }[];
  hakjeok?: string[];
  warnings: string[];
  years: Year[];
}

/* ───────────────────────── PDF 추출 ───────────────────────── */
export interface TextItem { s: string; x: number; y: number; w: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Page { items: TextItem[]; rects: Rect[] }

export interface Cell extends Rect {
  items: TextItem[];
  lines: string[];
  text: string;
  top: number;   // y + h
  page: number;  // 0부터
}

/* ───────────────────────── 직접 입력 ───────────────────────── */
export interface ManualEntry {
  year: Year;
  sem: Sem | null;
  kind: '세특' | '창체';
  subject: string;   // 과목명 또는 창체 영역
  text: string;
  ach?: string;      // 성취도
  rank?: number | null;
  group?: string;    // 교과(선택). 없으면 과목명으로 교과군 추정
}
export interface ManualInput {
  name?: string;
  hopes?: Hope[];
  entries: ManualEntry[];
}

/* ───────────────────────── 분석 단위 ───────────────────────── */
export interface Sent {
  s: string;          // 문장 원문
  a: number;          // 기록 원문 내 시작 위치
  b: number;          // 끝 위치
  ms: MethodKey[];    // 찾은 방법
  rf: boolean;        // 성찰(한계·오차·개선) 단서
  sc: number;         // 탐구 점수
  fu: boolean;        // 앞 활동에서 이어진 추가 탐구
  skills: SkillKey[]; // 과학 탐구 과정 기능
}

export interface Act {
  text: string;       // 요약 문장
  ms: MethodKey[];
  rf: boolean;
  sc: number;
  fu: boolean;
}

export interface GradeChip { sem: Sem | null; ach: string; rank: number | null }

export interface FieldHit { k: string; n: number; u: number; words: string[] }

export type TopicKind = 'q' | 'p' | 'b' | 's' | 'k';

export interface Rec {
  id: string;                 // 'S0', 'C1' …
  kind: '세특' | '창체';
  subj: string;               // 과목명(여러 과목이면 '·'로 이음) 또는 창체 영역
  lane: LaneKey;
  year: Year;
  sem: Sem | null;
  t: number;                  // (year-1)*2 + (sem===1?0:sem===2?1:0.5)
  text: string;
  grades: GradeChip[];
  // 분석 결과
  sents: Sent[];
  methods: MethodKey[];
  methodCounts: Partial<Record<MethodKey, number>>;
  depth: 1 | 2 | 3 | 4;
  faint: boolean;
  key: Sent[];
  acts: Act[];
  fuCount: number;
  connectCue: boolean;
  tf: Map<string, number>;
  ktf: Set<string>;
  fields: FieldHit[];
  topic: string;
  topicKind: TopicKind;
  kw: string[];
  summary: string;
  summaryFu: boolean;
  themes: string[];
  skills: SkillKey[];
  skillCounts: Partial<Record<SkillKey, number>>;
}

export type LinkKind = '심화' | '확장' | '전환' | '반복' | '동시';

export interface Link {
  from: string;
  to: string;
  rel: LinkKind;
  cross: boolean;     // 교과군이 바뀜
  ss: boolean;        // 같은 과목 계열
  cc: boolean;        // 교과↔창체 또는 서로 다른 창체
  cite: boolean;      // 뒤 기록이 앞 과목을 직접 언급
  words: string[];    // 공통 낱말(상위 3)
  theme: string | null;
  hope: string | null;
  sc: number;
  sent: string;       // 설명 문장
  head: string;       // 짧은 머리 (예: ‘전압·전극’ · 과학→동아리)
  detail: string;     // 방법/깊이 변화 요약
  why: string;        // 카드 안 한 줄
  lines: string[];    // 근거 줄
  newM: MethodKey[];  // 뒤 기록에서 새로 쓴 방법(lv>=2)
}

export interface Theme {
  name: string;
  words: string[];
  ids: string[];      // 기록 id
  color: string;
}

/* ───────────────────────── 낱말 통계(연결·주제 계산용) ───────────────────────── */
export interface Stats {
  N: number;                               // 기록 수(최소 1)
  df: Map<string, number>;                 // 낱말이 나온 기록 수
  kdf: Map<string, number>;                // 낱말이 핵심 문장에 나온 기록 수
  idf: (t: string) => number;              // ln((N+1)/(df+0.5))
  cw: (t: string) => number;               // 흔한 낱말 가중치 0.25~1
}

/* ───────────────────────── 결손 분석 ───────────────────────── */
/** 학기 칸 번호: 0=1-1, 1=1-2, 2=2-1, 3=2-2, 4=3-1, 5=3-2 */
export type SlotIndex = 0 | 1 | 2 | 3 | 4 | 5;
export const SLOTS: ReadonlyArray<readonly [Year, Sem]> = [[1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [3, 2]];

export interface SlotStat {
  slot: SlotIndex;
  year: Year;
  sem: Sem;
  recIds: string[];
  methodCounts: Partial<Record<MethodKey, number>>;
  lvCounts: [number, number, number];   // 수준 1,2,3 방법 사용 횟수
  lv3Share: number;                     // 3단계 방법이 하나라도 있는 기록 비율 (0~1)
  avgDepth: number;                     // 평균 깊이 (기록 없으면 0)
  missingLv3: MethodKey[];              // 아직 안 쓴 3단계 방법
}

export interface LaneGap {
  lane: LaneKey;
  recCount: number;
  used: MethodKey[];
  expected: MethodKey[];
  missing: MethodKey[];      // expected 중 한 번도 안 쓴 것
  lv3Share: number;
  avgDepth: number;
}

export interface Suggestion {
  tg: 'd' | 'g';             // d 방향, g 점검
  text: string;
  lane?: LaneKey;
  slot?: SlotIndex;
  method?: MethodKey;
  skill?: SkillKey;
}

export interface MatrixRow<K extends string> { key: K; cells: number[]; total: number }

export interface GapReport {
  slots: SlotStat[];                                   // 기록이 있는 학기만
  lanes: LaneGap[];                                    // 기록이 있는 교과군만
  semMatrix: MatrixRow<MethodKey>[];                   // 방법 × 학기(cells 길이 6)
  laneMatrix: { lane: LaneKey; cells: Partial<Record<MethodKey, number>>; total: number }[];
  skillMatrix: MatrixRow<SkillKey>[];                  // 과학 탐구 기능 × 학기(과학 관련 기록 기준)
  skillLaneMatrix: { lane: LaneKey; cells: Partial<Record<SkillKey, number>>; total: number }[];
  trend: string[];                                     // 학기 흐름 설명 문장
  suggestions: Suggestion[];
}

/* ───────────────────────── 상담 포인트 ───────────────────────── */
export interface Insight {
  tg: 's' | 'g' | 'q' | 'd';   // 강점, 점검, 질문, 방향
  t: string;
  go?: string;                 // 관련 기록 id
  th?: string;                 // 관련 관심 주제
}

/* ───────────────────────── 분석 결과 ───────────────────────── */
export interface Analysis {
  recs: Rec[];
  links: Link[];
  themes: Theme[];
  gaps: GapReport;
  insights: Insight[];
  mode: 'rule';
}

/* ───────────────────────── 저장 파일 ───────────────────────── */
export interface StudentEntry {
  id: string;
  file: string;              // 파일 이름 또는 '예시', '직접 입력'
  data: StudentRecord;
  memo: string;
  recMemo: Record<string, string>;
}

export interface WorkFile {
  app: 'tamgu-map';
  ver: 1;
  saved: string;
  userDict: UserDict;
  students: StudentEntry[];
}
