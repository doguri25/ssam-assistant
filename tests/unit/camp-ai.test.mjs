// 기초학력 캠프 AI(스펙 2026-11-11): 날짜는 앱이 정함(글에서 기간·요일 읽기, 주말·공휴일 빼기), AI 답 → 수업 줄(교과·지도 내용),
// 관찰 글·결과 보고서·양식 읽기 프롬프트에 학생·지도교사 이름이 없음(학생A·학생B), AI 답 정리
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCamp } from '../../web/menus/class/camp-model.js';
import {
  findRange, findWeekdays, schedulePrompt, normSchedule, buildSessions, obsPrompt, normObs, reportHeads, reportPrompt, normCampReport, layoutPrompt, normLayout
} from '../../web/menus/class/camp-ai.js';

const NAMES = ['김하늘', '이바다', '한가람', '하늘이', '바다가'];
const noNames = (s, what) => { for (const n of NAMES) assert.ok(!s.includes(n), `${what}에 「${n}」: ${s.slice(0, 300)}`); };
const S = (id, date, start, end, subject, content) => ({ id, date, start, end, subject, content });
function camp(f = {}) {
  return newCamp({
    name: '김하늘 반 교과캠프', teacher: '한가람', target: '3학년', subjects: ['국어', '수학'],
    students: [{ id: 'a', grade: 3, cls: 2, no: 5, name: '김하늘' }, { id: 'b', grade: 3, cls: 2, no: 11, name: '이바다' }],
    sessions: [S('s1', '2027-01-08', '09:00', '09:40', '국어', '낱말 읽기'), S('s2', '2027-01-08', '09:45', '10:25', '수학', '두 자리 덧셈'), S('s3', '2027-01-11', '09:00', '09:40', '국어', '받아쓰기')],
    att: { s1: { a: 'O', b: 'X' }, s2: { a: 'O', b: 'O' }, s3: { a: 'O' } },
    memo: { a: '김하늘이 받아쓰기에 자신감이 붙음. 한가람 선생님이 칭찬', b: '바다가 덧셈을 손가락으로 셈' },
    ...f
  });
}

test('글에서 기간 읽기: 1/8~1/23 · 1월 8일~23일 · 2027. 1. 8.~1. 23. · 12/28~1/8(해 넘김), 시각(9:00~12:40)은 기간이 아님', () => {
  const o = { year: 2026, today: '2026-11-11' };
  assert.deepEqual(findRange('1/8~1/23 평일, 9:00~12:40', o), { from: '2027-01-08', to: '2027-01-23' });
  assert.deepEqual(findRange('1월 8일~23일 오전', o), { from: '2027-01-08', to: '2027-01-23' });
  assert.deepEqual(findRange('기간 2027. 1. 8.(금) ~ 2027. 1. 23.', o), { from: '2027-01-08', to: '2027-01-23' });
  assert.deepEqual(findRange('12/28~1/8', o), { from: '2026-12-28', to: '2027-01-08' });
  assert.deepEqual(findRange('1.8부터 1.15까지', o), { from: '2027-01-08', to: '2027-01-15' });
  assert.equal(findRange('9:00~12:40 하루 5교시', o), null);
  assert.equal(findRange('국어·수학 3학년 2명', o), null);
  // 1·2월에 3월 캠프를 말하면 다음 학년도(지난 날이 되지 않게)
  assert.deepEqual(findRange('3/2~3/6', { year: 2026, today: '2027-02-10' }), { from: '2027-03-02', to: '2027-03-06' });
});

test('글에서 요일 읽기: 평일·월수금·화, 목·수요일, 없으면 null(「수학」「화목한」은 요일이 아님)', () => {
  assert.deepEqual(findWeekdays('1/8~1/23 평일'), [1, 2, 3, 4, 5]);
  assert.deepEqual(findWeekdays('매주 월수금 오후'), [1, 3, 5]);
  assert.deepEqual(findWeekdays('화, 목 2교시'), [2, 4]);
  assert.deepEqual(findWeekdays('매주 수요일'), [3]);
  assert.equal(findWeekdays('국어·수학 화목한 분위기'), null);
  assert.equal(findWeekdays('하루 5교시'), null);
});

test('일정 프롬프트: 앱이 센 수업 날 수·교과·출석 단위, 이름 없음', () => {
  const c = camp();
  const { prompt, range } = schedulePrompt('1/8~1/23 평일, 9:00~12:40 하루 5교시(40분·쉬는 5분), 국어·수학, 김하늘·이바다 2명, 아이스크림 홈런', c, { year: 2026, today: '2026-11-11' });
  noNames(prompt, '일정 프롬프트');
  assert.deepEqual(range, { from: '2027-01-08', to: '2027-01-23' });
  assert.ok(prompt.startsWith('[기초학력 수업 일정]'));
  assert.ok(prompt.includes('11일'), '앱이 센 수업 날: ' + prompt);
  assert.ok(prompt.includes('국어') && prompt.includes('아이스크림 홈런') && prompt.includes('학생A'));
  assert.ok(/"lessons"/.test(prompt) && /"order"/.test(prompt));
});

test('일정 AI 답 → 수업 줄: 기간은 앱이 읽은 것, 주말·공휴일은 앱이 뺌, 교시 묶음, 교과 차례대로 지도 내용', () => {
  const v = { from: '2027-01-01', to: '2027-01-30', weekdays: [1, 2, 3, 4, 5, 6], start: '9:00', periods: 2, minutes: 40, rest: 5,
    order: ['국어', '수학'], lessons: [{ subject: '국어', items: ['국1', '국2', '국3'] }, { subject: '수학', items: ['수1'] }] };
  // 앱이 읽은 기간(12/31~1/5): 신정(1/1)·토·일은 뺌. AI가 토요일을 넣어도 주말은 뺌
  const sp = normSchedule(v, { range: { from: '2026-12-31', to: '2027-01-05' } });
  assert.deepEqual(sp.dates, ['2026-12-31', '2027-01-04', '2027-01-05']);
  assert.equal(sp.dropped, 2, '신정·토요일');
  assert.deepEqual(sp.slots, [{ start: '09:00', end: '09:40' }, { start: '09:45', end: '10:25' }]);
  const { sessions, empty } = buildSessions(sp, camp());
  assert.equal(sessions.length, 6);
  assert.deepEqual(sessions.map(s => [s.date, s.start, s.subject, s.content]), [
    ['2026-12-31', '09:00', '국어', '국1'], ['2026-12-31', '09:45', '수학', '수1'],
    ['2027-01-04', '09:00', '국어', '국2'], ['2027-01-04', '09:45', '수학', ''],
    ['2027-01-05', '09:00', '국어', '국3'], ['2027-01-05', '09:45', '수학', '']]);
  assert.equal(empty, 2, '지도 내용이 모자란 줄');
  assert.ok(sessions.every(s => s.id && s.end));
  // 앱이 기간을 못 읽으면 AI의 기간, 요일 힌트가 있으면 그것
  const sp2 = normSchedule({ ...v, from: '2027-01-04', to: '2027-01-08' }, { weekdays: [1, 3, 5] });
  assert.deepEqual(sp2.dates, ['2027-01-04', '2027-01-06', '2027-01-08']);
  // 기간 없이 날짜를 하나하나 말함: 공휴일·주말은 뺌
  const sp3 = normSchedule({ dates: ['2027-01-08', '2027-01-01', '2027-01-09', 'x', '2027-01-08'], slots: [{ start: '13:00', end: '13:40' }, { start: '9:00', end: '8:00' }] });
  assert.deepEqual(sp3.dates, ['2027-01-08']); assert.equal(sp3.dropped, 2);
  assert.deepEqual(sp3.slots, [{ start: '13:00', end: '13:40' }]);
  // 망가진 답
  const bad = normSchedule(null);
  assert.deepEqual(bad.dates, []); assert.ok(bad.slots.length >= 1);
});

test('날마다 캠프: 날짜마다 한 줄(첫 교시 시작~끝 교시 끝, 교과 묶음, 그날 지도 내용)', () => {
  const sp = normSchedule({ start: '09:00', periods: 3, minutes: 40, rest: 10, order: ['국어', '수학', '국어'], lessons: { 국어: ['국1', '국2'], 수학: ['수1', '수2'] } },
    { range: { from: '2027-01-07', to: '2027-01-08' } });
  const { sessions } = buildSessions(sp, camp({ unit: 'day' }));
  assert.deepEqual(sessions.map(s => [s.date, s.start, s.end, s.subject, s.content]), [
    ['2027-01-07', '09:00', '11:20', '국어·수학', '국어: 국1 / 수학: 수1'], ['2027-01-08', '09:00', '11:20', '국어·수학', '국어: 국2 / 수학: 수2']]);
  // 교과 차례가 없으면 캠프 교과
  const sp2 = normSchedule({ periods: 2 }, { range: { from: '2027-01-08', to: '2027-01-08' } });
  assert.deepEqual(buildSessions(sp2, camp()).sessions.map(s => s.subject), ['국어', '수학']);
});

test('관찰 글 프롬프트: 학생A·학생B, 출석 수, 메모(이름은 바꾸거나 가림), 지도 내용, 이름 없음', () => {
  const c = camp();
  const p = obsPrompt(c, ['a', 'b']);
  noNames(p, '관찰 프롬프트');
  assert.ok(p.startsWith('[기초학력 관찰 기록]'));
  assert.ok(p.includes('학생A') && p.includes('학생B'));
  assert.ok(p.includes('출석 3/3회') && p.includes('출석 1/3회'), p);
  assert.ok(p.includes('받아쓰기에 자신감이 붙음') && p.includes('덧셈을 손가락으로'), '메모 내용');
  assert.ok(p.includes('낱말 읽기'), '지도 내용');
  assert.ok(/「~함\.」/.test(p), '문장 끝 꼴');
  const only = obsPrompt(c, ['b']);
  assert.ok(only.includes('학생B') && !only.includes('- 학생A'), '고른 학생만');
});

test('관찰 AI 답 정리: 학생A → 학생 id, 개조식 줄은 이어 씀, 모르는 학생은 버림', () => {
  const c = camp();
  const r = normObs({ students: [{ id: '학생A', text: '- 받아쓰기에 자신감이 붙음.\n- 꾸준히 참여함.' }, { id: '학생C', text: '없는 학생' }, { id: '학생B', text: '  ' }] }, c);
  assert.deepEqual(r, { a: '받아쓰기에 자신감이 붙음. 꾸준히 참여함.' });
  assert.deepEqual(normObs([{ id: '학생B', text: '덧셈을 함.' }], c), { b: '덧셈을 함.' });
  assert.deepEqual(normObs(null, c), {});
});

test('결과 보고서: 꼴마다 글 머리, 프롬프트에 이름 없음(학생A), 출석·지도 내용·선생님 메모', () => {
  assert.deepEqual(reportHeads(camp()), ['운영 목적', '운영 내용', '운영 성과']);
  assert.deepEqual(reportHeads(camp({ report: { kind: 'lead' } })), ['필요성 및 목적', '추진 내용', '결과 및 결론', '일반화 방안']);
  assert.deepEqual(reportHeads(camp({ report: { kind: 'form' } }), { heads: ['1. 운영 개요', '2. 운영 결과'] }), ['운영 개요', '운영 결과']);
  assert.deepEqual(reportHeads(camp({ report: { kind: 'form' } }), null), ['운영 목적', '운영 내용', '운영 성과'], '양식 글 머리가 없으면 사업선택제');
  const c = camp({ report: { kind: 'select', prompt: '김하늘이 받아쓰기 60점→85점. 이바다 덧셈 속도 빨라짐' }, obs: { a: '하늘이 자신감이 붙음.' } });
  const p = reportPrompt(c);
  noNames(p, '보고서 프롬프트');
  assert.ok(p.startsWith('[기초학력 결과 보고서]'));
  assert.ok(p.includes('사업선택제') && p.includes('2쪽 이내'));
  assert.ok(p.includes('「운영 목적」') && p.includes('「운영 성과」'));
  assert.ok(p.includes('학생A') && p.includes('60점→85점') && p.includes('총 3시간') && p.includes('낱말 읽기'));
  assert.ok(reportPrompt(camp({ report: { kind: 'lead' } })).includes('5쪽 이상'));
});

test('결과 보고서 AI 답 정리: 글 머리 차례로 맞추고, 없으면 AI 차례', () => {
  const heads = ['운영 목적', '운영 내용', '운영 성과'];
  const r = normCampReport({ title: ' 겨울 교과캠프 결과 보고서 ', sections: [{ head: '운영 성과', text: '성과 글' }, { head: '1. 운영 목적', text: '목적 글' }, { head: '기타', text: '내용 글' }] }, heads);
  assert.equal(r.title, '겨울 교과캠프 결과 보고서');
  assert.deepEqual(r.sections, [{ head: '운영 목적', text: '목적 글' }, { head: '운영 내용', text: '내용 글' }, { head: '운영 성과', text: '성과 글' }]);
  const r2 = normCampReport({ sections: [{ h: '가', lines: ['- 하나', '둘'] }] }, []);
  assert.deepEqual(r2.sections, [{ head: '가', text: '- 하나\n둘' }]);
  assert.deepEqual(normCampReport(null, heads).sections, []);
});

test('양식 읽기: 프롬프트(문서 종류·글), AI 답 정리(번호 뺀 글 머리, 빈 답은 null)', () => {
  const p = layoutPrompt('confirm', { text: '수업 확인서\n순 날짜 시간', nImages: 0 });
  assert.ok(p.startsWith('[기초학력 양식 읽기]') && p.includes('수업 확인서') && p.includes('순 날짜 시간'));
  assert.ok(layoutPrompt('attend', { nImages: 2 }).includes('그림 2장'));
  const l = normLayout({ title: ' 3-(1) 교과캠프 수업 확인서 ', columns: ['순', ' 날짜 ', '', 3], notes: ['※확인(서명)란은 지도 교사가 반드시 날인(사인)'], heads: ['1. 운영 목적', 'Ⅱ. 운영 내용', '가. 성과'] });
  assert.deepEqual(l, { title: '3-(1) 교과캠프 수업 확인서', columns: ['순', '날짜'], notes: ['※확인(서명)란은 지도 교사가 반드시 날인(사인)'], heads: ['운영 목적', '운영 내용', '성과'] });
  assert.equal(normLayout({}), null);
  assert.equal(normLayout('x'), null);
});
