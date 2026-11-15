// 2026-11-15 검토 고침 — 문서·소통 › 회의록: 메모는 한 가리개로 한꺼번에 가림(여러 줄 명단·표·뒤 줄에서 알아낸 이름), 시간 칸도 가림,
// 연도 없는 회의 날(3월에 적은 2월 회의 → 그 해 2월, 할 일 기한도 그 회의 날 학년도 기준). 이름은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { redactInput, minutesPrompt, backAll, normMinutes } from '../../web/menus/etc/minutes-ai.js';
import { schoolYearOf } from '../../web/core/calendar.js';

const NAMES = /김하늘|이바다|한가람|박솔빛|윤슬기|서다온/;
const MEMO = ['5학년 학년 협의회', '체험학습 박솔빛 빠짐', '5-2 김하늘 결석 3일', '김하늘(5-2) 학부모 민원', '김하늘, 이바다 학생 상담 필요', '한가람·이바다 선생님 인솔',
  '상담할 학생', '1 윤슬기', '2 서다온', '3 한가람', '박솔빛 학생 보호자 연락'];

test('[mn-redact-all] 메모는 한 번에 가림: 반 번호 옆·괄호·쉼표·「·」로 이은 이름, 한 줄에 한 명씩 번호 명단, 뒤 줄에서 알아낸 이름(앞 줄도), 시간 칸 — 프롬프트에 이름 없음, 답에는 되돌림', () => {
  const r = redactInput(MEMO.join('\n'), { kind: 'grade', title: '5학년 학년 협의회', date: '2026-11-12', time: '15:00 이바다 선생님 교실', place: '5학년 연구실', attendees: '김하늘 외' });
  const p = minutesPrompt({ text: r.text, meta: r.meta, today: '2026-11-15', year: 2026 });
  assert.ok(!NAMES.test(p), p.slice(p.indexOf('[선생님이 적은 칸]')));
  for (const s of ['결석 3일', '(5-2) 학부모 민원', '학생 상담 필요', '선생님 인솔', '상담할 학생', '보호자 연락']) assert.ok(r.text.includes(s), s);
  assert.equal(r.text.split('\n').length, MEMO.length, '명단이 아닌 줄은 모두 보냄: ' + r.text);
  assert.equal(r.dropped, 0);
  assert.match(r.meta.time, /^15:00 〔이름\d+〕 선생님 교실$/);
  // 같은 이름은 같은 자리 표시(메모와 칸이 한 가리개)
  const tok = /〔이름\d+〕/.exec(r.meta.time)[0];
  assert.ok(r.text.includes(`${tok} 학생 상담 필요`) && r.text.includes(`·${tok} 선생님 인솔`), r.text);
  // AI가 메모 줄을 그대로 옮겨 쓴 답 → 이름이 모두 되돌아옴
  const v = backAll({ time: r.meta.time, agenda: [{ title: '학생 상담', discussion: r.text.split('\n'), decisions: [] }] }, r.back);
  assert.deepEqual(v.agenda[0].discussion, MEMO);
  assert.equal(v.time, '15:00 이바다 선생님 교실');
});

test('[mn-year-less] 연도 없는 회의 날이 오늘보다 7일 넘게 뒤면 지난해(3월에 적은 2월 회의), 할 일·다음 회의는 그 회의 날 기준', () => {
  const at = (today, v) => normMinutes(v, { year: schoolYearOf(today), today });
  const a = at('2026-03-03', { title: '새 학년 준비 협의회', date: '02-25', todos: [{ task: '교실 배정', due: '03-06' }, { task: '명렬표 받기', due: '02-27' }], next: { date: '03-10' } });
  assert.equal(a.date, '2026-02-25');
  assert.deepEqual(a.todos.map(t => t.due), ['2026-03-06', '2026-02-27']);
  assert.equal(a.next.date, '2026-03-10');
  // 2월에 적은 2월 회의, 3월 할 일(그대로 맞음)
  const b = at('2027-02-20', { date: '02-20', todos: [{ task: '새 학년 준비', due: '03-04' }] });
  assert.equal(b.date, '2027-02-20');
  assert.deepEqual(b.todos.map(t => t.due), ['2027-03-04']);
  // 7일 안의 앞날(미리 적는 다음 주 회의)은 그대로, 지난 회의도 그대로
  assert.equal(at('2026-11-15', { date: '11-20' }).date, '2026-11-20');
  assert.equal(at('2026-11-15', { date: '11-12' }).date, '2026-11-12');
  assert.equal(at('2026-12-03', { date: '11-28', todos: [{ task: 'a', due: '12-01' }, { task: 'b', due: '1-10' }] }).todos.map(t => t.due).join(), '2026-12-01,2027-01-10');
  // 없는 날은 빈칸
  const c = at('2026-11-15', { date: '02-30', todos: [{ task: 'a', due: '2/30' }, { task: 'b', due: '11/31' }] });
  assert.deepEqual([c.date, ...c.todos.map(t => t.due)], ['', '', '']);
  // 연도를 적은 날은 그대로
  assert.equal(at('2026-03-03', { date: '2027-02-25' }).date, '2027-02-25');
});
