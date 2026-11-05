// 2026-11-05 3차 고침(계획·학급): 엑셀·CSV 진도표·시간표, 날짜 없는 진도표에 줄 덧붙이기, 1·2학기 합친 진도표, 지운 교과 다시 넣기
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as store from '../../web/core/store.js';
import { readText } from '../../web/core/files.js';
import { zipStore } from '../../web/core/zip.js';
import { parseJindo, parseTimetable } from '../../web/menus/class/class-import.js';
import { setTimetable, setSubjects, listSubjects, saveSubject, removeSubject, importSubjects, replaceLessons, addSubject, termStart, makeCtx, dayView, hours, progressOf, alignToPlan } from '../../web/menus/class/class-model.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const J = JSON.stringify;
const FX = new URL('../fixtures/', import.meta.url);

/* ---------- class-xlsx-1 ---------- */
// 한글 표 글(「칸 | 칸」)을 같은 칸의 엑셀·CSV로: 한글 글에서 빠진 합친 칸은 엑셀처럼 빈 칸으로 채움
const rowsOf = txt => txt.split('\n').map(l => l.split(/\s*\|\s*/));
const toCsv = rows => rows.map(r => r.map(c => (/[,"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
const file = (name, data) => ({ name, arrayBuffer: async () => (typeof data === 'string' ? new TextEncoder().encode(data) : data).buffer });
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const col = i => String.fromCharCode(65 + i);
const xesc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function xlsx(rows) {
  const sheet = rows.map((r, i) => `<row r="${i + 1}">${r.map((c, k) => (c === '' ? '' : `<c r="${col(k)}${i + 1}" t="inlineStr"><is><t>${xesc(c)}</t></is></c>`)).join('')}</row>`).join('');
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0"?><workbook ${NS}><sheets><sheet name="1" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0"?><worksheet ${NS}><sheetData>${sheet}</sheetData></worksheet>` }
  ]);
}
// 엑셀 진도표(합친 칸은 빈 칸): 주 | 기간 | 단원명 | 학습 주제 | 차시 | 쪽수 | 비고
const JINDO_ROWS = [
  ['국어 교육과정 연간지도계획'], ['2026학년도 2학기', '3학년 1반'], ['주', '기간', '단원명', '학습 주제', '차시', '쪽수', '비고'],
  ['1', '8.24~8.29', '1. 마음을 나누는 글', '단원 열기', '1/3', '10~13', ''],
  ['', '', '', '글쓴이의 마음 짐작하기', '2/3', '14~17', ''],
  ['2', '8.31~9.5', '', '마음을 전하는 글 쓰기', '3/3', '18~21', '학예회'],
  ['', '', '2. 낱말 탐험', '단원 열기', '1/1', '', ''],
  ['▶ 2학기 총 시수: 4시간'],
  ['수학 교육과정 연간지도계획'], ['주', '기간', '단원명', '학습 주제', '차시', '쪽수', '비고'],
  ['1', '8.24~8.29', '1. 곱셈', '단원 도입', '1/2', '8~9', ''],
  ['', '', '', '몇십 곱하기', '2/2', '10~11', '']
];
// 엑셀 기초시간표: 빈 시간(합친 칸·빈 칸)도 자리를 지킴
const TT_ROWS = [
  ['3) 3학년'], ['3-1', '월', '화', '수', '목', '금', '3-2', '월', '화', '수', '목', '금'],
  ['1', '국어', '수학', '국어', '수학', '국어', '1', '수학', '국어', '국어', '수학', '국어(자)'],
  ['2', '수학', '', '과학', '국어(자)', '수학', '2', '국어', '수학', '과학', '국어', '수학'],
  ['3', '사회', '과학', '수학', '사회', '영어', '3', '사회', '과학', '수학', '사회', '영어'],
  ['4', '과학', '체육', '음악', '미술', '체육', '4', '과학', '체육', '음악', '미술', '체육'],
  ['5', '체육', '창체(동)', '영어', '미술', '도덕', '5', '체육', '창체', '영어', '미술', '도덕'],
  ['6', '', '', '', '창체', '', '6', '', '', '', '미술', '']
];
const lessonsOf = r => r.subjects.map(s => [s.name, s.lessons.map(l => [l.week, l.from, l.unit, l.title, l.no, l.pages, l.memo].join('/'))]);

test('[class-xlsx-1] 엑셀(.xlsx)·CSV 진도표: 탭으로 나뉜 칸을 읽어 한글 표와 같은 차시(합친 빈 칸은 앞 줄의 주·기간·단원)', async () => {
  const want = [
    ['국어', ['1/2026-08-24/1. 마음을 나누는 글/단원 열기/1/3/10~13/', '1/2026-08-24/1. 마음을 나누는 글/글쓴이의 마음 짐작하기/2/3/14~17/',
      '2/2026-08-31/1. 마음을 나누는 글/마음을 전하는 글 쓰기/3/3/18~21/학예회', '2/2026-08-31/2. 낱말 탐험/단원 열기/1/1//']],
    ['수학', ['1/2026-08-24/1. 곱셈/단원 도입/1/2/8~9/', '1/2026-08-24/1. 곱셈/몇십 곱하기/2/2/10~11/']]];
  const opt = { today: '2026-08-20', year: 2026 };
  for (const f of [file('진도표.xlsx', xlsx(JINDO_ROWS)), file('진도표.csv', toCsv(JINDO_ROWS))]) {
    const r = parseJindo(await readText(f), opt);
    assert.deepEqual(lessonsOf(r), want, f.name);
    assert.equal(r.year, 2026);
    assert.equal(r.subjects[0].total, 4);
  }
  // 한글 표 글(「|」)은 그대로
  const hwp = JINDO_ROWS.map(r => r.filter(Boolean).join(' | ')).join('\n');
  assert.deepEqual(lessonsOf(parseJindo(hwp, opt)), want);
  // 붙여 넣은 엑셀 표(탭), 칸 안에 탭이 든 한글 표 글(칸은 「|」로)
  assert.deepEqual(lessonsOf(parseJindo(JINDO_ROWS.map(r => r.join('\t')).join('\n'), opt)), want);
  const tabIn = parseJindo('국어 교육과정 연간지도계획\n1 | 8.24~8.29 | 1. 단원 | 시\t읽기 | 1/1 | 10 |', opt);
  assert.equal(tabIn.subjects[0].lessons[0].title, '시\t읽기');
  // 시험 자료(한글 표 글)를 CSV로 바꿔도 같은 교과·차시 수
  const sample = readFileSync(new URL('jindo-sample.txt', FX), 'utf8');
  const a = parseJindo(sample, opt), b = parseJindo(await readText(file('s.csv', toCsv(rowsOf(sample)))), opt);
  assert.deepEqual(b.subjects.map(s => `${s.name}:${s.lessons.length}`), a.subjects.map(s => `${s.name}:${s.lessons.length}`));
  assert.ok(b.subjects.length >= 3, J(b.subjects.map(s => s.name)));
});

test('[class-xlsx-1] 엑셀(.xlsx)·CSV 기초시간표: 우리 반 칸, 빈 시간 자리를 지킴', async () => {
  const want = [['국어', '수학', '사회', '과학', '체육', ''], ['수학', '', '과학', '체육', '창체(동)', ''], ['국어', '과학', '수학', '음악', '영어', ''],
    ['수학', '국어(자)', '사회', '미술', '미술', '창체'], ['국어', '수학', '영어', '체육', '도덕', '']];
  for (const f of [file('시간표.xlsx', xlsx(TT_ROWS)), file('시간표.csv', toCsv(TT_ROWS))]) {
    const text = await readText(f);
    assert.deepEqual(parseTimetable(text, { grade: 3, room: 1 }), { periods: 6, cells: want }, f.name);
    assert.equal(parseTimetable(text, { grade: 3, room: 2 }).cells[4][0], '국어(자)', f.name);
    assert.equal(parseTimetable(text, { grade: 3, room: 9 }), null);
  }
  // 한글 표 글은 그대로
  const sample = readFileSync(new URL('timetable-sample.txt', FX), 'utf8');
  const hw = parseTimetable(sample, { grade: 3, room: 1 });
  assert.deepEqual(hw.cells[0], ['국어', '수학', '사회', '과학', '체육', '']);
  assert.deepEqual(parseTimetable(await readText(file('s.csv', toCsv(rowsOf(sample)))), { grade: 3, room: 1 }), hw);
});

/* ---------- class-append-3 · class-sem-fullyear-2 ---------- */
const at = t => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date(t + 'T08:00:00') }); };
const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const plain = t => ({ week: null, period: '', from: '', unit: '', title: t, no: '', pages: '', memo: '' });
/* 화요일 1교시에 name 교과, 날짜 없는 1학기 n차시를 3/3부터 매주 모두 체크 */
function handDone(name = '창체', n = 10) {
  store.useStorage(mem());
  at('2026-03-02');
  const cells = Array.from({ length: 5 }, () => Array(6).fill(''));
  cells[1][0] = name;
  setTimetable({ periods: 6, cells });
  const s = saveSubject({ name, start: '2026-03-02', offset: 0, total: null, lessons: Array.from({ length: n }, (_, i) => plain(`1학기 ${i + 1}`)) });
  saveSubject(alignToPlan(makeCtx(), s));
  store.set('class:log', Object.fromEntries(Array.from({ length: n }, (_, i) => [add('2026-03-03', 7 * i), { 1: { subject: name, status: 'done' } }])));
}
const state = (T, s = listSubjects()[0]) => {
  const ctx = makeCtx(T), p = progressOf(ctx, s), slot = dayView(ctx, T).slots[0];
  return { since: s.since, plan: p.plan, actual: p.actual, next: p.next, diff: p.diff, today: slot && slot.lesson ? slot.lesson.title : '' };
};

test('[class-append-3] 다 마친 날짜 없는 교과에 [진도표 고치기]로 2학기 줄을 뒤에 더해 저장하면 체크 그대로 11차시부터', () => {
  try {
    handDone();
    at('2026-09-01');
    assert.deepEqual(state('2026-09-01'), { since: undefined, plan: 10, actual: 10, next: 11, diff: 0, today: '' }); // 다 마침
    // 옛 줄보다 많은 12줄을 뒤에 더함 (고치기 시트 [저장]처럼 이름과 함께)
    const old = listSubjects()[0];
    const s = replaceLessons(old, [...old.lessons, ...Array.from({ length: 12 }, (_, i) => plain(`2학기 ${i + 1}`))], { name: '창체' });
    assert.ok(s && !('since' in s), J(s && s.since));
    const st = state('2026-09-01');
    assert.deepEqual([st.plan, st.actual, st.next, st.today], [22, 10, 11, '2학기 1'], J(st));
    assert.deepEqual(hours(makeCtx('2026-09-01'), s), { plan: 22, done: 10, left: 12 });
  } finally { mock.timers.reset(); }
  // 옛 줄의 글자를 고치며 덧붙여도 같음
  try {
    handDone();
    at('2026-09-01');
    const old = listSubjects()[0];
    const ls = [...old.lessons.map((l, i) => (i < 2 ? { ...l, title: l.title + ' (고침)' } : l)), ...Array.from({ length: 15 }, (_, i) => plain(`가을 ${i + 1}`))];
    assert.equal(termStart(makeCtx('2026-09-01'), old, ls), null);
    assert.equal(state('2026-09-01', replaceLessons(old, ls)).next, 11);
  } finally { mock.timers.reset(); }
  // 2학기 줄만 새로 쓰면(옛 줄을 지움) 그대로 다음 학기: 오늘부터 새로 셈
  try {
    handDone();
    at('2026-09-01');
    const s = replaceLessons(listSubjects()[0], Array.from({ length: 12 }, (_, i) => plain(`2학기 ${i + 1}`)), { name: '창체' });
    assert.equal(s.since, '2026-09-01');
    const st = state('2026-09-01');
    assert.deepEqual([st.actual, st.next, st.today], [0, 1, '2학기 1'], J(st));
  } finally { mock.timers.reset(); }
});

/* 화요일 1교시 국어: 3/2에 1학기 진도표(18차시)를 넣고 모두 체크 → 8/24에 2학기 진도표(20차시) → 9/29까지 5차시 체크 */
const md = d => `${+d.slice(5, 7)}.${+d.slice(8, 10)}`;
const HEAD = '국어 교육과정 연간지도계획\n2026학년도 | 3학년 1반\n주 | 기간 | 단원명 | 학습 주제 | 차시 | 쪽수 | 비고\n';
const rows = (mon0, n, tag, w0 = 1) => Array.from({ length: n }, (_, i) => { const m = add(mon0, 7 * i); return `${w0 + i} | ${md(m)}~${md(add(m, 4))} | 단원 | ${tag} ${i + 1} | ${i + 1}/${n} | |`; });
const jindo = (lines, today) => parseJindo(HEAD + lines.join('\n'), { today, year: 2026 }).subjects;
function sem2Started(n1 = 18, n2 = 20) {
  store.useStorage(mem());
  at('2026-03-02');
  const cells = Array.from({ length: 5 }, () => Array(6).fill(''));
  cells[1][0] = '국어';
  setTimetable({ periods: 6, cells });
  assert.ok(importSubjects(jindo(rows('2026-03-02', n1, '1학기'), '2026-03-02')));
  const log = Object.fromEntries(Array.from({ length: n1 }, (_, i) => [add('2026-03-03', 7 * i), { 1: { subject: '국어', status: 'done' } }]));
  store.set('class:log', log);
  at('2026-08-24');
  assert.ok(importSubjects(jindo(rows('2026-08-24', n2, '2학기'), '2026-08-24')));
  assert.equal(listSubjects()[0].since, '2026-08-24');
  for (let i = 0; i < 5; i++) log[add('2026-08-25', 7 * i)] = { 1: { subject: '국어', status: 'done' } };
  store.set('class:log', log);
  at('2026-09-29');
}

test('[class-sem-fullyear-2] 2학기 진도표를 넣은 교과에 1·2학기 합친 진도표를 넣으면 기준일을 없애 1학기 체크도 세고 지금 차시는 2학기 6', () => {
  try {
    sem2Started();
    const T = '2026-09-29', before = state(T);
    assert.deepEqual([before.next, before.today], [6, '2학기 6'], J(before));
    const all = jindo([...rows('2026-03-02', 18, '1학기'), ...rows('2026-08-24', 20, '2학기', 30)], T);
    // 넣기 창 안내: 기준일을 없앰('') — 「체크 기록은 그대로」
    assert.equal(termStart(makeCtx(T), listSubjects()[0], all[0].lessons), '');
    assert.ok(importSubjects(all));
    const s = listSubjects()[0], st = state(T);
    assert.ok(!('since' in s), J(s.since));
    assert.deepEqual([st.plan, st.actual, st.next, st.diff, st.today], [38, 23, 24, 0, '2학기 6'], J(st));
  } finally { mock.timers.reset(); }
  // 1학기 줄이 더 많아도 같음
  try {
    sem2Started(20, 18);
    const T = '2026-09-29';
    assert.ok(importSubjects(jindo([...rows('2026-03-02', 20, '1학기'), ...rows('2026-08-24', 18, '2학기', 30)], T)));
    const st = state(T);
    assert.deepEqual([st.since, st.next, st.today], [undefined, 26, '2학기 6'], J(st));
  } finally { mock.timers.reset(); }
});

test('[class-sem-fullyear-2] 그대로 지킴: 2학기 진도표를 고쳐 다시 넣으면(첫 주 줄 지움·글자 고침) 기준일·체크 그대로, 1학기 진도표로 되돌리면 기준일을 없앰', () => {
  try {
    sem2Started();
    const T = '2026-09-29';
    // 첫 주 줄을 지우고 글자를 고친 2학기 진도표
    const fixed = jindo(rows('2026-08-24', 20, '2학기').slice(1).map(l => l.replace('2학기 5', '2학기 5 (고침)')), T);
    assert.equal(termStart(makeCtx(T), listSubjects()[0], fixed[0].lessons), null);
    assert.ok(importSubjects(fixed));
    let st = state(T);
    assert.deepEqual([st.since, st.actual, st.next], ['2026-08-24', 5, 6], J(st));
    // 같은 2학기 진도표 그대로
    assert.ok(importSubjects(jindo(rows('2026-08-24', 20, '2학기'), T)));
    st = state(T);
    assert.deepEqual([st.since, st.actual, st.today], ['2026-08-24', 5, '2학기 6'], J(st));
    // 2학기 진도표에 줄을 뒤에 덧붙임(날짜 있음)
    const s = replaceLessons(listSubjects()[0], [...listSubjects()[0].lessons, ...jindo(rows('2027-01-04', 4, '겨울', 21), T)[0].lessons]);
    assert.equal(s.since, '2026-08-24');
    assert.equal(state(T).next, 6);
    // 1학기 진도표로 되돌림
    assert.ok(importSubjects(jindo(rows('2026-03-02', 18, '1학기'), T)));
    assert.ok(!('since' in listSubjects()[0]));
    assert.equal(state(T).actual, 18);
  } finally { mock.timers.reset(); }
});

/* ---------- class-readd-5 ---------- */
const KO30 = () => jindo(rows('2026-03-02', 30, '차시'), '2026-03-02');
/* 국어 30차시(3/2~), 15주 동안 완료 10·못함 5 → 6/15 */
function behind() {
  store.useStorage(mem());
  at('2026-03-02');
  const cells = Array.from({ length: 5 }, () => Array(6).fill(''));
  cells[1][0] = '국어';
  setTimetable({ periods: 6, cells });
  assert.ok(importSubjects(KO30()));
  store.set('class:log', Object.fromEntries(Array.from({ length: 15 }, (_, i) => [add('2026-03-03', 7 * i), { 1: { subject: '국어', status: i < 10 ? 'done' : 'skip' } }])));
  at('2026-06-15');
}

test('[class-readd-5] 교과를 지웠다가 같은 진도표를 다시 넣으면 남은 체크 기록대로 이어짐(다음 차시 11, 실시 10)', () => {
  try {
    behind();
    const T = '2026-06-15', ctx = makeCtx(T), s0 = listSubjects()[0];
    assert.deepEqual([progressOf(ctx, s0).next, hours(ctx, s0).done], [11, 10]);
    assert.ok(removeSubject(s0.id));
    assert.ok(importSubjects(KO30()));
    const s = listSubjects()[0], p = progressOf(makeCtx(T), s);
    assert.equal(s.offset, 0);
    assert.deepEqual([p.actual, p.done, p.expected, p.next], [10, 10, 15, 11], J(p));
    assert.equal(dayView(makeCtx('2026-06-16'), '2026-06-16').slots[0].lesson.title, '차시 11');
  } finally { mock.timers.reset(); }
  // AI로 뽑기·직접 쓰기(addSubject)도 같음
  try {
    behind();
    removeSubject(listSubjects()[0].id);
    const s = addSubject({ name: '국어', lessons: KO30()[0].lessons });
    assert.ok(s && s.offset === 0, J(s));
    assert.equal(progressOf(makeCtx('2026-06-15'), s).next, 11);
  } finally { mock.timers.reset(); }
  // 날짜 없는(직접 쓴) 교과: 시작일은 남은 첫 기록 날이라 진도 차이도 이어짐
  try {
    handDone('창체', 6);
    at('2026-04-13');
    const before = progressOf(makeCtx('2026-04-13'), listSubjects()[0]);
    removeSubject(listSubjects()[0].id);
    const s = addSubject({ name: '창체', lessons: Array.from({ length: 10 }, (_, i) => plain(`1학기 ${i + 1}`)) });
    const p = progressOf(makeCtx('2026-04-13'), s);
    assert.equal(s.start, '2026-03-03');
    assert.deepEqual([p.actual, p.next, p.expected, p.diff], [6, 7, before.expected, before.diff], J([p, before]));
  } finally { mock.timers.reset(); }
});

test('[class-readd-5] 그대로 지킴: 기록이 없는 새 교과는 계획 진도에 맞춤, 지운 1학기 교과에 2학기 진도표를 새로 넣으면 1학기 체크는 세지 않음', () => {
  try {
    behind();
    // 기록 없는 새 교과(수학, 화 2교시) — 계획 진도(15주째)에 맞춤
    const cells = Array.from({ length: 5 }, () => Array(6).fill(''));
    cells[1][0] = '국어'; cells[1][1] = '수학';
    setTimetable({ periods: 6, cells });
    const m = addSubject({ name: '수학', total: 30, lessons: KO30()[0].lessons });
    assert.equal(progressOf(makeCtx('2026-06-15'), m).next, 16);
    assert.equal(m.total, 30);
  } finally { mock.timers.reset(); }
  try {
    behind();
    removeSubject(listSubjects()[0].id);
    at('2026-08-25');
    assert.ok(importSubjects(jindo(rows('2026-08-24', 20, '2학기'), '2026-08-25')));
    const s = listSubjects()[0], st = state('2026-08-25', s);
    assert.equal(s.since, '2026-08-24');
    assert.deepEqual([st.actual, st.next, st.today], [0, 1, '2학기 1'], J(st));
  } finally { mock.timers.reset(); }
});
