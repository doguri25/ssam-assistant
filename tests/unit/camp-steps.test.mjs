// 기초학력 캠프 화면 개선(스펙 2026-11-11-ui-refresh §3): 단계 진행 표시 6칸의 상태 한 줄·다 됨, 문서 준비 상자(준비됨·할 일 남음·아직),
// 출석 날짜 칩의 「다 체크한 날」, [남은 칸 모두 출석](표시한 칸은 그대로)
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCamp, sessionChecked, dayDone, remainingOn, markRest, markAll } from '../../web/menus/class/camp-model.js';
import { STEPS, campSteps, docReadiness } from '../../web/menus/class/camp-steps.js';

/* 학생 2명, 1/8(금) 2교시 · 1/11(월) 1교시 */
function sample(f = {}) {
  return newCamp({
    name: '교과캠프', target: '3학년', subjects: ['국어', '수학'],
    students: [{ id: 'a', name: '김하늘' }, { id: 'b', name: '이바다' }],
    sessions: [
      { id: 's1', date: '2027-01-08', start: '09:00', end: '09:40', subject: '국어', content: '낱말 읽기' },
      { id: 's2', date: '2027-01-08', start: '09:45', end: '10:25', subject: '수학', content: '두 자리 덧셈' },
      { id: 's3', date: '2027-01-11', start: '09:00', end: '09:40', subject: '국어', content: '' }
    ],
    ...f
  });
}
const byId = list => Object.fromEntries(list.map(x => [x.id, x]));

test('단계 6칸: 캠프 정보·수업 일정·출석 체크·관찰 기록·결과 보고서·문서 내보내기 차례', () => {
  assert.deepEqual(STEPS.map(s => s[0]), ['info', 'sched', 'att', 'obs', 'report', 'docs']);
  assert.deepEqual(STEPS.map(s => s[1]), ['캠프 정보', '수업 일정', '출석 체크', '관찰 기록', '결과 보고서', '문서 내보내기']);
  assert.deepEqual(campSteps(sample()).map(s => [s.id, s.label]), STEPS);
});

test('새 캠프: 모든 단계가 아직이고, 무엇을 먼저 할지 한 줄로', () => {
  const s = byId(campSteps(newCamp()));
  assert.ok(Object.values(s).every(x => !x.done), '다 된 단계 없음');
  assert.equal(s.info.line, '학생을 넣어 주세요');
  assert.equal(s.sched.line, '아직 없어요');
  assert.equal(s.att.line, '학생·일정이 먼저예요');
  assert.equal(s.obs.line, '학생이 먼저예요');
  assert.equal(s.report.line, '아직 안 씀');
  assert.equal(s.docs.line, '0 / 4 준비됨');
});

test('상태 한 줄: 「대상 3학년 · 국어·수학」「3줄 · 총 3시간」「1 / 3 수업 체크」「입력 필요 2명」「아직 안 씀」', () => {
  const c = sample({ att: { s1: { a: 'O', b: 'X' }, s2: { a: 'O' } } });
  const s = byId(campSteps(c));
  assert.equal(s.info.line, '대상 3학년 · 국어·수학'); assert.equal(s.info.done, true);
  assert.equal(s.sched.line, '3줄 · 총 3시간'); assert.equal(s.sched.done, true);
  assert.equal(s.att.line, '1 / 3 수업 체크', '학생 모두 표시한 수업만(○·/ 둘 다)'); assert.equal(s.att.done, false);
  assert.equal(s.obs.line, '입력 필요 2명'); assert.equal(s.obs.done, false);
  assert.equal(s.report.line, '아직 안 씀'); assert.equal(s.report.done, false);
  // 대상이 없으면 학생 수
  assert.equal(byId(campSteps(sample({ target: '', subjects: [] }))).info.line, '학생 2명');
});

test('다 된 단계: 출석 모두 체크·관찰 글 모두·보고서 칸 모두 → ✓, 보고서 일부는 「1 / 2칸 씀」', () => {
  const full = sample({
    sessions: sample().sessions.map(s => ({ ...s, content: s.content || '받아쓰기' })),
    att: { s1: { a: 'O', b: 'O' }, s2: { a: 'X', b: 'O' }, s3: { a: 'O', b: 'O' } },
    obs: { a: '자신감이 붙음', b: '덧셈을 익힘' },
    report: { sections: [{ head: '운영 목적', text: '기초학력 향상' }, { head: '운영 성과', text: '받아쓰기 85점' }] }
  });
  const s = byId(campSteps(full));
  assert.equal(s.att.line, '3 / 3 수업 체크'); assert.equal(s.att.done, true);
  assert.equal(s.obs.line, '2명 다 씀'); assert.equal(s.obs.done, true);
  assert.equal(s.report.line, '2칸'); assert.equal(s.report.done, true);
  assert.equal(s.docs.line, '4 / 4 준비됨'); assert.equal(s.docs.done, true);
  const half = byId(campSteps({ ...full, report: { ...full.report, sections: [full.report.sections[0], { head: '운영 성과', text: ' ' }] } }));
  assert.equal(half.report.line, '1 / 2칸 씀'); assert.equal(half.report.done, false);
});

test('문서 준비: 문서 4종 — 준비됨·할 일 남음(까닭)·아직, 그 단계로 가는 곳', () => {
  const c = sample({ att: { s1: { a: 'O', b: 'X' } }, obs: { a: '자신감이 붙음' } });
  const d = docReadiness(c);
  assert.deepEqual(d.map(x => x.id), ['confirm', 'attend', 'observe', 'report']);
  assert.deepEqual(d.map(x => x.label), ['수업 확인서', '학생 출석 및 관찰 기록부', '관찰 기록부', '결과 보고서']);
  const r = byId(d);
  assert.deepEqual([r.confirm.state, r.confirm.note, r.confirm.sec], ['todo', '지도 내용 1줄 비어 있음', 'sched']);
  assert.deepEqual([r.attend.state, r.attend.note, r.attend.sec], ['todo', '출석 2줄 남음', 'att']);
  assert.deepEqual([r.observe.state, r.observe.note, r.observe.sec], ['todo', '관찰 글 1명 남음', 'obs']);
  assert.deepEqual([r.report.state, r.report.note, r.report.sec], ['none', '아직 안 씀', 'report']);
});

test('문서 준비: 아무것도 없으면 아직(먼저 할 곳으로), 다 되면 준비됨, 날마다 캠프는 「학생 출석부」', () => {
  const r0 = byId(docReadiness(newCamp()));
  assert.deepEqual([r0.confirm.state, r0.confirm.note, r0.confirm.sec], ['none', '수업 일정이 없어요', 'sched']);
  assert.deepEqual([r0.attend.state, r0.attend.note, r0.attend.sec], ['none', '학생을 넣어 주세요', 'info']);
  assert.deepEqual([r0.observe.state, r0.observe.sec], ['none', 'info']);
  const r1 = byId(docReadiness(sample()));
  assert.deepEqual([r1.attend.state, r1.attend.note], ['none', '아직 체크 안 함'], '표시가 하나도 없으면 아직');
  assert.deepEqual([r1.observe.state, r1.observe.note], ['none', '아직 안 씀']);
  const full = sample({
    unit: 'day', sessions: sample().sessions.map(s => ({ ...s, content: '받아쓰기' })),
    att: { s1: { a: 'O', b: 'O' }, s2: { a: 'X', b: 'O' }, s3: { a: 'O', b: 'X' } }, obs: { a: '가', b: '나' },
    report: { sections: [{ head: '운영 목적', text: '글' }] }
  });
  const d = docReadiness(full);
  assert.ok(d.every(x => x.state === 'ready' && x.note === '준비됨'), JSON.stringify(d));
  assert.equal(byId(d).attend.label, '학생 출석부');
});

test('출석: 수업 하나를 학생 모두 표시했는지, 다 체크한 날, 그날 남은 칸', () => {
  const c = sample({ att: { s1: { a: 'O', b: 'X' }, s2: { a: 'O' } } });
  assert.equal(sessionChecked(c, c.sessions.find(s => s.id === 's1')), true);
  assert.equal(sessionChecked(c, c.sessions.find(s => s.id === 's2')), false);
  assert.equal(sessionChecked(newCamp({ sessions: [{ id: 'x', date: '2027-01-08' }] }), { id: 'x' }), false, '학생이 없으면 체크한 수업이 아님');
  assert.equal(dayDone(c, '2027-01-08'), false);
  assert.equal(remainingOn(c, '2027-01-08'), 1);
  assert.equal(remainingOn(c, '2027-01-11'), 2);
  assert.equal(remainingOn(c, '2027-01-09'), 0, '수업 없는 날');
  assert.equal(dayDone(c, '2027-01-09'), false, '수업 없는 날은 다 체크한 날이 아님');
  const c2 = { ...c, att: { ...c.att, s2: { a: 'O', b: 'O' } } };
  assert.equal(dayDone(c2, '2027-01-08'), true);
  assert.equal(remainingOn(c2, '2027-01-08'), 0);
});

test('[남은 칸 모두 출석]: 빈칸만 ○, 표시한 /는 그대로, 다른 날·원래 캠프도 그대로', () => {
  const c = sample({ att: { s1: { a: 'X' } } });
  const c1 = markRest(c, '2027-01-08');
  assert.deepEqual(c1.att.s1, { a: 'X', b: 'O' });
  assert.deepEqual(c1.att.s2, { a: 'O', b: 'O' });
  assert.equal(c1.att.s3, undefined, '다른 날');
  assert.deepEqual(c.att, { s1: { a: 'X' } }, '순수 함수');
  assert.deepEqual(markAll(c, '2027-01-08').att.s1, { a: 'O', b: 'O' }, 'markAll(오늘 화면)은 그대로 모두 ○');
});
