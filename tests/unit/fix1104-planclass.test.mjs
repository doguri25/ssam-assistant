// 2026-11-04 고침(계획·학급·학년도): 작년 결과 개인정보, 결과 보고 학년도, 진도표 학년도·2월 첫 주, 2학기 진도표, 가져간 진도표 시작일, 학년도와 상관없는 키
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { stripPersonal, stripTable, personalMsg } from '../../web/core/survey.js';
import { readCsv } from '../../web/core/sheet.js';
import { yearOfMonth } from '../../web/core/calendar.js';
import { normReport, guessSourceKind } from '../../web/menus/plan/report-ai.js';
import { periodStart, parseJindo, lessonYear } from '../../web/menus/class/class-import.js';
import { setTimetable, setSubjects, listSubjects, importSubjects, makeCtx, dayView, hours, progressOf, normLessons, setNext } from '../../web/menus/class/class-model.js';
import { isYearKey, snapshot, carryOver } from '../../web/core/years.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const J = JSON.stringify;

/* ---------- plan-privacy-1 ---------- */
// readText가 CSV·엑셀을 읽은 모양(칸은 탭)
const CSV_TEXT = ['타임스탬프\t학생 이름\t보호자 연락처\t만족도\t아쉬운 점',
  '2026/10/01\t박서윤\t010-9876-5432\t5\t줄이 길었어요',
  '2026/10/01\t최도윤\t010-2222-3333\t4\t더웠어요',
  '2026/10/02\t김민준\t010-1234-5678\t3\t그늘이 없었어요'].join('\n');

test('[plan-privacy-1] 표 글(CSV·엑셀)의 이름·연락처 열은 빼고, 다른 열과 답은 남김', () => {
  const r = stripPersonal(CSV_TEXT);
  assert.ok(!r.text.includes('박서윤') && !r.text.includes('김민준') && !r.text.includes('010-'), r.text);
  assert.deepEqual(r.cols, ['학생 이름', '보호자 연락처']);
  assert.ok(r.text.includes('만족도') && r.text.includes('줄이 길었어요') && r.text.includes('그늘이 없었어요'), r.text);
  assert.equal(r.text.split('\n').length, 4);
  assert.match(personalMsg(r), /열 2개/);
  // CSV 파일은 표로: 칸 안 줄바꿈이 있어도, 위에 제목 줄이 있어도 머리를 찾아 열을 뺌
  const csv = '2026 운동회 만족도\n타임스탬프,학생 이름,보호자 연락처,아쉬운 점\n2026/10/01,박서윤,010-9876-5432,"줄이\n길었어요"\n2026/10/01,최도윤,010-2222-3333,더웠어요\n';
  const t = stripTable(readCsv(csv));
  assert.ok(!t.text.includes('박서윤') && !t.text.includes('최도윤') && !t.text.includes('010-'), t.text);
  assert.ok(t.text.includes('줄이 길었어요') && t.text.startsWith('2026 운동회 만족도'), t.text);
  assert.deepEqual(t.cols, ['학생 이름', '보호자 연락처']);
});

test('[plan-privacy-1] 머리 없이도 답이 이름·전화번호 모양이면 빼고, 붙여 넣은 글의 전화번호 줄은 빼고 뺀 줄 수를 셈', () => {
  const t = ['응답\t소감', '이서연\t좋았어요', '정하준\t재밌었어요', '한지민\t또 하고 싶어요'].join('\n');
  const r = stripPersonal(t);
  assert.ok(!/이서연|정하준|한지민/.test(r.text), r.text);
  assert.ok(r.text.includes('또 하고 싶어요'));
  const p = stripPersonal('작년 운동회 만족도 4.1점\n담당: 김철수 010-1111-2222\n대기 시간이 길었음');
  assert.equal(p.dropped, 1);
  assert.ok(!p.text.includes('010-1111-2222') && p.text.includes('대기 시간이 길었음'));
  assert.match(personalMsg(p), /줄 1개/);
  // 개인정보가 없으면 글 그대로
  const n = stripPersonal('만족도 4.2점, 대출 권수 12% 증가\n반성: 저학년 참여가 적었음');
  assert.equal(n.text, '만족도 4.2점, 대출 권수 12% 증가\n반성: 저학년 참여가 적었음');
  assert.equal(n.cols.length + n.dropped + n.masked, 0);
});

/* ---------- report-year-1 ---------- */
test('[report-year-1] 결과 보고의 연도 없는 날은 학년도로 읽음(1~2월은 다음 해)', () => {
  assert.equal(yearOfMonth(10, 2026), 2026);
  assert.equal(yearOfMonth(2, 2026), 2027);
  const a = normReport({ period: { start: '10.15', end: '10.16' }, related: [{ no: '○○초-12', date: '9.20', title: '계획' }] }, { year: 2026 });
  assert.equal(a.period.start, '2026-10-15'); assert.equal(a.period.end, '2026-10-16');
  assert.equal(a.related[0].date, '2026-09-20');
  const b = normReport({ period: { start: '1.20', end: '' } }, { year: 2026 });
  assert.equal(b.period.start, '2027-01-20');
  // 해를 넘는 행사: 끝 날은 시작 날의 학년도로
  const c = normReport({ period: { start: '12.30', end: '1.2' } }, { year: 2026 });
  assert.equal(c.period.start, '2026-12-30'); assert.equal(c.period.end, '2027-01-02');
  const d = normReport({ period: { start: '2027-01-05', end: '1.6' } }, { year: 2026 });
  assert.equal(d.period.end, '2027-01-06');
  // 올해(2026학년도) 결과 보고서는 작년 보고서가 아님
  assert.equal(guessSourceKind('2026 운동회 결과 보고서.hwpx', '', 2026), 'plan');
  assert.equal(guessSourceKind('2025 운동회 결과 보고서.hwpx', '', 2026), 'last');
});

/* ---------- class-jindo-year-1 ---------- */
test('[class-jindo-year-1] 진도표에 학년도가 없으면 넘겨받은 지금 자료의 학년도로 읽음', () => {
  const T = '국어 교육과정 연간지도계획\n1 | 3.2~3.6 | 1. 시 | 시 읽기 | 1/2 | 5 |\n1 | 3.2~3.6 | 1. 시 | 시 쓰기 | 2/2 | 6 |';
  const r = parseJindo(T, { today: '2027-02-16', year: 2027 });
  assert.equal(r.year, 2027);
  assert.equal(r.subjects[0].lessons[0].from, '2027-03-02');
  // 파일에 학년도가 적혀 있으면 그것
  assert.equal(parseJindo('2026학년도\n' + T, { today: '2027-02-16', year: 2027 }).subjects[0].lessons[0].from, '2026-03-02');
  // 넘겨받지 않으면 예전처럼 오늘이 든 학년도
  assert.equal(parseJindo(T, { today: '2027-02-16' }).year, 2026);
});

/* ---------- class-period-feb-1 ---------- */
test('[class-period-feb-1] 2월에 시작해 3월에 끝나는 첫 주(일~토 표기)는 그 학년도의 2월', () => {
  assert.equal(periodStart('2.28~3.6', 2027), '2027-02-28');
  assert.equal(periodStart('2.28~3.4', 2028), '2028-02-28');
  // 그 밖에는 그대로: 1·2월은 다음 해, 해를 넘는 주는 시작 해
  assert.equal(periodStart('2.14~2.18', 2026), '2027-02-14');
  assert.equal(periodStart('1.4~1.9', 2026), '2027-01-04');
  assert.equal(periodStart('12.28~1.2', 2026), '2026-12-28');
  assert.equal(normLessons([{ title: 'a', period: '2.28~3.6' }], 2027)[0].from, '2027-02-28');
  // 저장된 차시에서 학년도를 거꾸로 찾음(2월 첫 주도)
  assert.equal(lessonYear({ period: '2.28~3.6', from: '2027-02-28' }), 2027);
  assert.equal(lessonYear({ period: '2.14~2.18', from: '2027-02-14' }), 2026);
  assert.equal(lessonYear({ period: '9.7~9.11', from: '2026-09-07' }), 2026);
});

/* ---------- class-sem2-1 ---------- */
const lessonsOf = (pre, n, from) => Array.from({ length: n }, (_, i) => ({ week: i + 1, period: '', from: from(i), unit: '단원', title: `${pre} ${i + 1}`, pages: '', memo: '' }));
const iso = (d0, i) => new Date(Date.parse(d0 + 'T00:00:00Z') + i * 7 * 86400000).toISOString().slice(0, 10);

test('[class-sem2-1] 같은 교과에 2학기 진도표를 넣으면 1학기 체크는 세지 않아 오늘 수업이 2학기 1차시, 시수도 처음부터', () => {
  store.useStorage(mem());
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-25T09:00:00') });
  try {
    // 화요일 1교시 국어
    const cells = Array.from({ length: 5 }, () => Array(6).fill(''));
    cells[1][0] = '국어';
    setTimetable({ periods: 6, cells });
    // 1학기 국어 20차시를 모두 마침 (3/3부터 매주 화요일)
    const sem1 = lessonsOf('1학기', 20, i => iso('2026-03-02', i));
    setSubjects([{ id: 'ko', name: '국어', start: '2026-03-02', offset: 0, total: 20, lessons: sem1 }]);
    const log = {};
    for (let i = 0; i < 20; i++) log[iso('2026-03-03', i)] = { 1: { subject: '국어', status: 'done' } };
    store.set('class:log', log);
    const before = makeCtx('2026-08-25');
    assert.equal(hours(before, before.subjects[0]).done, 20);
    // 8월에 받은 2학기 진도표(8/24부터)로 바꿈
    const sem2 = lessonsOf('2학기', 20, i => iso('2026-08-24', i));
    assert.ok(importSubjects([{ name: '국어', total: 20, lessons: sem2 }]));
    const subs = listSubjects();
    assert.equal(subs.length, 1); assert.equal(subs[0].id, 'ko');
    const ctx = makeCtx('2026-08-25');
    const slot = dayView(ctx, '2026-08-25').slots[0];
    assert.equal(slot.lesson && slot.lesson.title, '2학기 1', JSON.stringify(slot));
    assert.equal(slot.finished, false);
    assert.deepEqual(hours(ctx, subs[0]), { plan: 20, done: 0, left: 20 });
    const p = progressOf(ctx, subs[0]);
    assert.equal(p.next, 1); assert.equal(p.diff, 0);
    // 「다음 차시」를 고쳐도 1학기 기록은 세지 않음
    const s3 = setNext(ctx, subs[0], 3);
    assert.equal(hours(ctx, s3).done, 2);
    // 같은 2학기 진도표를 다시 넣으면(이미 2학기) 그대로
    store.set('class:log', { ...log, '2026-08-25': { 1: { subject: '국어', status: 'done' } } });
    assert.ok(importSubjects([{ name: '국어', total: 20, lessons: sem2 }]));
    const again = makeCtx('2026-08-26');
    assert.equal(hours(again, again.subjects[0]).done, 1);
    assert.equal(dayView(again, '2026-09-01').slots[0].lesson.title, '2학기 2');
    // 앞 학기 진도표로 되돌리면 기준일을 없애 기록을 모두 셈
    assert.ok(importSubjects([{ name: '국어', total: 20, lessons: sem1 }]));
    const back = listSubjects()[0];
    assert.ok(!('since' in back), JSON.stringify(back.since));
    assert.equal(hours(makeCtx('2026-08-26'), back).done, 21);
  } finally { mock.timers.reset(); }
});

test('[class-sem2-1] 같은 학기 진도표를 고쳐 다시 넣으면 체크 기록·보정값은 그대로', () => {
  store.useStorage(mem());
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-29T09:00:00') });
  try {
    const cells = Array.from({ length: 5 }, () => Array(6).fill(''));
    cells[1][0] = '국어';
    setTimetable({ periods: 6, cells });
    const sem2 = lessonsOf('2학기', 20, i => iso('2026-08-24', i));
    setSubjects([{ id: 'ko', name: '국어', start: '2026-08-24', offset: 2, total: 20, lessons: sem2 }]);
    store.set('class:log', { '2026-10-27': { 1: { subject: '국어', status: 'done' } } });
    assert.ok(importSubjects([{ name: '국어', total: 21, lessons: lessonsOf('고친', 21, i => iso('2026-08-24', i)) }]));
    const s = listSubjects()[0];
    assert.equal(s.offset, 2); assert.equal(s.total, 21); assert.equal(s.lessons.length, 21);
    assert.equal(hours(makeCtx('2026-10-29'), s).done, 3);
  } finally { mock.timers.reset(); }
});

/* ---------- years-carry-start-1 ---------- */
test('[years-carry-start-1] 학급 준비를 가져가면 진도표 시작일은 새 학년도 첫 수업일(손으로 정한 새 학년도 날은 그대로)', () => {
  const snap = { 'class:subjects': J([
    { id: 'a', name: '과학', start: '2027-02-16', offset: 3, lessons: [{ title: '1' }] },
    { id: 'b', name: '국어', start: '2027-03-04', offset: 1, lessons: [{ title: '1' }] },
    { id: 'c', name: '수학', start: '', offset: 0, lessons: [{ title: '1' }] }]) };
  const subs = JSON.parse(carryOver(snap, 2027, { classSetup: true })['class:subjects']);
  // 2027-03-01(월)은 삼일절 → 3/2(화)
  assert.deepEqual(subs.map(s => s.start), ['2027-03-02', '2027-03-04', '2027-03-02']);
  assert.ok(subs.every(s => s.offset === 0));
  // 2026-03-02(월)은 대체공휴일 → 3/3(화)
  assert.equal(JSON.parse(carryOver(snap, 2026, { classSetup: true })['class:subjects'])[2].start, '2026-03-03');
});

/* ---------- core-6 ---------- */
test('[core-6] 시험용 키 알림·붙여넣기 설정·산출 내역 방식은 학년도 자료가 아님(백업·학년도 옮기기에 들지 않음)', () => {
  for (const k of ['testkey:told', 'queue', 'queueCalc']) assert.equal(isYearKey(k), false, k);
  const ls = mem();
  ls.setItem('ssam:testkey:told', '1'); ls.setItem('ssam:queue', J({ anyWindow: true })); ls.setItem('ssam:queueCalc', J('table'));
  ls.setItem('ssam:mig:pron', '1'); ls.setItem('ssam:years', J({ current: 2026 }));
  assert.deepEqual(snapshot(ls), {});
});
