// 학급 › 기초학력 캠프 모델(스펙 2026-11-11): 저장(학년도 키 camp)·망가진 값, 출석 수·출석률, 수업 시간, 그날 수업,
// 학생A 바꾸기(이름이 AI 글에 남지 않음), 날짜 펼치기(주말·공휴일 빼기), 교시 묶음, 출석 칸 돌리기·모두 출석
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { isYearKey } from '../../web/core/years.js';
import {
  KEY, newCamp, normCamp, listCamps, getCamp, saveCamp, deleteCamp, currentCampId, setCurrentCamp,
  attCount, attStats, hoursTotal, sessionsOn, campDates, sortSessions, aliasMap, aliasOf, toAlias,
  expandDates, periodSlots, nextMark, setMark, markAll, fmtDate, fmtTime, newSession, newStudent
} from '../../web/menus/class/camp-model.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const NAMES = ['김하늘', '이바다'];
const TEACHER = '한가람';
/* 학생 2명, 1/8(금) 2교시 · 1/11(월) 1교시 */
function sample() {
  return newCamp({
    name: '교과캠프', teacher: TEACHER, target: '3학년', unit: 'period', subjects: ['국어', '수학'],
    students: [{ id: 'a', grade: 3, cls: 2, no: 5, name: NAMES[0] }, { id: 'b', grade: 3, cls: 2, no: 11, name: NAMES[1] }],
    sessions: [
      { id: 's3', date: '2027-01-11', start: '09:00', end: '09:40', subject: '국어', content: '받아쓰기' },
      { id: 's2', date: '2027-01-08', start: '09:45', end: '10:25', subject: '수학', content: '두 자리 덧셈' },
      { id: 's1', date: '2027-01-08', start: '09:00', end: '09:40', subject: '국어', content: '낱말 읽기' }
    ],
    att: { s1: { a: 'O', b: 'X' }, s2: { a: 'O', b: 'O' }, gone: { a: 'O' } }
  });
}

test('camp는 학년도 키(공통 키가 아님) — 백업·학년도 옮기기를 따라감', () => {
  assert.equal(KEY, 'camp');
  assert.equal(isYearKey(KEY), true);
});

test('새 캠프 기본값: 출석 단위 교시마다, 결재란 계(담당자)·교감·교장, 빈 칸들', () => {
  const c = newCamp();
  assert.match(c.id, /^cp/);
  assert.equal(c.unit, 'period');
  assert.deepEqual(c.approval, ['계(담당자)', '교감', '교장']);
  assert.deepEqual(c.students, []); assert.deepEqual(c.sessions, []);
  assert.deepEqual(c.att, {}); assert.deepEqual(c.memo, {}); assert.deepEqual(c.obs, {}); assert.deepEqual(c.obsEdited, {});
  assert.deepEqual(c.report, { kind: 'select', prompt: '', title: '', sections: [] });
  assert.deepEqual(c.forms, { confirm: '', attend: '', observe: '', report: '' });
});

test('망가진 값은 고치거나 버림: 날짜·시간·출석 표시·학생 칸', () => {
  assert.equal(normCamp(null), null);
  assert.equal(normCamp({ name: 'x' }), null, 'id 없음');
  const c = normCamp({
    id: 'cp1', unit: 'week', approval: 'x', subjects: ['국어', '', 3, ' 수학 '],
    students: [{ id: 's', grade: '3', cls: 2, no: 'x', name: ' 김하늘 ' }, null, { name: '이름만' }],
    sessions: [{ id: 'q', date: '2027-13-01', start: '9:00', end: 'x', subject: 3, content: null }, { date: '2027-01-08', start: '09:00', end: '09:40' }, 'bad'],
    att: { q: { s: 'O', t: 'Z' }, 'bad': 'x' }, memo: { s: 3 }, obs: { s: '좋음' }, obsEdited: { s: 'yes' },
    report: { kind: 'nope', sections: [{ head: '목적', text: '글' }, { head: '' }] }, forms: { confirm: 'fm1', x: 'y' }
  });
  assert.equal(c.unit, 'period');
  assert.deepEqual(c.approval, ['계(담당자)', '교감', '교장']);
  assert.deepEqual(c.subjects, ['국어', '수학']);
  assert.equal(c.students.length, 2);
  assert.deepEqual({ ...c.students[0] }, { id: 's', grade: 3, cls: 2, no: null, name: '김하늘' });
  assert.ok(c.students[1].id, '없는 id는 새로');
  assert.equal(c.sessions.length, 2);
  assert.equal(c.sessions[0].date, '', '잘못된 날짜는 빈칸');
  assert.equal(c.sessions[0].start, '09:00', '9:00 → 09:00');
  assert.equal(c.sessions[0].end, '');
  assert.ok(c.sessions[1].id);
  assert.deepEqual(c.att, { q: { s: 'O' } });
  assert.deepEqual(c.memo, {}); assert.deepEqual(c.obs, { s: '좋음' }); assert.deepEqual(c.obsEdited, { s: true });
  assert.equal(c.report.kind, 'select');
  assert.deepEqual(c.report.sections, [{ head: '목적', text: '글' }]);
  assert.deepEqual(c.forms, { confirm: 'fm1', attend: '', observe: '', report: '' });
});

test('저장·목록·지우기·보고 있는 캠프 (키 camp 하나에 이 학년도 캠프 모두)', () => {
  store.useStorage(mem());
  assert.deepEqual(listCamps(), []);
  assert.equal(currentCampId(), '');
  const a = saveCamp(sample());
  assert.ok(a && a.updatedAt > 0);
  const b = saveCamp(newCamp({ name: '수학 캠프' }));
  assert.deepEqual(listCamps().map(c => c.name), ['수학 캠프', '교과캠프'], '새 캠프가 앞');
  assert.equal(getCamp(a.id).students[0].name, NAMES[0]);
  assert.equal(getCamp('nope'), null);
  saveCamp({ ...getCamp(a.id), name: '겨울 교과캠프' });
  assert.equal(listCamps().length, 2, '같은 id는 바꿈');
  assert.equal(getCamp(a.id).name, '겨울 교과캠프');
  setCurrentCamp(b.id); assert.equal(currentCampId(), b.id);
  assert.ok(store.get('camp').camps.length === 2, '키 camp');
  assert.equal(deleteCamp(b.id), true);
  assert.equal(currentCampId(), '', '지운 캠프를 보고 있었으면 비움');
  assert.deepEqual(listCamps().map(c => c.id), [a.id]);
  store.set('camp', 'x'); assert.deepEqual(listCamps(), []);
  store.set('camp', { camps: [null, { id: 'cpx', name: 'ok' }, 3] }); assert.deepEqual(listCamps().map(c => c.id), ['cpx']);
});

test('출석 수·출석률: 있는 수업만, 표시한 칸으로 출석률', () => {
  const c = sample();
  assert.equal(attCount(c, 'a'), 2, '지운 수업(gone)의 표시는 세지 않음');
  assert.equal(attCount(c, 'b'), 1);
  assert.equal(attCount(c, 'none'), 0);
  assert.deepEqual(attStats(c, 'a'), { present: 2, absent: 0, marked: 2, total: 3, rate: 100 });
  assert.deepEqual(attStats(c, 'b'), { present: 1, absent: 1, marked: 2, total: 3, rate: 50 });
  assert.equal(attStats(newCamp(), 'a').rate, null, '표시한 칸이 없으면 출석률 없음');
});

test('수업 시간 = 수업 줄 수, 그날 수업은 시작 시각 차례, 수업 날 목록', () => {
  const c = sample();
  assert.equal(hoursTotal(c), 3);
  assert.equal(hoursTotal(newCamp()), 0);
  assert.deepEqual(sessionsOn(c, '2027-01-08').map(s => s.id), ['s1', 's2']);
  assert.deepEqual(sessionsOn(c, '2027-01-09'), []);
  assert.deepEqual(campDates(c), ['2027-01-08', '2027-01-11']);
  assert.deepEqual(sortSessions(c.sessions).map(s => s.id), ['s1', 's2', 's3']);
  assert.deepEqual(c.sessions.map(s => s.id), ['s3', 's2', 's1'], '원래 배열은 그대로');
});

test('학생A·학생B: 캠프 안 차례, 26명 넘으면 번호', () => {
  const c = sample();
  assert.deepEqual(aliasMap(c), { a: '학생A', b: '학생B' });
  assert.equal(aliasOf(0), '학생A'); assert.equal(aliasOf(25), '학생Z'); assert.equal(aliasOf(26), '학생27');
});

test('toAlias: 학생 이름(성 뺀 이름 포함)·지도교사 이름을 바꾸고, 그 밖의 이름 모양은 가림', () => {
  const c = sample();
  const t = toAlias('김하늘이 받아쓰기를 잘함. 이바다는 하늘이와 짝. 바다가 조금 늦음. 한가람 선생님이 칭찬. 친구 박지훈과 다툼', c);
  for (const n of [...NAMES, TEACHER, '박지훈']) assert.ok(!t.includes(n), `${n} 남음: ${t}`);
  assert.ok(!/하늘이와|바다가/.test(t), `성 뺀 이름 남음: ${t}`);
  assert.ok(t.includes('학생A') && t.includes('학생B') && t.includes('지도교사'), t);
  assert.ok(t.includes('받아쓰기를 잘함'), '내용은 그대로: ' + t);
  assert.equal(toAlias('하늘이가 잘함. 김하늘이 발표함. 이바다은 늦음', c), '학생A가 잘함. 학생A가 발표함. 학생B는 늦음', '조사를 학생A에 맞춤');
  assert.equal(toAlias('', c), '');
  assert.equal(toAlias('하늘을 보고 그림을 그림', newCamp()), '하늘을 보고 그림을 그림', '학생이 없으면 낱말은 그대로');
});

test('날짜 펼치기: 기간 안 요일만, 주말·공휴일은 뺌', () => {
  // 2027-01-08(금) ~ 01-23(토) 평일 → 11일
  const d = expandDates('2027-01-08', '2027-01-23');
  assert.equal(d.length, 11);
  assert.equal(d[0], '2027-01-08'); assert.equal(d[1], '2027-01-11'); assert.equal(d.at(-1), '2027-01-22');
  // 성탄절(12/25)·신정(1/1)
  const h = expandDates('2026-12-21', '2027-01-05');
  assert.ok(!h.includes('2026-12-25') && !h.includes('2027-01-01'), '공휴일');
  assert.equal(h.length, 10);
  assert.equal(expandDates('2026-12-21', '2027-01-05', { skipHolidays: false }).length, 12);
  assert.deepEqual(expandDates('2027-01-04', '2027-01-15', { weekdays: [1, 3, 5] }), ['2027-01-04', '2027-01-06', '2027-01-08', '2027-01-11', '2027-01-13', '2027-01-15']);
  assert.deepEqual(expandDates('2027-01-08', '2027-01-08'), ['2027-01-08']);
  assert.deepEqual(expandDates('2027-01-09', '2027-01-08'), [], '거꾸로');
  assert.deepEqual(expandDates('x', '2027-01-08'), []);
  assert.ok(expandDates('2026-01-01', '2028-12-31').length <= 400, '너무 긴 기간은 자름');
});

test('교시 묶음: 시작·교시 수·분·쉬는 시간', () => {
  assert.deepEqual(periodSlots('09:00', 5, 40, 5), [
    { start: '09:00', end: '09:40' }, { start: '09:45', end: '10:25' }, { start: '10:30', end: '11:10' }, { start: '11:15', end: '11:55' }, { start: '12:00', end: '12:40' }]);
  assert.deepEqual(periodSlots('13:30', 2, 40, 10), [{ start: '13:30', end: '14:10' }, { start: '14:20', end: '15:00' }]);
  assert.deepEqual(periodSlots('x', 2, 40, 10), [], '시작 시각이 이상하면 없음');
  assert.equal(periodSlots('23:30', 3, 40, 10).length, 0, '자정을 넘기면 없음');
  assert.equal(periodSlots('09:00', 99, 40, 5).length, 10, '10교시까지');
});

test('출석 칸: 누를 때마다 ○ → / → 빈칸, 모두 출석, 원래 캠프는 그대로', () => {
  assert.equal(nextMark(''), 'O'); assert.equal(nextMark('O'), 'X'); assert.equal(nextMark('X'), '');
  const c = sample();
  const c1 = setMark(c, 's3', 'a', 'O');
  assert.equal(c1.att.s3.a, 'O'); assert.equal(c.att.s3, undefined, '순수 함수');
  const c2 = setMark(c1, 's3', 'a', '');
  assert.equal(c2.att.s3, undefined, '빈칸이면 지움');
  const c3 = markAll(c, '2027-01-08');
  assert.deepEqual(c3.att.s1, { a: 'O', b: 'O' }); assert.deepEqual(c3.att.s2, { a: 'O', b: 'O' });
  assert.equal(c3.att.s3, undefined, '다른 날은 그대로');
});

test('날짜·시간 글: 「1. 8.(금)」「09:00~09:40」', () => {
  assert.equal(fmtDate('2027-01-08'), '1. 8.(금)');
  assert.equal(fmtDate(''), '');
  assert.equal(fmtTime({ start: '09:00', end: '09:40' }), '09:00~09:40');
  assert.equal(fmtTime({ start: '09:00', end: '' }), '09:00');
  assert.equal(fmtTime({}), '');
});

test('새 수업 줄·새 학생: id가 있고 칸은 비어 있음', () => {
  const s = newSession({ date: '2027-01-08' });
  assert.ok(s.id && s.date === '2027-01-08' && s.start === '' && s.subject === '');
  const st = newStudent({ name: '김하늘' });
  assert.ok(st.id && st.name === '김하늘' && st.grade === null);
});
