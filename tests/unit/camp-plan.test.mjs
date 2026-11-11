// 기초학력 캠프 › 계획 파일 넣기: 운영 계획서 글 → 캠프 정보(이름·대상·교과·지도교사)·수업 일정(기간·요일·시간·교시).
// AI가 있으면 계획서 글(이름·연락처 가림)을 일정 AI에, 없으면 규칙으로 날짜 × 교시 줄(지도 내용은 빈칸). 글은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCamp } from '../../web/menus/class/camp-model.js';
import { normSchedule, buildSessions } from '../../web/menus/class/camp-ai.js';
import { readPlan, planSchedule, planPrompt, planDraft, fillCampInfo } from '../../web/menus/class/camp-plan.js';

const PLAN = `2027학년도 겨울방학 기초학력 교과캠프 운영 계획
1. 목적
 가. 기초학력 향상을 위한 맞춤형 지도
2. 추진 일정
 가. 계획 수립: 2026. 12. 1. ~ 12. 5.
3. 운영 개요
 가. 기간: 2027. 1. 8.(금) ~ 1. 22.(금) (평일)
 나. 시간: 09:00 ~ 12:40 (하루 5교시, 1교시 40분, 쉬는 시간 5분)
 다. 대상: 3학년 학습지원 대상 학생 2명
 라. 교과: 국어, 수학
 마. 장소: 3학년 2반 교실
 바. 지도 교사: 한가람 (010-1234-5678)
4. 세부 지도 계획
차시 | 국어 | 수학
1 | 받침 없는 낱말 읽기 | 두 자리 수 덧셈
2 | 받침 있는 낱말 읽기 | 두 자리 수 뺄셈`;
const ctx = { year: 2026, today: '2026-11-11' };

test('운영 계획서 → 캠프 이름·대상·교과·지도교사, 기간은 「기간」 줄(앞의 추진 일정이 아님)·평일, 시간·교시·분·쉬는 시간', () => {
  const p = readPlan(PLAN, ctx);
  assert.equal(p.name, '겨울방학 기초학력 교과캠프');
  assert.equal(p.target, '3학년');
  assert.deepEqual(p.subjects, ['국어', '수학']);
  assert.equal(p.teacher, '한가람');
  assert.deepEqual(p.range, { from: '2027-01-08', to: '2027-01-22' });
  assert.deepEqual(p.weekdays, [1, 2, 3, 4, 5]);
  assert.deepEqual([p.start, p.end, p.periods, p.minutes, p.rest], ['09:00', '12:40', 5, 40, 5]);
});

test('AI 없이: 계획서 기간 × 교시로 수업 줄(교과는 차례로 돌림, 지도 내용은 빈칸), 날마다 캠프는 하루 한 줄', () => {
  const p = readPlan(PLAN, ctx);
  const c = newCamp({ subjects: ['국어', '수학'] });
  const { sessions, empty } = buildSessions(planSchedule(p, c), c);
  assert.equal(sessions.length, 11 * 5, '1/8 + 1/11~15 + 1/18~22 = 11일 × 5교시');
  assert.deepEqual(sessions.slice(0, 5).map(s => [s.date, s.start, s.end, s.subject]), [
    ['2027-01-08', '09:00', '09:40', '국어'], ['2027-01-08', '09:45', '10:25', '수학'], ['2027-01-08', '10:30', '11:10', '국어'],
    ['2027-01-08', '11:15', '11:55', '수학'], ['2027-01-08', '12:00', '12:40', '국어']]);
  assert.equal(empty, 55);
  const d = newCamp({ unit: 'day', subjects: ['국어', '수학'] });
  const day = buildSessions(planSchedule(p, d), d).sessions;
  assert.equal(day.length, 11);
  assert.deepEqual([day[0].start, day[0].end, day[0].subject], ['09:00', '12:40', '국어·수학']);
});

test('교시 수가 없으면 시작~끝 한 줄, 기간이 없으면 일정 없음', () => {
  const p = readPlan('기초학력 캠프 계획\n기간: 1/8~1/9\n시간: 13:00~15:00\n교과: 수학', ctx);
  const c = newCamp({ subjects: ['수학'] });
  const s = buildSessions(planSchedule(p, c), c).sessions;
  assert.deepEqual(s.map(x => [x.date, x.start, x.end, x.subject]), [['2027-01-08', '13:00', '15:00', '수학']], '1/9는 토요일');
  assert.equal(buildSessions(planSchedule(readPlan('캠프 계획\n교과: 국어', ctx), c), c).sessions.length, 0);
});

test('AI 글: 「운영 계획서」 표시, 계획서의 지도 계획까지 보내고 지도교사·학생 이름·전화번호는 가림, 기간은 「기간」 줄로', () => {
  const c = newCamp({ teacher: '한가람', students: [{ id: 'a', name: '김하늘' }] });
  const p = readPlan(PLAN + '\n※ 김하늘 학생은 받침 지도 필요', ctx);
  const { prompt, range } = planPrompt(PLAN + '\n※ 김하늘 학생은 받침 지도 필요', c, ctx, p);
  assert.ok(prompt.includes('[기초학력 캠프 수업 일정]') && prompt.includes('[운영 계획서]'), prompt.slice(0, 200));
  assert.ok(prompt.includes('받침 있는 낱말 읽기') && prompt.includes('두 자리 수 뺄셈'), '지도 계획');
  for (const w of ['한가람', '김하늘', '010-1234-5678']) assert.ok(!prompt.includes(w), w);
  assert.deepEqual(range, { from: '2027-01-08', to: '2027-01-22' });
  assert.ok(prompt.includes('계획서에 차시별 지도 내용이 있으면'), '지도 내용 규칙');
});

test('일정 칸 한 줄 요약, 캠프 정보는 빈 칸만 채움(고른 것 목록)', () => {
  const p = readPlan(PLAN, ctx);
  assert.equal(planDraft(p), '1/8~1/22 평일, 09:00~12:40 하루 5교시(40분·쉬는 5분), 국어·수학, 3학년');
  const c = newCamp({ name: '내가 붙인 이름' });
  const got = fillCampInfo(c, p);
  assert.deepEqual(got, ['대상', '교과', '지도교사']);
  assert.deepEqual([c.name, c.target, c.subjects, c.teacher], ['내가 붙인 이름', '3학년', ['국어', '수학'], '한가람']);
  // 다시 넣어도 이미 있는 칸은 그대로
  assert.deepEqual(fillCampInfo(c, readPlan('다른 캠프 계획\n대상: 4학년\n교과: 영어', ctx)), []);
});
