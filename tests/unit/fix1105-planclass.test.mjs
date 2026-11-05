// 2026-11-05 고침(계획·학급·학년도): 실적 표 숫자 지우기 회귀, 작년 계획서·지침·참고 자료 개인정보, 진도표 학년도(3월·2월 준비·가져가기), 날짜 없는·AI·직접 쓴 2학기 진도표
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { stripPersonal, stripTable, summarize } from '../../web/core/survey.js';
import { readCsv } from '../../web/core/sheet.js';
import { parseJindo } from '../../web/menus/class/class-import.js';
import { setTimetable, setSubjects, listSubjects, importSubjects, replaceLessons, makeCtx, dayView, hours, progressOf } from '../../web/menus/class/class-model.js';
import { carryOver } from '../../web/core/years.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const J = JSON.stringify;

/* ---------- plan-strip-numbers-1 ---------- */
test('[plan-strip-numbers-1] 실적 표의 예산·집행액(4~6자리 금액)·연도·학년 열은 지우지 않음', () => {
  const t = '2025 독서교육 실적\n항목\t예산\t집행액\t비고\n도서 구입\t820000\t786500\t학급문고\n독서 골든벨\t150000\t148000\t상품\n체험학습\t45000\t43200\t버스\n반성: 강사 섭외가 늦었음';
  const r = stripPersonal(t);
  assert.equal(r.text, t);
  assert.deepEqual([r.cols, r.dropped, r.masked], [[], 0, 0]);
  // 엑셀·CSV 표: 연도 열, 학년별 실적
  const y = stripTable([['연도', '참가 학생 수', '만족도'], ['2023', '312', '4.1'], ['2024', '298', '4.3'], ['2025', '305', '4.5']]);
  assert.deepEqual(y.cols, []);
  assert.ok(y.text.includes('2023\t312\t4.1') && y.text.startsWith('연도'), y.text);
  const g = stripTable(readCsv('학년,응답 수,만족도 평균\n1,52,4.6\n2,48,4.4\n3,50,4.2\n'));
  assert.deepEqual(g.cols, []);
  assert.ok(g.text.startsWith('학년\t응답 수') && g.text.includes('1\t52\t4.6'), g.text);
  // 붙여 넣은 학년·반별 표, 연번이 붙은 학년별 표
  const c = '학년\t반\t참여 인원\n1\t1\t25\n1\t2\t24\n2\t1\t26';
  assert.equal(stripPersonal(c).text, c);
  const n = '번호\t학년\t참가 수\t예산\n1\t1\t52\t120000\n2\t2\t48\t110000\n3\t3\t50\t115000';
  assert.equal(stripPersonal(n).text, n);
});

test('[plan-strip-numbers-1] 설문 응답 표의 이름·학번·학생 번호와 함께 있는 학년·반 열은 계속 뺌', () => {
  const t = ['학년\t반\t번호\t이름\t만족도', '3\t1\t5\t김하나\t5', '3\t2\t7\t이두리\t4', '4\t1\t3\t박세나\t4'].join('\n');
  const r = stripPersonal(t);
  assert.deepEqual(r.cols, ['학년', '반', '번호', '이름']);
  assert.equal(r.text, '만족도\n5\n4\n4');
  // 이름 없이 학년·반·번호만 있어도 학생을 가리킴
  assert.deepEqual(stripPersonal('학년\t반\t번호\t만족도\n3\t1\t5\t5\n3\t2\t7\t4\n4\t1\t3\t4').cols, ['학년', '반', '번호']);
  assert.deepEqual(stripPersonal('학년 반 번호\t소감\n3-1-5\t좋았어요\n3-2-7\t재밌었어요').cols, ['학년 반 번호']);
  // 학번 모양 답: 머리가 학번·아이디·번호를 가리키거나 비었으면 뺌
  assert.deepEqual(stripTable([['학번', '만족도'], ['30101', '5'], ['30102', '4'], ['30103', '5']]).cols, ['학번']);
  assert.deepEqual(stripTable([['아이디', '즐거웠나요?'], ['30101', '5'], ['30102', '4'], ['30103', '4']]).cols, ['아이디']);
  assert.deepEqual(stripPersonal('\t소감\n30101\t좋았어요\n30102\t재밌었어요\n30103\t또 해요').cols, ['1번째 열']);
  // 설문 집계(summarize)는 예전 그대로 학년·반 열을 문항으로 보지 않음
  assert.deepEqual(summarize([['학년', '반', '즐거웠나요?'], ['3', '1', '5'], ['4', '2', '4']]).excluded, ['학년', '반']);
});

/* ---------- class-jindo-year-2 ---------- */
// 2027학년도 3월 주(3/1(월) 삼일절이라 첫 주는 3.2(화)~3.5(금))
const W27 = ['3.2~3.5', '3.8~3.12', '3.15~3.19'];
// 2026학년도 3월 주(3/2(월) 대체공휴일이라 첫 주는 3.3(화)~3.6(금))
const W26 = ['3.3~3.6', '3.9~3.13', '3.16~3.20'];
const jindo = (weeks, per = 3) => '국어 교육과정 연간지도계획\n' + weeks.flatMap((p, w) => Array.from({ length: per }, (_, k) => `${w + 1} | ${p} | 1. 시 | 주제 ${w * per + k + 1} | ${k + 1}/${per} | 5 |`)).join('\n');

test('[class-jindo-year-2] 학년도 없는 진도표: 3월에 학년도를 안 바꿨으면 오늘이 든 학년도, 2월 준비는 다음 학년도, 기간 요일이 맞으면 그 학년도', () => {
  const a = parseJindo(jindo(W27), { today: '2027-03-10', year: 2026 });
  assert.equal(a.year, 2027);
  assert.equal(a.subjects[0].lessons[0].from, '2027-03-02');
  // 2월에 지난 학년도(2026) 자료에서 미리 넣음(준비 화면 안내대로) → 다음 학년도
  assert.equal(parseJindo(jindo(W27), { today: '2027-02-16', year: 2026 }).subjects[0].lessons[3].from, '2027-03-08');
  // 지난 학년도 진도표를 늦게 넣음: 기간 요일이 지금 자료의 학년도(2026)와 맞음
  assert.equal(parseJindo(jindo(W26), { today: '2027-03-10', year: 2026 }).year, 2026);
  // 그 밖에는 지금 자료의 학년도 (1차 고침 그대로: 2월에 새 학년도를 시작했으면 그 학년도)
  assert.equal(parseJindo(jindo(W27), { today: '2026-11-05', year: 2026 }).year, 2026);
  assert.equal(parseJindo(jindo(W26), { today: '2027-02-16', year: 2027 }).year, 2027);
});

test('[class-jindo-year-2] 3월에 넣은 새 교과는 계획 진도에 맞고 「끝」이 아님', () => {
  store.useStorage(mem());
  mock.timers.enable({ apis: ['Date'], now: new Date('2027-03-10T09:00:00') });
  try {
    const cells = Array.from({ length: 5 }, () => Array(6).fill(''));
    cells[0][0] = '국어'; cells[2][0] = '국어';
    setTimetable({ periods: 6, cells });
    const r = parseJindo(jindo(W27), { today: '2027-03-10', year: 2026 });
    assert.ok(importSubjects([{ name: '국어', total: 9, lessons: r.subjects[0].lessons }]));
    const ctx = makeCtx('2027-03-10'), p = progressOf(ctx, listSubjects()[0]);
    // 첫 주 3차시 + 이번 주 월요일 1차시 → 다음 차시 5 (2026년으로 읽으면 다음 차시 10 = 끝)
    assert.equal(p.next, 5); assert.equal(p.diff, 0);
    assert.equal(dayView(ctx, '2027-03-10').slots[0].lesson.title, '주제 5');
  } finally { mock.timers.reset(); }
});

test('[class-jindo-year-2] 학급 준비를 가져가면 차시 날짜(기간)도 새 학년도로 다시 셈', () => {
  // 예전 판이 2월에 지난 학년도 날짜(2026)로 저장한 진도표
  const lessons = parseJindo(jindo(W27, 4), { today: '2027-02-16' }).subjects[0].lessons;
  assert.equal(lessons[0].from, '2026-03-02');
  const feb = { week: 0, period: '2.28~3.6', from: '2026-02-28', unit: '', title: '첫 주', no: '', pages: '', memo: '' };
  const plain = { week: null, period: '', from: '', unit: '', title: '기간 없음', no: '', pages: '', memo: '' };
  const snap = {
    'class:subjects': J([{ id: 'ko', name: '국어', start: '2027-02-16', offset: 0, total: 12, lessons }, { id: 'sc', name: '과학', start: '', offset: 0, lessons: [feb, plain] }]),
    'class:timetable': J({ periods: 6, cells: [['국어'], ['국어'], ['국어'], ['국어'], []] })
  };
  const out = carryOver(snap, 2027, { classSetup: true }), subs = JSON.parse(out['class:subjects']);
  assert.deepEqual(subs[0].lessons.map(l => l.from).filter((d, i, a) => a.indexOf(d) === i), ['2027-03-02', '2027-03-08', '2027-03-15']);
  assert.deepEqual(subs[1].lessons.map(l => l.from), ['2027-02-28', '']);
  // 새 학년도 첫 주 3/3(수): 3/2(화)에 1차시를 했어야 함(진도 차이 -20이 아님)
  const ls = mem();
  for (const [k, v] of Object.entries(out)) ls.setItem('ssam:' + k, v);
  store.useStorage(ls);
  const p = progressOf(makeCtx('2027-03-03'), listSubjects()[0]);
  assert.equal(p.expected, 1); assert.equal(p.diff, -1);
});

/* ---------- class-sem2-2 ---------- */
const iso = (d0, i) => new Date(Date.parse(d0 + 'T00:00:00Z') + i * 7 * 86400000).toISOString().slice(0, 10);
const md = d => `${+d.slice(5, 7)}.${+d.slice(8, 10)}`;
const sem1 = () => Array.from({ length: 20 }, (_, i) => ({ week: i + 1, period: `${md(iso('2026-03-02', i))}~${md(iso('2026-03-06', i))}`, from: iso('2026-03-02', i), unit: '단원', title: `1학기 ${i + 1}`, no: '', pages: '', memo: '' }));
/* 화요일 1교시 국어, 1학기 국어 20차시를 모두 체크 */
function finished(t = '2026-08-25T09:00:00') {
  store.useStorage(mem());
  mock.timers.enable({ apis: ['Date'], now: new Date(t) });
  const cells = Array.from({ length: 5 }, () => Array(6).fill(''));
  cells[1][0] = '국어';
  setTimetable({ periods: 6, cells });
  setSubjects([{ id: 'ko', name: '국어', start: '2026-03-02', offset: 0, total: 20, lessons: sem1() }]);
  const log = {};
  for (let i = 0; i < 20; i++) log[iso('2026-03-03', i)] = { 1: { subject: '국어', status: 'done' } };
  store.set('class:log', log);
}

test('[class-sem2-2] 기간 칸 없이 주만 있는 2학기 진도표: 1학기를 다 마친 교과는 오늘부터 새로 셈', () => {
  finished();
  try {
    const T = '국어 교육과정 연간지도계획\n' + Array.from({ length: 20 }, (_, i) => `${i + 1} | 1. 단원 | 2학기 ${i + 1} | 1/1 | 5 |`).join('\n');
    const lessons = parseJindo(T, { today: '2026-08-25', year: 2026 }).subjects[0].lessons;
    assert.equal(lessons[0].from, '');
    assert.ok(importSubjects([{ name: '국어', total: 20, lessons }]));
    const s = listSubjects()[0], ctx = makeCtx('2026-08-25');
    assert.equal(s.since, '2026-08-25');
    assert.deepEqual(hours(ctx, s), { plan: 20, done: 0, left: 20 });
    const slot = dayView(ctx, '2026-08-25').slots[0];
    assert.equal(slot.lesson && slot.lesson.title, '2학기 1', J(slot));
    assert.equal(progressOf(ctx, s).next, 1);
  } finally { mock.timers.reset(); }
});

test('[class-sem2-2] AI로 뽑거나 고치기 시트로 바꾼 2학기 진도표도 1학기 체크를 세지 않음, 같은 진도표를 고치면 기록 그대로', () => {
  finished();
  try {
    // AI가 뽑은 2학기(기간 8.24~) → 고치기 시트 [저장]
    const ai = Array.from({ length: 20 }, (_, i) => ({ week: i + 1, period: `${md(iso('2026-08-24', i))}~${md(iso('2026-08-28', i))}`, from: iso('2026-08-24', i), unit: '1. 단원', title: `2학기 ${i + 1}`, no: '', pages: '', memo: '' }));
    const s = replaceLessons(listSubjects()[0], ai, { name: '국어' });
    assert.ok(s);
    const ctx = makeCtx('2026-08-25');
    assert.deepEqual(hours(ctx, s), { plan: 20, done: 0, left: 20 });
    assert.equal(dayView(ctx, '2026-08-25').slots[0].lesson.title, '2학기 1');
  } finally { mock.timers.reset(); }
  // 직접 쓴(날짜 없는) 2학기 진도표
  finished();
  try {
    const hand = Array.from({ length: 18 }, (_, i) => ({ week: null, period: '', from: '', unit: '', title: `가을 ${i + 1}`, no: '', pages: '', memo: '' }));
    const s = replaceLessons(listSubjects()[0], hand);
    assert.equal(s.since, '2026-08-25');
    assert.deepEqual(hours(makeCtx('2026-08-25'), s), { plan: 18, done: 0, left: 18 });
  } finally { mock.timers.reset(); }
  // 다 마친 진도표를 고쳐 저장: 같은 진도표라 기록 그대로 (날짜 없는 진도표의 글자 고침, 날짜 있는 진도표의 첫 주 줄 지움)
  finished();
  try {
    const plain = sem1().map(l => ({ ...l, period: '', from: '' }));
    setSubjects([{ ...listSubjects()[0], lessons: plain }]);
    const s = replaceLessons(listSubjects()[0], plain.map((l, i) => (i === 3 ? { ...l, title: '1학기 4 (고침)' } : l)));
    assert.ok(!('since' in s), J(s.since));
    assert.equal(hours(makeCtx('2026-08-25'), s).done, 20);
  } finally { mock.timers.reset(); }
  finished();
  try {
    const s = replaceLessons(listSubjects()[0], sem1().slice(2));
    assert.ok(!('since' in s), J(s.since));
    assert.equal(hours(makeCtx('2026-08-25'), s).done, 20);
  } finally { mock.timers.reset(); }
  // 1학기를 다 마치지 않았으면(날짜 없는 진도표) 기록 그대로
  finished();
  try {
    store.set('class:log', { '2026-03-03': { 1: { subject: '국어', status: 'done' } } });
    const hand = Array.from({ length: 18 }, (_, i) => ({ week: null, period: '', from: '', unit: '', title: `가을 ${i + 1}`, no: '', pages: '', memo: '' }));
    const s = replaceLessons(listSubjects()[0], hand);
    assert.ok(!('since' in s));
    assert.equal(hours(makeCtx('2026-08-25'), s).done, 1);
  } finally { mock.timers.reset(); }
});
