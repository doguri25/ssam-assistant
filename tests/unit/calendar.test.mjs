// 날짜·공휴일·학사일정: 겹침 이유와 가까운 가능한 날짜 (PRD Y-6)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { HOLIDAYS, isDate, addDays, weekday, listEvents, setEvents, removeEvents, dayIssues, suggestDates } from '../../web/core/calendar.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
store.useStorage(mem());

test('날짜 도구', () => {
  assert.equal(isDate('2027-02-29'), false); assert.equal(isDate('2028-02-29'), true); assert.equal(isDate('2027-13-01'), false); assert.equal(isDate(''), false);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01'); assert.equal(addDays('2027-03-01', -1), '2027-02-28');
  assert.equal(weekday('2026-11-08'), 0);
});

test('공휴일 표: 2026·2027 설날·추석·대체공휴일', () => {
  for (const d of ['2026-02-16', '2026-02-17', '2026-02-18', '2026-03-02', '2026-05-25', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-05',
    '2027-02-06', '2027-02-09', '2027-05-13', '2027-08-16', '2027-09-15', '2027-10-04', '2027-10-11', '2027-12-27']) assert.ok(HOLIDAYS[d], d + ' 없음');
  assert.equal(HOLIDAYS['2026-07-17'], undefined);
});

test('겹침 이유', () => {
  assert.deepEqual(dayIssues('2026-10-03', {}), ['토요일', '공휴일(개천절)']);
  assert.deepEqual(dayIssues('2026-10-05', {}), ['공휴일(대체공휴일(개천절))']);
  assert.deepEqual(dayIssues('2026-10-06', {}), []);
  const breaks = [{ from: '2027-07-23', to: '2027-08-22', label: '여름방학' }];
  assert.deepEqual(dayIssues('2027-08-16', { breaks }), ['공휴일(대체공휴일(광복절))', '여름방학']);
  assert.deepEqual(dayIssues('2027-07-23', { breaks: [{ from: '2027-07-23', to: '2027-08-22', label: '' }] }), ['방학·재량휴업일']);
  assert.deepEqual(dayIssues('잘못', {}), []);
});

test('학사일정과 겹침, 같은 출처는 빼고 봄', () => {
  setEvents('event:1', [{ date: '2026-11-20', title: '학교 축제' }, { date: '없는 날', title: 'x' }]);
  assert.equal(listEvents().length, 1);
  assert.deepEqual(dayIssues('2026-11-20', { events: listEvents() }), ['「학교 축제」 일정과 겹쳐요']);
  assert.deepEqual(dayIssues('2026-11-20', { events: listEvents(), source: 'event:1' }), []);
  setEvents('year:2', [{ date: '2026-11-20', title: '독서 행사' }]);
  setEvents('event:1', [{ date: '2026-11-27', title: '학교 축제' }]);
  assert.deepEqual(listEvents().map(e => e.source + e.date), ['year:22026-11-20', 'event:12026-11-27']);
  removeEvents('year:2'); removeEvents('event:1');
  assert.equal(listEvents().length, 0);
});

test('가까운 가능한 날짜 2개 (+1, −1, +2, −2 … 찾은 순서)', () => {
  assert.deepEqual(suggestDates('2026-09-25', {}), ['2026-09-23', '2026-09-28']);
  setEvents('event:1', [{ date: '2026-11-20', title: '학교 축제' }]);
  assert.deepEqual(suggestDates('2026-11-20', { events: listEvents() }), ['2026-11-19', '2026-11-18']);
  assert.deepEqual(suggestDates('2026-10-03', {}), ['2026-10-02', '2026-10-01']);
  assert.deepEqual(suggestDates('잘못', {}), []);
  removeEvents('event:1');
});

test('망가진 학사일정 저장 값', () => {
  store.set('calendar', '망가짐'); assert.deepEqual(listEvents(), []);
  store.set('calendar', [null, { date: 'x', title: 1 }, { date: '2026-12-01', title: '학예회', source: 's' }]);
  assert.deepEqual(listEvents(), [{ date: '2026-12-01', title: '학예회', source: 's' }]);
});

test('2028년 공휴일: 2027학년도 1·2월(설날)과 2028학년도 계획에 필요', () => {
  const want = { '2028-01-01': '신정', '2028-01-26': '설날', '2028-01-27': '설날', '2028-01-28': '설날', '2028-03-01': '삼일절', '2028-04-12': '국회의원선거', '2028-05-02': '부처님오신날', '2028-05-05': '어린이날', '2028-06-06': '현충일', '2028-08-15': '광복절', '2028-10-02': '추석', '2028-10-03': '추석·개천절', '2028-10-04': '추석', '2028-10-05': '대체공휴일(개천절)', '2028-10-09': '한글날', '2028-12-25': '성탄절' };
  for (const [d, name] of Object.entries(want)) assert.equal(HOLIDAYS[d], name, d);
  assert.ok(dayIssues('2028-01-27').some(x => x.includes('설날')), '설날을 알리지 않음');
});
