// 학급 모델: 저장·망가진 값, 교과 이름 맞추기, 수업 없는 날, 차시 배정, 시수, 진도 차이, 주간 예상
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import {
  getInfo, setInfo, getTimetable, setTimetable, listSubjects, saveSubject, removeSubject, getLog, setMark, getWeekly, saveWeekly,
  mondayOf, fmtDay, fmtShort, noClass, sameSubject, findSubject, slotsOn, lessonAt, dayView, hours, setNext,
  lessonMonday, progressOf, summary, alignToPlan, missingDays, defaultWeek, weekView, normLessons, normTimetableAI, normNotes, weeklyTitle, cellText, weeklyDoc
} from '../../web/menus/class/class-model.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const L = n => Array.from({ length: n }, (_, i) => ({ week: null, period: '', from: '', unit: '1. 단원', title: `차시 ${i + 1}`, pages: '', memo: '' }));
const empty = p => Array.from({ length: 5 }, () => Array(p).fill(''));
/* 화1·수2·목1·목3(국어(자))·금2 국어, 목2 영어 */
function tt() {
  const c = empty(6);
  c[1][0] = '국어'; c[2][1] = '국어'; c[3][0] = '국어'; c[3][2] = '국어(자)'; c[4][1] = '국어'; c[3][1] = '영어';
  return { periods: 6, cells: c };
}
const KO = { id: 'ko', name: '국어', start: '', offset: 2, total: 10, lessons: L(10) };
const ctxOf = (log = {}, sub = KO) => ({ tt: tt(), subjects: [sub], log, breaks: [], today: '2026-10-29' });
const mark = (log, date, period, status, subject = '국어') => { (log[date] || (log[date] = {}))[period] = { subject, status }; return log; };

test('학급·시간표 저장, 칸 띄어쓰기 붙이기, 망가진 값은 기본값', () => {
  store.useStorage(mem());
  assert.deepEqual(getInfo(), { grade: null, room: null });
  setInfo({ grade: 3, room: 2 }); assert.deepEqual(getInfo(), { grade: 3, room: 2 });
  const t = getTimetable();
  assert.equal(t.periods, 6); assert.equal(t.cells.length, 5); assert.deepEqual(t.cells[0], ['', '', '', '', '', '']);
  const c = empty(7); c[0][0] = '수 학'; c[4][6] = ' 국어(자) ';
  assert.equal(setTimetable({ periods: 7, cells: c }), true);
  assert.equal(getTimetable().cells[0][0], '수학'); assert.equal(getTimetable().cells[4][6], '국어(자)'); assert.equal(getTimetable().periods, 7);
  store.set('class:timetable', 'x'); assert.equal(getTimetable().periods, 6);
  store.set('class:timetable', { periods: 99, cells: 3 }); assert.equal(getTimetable().periods, 6);
});

test('교과 저장·바꾸기·지우기, 망가진 교과는 빠짐', () => {
  store.useStorage(mem());
  const a = saveSubject({ name: '국어', lessons: L(3) });
  assert.match(a.id, /^sj/);
  const b = saveSubject({ name: '수학', lessons: L(2), start: '2026-08-24', offset: 1, total: 2 });
  assert.deepEqual(listSubjects().map(s => s.name), ['국어', '수학']);
  saveSubject({ ...a, lessons: L(5) });
  assert.equal(listSubjects().length, 2); assert.equal(listSubjects()[0].lessons.length, 5);
  removeSubject(a.id); assert.deepEqual(listSubjects().map(s => s.id), [b.id]);
  store.set('class:subjects', [{ id: 'k', name: '국어', lessons: [{ title: 'x', week: '3' }, { week: 1 }] }, 'bad', { id: '', name: 'x' }, { id: 'm', name: '수학', lessons: 'x', offset: 'y', start: '어제' }]);
  const s = listSubjects();
  assert.deepEqual(s.map(x => x.name), ['국어', '수학']);
  assert.equal(s[0].lessons.length, 1); assert.equal(s[0].lessons[0].week, null);
  assert.deepEqual(s[1].lessons, []); assert.equal(s[1].offset, 0); assert.equal(s[1].start, ''); assert.equal(s[1].total, null);
  store.set('class:subjects', 'x'); assert.deepEqual(listSubjects(), []);
});

test('체크 기록·지우기, 주간학습안내 저장, 망가진 값', () => {
  store.useStorage(mem());
  assert.equal(setMark('2026-10-29', 1, '국어', 'done'), true);
  setMark('2026-10-29', 3, '국어(자)', 'part');
  assert.deepEqual(getLog()['2026-10-29'], { 1: { subject: '국어', status: 'done' }, 3: { subject: '국어(자)', status: 'part' } });
  setMark('2026-10-29', 1, '국어', null); setMark('2026-10-29', 3, '국어', null);
  assert.equal(getLog()['2026-10-29'], undefined);
  store.set('class:log', { 'x': {}, '2026-10-28': { 1: { subject: '국어', status: 'bad' }, 2: { subject: '수학', status: 'skip' } } });
  assert.deepEqual(getLog(), { '2026-10-28': { 2: { subject: '수학', status: 'skip' } } });
  const w = getWeekly('2026-11-02');
  assert.equal(w.title, ''); assert.deepEqual(w.cells, {}); assert.deepEqual(w.notes[0], { events: '', prep: '', homework: '', notice: '', safety: '' });
  saveWeekly('2026-11-02', { title: '3학년 2반', cells: { '0-1': '국어', '9-9': 'x' }, notes: { 2: { prep: '색연필', safety: 3 } } });
  const g = getWeekly('2026-11-02');
  assert.deepEqual(g.cells, { '0-1': '국어' }); assert.equal(g.notes[2].prep, '색연필'); assert.equal(g.notes[2].safety, '');
});

test('저장 공간이 모자라면 false·null', () => {
  const s = mem(); s.setItem = () => { throw new Error('quota'); };
  store.useStorage(s);
  assert.equal(saveSubject({ name: '국어', lessons: [] }), null);
  assert.equal(setMark('2026-10-29', 1, '국어', 'done'), false);
  assert.equal(setTimetable({ periods: 6, cells: empty(6) }), false);
});

test('날짜 글·월요일', () => {
  assert.equal(mondayOf('2026-10-29'), '2026-10-26'); assert.equal(mondayOf('2026-11-01'), '2026-10-26'); assert.equal(mondayOf('2026-10-26'), '2026-10-26');
  assert.equal(fmtDay('2026-10-29'), '10월 29일 (목)'); assert.equal(fmtShort('2026-10-27'), '10/27(화)');
});

test('수업 없는 날: 주말·공휴일·방학', () => {
  assert.equal(noClass('2026-10-31', []), '토요일');
  assert.equal(noClass('2026-10-09', []), '공휴일(한글날)');
  assert.equal(noClass('2027-01-05', [{ from: '2026-12-24', to: '2027-02-28', label: '겨울방학' }]), '겨울방학');
  assert.equal(noClass('2026-10-29', []), '');
});

test('교과 이름 맞추기', () => {
  assert.ok(sameSubject('국어(자)', '국어')); assert.ok(sameSubject('창의적 체험활동', '창체')); assert.ok(sameSubject('창체(동)', '창체'));
  assert.ok(sameSubject('수 학', '수학')); assert.ok(!sameSubject('국어', '수학')); assert.ok(!sameSubject('', ''));
  const subs = [{ id: 'a', name: '국어' }, { id: 'b', name: '국어(자)' }, { id: 'c', name: '창체' }];
  assert.equal(findSubject(subs, '국어(자)').id, 'b');
  assert.equal(findSubject(subs.slice(0, 1), '국어(자)').id, 'a');
  assert.equal(findSubject(subs, '창의적 체험활동').id, 'c');
  assert.equal(findSubject(subs, '영어'), null);
});

test('수업 시간 목록', () => {
  const c = ctxOf();
  assert.deepEqual(slotsOn(c, '2026-10-29'), [{ period: 1, subject: '국어' }, { period: 2, subject: '영어' }, { period: 3, subject: '국어(자)' }]);
  assert.deepEqual(slotsOn(c, '2026-10-31'), []);
  assert.deepEqual(slotsOn(c, '2026-10-09'), []);
});

test('차시 배정: 기록 없음 — 오늘부터는 매시간 한 차시로 예상, 지난 빈 시간은 더하지 않음', () => {
  const c = ctxOf();
  assert.equal(lessonAt(c, KO, '2026-10-29', 1), 2);
  assert.equal(lessonAt(c, KO, '2026-10-29', 3), 3);
  assert.equal(lessonAt(c, KO, '2026-10-30', 2), 4);
  assert.equal(lessonAt(c, KO, '2026-10-27', 1), 2);
});

test('차시 배정: 일부 진행은 같은 차시, 못 함은 진도 없음', () => {
  assert.equal(lessonAt(ctxOf(mark({}, '2026-10-29', 1, 'part')), KO, '2026-10-29', 3), 2);
  assert.equal(lessonAt(ctxOf(mark({}, '2026-10-29', 1, 'part')), KO, '2026-10-30', 2), 3);
  const log = mark(mark({}, '2026-10-29', 1, 'done'), '2026-10-29', 3, 'skip', '국어(자)');
  assert.equal(lessonAt(ctxOf(log), KO, '2026-10-30', 2), 3);
  assert.equal(lessonAt(ctxOf(log), KO, '2026-10-29', 3), 3);
});

test('차시 배정: 순서 없이 체크해도 날짜·교시 순', () => {
  const log = {};
  mark(log, '2026-10-28', 2, 'done');
  mark(log, '2026-10-27', 1, 'done');
  const c = ctxOf(log);
  assert.equal(lessonAt(c, KO, '2026-10-27', 1), 2);
  assert.equal(lessonAt(c, KO, '2026-10-28', 2), 3);
  assert.equal(lessonAt(c, KO, '2026-10-29', 1), 4);
});

test('하루 보기: 교과·차시·체크, 진도표 없는 교과, 다 마친 진도표', () => {
  const v = dayView(ctxOf(mark({}, '2026-10-29', 1, 'done')), '2026-10-29');
  assert.equal(v.off, '');
  assert.deepEqual(v.slots.map(s => [s.period, s.subject, s.sub && s.sub.id, s.index, s.status]), [[1, '국어', 'ko', 2, 'done'], [2, '영어', null, null, null], [3, '국어(자)', 'ko', 3, null]]);
  assert.equal(v.slots[0].lesson.title, '차시 3');
  assert.equal(dayView(ctxOf(), '2026-10-31').off, '토요일');
  const fin = { ...KO, offset: 10 };
  const f = dayView(ctxOf({}, fin), '2026-10-29').slots[0];
  assert.equal(f.lesson, null); assert.equal(f.finished, true);
});

test('시수: 계획·실시·남은, 보정값이 0 아래면 0으로', () => {
  const log = {};
  mark(log, '2026-10-27', 1, 'done'); mark(log, '2026-10-28', 2, 'done'); mark(log, '2026-10-29', 1, 'part'); mark(log, '2026-10-29', 3, 'skip', '국어(자)');
  assert.deepEqual(hours(ctxOf(log), KO), { plan: 10, done: 5, left: 5 });
  assert.deepEqual(hours(ctxOf(log), { ...KO, offset: -1 }), { plan: 10, done: 3, left: 7 });
});

test('다음 차시 고치기는 기록을 두고 보정값만 맞춤', () => {
  const c = ctxOf();
  const s = setNext(c, KO, 5);
  assert.equal(s.offset, 4);
  assert.equal(lessonAt({ ...c, subjects: [s] }, s, '2026-10-29', 1), 4);
  const log = mark(mark({}, '2026-10-27', 1, 'done'), '2026-10-28', 2, 'done');
  const s2 = setNext(ctxOf(log), KO, 5);
  assert.equal(s2.offset, 2);
  assert.equal(lessonAt({ ...ctxOf(log), subjects: [s2] }, s2, '2026-10-29', 1), 4);
});

/* 월·수·금 1교시 국어. 주1 2줄, 주2 3줄, 주3 2줄 */
function wk(lessonsOf) {
  const c = empty(6); c[0][0] = '국어'; c[2][0] = '국어'; c[4][0] = '국어';
  const sub = { id: 'ko', name: '국어', start: '', offset: 0, total: null, lessons: lessonsOf };
  return (today, log = {}, s = sub) => ({ tt: { periods: 6, cells: c }, subjects: [s], log, breaks: [], today });
}
const dated = () => [
  ...[1, 2].map(i => ({ week: 1, period: '8.24~8.29', from: '2026-08-24', unit: '', title: 'a' + i, pages: '', memo: '' })),
  ...[1, 2, 3].map(i => ({ week: 2, period: '8.31~9.4', from: '2026-08-31', unit: '', title: 'b' + i, pages: '', memo: '' })),
  ...[1, 2].map(i => ({ week: 3, period: '9.7~9.11', from: '2026-09-07', unit: '', title: 'c' + i, pages: '', memo: '' }))
];

test('진도 차이: 진도표 기간 날짜 — 지난주까지 + 이번 주는 지나간 시간만큼', () => {
  const at = wk(dated());
  const c = at('2026-09-02');
  const p = progressOf(c, c.subjects[0]);
  assert.equal(p.mode, 'week'); assert.equal(p.started, true);
  assert.equal(p.expected, 3); assert.equal(p.actual, 0); assert.equal(p.diff, -3); assert.equal(p.next, 1); assert.equal(p.inTimetable, true);
  const c2 = at('2026-09-02', mark({}, '2026-09-02', 1, 'done'));
  const p2 = progressOf(c2, c2.subjects[0]);
  assert.equal(p2.expected, 4); assert.equal(p2.actual, 1); assert.equal(p2.diff, -3); assert.equal(p2.next, 2);
  assert.equal(p2.plan, 7); assert.equal(p2.done, 1); assert.equal(p2.left, 6);
});

test('진도 차이: 주 번호만 있으면 시작일이 든 주가 가장 작은 주', () => {
  const ls = dated().map(l => ({ ...l, period: '', from: '', week: l.week + 21 }));
  const at = wk(ls);
  const c = at('2026-09-02');
  const sub = { ...c.subjects[0], start: '2026-08-26' };
  const c2 = { ...c, subjects: [sub] };
  assert.equal(lessonMonday(c2, sub, 0), '2026-08-24'); assert.equal(lessonMonday(c2, sub, 6), '2026-09-07');
  assert.equal(progressOf(c2, sub).expected, 3);
});

test('진도 차이: 주가 없으면 시작일부터 시간표대로, 차시 수를 넘지 않음', () => {
  const ls = dated().map(l => ({ ...l, week: null, period: '', from: '' }));
  const at = wk(ls);
  const sub = { id: 'ko', name: '국어', start: '2026-08-31', offset: 0, total: null, lessons: ls };
  const p = progressOf(at('2026-09-02', {}, sub), sub);
  assert.equal(p.mode, 'slot'); assert.equal(p.expected, 1);
  assert.equal(progressOf(at('2026-09-02', mark({}, '2026-09-02', 1, 'part'), sub), sub).expected, 2);
  assert.equal(progressOf(at('2026-12-01', {}, sub), sub).expected, 7);
  const none = { ...sub, start: '' };
  assert.equal(progressOf(at('2026-09-02', {}, none), none).expected, 0);
});

test('진도 차이: 시작 전, 공휴일 주, 맞추기', () => {
  const at = wk(dated());
  const pre = progressOf(at('2026-08-14'), at('2026-08-14').subjects[0]);
  assert.equal(pre.started, false); assert.equal(pre.expected, 0); assert.equal(pre.diff, 0);
  // 추석 주(9/21~9/25): 진도표 1줄인데 지나간 시간은 월·수 2시간 → 1만 더함
  const ls = [{ week: 1, period: '9.21~9.26', from: '2026-09-21', unit: '', title: 'x', pages: '', memo: '' }, { week: 2, period: '9.28~10.3', from: '2026-09-28', unit: '', title: 'y', pages: '', memo: '' }];
  const ch = wk(ls)('2026-09-25');
  assert.equal(progressOf(ch, ch.subjects[0]).expected, 1);
  const c = at('2026-09-02', mark({}, '2026-08-31', 1, 'done'));
  const s = alignToPlan(c, c.subjects[0]);
  const p = progressOf({ ...c, subjects: [s] }, s);
  assert.equal(p.diff, 0); assert.equal(p.next, 4);
});

test('요약: 교과 순서, 시간표에 없는 교과', () => {
  const at = wk(dated());
  const c = at('2026-09-02');
  const c2 = { ...c, subjects: [c.subjects[0], { id: 'ma', name: '수학', start: '', offset: 0, total: null, lessons: L(3) }] };
  const s = summary(c2);
  assert.deepEqual(s.map(r => [r.sub.name, r.inTimetable]), [['국어', true], ['수학', false]]);
});

test('체크하지 않은 날: 처음 체크한 날부터, 수업일 n일 안, 진도표 없는 교과만 있는 날은 빼고', () => {
  const c = empty(6); c[0][0] = '국어'; c[1][0] = '국어'; c[2][0] = '국어'; c[3][0] = '국어'; c[4][0] = '영어';
  const log = mark({}, '2026-10-26', 1, 'done'); mark(log, '2026-10-29', 1, 'done');
  const ctx = { tt: { periods: 6, cells: c }, subjects: [{ ...KO }], log, breaks: [], today: '2026-10-30' };
  assert.deepEqual(missingDays(ctx), ['2026-10-27', '2026-10-28']);
  assert.deepEqual(missingDays({ ...ctx, log: {} }), []);
  assert.deepEqual(missingDays(ctx, 1), []);
});

test('기본 주와 주간 예상', () => {
  assert.equal(defaultWeek('2026-10-29'), '2026-11-02'); assert.equal(defaultWeek('2026-10-27'), '2026-10-26');
  assert.equal(defaultWeek('2026-11-01'), '2026-11-02'); assert.equal(defaultWeek('2026-10-26'), '2026-10-26');
  const w = weekView(ctxOf(), '2026-11-02');
  assert.equal(w.length, 5); assert.equal(w[0].date, '2026-11-02');
  assert.equal(w[1].slots[0].index, 5); // 이번 주 남은 목1·목3·금2 3시간만큼 밀림
});

test('AI 답 다듬기: 차시·시간표·알림', () => {
  const ls = normLessons([{ title: '분수', week: '3', period: '9.7~9.11', pages: 48 }, { week: 1 }, 'x', { title: ' 시 ', week: 2, period: '1.4~1.9' }], 2026);
  assert.equal(ls.length, 2);
  assert.deepEqual(ls[0], { week: null, period: '9.7~9.11', from: '2026-09-07', unit: '', title: '분수', pages: '48', memo: '' });
  assert.equal(ls[1].from, '2027-01-04'); assert.equal(ls[1].week, 2); assert.equal(ls[1].title, '시');
  assert.deepEqual(normLessons(null, 2026), []);
  const t = normTimetableAI({ cells: [['국어', '수 학'], [], [], [], []] });
  assert.equal(t.periods, 4); assert.deepEqual(t.cells[0], ['국어', '수학', '', '']);
  assert.equal(normTimetableAI({ periods: 6, cells: [[], [], [], [], []] }), null);
  assert.equal(normTimetableAI({}), null);
  const n = normNotes([{ prep: '색연필', safety: 1 }, null]);
  assert.equal(n.length, 5); assert.equal(n[0].prep, '색연필'); assert.equal(n[0].safety, ''); assert.equal(n[4].homework, '');
});

test('주간학습안내 문서', () => {
  assert.equal(weeklyTitle({ grade: 3, room: 2 }), '3학년 2반 주간학습안내');
  assert.equal(weeklyTitle({ grade: null, room: null }), '주간학습안내');
  const c = ctxOf();
  const days = weekView({ ...c, today: '2026-10-01' }, '2026-10-05');
  assert.equal(cellText(days[1].slots[0]), '국어 · ' + days[1].slots[0].lesson.title);
  assert.equal(cellText({ subject: '영어', lesson: null }), '영어');
  const w = { title: '3학년 2반 주간학습안내', cells: { '1-1': '국어 · 고친 글' }, notes: { 0: { events: '', prep: '', homework: '', notice: '', safety: '' }, 1: { events: '현장체험학습', prep: '도시락', homework: '', notice: '', safety: '' }, 2: {}, 3: {}, 4: {} } };
  const doc = weeklyDoc(days, w);
  assert.equal(doc.title, '3학년 2반 주간학습안내');
  const [t1, t2] = doc.blocks.filter(b => b.type === 'table');
  assert.equal(t1.rows[0][0], '교시'); assert.equal(t1.rows[0][1], '월 10/5');
  assert.equal(t1.rows[1][0], '1교시'); assert.equal(t1.rows[1][2], '국어 · 고친 글');
  assert.equal(t1.rows[1][1], '공휴일(대체공휴일(개천절))');
  assert.deepEqual(t2.rows.map(r => r[0]), ['구분', '학사일정', '준비물', '과제', '안내장', '안전']);
  assert.equal(t2.rows[1][2], '현장체험학습'); assert.equal(t2.rows[2][2], '도시락');
});
