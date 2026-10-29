// 학급 모델: 저장·망가진 값, 교과 이름 맞추기, 수업 없는 날, 차시 배정, 시수, 진도 차이, 주간 예상
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import {
  getInfo, setInfo, getTimetable, setTimetable, listSubjects, saveSubject, removeSubject, getLog, setMark, getWeekly, saveWeekly,
  mondayOf, fmtDay, fmtShort, noClass, sameSubject, findSubject, slotsOn, lessonAt, dayView, hours, setNext
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
