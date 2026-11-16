/* 2026-11-16 회의록 버그 고침: AI 줄 앞 날짜·소수를 번호로 잘라 내던 것, 메모 뒤 끝 줄 「회의록 써 줘」가 다른 일로 가던 것,
   「이 공문 맞춤법 고쳐 줘」「한글 파일 공문체로」가 공문 처리로 가던 것, 마지막 할 일을 빼도 저장되지 않던 것,
   다시 정리할 때 AI가 이름을 비우면 종류가 「기타」로 바뀌던 것. 이름은 모두 지어낸 것 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { normMinutes, keepFields } from '../../web/menus/etc/minutes-ai.js';
import { blankMinutes, listMinutes, putMinutes, saveMinutes } from '../../web/menus/etc/minutes-model.js';
import { routeText, payloadFor, handoffText } from '../../web/core/chat-route.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }
store.useStorage(mem());
const TODAY = '2026-11-16';
const route = s => routeText(handoffText(s));

/* ---------- C9: 줄 앞 번호 빼기가 날짜·소수를 자르지 않음 ---------- */
const lineOut = s => normMinutes({ agenda: [{ title: '안건', discussion: [s] }] }, { year: 2026, today: TODAY }).agenda[0].discussion[0];

test('[fix1116-min-bullet-keep] 줄 앞 날짜(「11. 20.(금)」「11.25.」)·소수(「1.5배」「3.1절」)는 번호가 아님 — 그대로 남김', () => {
  const v = { title: '5학년 협의회', date: '2026-11-12', agenda: [
    { title: '12. 24.(목) 방학식 운영', discussion: ['11. 20.(금)까지 체험학습 신청서 받기로 함', '3.1절 계기 교육 자료 공유함'], decisions: ['1.5배 증액함', '2.5% 인상안 채택함', '10시 30분 시작함'] }],
  todos: [{ task: '11.25. 가정통신문 발송', who: '', due: '2026-11-25' }] };
  const n = normMinutes(v, { year: 2026, today: TODAY });
  assert.equal(n.agenda[0].title, '12. 24.(목) 방학식 운영');
  assert.deepEqual(n.agenda[0].discussion, ['11. 20.(금)까지 체험학습 신청서 받기로 함', '3.1절 계기 교육 자료 공유함']);
  assert.deepEqual(n.agenda[0].decisions, ['1.5배 증액함', '2.5% 인상안 채택함', '10시 30분 시작함']);
  assert.equal(n.todos[0].task, '11.25. 가정통신문 발송');
  for (const s of ['11. 20(금)까지 신청서 받기로 함', '12.24. 방학식', '0.5시간 늘림']) assert.equal(lineOut(s), s, s);
});

test('[fix1116-min-bullet-strip] 목록 번호·기호는 지금처럼 뺌(뒤에 숫자로 시작하는 낱말·날짜가 와도)', () => {
  const cases = [
    ['1. 체험학습 장소', '체험학습 장소'], ['1.체험학습 장소', '체험학습 장소'], ['(2) 버스 예약', '버스 예약'], ['2) 버스 예약', '버스 예약'],
    ['가. 안건', '안건'], ['나) 안건', '안건'], ['- 협의함', '협의함'], ['· 거리·비용을 비교함', '거리·비용을 비교함'], ['○ 결정함', '결정함'],
    ['3. 1학기 평가 계획', '1학기 평가 계획'], ['1. 2학기 체험학습', '2학기 체험학습'], ['2. 10시 시작함', '10시 시작함'], ['1. 12월 행사', '12월 행사'],
    ['1. 2026. 3. 2. 입학식', '2026. 3. 2. 입학식'], ['3. 1.5배 증액함', '1.5배 증액함'], ['(1) 11. 20.(금)까지 받기로 함', '11. 20.(금)까지 받기로 함'],
    ['1) 11.25. 발송', '11.25. 발송']];
  for (const [s, want] of cases) assert.equal(lineOut(s), want, s);
  // 번호 뒤에 날짜가 바로 오면(「1. 11. 20.(금)…」) 날짜를 살림(번호가 남는 편이 숫자가 사라지는 것보다 나음)
  assert.ok(lineOut('1. 11. 20.(금)까지 받기로 함').includes('11. 20.(금)까지'), lineOut('1. 11. 20.(금)까지 받기로 함'));
});

/* ---------- C11: 메모 뒤 끝 줄 명령 ---------- */
test('[fix1116-min-tail-cmd] 메모를 먼저 쓰고 끝 줄에 「회의록 써 줘」 → 회의록(메모 속 가정통신문·쪽지로·행사 계획은 세지 않음), 넘길 메모에서 명령 줄은 뺌', () => {
  const cases = [
    ['- 체험학습 장소 과학관으로 정함\n- 가정통신문 11/18 발송\n회의록 써 줘', '- 체험학습 장소 과학관으로 정함\n- 가정통신문 11/18 발송'],
    ['- 버스 예약 11/20까지\n- 쪽지로 안내함\n위 내용 회의록으로 정리해 줘', '- 버스 예약 11/20까지\n- 쪽지로 안내함'],
    ['- 가정통신문 11/18 발송\n- 버스 예약은 이바다 선생님\n회의록으로 만들어 주세요', '- 가정통신문 11/18 발송\n- 버스 예약은 이바다 선생님'],
    ['운동회 계획 다시 보기로 함\n회의록 정리해 줘', '운동회 계획 다시 보기로 함']];
  for (const [s, memo] of cases) {
    const r = route(s);
    assert.equal(r.intent, 'minutes', `${JSON.stringify(s)} → ${r.intent} ${r.candidates}`);
    assert.equal(payloadFor('minutes', s).text, memo, s);
  }
  // 문서 다듬기도 끝 줄 명령이면 그 일(메모 속 「가정통신문」으로 가정통신문을 쓰지 않음)
  assert.equal(route('가정통신문 11월호 원고\n- 행사 일정 고침\n한글 파일 맞춤법 고쳐 줘').intent, 'docedit');
  // 첫 줄 명령은 그대로(명령 줄을 빼고 넘김)
  assert.equal(payloadFor('minutes', '회의록 정리해 줘\n- 과학관으로 정함\n- 버스 예약').text, '- 과학관으로 정함\n- 버스 예약');
});

test('[fix1116-min-tail-cmd-not] 첫 줄이 다른 일 명령이거나 끝 줄이 명령 꼴이 아니면 끝 줄의 「회의록」은 넣을 글', () => {
  const cases = [
    ['쪽지 써 줘\n학교운영위원회 회의록 열람 안내: 행정실에서 11/20까지', 'message'],
    ['쪽지 써 줘\n- 3학년 협의회 결과 공유\n회의록 정리해서 11/20까지 보내 주세요', 'message'],
    ['가정통신문\n학부모 상담 주간 안내\n회의록은 담임 선생님께 보내 주세요', 'letter'],
    ['공문 처리해 줘\n제5차 학교운영위원회 회의록 제출 요청, 기한 11월 25일', 'gongmun'],
    ['공문 처리\n제출 서류: 협의회 회의록 작성해서 보내 주세요', 'gongmun'],
    ['가정통신문 써 줘\n학부모 상담 주간 안내\n학년 협의회 회의록 참고', 'letter']];
  for (const [s, want] of cases) { const r = route(s); assert.equal(r.intent, want, `${JSON.stringify(s)} → ${r.intent} ${r.candidates}`); }
  // 첫 줄이 회의록 명령이면 메모 끝 줄의 「회의록 …」 줄은 메모 그대로(빼지 않음)
  assert.equal(payloadFor('minutes', '회의록 정리해 줘\n- 체험학습 장소 정함\n- 회의록은 교무부에 냄').text, '- 체험학습 장소 정함\n- 회의록은 교무부에 냄');
  // 메모만(명령 없음)은 지금처럼
  assert.equal(route('- 버스 예약 11/20까지\n- 가정통신문 11/18 발송').intent, 'letter');
});

/* ---------- C12: 공문체·맞춤법 ---------- */
test('[fix1116-min-docedit-words] 「이 공문 맞춤법 고쳐 줘」「한글 파일 공문체로」「가정통신문 맞춤법 봐 줘」 → 문서 다듬기(공문 처리·가정통신문 쓰기가 아님)', () => {
  for (const s of ['이 공문 맞춤법 고쳐 줘', '한글 파일 공문체로', '이 문서 공문체로', '공문 다듬어 줘', '공문을 교정해 줘', '공문 맞춤법이랑 띄어쓰기 좀 봐 줘', '가정통신문 맞춤법 봐 줘', '안내장 띄어쓰기 고쳐 줘', '보고서 맞춤법 고쳐 줘', '이 파일 다듬어 줘']) {
    const r = route(s);
    assert.equal(r.intent, 'docedit', `${s} → ${r.intent} ${r.candidates}`);
  }
});

test('[fix1116-min-docedit-not] 공문 처리·글 쓰기 말은 그대로, 「공문체로 ○○ 써 줘」는 그 글', () => {
  const cases = [['공문 처리해 줘', 'gongmun'], ['공문 기한 정리해 줘', 'gongmun'], ['교육청 공문 처리', 'gongmun'], ['협의회 결과 공문 처리', 'gongmun'],
    ['공문체로 쪽지 써 줘', 'message'], ['공문체로 가정통신문 써 줘', 'letter'], ['가정통신문 써 줘', 'letter'], ['결과 보고서 써 줘', 'report'],
    ['학생 문집 맞춤법 교정 활동 결과 보고서 써 줘', 'report'], ['공문 처리해 줘\n제출 문서는 맞춤법을 확인하여 보내 주시기 바랍니다', 'gongmun']];
  for (const [s, want] of cases) { const r = route(s); assert.equal(r.intent, want, `${s} → ${r.intent} ${r.candidates}`); }
  // 맞춤법 뒤가 고치는 말이 아니면(확인 후 발송·확인 안내) 넣을 내용 — 문서 다듬기로 가지 않음
  assert.equal(route('학부모 안내장 맞춤법 확인 후 발송').intent, 'letter');
  assert.notEqual(route('공문 맞춤법 확인 안내 쪽지 써 줘').intent, 'docedit');
});

/* ---------- C13: 마지막 할 일을 빼면 저장소에서도 ---------- */
test('[fix1116-min-save-empty] 저장한 회의록에서 마지막 할 일·글을 지우면 저장소에서도 빠짐(「오늘」에 남지 않음), 새 빈 회의록은 넣지 않음', () => {
  const x = blankMinutes();
  x.todos.push({ task: '버스 예약', who: '', due: '2026-11-18', done: false });
  saveMinutes(x);
  assert.deepEqual(listMinutes().map(r => r.todos.map(t => t.task)), [['버스 예약']]);
  x.todos.splice(0, 1);
  saveMinutes(x);
  assert.equal(listMinutes().length, 0, JSON.stringify(listMinutes()));
  // 빈 새 회의록은 목록에 넣지 않음, 다른 회의록은 그대로
  const y = { ...blankMinutes(), title: '3학년 학년 협의회' };
  putMinutes(y);
  saveMinutes(blankMinutes());
  assert.deepEqual(listMinutes().map(r => r.title), ['3학년 학년 협의회']);
  // 글을 다시 쓰면 다시 들어감
  x.title = '5학년 학년 협의회'; saveMinutes(x);
  assert.deepEqual(listMinutes().map(r => r.title).sort(), ['3학년 학년 협의회', '5학년 학년 협의회']);
});

/* ---------- C14: 다시 정리할 때 종류 ---------- */
test('[fix1116-min-kind-keep] 다시 정리할 때 AI가 이름을 비워도 남은 이름의 종류 그대로(「기타」로 바뀌지 않음)', () => {
  const first = normMinutes({ title: '3학년 학년 협의회', agenda: [{ title: 'a' }] }, { year: 2026, today: TODAY });
  assert.equal(first.kind, 'grade');
  const second = keepFields(normMinutes({ title: '', agenda: [{ title: 'b' }] }, { year: 2026, today: TODAY }), first, []);
  assert.deepEqual([second.title, second.kind], ['3학년 학년 협의회', 'grade']);
  // 선생님이 고친 이름이 남으면 그 이름으로 짐작
  const typed = { ...blankMinutes(), title: '6학년 과학 교과 협의회', touched: ['title'] };
  const k = keepFields(normMinutes({ title: '협의 결과', agenda: [{ title: 'b' }] }, { year: 2026, today: TODAY }), typed, ['title']);
  assert.deepEqual([k.title, k.kind], ['6학년 과학 교과 협의회', 'subject']);
});

test('[fix1116-min-kind-not] AI 새 이름이 다른 종류면 그 종류, 선생님이 고른 종류(기타 포함)는 그대로', () => {
  const prev = normMinutes({ title: '3학년 학년 협의회' }, { year: 2026, today: TODAY });
  assert.equal(keepFields(normMinutes({ title: '6학년 과학 교과 협의회' }, { year: 2026, today: TODAY }), prev, []).kind, 'subject');
  const chose = { ...prev, kind: 'etc' };
  assert.equal(keepFields(normMinutes({ title: '' }, { year: 2026, today: TODAY }), chose, ['kind']).kind, 'etc');
  const council = { ...prev, kind: 'council' };
  assert.equal(keepFields(normMinutes({ title: '3학년 학년 협의회' }, { year: 2026, today: TODAY }), council, ['kind']).kind, 'council');
});
