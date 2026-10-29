/* 학급 예시 자료 (심사·시연용, 모두 지어낸 것). 실제 학교 진도표·시간표와 같은 칸 모양으로 만듦.
   국어·수학·사회는 주·기간이 있는 진도표, 과학은 주 없는 진도표. 오늘이 든 학기(1학기 3월 / 2학기 8월 넷째 주)부터 18주 */
import { addDays, schoolYearOf } from '../../core/calendar.js';
import { slotsOn, alignToPlan, sameSubject, mondayOf } from './class-model.js';

const WEEKS = 18;
/* 오늘이 든 학기의 시작 월요일과 이름: 3~7월이면 1학기, 그 밖은 2학기 */
function semesterOf(today) {
  const y = schoolYearOf(today), m = +String(today).slice(5, 7);
  return m >= 3 && m <= 7 ? { start: mondayOf(`${y}-03-02`), label: `${y}학년도 1학기` } : { start: mondayOf(`${y}-08-24`), label: `${y}학년도 2학기` };
}
const TT = [
  ['국어', '수학', '사회', '과학', '체육', ''],
  ['수학', '국어', '과학', '체육', '창체', ''],
  ['국어', '수학', '영어', '음악', '미술', '미술'],
  ['수학', '국어(자)', '사회', '영어', '음악', '창체'],
  ['국어', '수학', '사회', '과학', '도덕', '']
];
// 시간표 파일 예시에만 쓰는 옆 반(칸 표기가 섞인 모양)
const TT2 = [
  ['수 학', '국어', '체육', '사회', '과학', ''],
  ['국어', '수학', '사회', '음악', '창체', ''],
  ['수학', '국어', '과학', '과학', '영어', ''],
  ['국어', '국어(자)', '미술', '미술', '체육', '창체'],
  ['수학', '국어', '사회', '영어', '도덕', '']
];
const UNITS = {
  국어: [
    ['1. 생각을 나누며 읽어요', ['글의 중심 생각 찾기', '중심 생각을 정리하며 읽기', '읽은 내용 발표하기']],
    ['2. 마음을 전하는 글', ['마음을 전하는 글의 특징 알기', '전하고 싶은 마음 떠올리기', '마음을 전하는 글 쓰기']],
    ['3. 알맞게 말해요', ['상황에 맞는 말 알기', '높임 표현 바르게 쓰기', '역할을 나누어 말하기']],
    ['4. 이야기 속 세상', ['인물의 마음 짐작하기', '이야기의 흐름 정리하기', '이야기 이어 쓰기']],
    ['5. 낱말을 탐험해요', ['낱말의 뜻 짐작하기', '국어사전에서 낱말 찾기', '낱말 사전 만들기']],
    ['6. 함께 읽는 즐거움', ['읽을 책 고르기', '책 읽고 생각 나누기', '책 소개 글 쓰기']]
  ],
  수학: [
    ['1. 곱셈', ['(세 자리 수)×(한 자리 수)', '(두 자리 수)×(몇십)', '(두 자리 수)×(두 자리 수)']],
    ['2. 나눗셈', ['(몇십)÷(몇)', '나머지가 있는 나눗셈', '(세 자리 수)÷(한 자리 수)']],
    ['3. 원', ['원의 중심과 반지름', '원의 지름', '컴퍼스로 원 그리기']],
    ['4. 분수', ['분수로 나타내기', '진분수와 가분수', '분모가 같은 분수의 크기 비교']],
    ['5. 들이와 무게', ['들이 비교하기', '무게의 단위', '들이와 무게의 덧셈과 뺄셈']],
    ['6. 자료의 정리', ['자료를 표로 나타내기', '그림그래프 알기', '그림그래프로 나타내기']]
  ],
  사회: [
    ['1. 우리 지역의 모습', ['지도로 우리 지역 살펴보기', '우리 지역의 중심지', '중심지 답사 계획 세우기']],
    ['2. 시대마다 다른 삶', ['옛날과 오늘날의 도구', '옛날과 오늘날의 세시 풍속', '옛날 사람들의 생활 모습']],
    ['3. 가족의 모습과 역할', ['옛날과 오늘날의 혼인 풍습', '가족 구성원의 역할', '다양한 가족의 모습']]
  ],
  과학: [
    ['1. 동물의 생활', ['주변 동물 관찰하기', '사는 곳에 따른 동물의 생김새', '동물의 특징을 활용한 물건']],
    ['2. 소리의 성질', ['소리가 나는 물체', '소리의 세기와 높낮이', '소리의 전달']],
    ['3. 지표의 변화', ['흙의 생성', '흐르는 물에 의한 지형 변화', '바닷가 지형 관찰하기']],
    ['4. 물질의 상태', ['고체와 액체의 성질', '기체의 성질', '공기의 무게']]
  ]
};
const WEEKLY = ['국어', '수학', '사회']; // 주·기간이 있는 진도표
const ID = { 국어: 'smp-ko', 수학: 'smp-ma', 사회: 'smp-so', 과학: 'smp-sc' };
const DIFF = { 국어: -2, 수학: 1, 사회: 0, 과학: -1 }; // 오늘 기준 진도 차이(시연용)
const md = d => `${+d.slice(5, 7)}.${+d.slice(8, 10)}`;

/* 단원마다 「배울 내용 살펴보기 → 주제 -1-, -2-… → 배운 내용 마무리하기」로 n시간을 채움 */
function unitTitles(topics, n) {
  const mid = Math.max(0, n - 2), each = Math.ceil(mid / topics.length) || 1;
  const body = topics.flatMap(t => Array.from({ length: each }, (_, i) => (each > 1 ? `${t} -${i + 1}-` : t))).slice(0, mid);
  return ['배울 내용 살펴보기', ...body, '배운 내용 마무리하기'].slice(0, n);
}

/* 단원이 이어지는 줄마다 「k/n」 (진도표의 차시 칸) */
/* 단원 안 차시 번호 「n/전체」. ◈ 행사 줄은 실제 진도표처럼 「1/1」이고 단원을 끊지 않음 */
function numbered(lessons) {
  const ev = l => /^◈/.test(l.unit);
  const out = lessons.map(l => ({ ...l, no: ev(l) ? '1/1' : '' }));
  const idx = lessons.map((l, i) => i).filter(i => !ev(lessons[i]));
  for (let k = 0; k < idx.length;) {
    let e = k; while (e + 1 < idx.length && lessons[idx[e + 1]].unit === lessons[idx[k]].unit) e++;
    for (let j = k; j <= e; j++) out[idx[j]].no = `${j - k + 1}/${e - k + 1}`;
    k = e + 1;
  }
  return out;
}

function buildSubject(name, START) {
  const ctx = { tt: { periods: 6, cells: TT }, subjects: [], log: {}, breaks: [], today: START };
  const weeks = [];
  for (let w = 0; w < WEEKS; w++) {
    const mon = addDays(START, 7 * w);
    let n = 0;
    for (let d = 0; d < 5; d++) n += slotsOn(ctx, addDays(mon, d)).filter(s => sameSubject(s.subject, name)).length;
    weeks.push({ week: w + 1, period: `${md(mon)}~${md(addDays(mon, 5))}`, from: mon, n });
  }
  const total = weeks.reduce((s, w) => s + w.n, 0);
  const units = UNITS[name], per = Math.ceil(total / units.length);
  const titles = units.flatMap(([unit, topics], i) => unitTitles(topics, Math.min(per, total - per * i)).map(title => ({ unit, title })));
  const weekOf = weeks.flatMap(w => Array(w.n).fill(w));
  let page = 8;
  const lessons = titles.map((t, i) => {
    const w = WEEKLY.includes(name) ? weekOf[i] : null;
    const pages = `${page}~${page + 1}`; page += 2;
    return { week: w ? w.week : null, period: w ? w.period : '', from: w ? w.from : '', unit: t.unit, title: t.title, no: '', pages, memo: '' };
  });
  if (name === '국어') { // 행사 시간 한 줄(실제 진도표의 ◈ 줄 모양)
    const k = lessons.findIndex(l => l.week === 7);
    if (k >= 0) lessons[k] = { ...lessons[k], unit: '◈독서의 날 행사', title: '좋아하는 책 소개하기', pages: '', memo: '◈독서의 날 행사' };
  }
  return { id: ID[name], name, start: START, offset: 0, total: lessons.length, lessons: numbered(lessons) };
}

const NAMES = ['국어', '수학', '사회', '과학'];

/* 예시 자료: 오늘 기준으로 진도 차이가 국어 −2, 수학 +1, 사회 0, 과학 −1이 되게 맞춤 */
export function sampleData(today, breaks = []) {
  const timetable = { periods: 6, cells: TT.map(r => r.slice()) };
  const { start } = semesterOf(today);
  const subjects = NAMES.map(n => buildSubject(n, start));
  const ctx = { tt: timetable, subjects, log: {}, breaks, today };
  return {
    info: { grade: 3, room: 1 },
    timetable,
    subjects: subjects.map(s => { const a = alignToPlan(ctx, s); return { ...a, offset: Math.max(0, a.offset + DIFF[s.name]) }; })
  };
}

const HEAD = ['주', '기간', '단원명', '학습 주제', '차시', '쪽수', '비고'];
function jindoRows(lessons) {
  return lessons.map((l, i) => {
    const newWeek = l.week != null && (!i || l.week !== lessons[i - 1].week);
    const newUnit = !i || l.unit !== lessons[i - 1].unit;
    return [newWeek ? String(l.week) : '', newWeek ? l.period : '', newUnit ? l.unit : '', l.title, l.no, l.pages, l.memo];
  });
}
const CC = [
  ['1', '8.24~8.29', '◈개학식', '개학식', '1/1', '자율⋅자치', '◈개학식'],
  ['', '', '안전 생활', '교실에서 안전하게 생활하기', '1/2', '자율⋅자치', ''],
  ['2', '8.31~9.5', '꿈 동아리', '동아리 약속 정하기', '1/2', '동아리', ''],
  ['3', '9.7~9.12', '안전 생활', '등하굣길 안전 지키기', '2/2', '자율⋅자치', ''],
  ['4', '9.14~9.19', '꿈 동아리', '좋아하는 일 찾아보기', '2/2', '동아리', '']
];

/* samples/진도표-예시.hwpx: 교과 연간지도계획 표들 + 창체(합계·동아리 따로) */
export function sampleJindoDoc(today = '2026-10-29') {
  const blocks = [], sem = semesterOf(today);
  const section = (source, head, rows, total) => blocks.push(
    { type: 'p', text: `${source} 교육과정 연간지도계획` }, { type: 'p', text: `${sem.label} · 3학년 1반` },
    { type: 'table', head: true, rows: [head, ...rows] }, { type: 'p', text: `▶ 2학기 총 시수: ${total}시간` });
  for (const name of NAMES) { const s = buildSubject(name, sem.start); section(name, HEAD, jindoRows(s.lessons), s.lessons.length); }
  const ccHead = HEAD.slice(); ccHead[5] = '영역';
  section('창의적 체험활동', ccHead, CC, CC.length);
  const club = CC.filter(r => r[5] === '동아리').map(r => [r[0] || '2', r[1] || '8.31~9.5', r[2], r[3], r[4], '', r[6]]);
  section('동아리 활동', HEAD, club, club.length);
  return { title: '3학년 1반 교과·창체 진도표 (예시)', blocks };
}

/* samples/시간표-예시.hwpx: 학년별 기초시간표처럼 두 반이 나란히 */
export function sampleTimetableDoc() {
  const rows = [['3-1', '월', '화', '수', '목', '금', '3-2', '월', '화', '수', '목', '금']];
  for (let p = 0; p < 6; p++) rows.push([String(p + 1), ...TT.map(d => d[p]), String(p + 1), ...TT2.map(d => d[p])]);
  return { title: '학년별 기초시간표 (예시)', blocks: [{ type: 'p', text: '3) 3학년' }, { type: 'table', head: true, rows }] };
}
export const SAMPLE_TT2 = TT2;
