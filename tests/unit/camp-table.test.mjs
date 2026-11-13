// 기초학력 캠프 › 계획서 「지도 계획」 표 그대로 수업 일정 + 요일마다 다른 시간 + 차시 수로 날짜 만들기 (2026-11-13 선생님 요청)
// 「줄글이 아니라 표에 있는 내용으로」: 차시·과목·날짜·학습 내용 표 → 그 줄 그대로(날짜·교과·지도 내용), 시간은 「지도시간」 줄의 요일별 시간.
// 날짜가 「/」로 빈 표는 기간·요일에서 차시 수만큼 날짜를 셈. 글은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCamp } from '../../web/menus/class/camp-model.js';
import { buildSessions } from '../../web/menus/class/camp-ai.js';
import { readPlan, planSchedule, planTable, tableSessions, weekTimes } from '../../web/menus/class/camp-plan.js';
import { countDates, sessionsByCount } from '../../web/menus/class/camp-sched.js';

const ctx = { year: 2026, today: '2026-11-13' };
const HEAD = `2026 기초학력 중점학급 운영 계획
3학년 2반
Ⅱ | 세부 운영계획
1. 운영시기: 2026. 9. 1.(화) ~ 2026. 12. 31.(목)
2. 대상: 3-2 학생 중 학습지원을 희망하는 학생
3. 장소: 3-2 교실
▣학기 중 운영
수강대상 | 3-2 학습지원학생 1명 | 지도교사 | 3-2 담임: 한가람
지도기간 | 2026년 9월 1일 ~ 12월 31일 | 과목 | 국어, 수학
지도시간 | 매주 수요일 13:40~14:20, 목요일 14:30~15:10 (학생이 가능한 시간을 활용하여 지도함)
지도목표 | 국어, 수학 기초학력 향상`;
const TABLE = `지     도     계     획
차시 | 과목 | 날짜 | 학   습   내   용 | 비고
1 | 국어 | 9/2(수) | 받침이 있는 낱말 읽고 쓰기 |
2 | 수학 | 9/3(목) | 세 자리 수의 덧셈과 뺄셈 |
3 | 국어 | 9/9(수) | 문장 부호를 살펴 띄어 읽기 |
4 | 수학 | 9/10(목) | 곱셈구구로 나눗셈 몫 구하기 |
누계 | 4차시`;
const FORM = `<양식1-수업확인서, 학생출석부>
결 재 | 계(담당자) | 교 감 | 교 장
지도교사 :  한 가 람    (인)
순 | 날 짜 | 시 간(40분) | 교 과 | 지 도 내 용 | 확인(서명)
1 | / | ~ | 국어 | 받침이 있는 낱말 읽고 쓰기 |
2 | / | ~ | 수학 | 세 자리 수의 덧셈과 뺄셈 |
3 | / | ~ | 국어 | 문장 부호를 살펴 띄어 읽기 |
계 | 지도 시간: 총 ( 3 )시간
순 | 학년-반 | 날 짜 이 름 | / | / | / | 계
1 | 3-2 |  |  |  |  |`;

test('「지도시간」 줄: 요일마다 다른 시간 → { 요일: { start, end } }, 요일 없는 시간은 빼고', () => {
  assert.deepEqual(weekTimes('지도시간 | 매주 수요일 13:40~14:20, 목요일 14:30~15:10 (학생이 가능한 시간)'),
    { 3: { start: '13:40', end: '14:20' }, 4: { start: '14:30', end: '15:10' } });
  assert.deepEqual(weekTimes('매주 화·목 15:00~15:40'), { 2: { start: '15:00', end: '15:40' }, 4: { start: '15:00', end: '15:40' } });
  assert.deepEqual(weekTimes('시간: 09:00 ~ 12:40'), {});
});

test('표 꼴 계획서(「라벨 | 값」): 교과·지도교사(「담임:」 뒤)·대상(3-2 → 3학년)·요일(지도시간 줄)', () => {
  const p = readPlan(`${HEAD}\n${TABLE}`, ctx);
  assert.deepEqual(p.subjects, ['국어', '수학'], '표의 「과목 | 국어, 수학」 — 글에 나온 「쓰기·읽기」가 아님');
  assert.equal(p.teacher, '한가람');
  assert.equal(p.target, '3학년');
  assert.deepEqual(p.range, { from: '2026-09-01', to: '2026-12-31' });
  assert.deepEqual(p.weekdays, [3, 4], '지도시간 줄의 수·목');
  assert.deepEqual(p.dayTimes, { 3: { start: '13:40', end: '14:20' }, 4: { start: '14:30', end: '15:10' } });
});

test('지도 계획 표: 날짜가 적힌 표를 고름(날짜가 「/」인 수업 확인서 양식보다 앞), 줄마다 차시·날짜·교과·내용, 「누계」에서 끝', () => {
  const p = readPlan(`${HEAD}\n${TABLE}\n${FORM}`, ctx);
  const t = planTable(`${HEAD}\n${TABLE}\n${FORM}`, { ...ctx, range: p.range });
  assert.equal(t.kind, 'rows');
  assert.equal(t.dated, 4);
  assert.deepEqual(t.rows.map(r => [r.no, r.date, r.subject, r.content]), [
    [1, '2026-09-02', '국어', '받침이 있는 낱말 읽고 쓰기'], [2, '2026-09-03', '수학', '세 자리 수의 덧셈과 뺄셈'],
    [3, '2026-09-09', '국어', '문장 부호를 살펴 띄어 읽기'], [4, '2026-09-10', '수학', '곱셈구구로 나눗셈 몫 구하기']]);
});

test('표 그대로 수업 줄: 표의 날짜·교과·지도 내용, 시간은 그 요일의 지도시간(수 13:40·목 14:30)', () => {
  const text = `${HEAD}\n${TABLE}\n${FORM}`;
  const p = readPlan(text, ctx), c = newCamp({ subjects: ['국어', '수학'] });
  const r = tableSessions(planTable(text, { ...ctx, range: p.range }), p, c);
  assert.equal(r.undated, 0);
  assert.deepEqual(r.sessions.map(s => [s.date, s.start, s.end, s.subject, s.content]), [
    ['2026-09-02', '13:40', '14:20', '국어', '받침이 있는 낱말 읽고 쓰기'], ['2026-09-03', '14:30', '15:10', '수학', '세 자리 수의 덧셈과 뺄셈'],
    ['2026-09-09', '13:40', '14:20', '국어', '문장 부호를 살펴 띄어 읽기'], ['2026-09-10', '14:30', '15:10', '수학', '곱셈구구로 나눗셈 몫 구하기']]);
});

test('날짜가 빈 표(「/」)만 있으면 기간·요일에서 차시 수만큼 날짜를 셈(내용은 표 차례), 기간이 없으면 날짜 없이 내용만', () => {
  const text = `${HEAD}\n${FORM}`;
  const p = readPlan(text, ctx), c = newCamp();
  const t = planTable(text, { ...ctx, range: p.range });
  assert.equal(t.kind, 'rows'); assert.equal(t.dated, 0); assert.equal(t.rows.length, 3);
  const r = tableSessions(t, p, c);
  assert.deepEqual(r.sessions.map(s => [s.date, s.start, s.subject, s.content]), [
    ['2026-09-02', '13:40', '국어', '받침이 있는 낱말 읽고 쓰기'], ['2026-09-03', '14:30', '수학', '세 자리 수의 덧셈과 뺄셈'], ['2026-09-09', '13:40', '국어', '문장 부호를 살펴 띄어 읽기']]);
  assert.equal(r.undated, 0);
  const bare = '수업 확인서\n' + FORM.split('\n').slice(3, 7).join('\n');
  const r2 = tableSessions(planTable(bare, ctx), readPlan(bare, ctx), c);
  assert.equal(r2.sessions.length, 3); assert.equal(r2.undated, 3);
  assert.ok(r2.sessions.every(s => !s.date && s.content), '날짜는 비우고 내용은 넣음');
});

test('날마다 캠프: 같은 날 두 줄은 한 줄로(교과·내용 합침)', () => {
  const text = `${HEAD}\n차시 | 과목 | 날짜 | 학습 내용\n1 | 국어 | 9/2(수) | 낱말 읽기\n2 | 수학 | 9/2(수) | 덧셈`;
  const p = readPlan(text, ctx), d = newCamp({ unit: 'day' });
  const r = tableSessions(planTable(text, { ...ctx, range: p.range }), p, d);
  assert.deepEqual(r.sessions.map(s => [s.date, s.subject, s.content]), [['2026-09-02', '국어·수학', '국어: 낱말 읽기 / 수학: 덧셈']]);
});

test('「차시 | 국어 | 수학」 표(교과마다 차시별 내용)는 지도 내용으로(AI 없이도 채움)', () => {
  const text = '겨울 캠프 계획\n기간: 2027. 1. 8. ~ 1. 11.\n시간: 09:00~10:30 (하루 2교시, 1교시 40분, 쉬는 시간 10분)\n교과: 국어, 수학\n차시 | 국어 | 수학\n1 | 받침 없는 낱말 | 두 자리 수 덧셈\n2 | 받침 있는 낱말 | 두 자리 수 뺄셈';
  const t = planTable(text, ctx);
  assert.equal(t.kind, 'lessons');
  assert.deepEqual(t.lessons, { 국어: ['받침 없는 낱말', '받침 있는 낱말'], 수학: ['두 자리 수 덧셈', '두 자리 수 뺄셈'] });
  const p = readPlan(text, ctx), c = newCamp({ subjects: ['국어', '수학'] });
  const s = buildSessions(planSchedule(p, c, t.lessons), c).sessions;
  assert.deepEqual(s.map(x => [x.date, x.subject, x.content]), [
    ['2027-01-08', '국어', '받침 없는 낱말'], ['2027-01-08', '수학', '두 자리 수 덧셈'], ['2027-01-11', '국어', '받침 있는 낱말'], ['2027-01-11', '수학', '두 자리 수 뺄셈']]);
});

test('표가 없거나 출석부 표(날짜·이름만)뿐이면 null', () => {
  assert.equal(planTable('캠프 계획\n기간: 1/8~1/9', ctx), null);
  assert.equal(planTable('순 | 학년-반 | 날 짜 이 름 | / | / | 계\n1 | 3-2 |  |  |  |', ctx), null);
});

test('차시 수로 날짜: 시작 날부터 고른 요일(공휴일 빼고) 차시 수만큼, 끝 날이 있으면 거기까지', () => {
  assert.deepEqual(countDates({ from: '2026-09-21', weekdays: [3, 4], n: 4 }), ['2026-09-23', '2026-09-30', '2026-10-01', '2026-10-07'], '9/24(목) 추석은 뺌');
  assert.deepEqual(countDates({ from: '2026-09-01', to: '2026-09-09', weekdays: [3, 4], n: 10 }), ['2026-09-02', '2026-09-03', '2026-09-09']);
  assert.deepEqual(countDates({ from: '2026-09-01', weekdays: [], n: 3 }), []);
  assert.deepEqual(countDates({ from: '2026-09-02', weekdays: [3], n: 4, perDay: 2 }), ['2026-09-02', '2026-09-09'], '하루 2차시 → 2일');
});

test('차시 수로 수업 줄: 요일마다 시간, 하루 여러 차시는 쉬는 시간을 두고 이어서, 교과는 차시마다 돌림, 들어가지 못한 차시 수', () => {
  const days = { 3: { start: '13:40', end: '14:20' }, 4: { start: '14:30', end: '15:10' } };
  const a = sessionsByCount({ from: '2026-09-01', days, n: 3, subjects: ['국어', '수학'] });
  assert.equal(a.short, 0);
  assert.deepEqual(a.specs, [
    { date: '2026-09-02', start: '13:40', end: '14:20', subject: '국어' }, { date: '2026-09-03', start: '14:30', end: '15:10', subject: '수학' },
    { date: '2026-09-09', start: '13:40', end: '14:20', subject: '국어' }]);
  const b = sessionsByCount({ from: '2026-09-02', days: { 3: { start: '09:00', end: '09:40' } }, n: 3, perDay: 2, rest: 10, subjects: ['수학'] });
  assert.deepEqual(b.specs.map(s => [s.date, s.start, s.end]), [['2026-09-02', '09:00', '09:40'], ['2026-09-02', '09:50', '10:30'], ['2026-09-09', '09:00', '09:40']]);
  const c = sessionsByCount({ from: '2026-09-01', to: '2026-09-03', days, n: 5 });
  assert.equal(c.specs.length, 2); assert.equal(c.short, 3);
  assert.equal(sessionsByCount({ from: '2026-09-01', days: { 3: { start: '14:20', end: '13:40' } }, n: 2 }).specs.length, 0, '끝이 시작보다 앞이면 없음');
});

test('한 줄에 「라벨: 값 | 라벨: 값」이 이어져도 값은 칸 경계까지', () => {
  const p = readPlan('기초학력 캠프 계획\n지도교사: 한가람 | 교과: 국어, 수학\n기간: 2027. 1. 8. ~ 1. 9.', ctx);
  assert.equal(p.teacher, '한가람');
  assert.deepEqual(p.subjects, ['국어', '수학']);
});
