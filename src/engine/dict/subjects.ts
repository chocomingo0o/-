/**
 * 교과군(lane)과 과목 분류 사전.
 *
 * - LANES / LANE  : 계보도의 세로 줄(교과군) 정의. 창체 세 줄 + 교과 열 줄, 모두 13줄.
 * - laneOf        : 교과(group)와 과목명으로 교과군 판정. 교과가 있으면 교과를 먼저 보고, 없거나 모호하면 과목명으로 추정.
 * - laneOfArea    : 창체 영역 이름으로 교과군 판정.
 * - subjectType   : 과목 유형(공통/일반/진로/융합/교양/기타). 2022 개정과 2015 개정 과목명을 모두 등록. 공백 무시.
 * - baseSubject   : 과목 기본형(공백, 끝의 숫자와 로마 숫자, 괄호 제거). 같은 과목 계열 판정에 쓴다.
 * - subjectFamily : 2022 개정 과목 계열(공통수학 → 대수·미적분Ⅰ·확률과 통계 등). 기본형이 달라도 같은 계열이면 같은 키.
 * - CC_AREAS      : 창체 영역 표준 이름.
 * - SUBJECTS      : 등록된 과목 목록(화면의 자동 완성이나 검사에 쓸 수 있음).
 *
 * 과목 유형은 2022 개정 교육과정을 기준으로 적고, 2015 개정에서만 쓰인 과목은 2015 기준으로 적는다.
 * 두 교육과정에서 유형이 다른 과목(경제, 윤리와 사상, 여행지리, 사회문제 탐구, 수학과제 탐구,
 * 지식 재산 일반, 운동과 건강)은 type2015에 2015 유형을 따로 두었다. subjectType(name, 2015)로 꺼낸다.
 *
 * 색은 LaneDef.color에 채워 두지만, 화면 명세(DESIGN.md 5.1)는 교과군별 색을 쓰지 않으므로
 * 화면에서는 줄 이름을 항상 함께 보여 준다. 이웃한 두 줄은 서로 다른 색이다.
 *
 * 이 파일은 DOM에 의존하지 않는다.
 */
import type { LaneDef, LaneKey, MethodKey } from '../types';

export type SubjectType = '공통' | '일반' | '진로' | '융합' | '교양' | '기타';

export interface SubjectEntry {
  name: string;           // 표준 표기(공백 포함)
  lane: LaneKey;
  type: SubjectType;      // 2022 개정 기준(2022에 없는 과목은 2015 기준)
  type2015?: SubjectType; // 2015 개정에서 유형이 다를 때만
}

/* ───────────────────────── 교과군 ───────────────────────── */
const PALETTE = {
  blue: '#2a78d6',
  orange: '#eb6834',
  teal: '#1baf7a',
  yellow: '#eda100',
  magenta: '#e87ba4',
  green: '#008300',
  violet: '#6250d6',
  red: '#e34948',
} as const;

/**
 * 창체 줄의 기대 방법. 영역 성격에 맞게 나눈다(진로 희망과 맞는 것만 결손으로 보는 일은 gaps.ts가 한다).
 * - 동아리: 탐구 동아리라면 실험·제작·설문·탐방이 모두 나올 수 있다.
 * - 진로: 현장 탐방과 직업인 면담이 자연스럽다. 학급 자치 활동에 변인 통제 실험을 기대하지는 않는다.
 * - 자율·자치: 학급 설문과 해결안 제안 정도를 기대한다.
 */
const CLUB_EXPECTED: MethodKey[] = ['experiment', 'making', 'survey', 'fieldtrip'];
const CAREER_EXPECTED: MethodKey[] = ['fieldtrip', 'survey'];
const AUTONOMY_EXPECTED: MethodKey[] = ['survey', 'proposal'];

export const LANES: LaneDef[] = [
  { key: '진로', label: '진로활동', color: PALETTE.violet, cc: true, expected: [...CAREER_EXPECTED] },
  { key: '동아리', label: '동아리활동', color: PALETTE.orange, cc: true, expected: [...CLUB_EXPECTED] },
  { key: '자율·자치', label: '자율·자치활동', color: PALETTE.teal, cc: true, expected: [...AUTONOMY_EXPECTED] },
  { key: '국어', label: '국어', color: PALETTE.red, cc: false, expected: ['critique', 'writing', 'reading'] },
  { key: '수학', label: '수학', color: PALETTE.blue, cc: false, expected: ['proof', 'modeling', 'data'] },
  { key: '영어', label: '영어', color: PALETTE.yellow, cc: false, expected: ['reading', 'critique', 'discussion'] },
  { key: '사회', label: '사회(역사·도덕)', color: PALETTE.green, cc: false, expected: ['survey', 'data', 'literature', 'proposal'] },
  { key: '과학', label: '과학', color: PALETTE.violet, cc: false, expected: ['experiment', 'data', 'modeling'] },
  { key: '정보·기술', label: '기술·가정/정보', color: PALETTE.magenta, cc: false, expected: ['coding', 'data', 'making'] },
  { key: '예체능', label: '체육·예술', color: PALETTE.orange, cc: false, expected: ['performance', 'making'] },
  { key: '제2외국어·한문', label: '제2외국어/한문', color: PALETTE.teal, cc: false, expected: ['literature', 'critique', 'discussion'] },
  { key: '교양·기타', label: '교양·기타', color: PALETTE.yellow, cc: false, expected: ['literature', 'discussion', 'writing'] },
  { key: '융합(자율과정)', label: '자율적 교육과정', color: PALETTE.red, cc: false, expected: ['literature', 'proposal', 'making'] },
];

export const LANE: Record<LaneKey, LaneDef> = Object.fromEntries(LANES.map((l) => [l.key, l])) as Record<LaneKey, LaneDef>;

/** 창체 영역 표준 이름. 2022 개정은 앞의 셋, 2015 개정 학생부에는 봉사활동이 더 있다. */
export const CC_AREAS: string[] = ['자율·자치활동', '동아리활동', '진로활동', '봉사활동'];

/* ───────────────────────── 문자열 정리 ───────────────────────── */
const nos = (s: string): string => s.replace(/\s+/g, '');

/** 공백을 빼고 가운뎃점 변형(ㆍ • ‧ ∙ ・)과 전각 괄호를 통일한다. */
function norm(s: string): string {
  return nos(s)
    .replace(/[ㆍ•‧∙・]/g, '·')
    .replace(/（/g, '(')
    .replace(/）/g, ')');
}

/** 끝의 영문 I, II, III를 로마 숫자 Ⅰ, Ⅱ, Ⅲ으로 통일한다. */
function canon(s: string): string {
  const k = norm(s);
  if (/III$/.test(k)) return k.replace(/III$/, 'Ⅲ');
  if (/II$/.test(k)) return k.replace(/II$/, 'Ⅱ');
  if (/I$/.test(k)) return k.replace(/I$/, 'Ⅰ');
  return k;
}

const digitsToRoman = (k: string): string => k.replace(/1$/, 'Ⅰ').replace(/2$/, 'Ⅱ').replace(/3$/, 'Ⅲ');
const romanToDigits = (k: string): string => k.replace(/Ⅰ$/, '1').replace(/Ⅱ$/, '2').replace(/Ⅲ$/, '3');

/**
 * 과목 기본형. 공백 제거, '(…)' 제거, 끝의 숫자·Ⅰ·Ⅱ·Ⅲ·I·II 제거.
 * '통합과학1' → '통합과학', '영어 Ⅰ' → '영어', '생명과학Ⅱ' → '생명과학', '스포츠 생활1' → '스포츠생활'
 */
export function baseSubject(name: string): string {
  return norm(name)
    .replace(/\([^)]*\)/g, '')
    .replace(/(?:[0-9０-９]+|[ⅠⅡⅢ]+|III|II|I)+$/, '');
}

/* ───────────────────────── 과목 계열 ───────────────────────── */
/**
 * 2022 개정 교육과정의 과목 계열. 1학년 공통과목과 그 뒤를 잇는 일반 선택 과목을 한 계열로 본다.
 *   공통국어 → 화법과 언어, 독서와 작문, 문학 / 공통수학 → 대수, 미적분Ⅰ, 확률과 통계 / 공통영어 → 영어Ⅰ·Ⅱ, 영어 독해와 작문
 *   통합과학 → 물리학, 화학, 생명과학, 지구과학 / 통합사회 → 세계시민과 지리, 세계사, 사회와 문화, 현대사회와 윤리
 * 2015 개정에서 같은 자리에 있던 과목(국어 → 독서·문학, 수학 → 수학Ⅰ·Ⅱ·미적분, 통합사회 → 한국지리·생활과 윤리 …)도 넣는다.
 * 과학탐구실험·한국사처럼 자기 기본형(과학탐구실험1 → 과학탐구실험2)으로 이어지는 과목은 baseSubject로 충분하므로 넣지 않는다.
 * 키는 baseSubject() 결과(공백 제거, 끝 숫자·로마 숫자 제거)로 적는다.
 */
const FAMILY_ROWS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['국어', ['공통국어', '국어', '화법과언어', '독서와작문', '문학', '화법과작문', '독서', '언어와매체']],
  ['수학', ['공통수학', '기본수학', '수학', '대수', '미적분', '확률과통계']],
  ['영어', ['공통영어', '기본영어', '영어', '영어독해와작문', '영어회화']],
  ['과학', ['통합과학', '물리학', '화학', '생명과학', '지구과학']],
  ['사회', ['통합사회', '세계시민과지리', '세계사', '사회와문화', '현대사회와윤리', '한국지리', '세계지리', '동아시아사', '정치와법', '생활과윤리', '사회·문화']],
];
const FAMILY: Map<string, string> = new Map();
for (const [fam, names] of FAMILY_ROWS) for (const n of names) FAMILY.set(n, fam);

/**
 * 과목이 속한 계열 키. 계열 표에 없으면 null.
 * subjectFamily('공통수학2') → '수학', subjectFamily('대수') → '수학', subjectFamily('과학탐구실험1') → null
 */
export function subjectFamily(name: string): string | null {
  const b = baseSubject(name);
  return FAMILY.get(b) ?? FAMILY.get(b.replace(/·/g, '')) ?? null;
}

/* ───────────────────────── 과목 목록 ───────────────────────── */
type Row = [string, SubjectType] | [string, SubjectType, SubjectType];

function rows(lane: LaneKey, list: Row[]): SubjectEntry[] {
  return list.map(([name, type, type2015]) => (type2015 ? { name, lane, type, type2015 } : { name, lane, type }));
}

const KOREAN: Row[] = [
  // 2022 개정
  ['공통국어1', '공통'], ['공통국어2', '공통'],
  ['화법과 언어', '일반'], ['독서와 작문', '일반'], ['문학', '일반'],
  ['주제 탐구 독서', '진로'], ['문학과 영상', '진로'], ['직무 의사소통', '진로'],
  ['독서 토론과 글쓰기', '융합'], ['매체 의사소통', '융합'], ['언어생활 탐구', '융합'],
  // 2015 개정
  ['국어', '공통'],
  ['화법과 작문', '일반'], ['독서', '일반'], ['언어와 매체', '일반'],
  ['실용 국어', '진로'], ['심화 국어', '진로'], ['고전 읽기', '진로'],
];

const MATH: Row[] = [
  // 2022 개정
  ['공통수학1', '공통'], ['공통수학2', '공통'], ['기본수학1', '공통'], ['기본수학2', '공통'],
  ['대수', '일반'], ['미적분Ⅰ', '일반'], ['확률과 통계', '일반'],
  ['기하', '진로'], ['미적분Ⅱ', '진로'], ['경제 수학', '진로'], ['인공지능 수학', '진로'], ['직무 수학', '진로'],
  ['수학과 문화', '융합'], ['실용 통계', '융합'], ['수학과제 탐구', '융합', '진로'],
  // 2015 개정
  ['수학', '공통'],
  ['수학Ⅰ', '일반'], ['수학Ⅱ', '일반'], ['미적분', '일반'],
  ['실용 수학', '진로'], ['기본 수학', '진로'],
];

const ENGLISH: Row[] = [
  // 2022 개정
  ['공통영어1', '공통'], ['공통영어2', '공통'], ['기본영어1', '공통'], ['기본영어2', '공통'],
  ['영어Ⅰ', '일반'], ['영어Ⅱ', '일반'], ['영어 독해와 작문', '일반'],
  ['영미 문학 읽기', '진로'], ['영어 발표와 토론', '진로'], ['심화 영어', '진로'], ['심화 영어 독해와 작문', '진로'], ['직무 영어', '진로'],
  ['실생활 영어 회화', '융합'], ['미디어 영어', '융합'], ['세계 문화와 영어', '융합'],
  // 2015 개정
  ['영어', '공통'],
  ['영어 회화', '일반'],
  ['실용 영어', '진로'], ['영어권 문화', '진로'], ['진로 영어', '진로'], ['기본 영어', '진로'],
];

const SOCIAL: Row[] = [
  // 2022 개정
  ['한국사1', '공통'], ['한국사2', '공통'], ['통합사회1', '공통'], ['통합사회2', '공통'],
  ['세계시민과 지리', '일반'], ['세계사', '일반'], ['사회와 문화', '일반'], ['현대사회와 윤리', '일반'],
  ['한국지리 탐구', '진로'], ['도시의 미래 탐구', '진로'], ['동아시아 역사 기행', '진로'], ['정치', '진로'], ['법과 사회', '진로'],
  ['경제', '진로', '일반'], ['윤리와 사상', '진로', '일반'], ['인문학과 윤리', '진로'], ['국제 관계의 이해', '진로'],
  ['여행지리', '융합', '진로'], ['역사로 탐구하는 현대 세계', '융합'], ['사회문제 탐구', '융합', '진로'],
  ['금융과 경제생활', '융합'], ['윤리문제 탐구', '융합'], ['기후변화와 지속가능한 세계', '융합'],
  // 2015 개정
  ['한국사', '공통'], ['통합사회', '공통'],
  ['한국지리', '일반'], ['세계지리', '일반'], ['동아시아사', '일반'], ['정치와 법', '일반'], ['생활과 윤리', '일반'], ['사회·문화', '일반'],
  ['고전과 윤리', '진로'],
];

const SCIENCE: Row[] = [
  // 2022 개정
  ['통합과학1', '공통'], ['통합과학2', '공통'], ['과학탐구실험1', '공통'], ['과학탐구실험2', '공통'],
  ['물리학', '일반'], ['화학', '일반'], ['생명과학', '일반'], ['지구과학', '일반'],
  ['역학과 에너지', '진로'], ['전자기와 양자', '진로'], ['물질과 에너지', '진로'], ['화학 반응의 세계', '진로'],
  ['세포와 물질대사', '진로'], ['생물의 유전', '진로'], ['지구시스템과학', '진로'], ['행성우주과학', '진로'],
  ['과학의 역사와 문화', '융합'], ['기후변화와 환경생태', '융합'], ['융합과학 탐구', '융합'],
  // 2015 개정
  ['통합과학', '공통'], ['과학탐구실험', '공통'],
  ['물리학Ⅰ', '일반'], ['화학Ⅰ', '일반'], ['생명과학Ⅰ', '일반'], ['지구과학Ⅰ', '일반'],
  ['물리학Ⅱ', '진로'], ['화학Ⅱ', '진로'], ['생명과학Ⅱ', '진로'], ['지구과학Ⅱ', '진로'],
  ['과학사', '진로'], ['생활과 과학', '진로'], ['융합과학', '진로'],
];

const ARTS_PE: Row[] = [
  // 체육 2022 개정
  ['체육1', '일반'], ['체육2', '일반'],
  ['운동과 건강', '진로', '일반'], ['스포츠 문화', '진로'], ['스포츠 과학', '진로'],
  ['스포츠 생활1', '융합'], ['스포츠 생활2', '융합'],
  // 체육 2015 개정
  ['체육', '일반'], ['스포츠 생활', '진로'], ['체육 탐구', '진로'],
  // 예술 2022 개정
  ['음악', '일반'], ['미술', '일반'], ['연극', '일반'],
  ['음악 연주와 창작', '진로'], ['음악 감상과 비평', '진로'], ['미술 창작', '진로'], ['미술 감상과 비평', '진로'],
  ['음악과 미디어', '융합'], ['미술과 매체', '융합'],
  // 예술 2015 개정
  ['음악 연주', '진로'],
];

const TECH_INFO: Row[] = [
  // 2022 개정
  ['기술·가정', '일반'], ['정보', '일반'],
  ['로봇과 공학세계', '진로'], ['생활과학 탐구', '진로'], ['인공지능 기초', '진로'], ['데이터 과학', '진로'],
  ['소프트웨어와 생활', '융합'], ['창의 공학 설계', '융합'], ['지식 재산 일반', '융합', '진로'],
  ['생애 설계와 자립', '융합'], ['아동발달과 부모', '융합'],
  // 2015 개정
  ['농업 생명 과학', '진로'], ['공학 일반', '진로'], ['창의 경영', '진로'], ['해양 문화와 기술', '진로'], ['가정과학', '진로'],
];

const LANGS = ['독일어', '프랑스어', '스페인어', '중국어', '일본어', '러시아어', '아랍어', '베트남어'];
const LANG_CULTURES = ['독일어권 문화', '프랑스어권 문화', '스페인어권 문화', '중국 문화', '일본 문화', '러시아 문화', '아랍 문화', '베트남 문화'];

const FOREIGN: Row[] = [
  // 제2외국어: 2022 개정은 ○○어(일반), ○○어 회화·심화 ○○어(진로), ○○어권 문화(융합). 2015 개정은 ○○어Ⅰ(일반), ○○어Ⅱ(진로).
  ...LANGS.flatMap<Row>((l) => [[l, '일반'], [`${l}Ⅰ`, '일반'], [`${l}Ⅱ`, '진로'], [`${l} 회화`, '진로'], [`심화 ${l}`, '진로']]),
  ...LANG_CULTURES.map<Row>((c) => [c, '융합']),
  // 한문
  ['한문', '일반'], ['한문Ⅰ', '일반'], ['한문Ⅱ', '진로'], ['한문 고전 읽기', '진로'], ['언어생활과 한자', '융합'],
];

const LIBERAL: Row[] = [
  // 2022 개정
  ['진로와 직업', '교양'], ['생태와 환경', '교양'], ['인간과 철학', '교양'], ['논리와 사고', '교양'], ['인간과 심리', '교양'],
  ['교육의 이해', '교양'], ['삶과 종교', '교양'], ['보건', '교양'], ['인간관계와 소통', '교양'], ['논술', '교양'], ['인간과 경제활동', '교양'],
  // 2015 개정
  ['철학', '교양'], ['논리학', '교양'], ['심리학', '교양'], ['교육학', '교양'], ['종교학', '교양'], ['환경', '교양'], ['실용 경제', '교양'],
];

/** 등록된 과목 전체. 2022 개정과 2015 개정 보통 교과. 전문 교과는 넣지 않았다(유형 '기타', 교과군은 이름으로 추정). */
export const SUBJECTS: SubjectEntry[] = [
  ...rows('국어', KOREAN),
  ...rows('수학', MATH),
  ...rows('영어', ENGLISH),
  ...rows('사회', SOCIAL),
  ...rows('과학', SCIENCE),
  ...rows('예체능', ARTS_PE),
  ...rows('정보·기술', TECH_INFO),
  ...rows('제2외국어·한문', FOREIGN),
  ...rows('교양·기타', LIBERAL),
];

/** 정리한 이름 → 과목. 가운뎃점을 뺀 표기('사회문화', '기술가정')도 같은 과목으로 찾는다. */
const INDEX: Map<string, SubjectEntry> = new Map();
for (const e of SUBJECTS) {
  const k = canon(e.name);
  if (!INDEX.has(k)) INDEX.set(k, e);
  const k2 = k.replace(/·/g, '');
  if (!INDEX.has(k2)) INDEX.set(k2, e);
}

function lookup(name: string): SubjectEntry | undefined {
  const k = canon(name);
  if (!k) return undefined;
  const tries = [k, k.replace(/·/g, ''), digitsToRoman(k), romanToDigits(k)];
  for (const t of tries) {
    const e = INDEX.get(t);
    if (e) return e;
  }
  const b = baseSubject(name);
  return INDEX.get(b) ?? INDEX.get(b.replace(/·/g, ''));
}

/**
 * 과목 유형. 등록되지 않은 과목은 '기타'.
 * 2022 개정과 2015 개정에서 유형이 다른 과목은 기본으로 2022 유형을 주고, curriculum에 2015를 넘기면 2015 유형을 준다.
 */
export function subjectType(name: string, curriculum?: 2015 | 2022): SubjectType {
  const e = lookup(name);
  if (!e) return '기타';
  if (curriculum === 2015 && e.type2015) return e.type2015;
  return e.type;
}

/* ───────────────────────── 교과군 판정 ───────────────────────── */
const SELF_DIRECTED = /자율적?교육과정|자율과정|학교자율과정/;

/** 교과(group) 이름에서 교과군을 찾는 규칙. 하나의 교과 이름이 여러 교과군에 걸칠 수 있다(2015 '기술·가정/제2외국어/한문/교양'). */
const GROUP_RULES: ReadonlyArray<readonly [RegExp, LaneKey]> = [
  [SELF_DIRECTED, '융합(자율과정)'],
  [/국어/, '국어'],
  [/수학/, '수학'],
  [/영어/, '영어'],
  [/사회|역사|도덕|지리|윤리|한국사|국제/, '사회'],
  [/과학/, '과학'],
  [/정보|기술|가정|공학/, '정보·기술'],
  [/체육|예술|음악|미술|연극|무용/, '예체능'],
  [/외국어|한문|한자/, '제2외국어·한문'],
  [/교양/, '교양·기타'],
];

/** 과목 이름에서 교과군을 추정하는 규칙. 등록된 과목은 먼저 목록에서 찾고, 이 규칙은 목록에 없는 이름에만 쓴다. 순서가 중요하다. */
const NAME_RULES: ReadonlyArray<readonly [RegExp, LaneKey]> = [
  [SELF_DIRECTED, '융합(자율과정)'],
  [/독일어|프랑스어|스페인어|중국어|일본어|러시아어|아랍어|베트남어|한문|한자|외국어/, '제2외국어·한문'],
  [/영어|영미/, '영어'],
  [/체육|스포츠|운동|음악|미술|연극|무용|예술/, '예체능'],
  [/국어|문학|화법|독서|작문|언어|매체|읽기|글쓰기/, '국어'],
  [/수학|대수|미적분|기하|확률|통계/, '수학'],
  [/정보|소프트웨어|프로그래밍|코딩|컴퓨터|인공지능|데이터|로봇|공학|기술|가정|경영|지식재산|창업/, '정보·기술'],
  [/과학|물리|화학|생명|생물|지구|천문|우주|역학|전자기|양자|물질|세포|유전|생태/, '과학'],
  [/사회|역사|지리|윤리|도덕|정치|법|경제|금융|세계|국제|한국사|동아시아|문화|도시/, '사회'],
  [/진로|직업|철학|심리|교육|종교|보건|논술|논리|환경|인간|생애/, '교양·기타'],
];

function groupLanes(g: string): LaneKey[] {
  const out: LaneKey[] = [];
  for (const [re, lane] of GROUP_RULES) if (re.test(g) && !out.includes(lane)) out.push(lane);
  return out;
}

function laneOfName(name: string): LaneKey | null {
  const n = norm(name);
  if (!n) return null;
  const e = lookup(n);
  if (e) return e.lane;
  // 여러 과목이 '·', '/', ','로 이어진 이름(예: '물리학Ⅰ·화학Ⅰ')은 앞에서부터 판정되는 것을 따른다.
  if (/[·/,]/.test(n)) {
    for (const part of n.split(/[·/,]/)) {
      if (!part) continue;
      const l = laneOfName(part);
      if (l) return l;
    }
  }
  for (const [re, lane] of NAME_RULES) if (re.test(n)) return lane;
  return null;
}

/**
 * 교과(group)와 과목명으로 교과군을 판정한다.
 * - 자율적 교육과정은 교과와 상관없이 '융합(자율과정)'.
 * - 교과가 한 교과군만 가리키면 그 교과군(교과 우선).
 * - 교과가 여러 교과군에 걸치거나('기술·가정/제2외국어/한문/교양') '○○ 계열', '전문 교과'처럼 느슨하면 과목명으로 가른다.
 * - 교과가 없으면 과목명으로 추정. 아무것도 맞지 않으면 '교양·기타'.
 */
export function laneOf(group: string | undefined | null, name: string): LaneKey {
  const n = norm(name ?? '');
  if (SELF_DIRECTED.test(n)) return '융합(자율과정)';
  const byName = laneOfName(n);
  const g = norm(group ?? '');
  if (g) {
    const gl = groupLanes(g);
    const soft = /계열|전문/.test(g);
    if (gl.length === 1 && !soft) return gl[0];
    if (gl.length >= 1) {
      if (byName && (soft || gl.includes(byName))) return byName;
      return byName ?? gl[0];
    }
  }
  return byName ?? '교양·기타';
}

/**
 * 창체 영역 이름으로 교과군을 판정한다.
 * '동아리활동(생명과학탐구반)' → '동아리', '진로활동' → '진로',
 * '자율·자치활동'/'자율활동'/'자치활동' → '자율·자치', 그 외(봉사활동 등) → '자율·자치'
 */
export function laneOfArea(area: string): LaneKey {
  const a = norm(area ?? '');
  if (/^동아리/.test(a)) return '동아리';
  if (/^진로/.test(a)) return '진로';
  if (/동아리/.test(a)) return '동아리';
  if (/진로/.test(a)) return '진로';
  return '자율·자치';
}
