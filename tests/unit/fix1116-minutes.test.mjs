/* 2026-11-16 회의록 버그 고침: AI 줄 앞 날짜·소수를 번호로 잘라 내던 것, 메모 뒤 끝 줄 「회의록 써 줘」가 다른 일로 가던 것,
   「이 공문 맞춤법 고쳐 줘」「한글 파일 공문체로」가 공문 처리로 가던 것, 마지막 할 일을 빼도 저장되지 않던 것,
   다시 정리할 때 AI가 이름을 비우면 종류가 「기타」로 바뀌던 것. 이름은 모두 지어낸 것 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { normMinutes, keepFields, minutesText } from '../../web/menus/etc/minutes-ai.js';
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
});

test('[fix1116-min-bullet-date] 목록 번호 뒤에 날짜가 오면(「1. 12. 24.(목) …」) 번호만 빼고 날짜는 살림 — 복사 글에 「1. 1. 12. 24.(목)」이 생기지 않음', () => {
  const cases = [
    ['1. 12. 24.(목) 방학식 운영', '12. 24.(목) 방학식 운영'], ['2. 11. 20.(금)까지 신청서 받기', '11. 20.(금)까지 신청서 받기'],
    ['1. 11. 20.(금)까지 받기로 함', '11. 20.(금)까지 받기로 함'], ['1. 3. 2.(월) 입학식', '3. 2.(월) 입학식'], ['1. 3. 2(월) 입학식', '3. 2(월) 입학식'],
    ['1. 5. 18. 계기교육', '5. 18. 계기교육'], ['1. 10. 3. 개천절 행사', '10. 3. 개천절 행사'], ['(1) 12. 24.(목) 방학식', '12. 24.(목) 방학식']];
  for (const [s, want] of cases) assert.equal(lineOut(s), want, s);
  // 번호 없는 날짜는 그대로
  for (const s of ['12. 24.(목) 방학식 운영', '3. 2.(월) 입학식', '3. 2(월) 입학식', '5. 18. 계기교육', '10. 3. 개천절 행사', '11. 20.(금)까지']) assert.equal(lineOut(s), s, s);
  // 안건 제목: 앱이 붙이는 번호 하나만
  const n = normMinutes({ title: '6학년 학년 협의회', agenda: [{ title: '1. 12. 24.(목) 방학식 운영' }, { title: '2. 11. 20.(금)까지 신청서 받기' }] }, { year: 2026, today: TODAY });
  const text = minutesText(n);
  assert.ok(text.includes('\n1. 12. 24.(목) 방학식 운영\n'), text);
  assert.ok(text.includes('\n2. 11. 20.(금)까지 신청서 받기'), text);
});

test('[fix1116-min-bullet-time] 「월. 일. 시각·교시」 줄(「11. 20. 14:00 협의」「11. 20. 2교시」)은 날짜라 달을 자르지 않음 — 번호는 뒤가 온전한 날짜(월. 일.·월. 일(요일))일 때만 뺌', () => {
  // 검토에서 찾은 것: 달이 잘려 「24. 10:00 방학식」이 되고 복사 글이 「1. 24. 10:00 방학식」(틀린 날)
  for (const s of ['12. 24. 10:00 방학식', '11. 20. 15시 협의회', '3. 2. 9시 입학식', '5. 18. 3교시 계기교육', '11. 20. 2학년 체험학습',
    '11. 20. 14:00 협의', '11. 20. 2교시', '11. 20. 14시 30분 학년 협의회', '11.20. 14:00 협의']) assert.equal(lineOut(s), s, s);
  // 앞서 고친 것도 그대로: 소수·날짜(요일)는 남기고, 번호 뒤 온전한 날짜는 번호만 뺌
  for (const s of ['1.5배 증액함', '11. 20.(금)까지 받기로 함', '12. 24.(목) 방학식', '5. 18. 계기교육']) assert.equal(lineOut(s), s, s);
  for (const [s, want] of [['1. 12. 24.(목) 방학식', '12. 24.(목) 방학식'], ['1. 12. 24. 10:00 방학식', '12. 24. 10:00 방학식'],
    ['2. 11. 20. 2교시 협의', '11. 20. 2교시 협의'], ['3. 1.5배 증액함', '1.5배 증액함'], ['2. 10시 시작함', '10시 시작함']]) assert.equal(lineOut(s), want, s);
  // 안건 제목·할 일도: 복사 글에 날이 온전히
  const n = normMinutes({ title: '6학년 학년 협의회', agenda: [{ title: '12. 24. 10:00 방학식' }, { title: '11. 20. 2교시 계기교육' }],
    todos: [{ task: '11. 20. 15시 협의회 자료 준비', who: '', due: '' }] }, { year: 2026, today: TODAY });
  assert.deepEqual(n.agenda.map(a => a.title), ['12. 24. 10:00 방학식', '11. 20. 2교시 계기교육']);
  assert.equal(n.todos[0].task, '11. 20. 15시 협의회 자료 준비');
  const text = minutesText(n);
  assert.ok(text.includes('\n1. 12. 24. 10:00 방학식\n'), text);
  assert.ok(text.includes('\n2. 11. 20. 2교시 계기교육'), text);
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

test('[fix1116-min-tail-cmd-closing] 안내·쪽지 글의 끝인사 줄(「첨부한 회의록 확인 부탁드려요」「회의록 작성은 … 부탁드려요」)은 회의록 명령이 아님 — 회의록 AI가 저절로 돌지 않음', () => {
  // 검토에서 찾은 것: 고치기 전처럼 할 일 없음(도우미·후보가 받음)
  for (const s of ['11월 학년 협의회 안내\n- 일시: 11/20(목) 15:00\n- 장소: 3학년 연구실\n회의록 작성은 이바다 선생님께 부탁드려요',
    '선생님들 안녕하세요\n오늘 3학년 협의회가 있었습니다\n첨부한 회의록 확인 부탁드려요',
    '교직원 여러분\n금일 부장회의 회의록 공유드립니다\n회의록 확인 부탁합니다']) {
    const r = route(s);
    assert.equal(r.intent, null, `${JSON.stringify(s)} → ${r.intent} ${r.confidence}`);
  }
  // 다른 사람에게 부탁하는 끝 줄도 넣을 글
  for (const s of ['선생님들께\n오늘 학년 협의회 했습니다\n회의록 정리해서 공유 부탁드려요', '선생님들 안녕하세요\n오늘 3학년 협의회 했습니다\n한가람 선생님 회의록 써 주세요',
    '오늘 협의회 결과입니다\n- 과학관으로 정함\n회의록은 교무부에 보내 주세요', '오늘 협의회 결과입니다\n- 과학관으로 정함\n회의록 작성 부탁드립니다']) {
    const r = route(s);
    assert.notEqual(r.intent, 'minutes', `${JSON.stringify(s)} → ${r.intent} ${r.confidence}`);
  }
  // 문서 다듬기도: 「한글 파일 맞춤법 확인 부탁드려요」는 쪽지 글의 끝 줄
  const d = route('선생님들께\n11월 가정통신문 초안 올렸습니다\n한글 파일 맞춤법 확인 부탁드려요');
  assert.notEqual(d.intent, 'docedit', `${d.intent} ${d.confidence}`);
  // 그 줄이 회의록 명령뿐이면 회의록(메모만 넘김)
  for (const [s, memo] of [['- 과학관으로 정함\n- 버스 2대\n3학년 협의회 회의록 써 줘', '- 과학관으로 정함\n- 버스 2대'],
    ['- 과학관으로 정함\n- 버스 2대\n이 메모 회의록으로 정리해 주세요', '- 과학관으로 정함\n- 버스 2대'], ['운동회 계획\n- 날짜 5/20\n회의록', '운동회 계획\n- 날짜 5/20']]) {
    const r = route(s);
    assert.equal(r.intent, 'minutes', `${JSON.stringify(s)} → ${r.intent} ${r.candidates}`);
    assert.equal(payloadFor('minutes', s).text, memo, s);
  }
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

test('[fix1116-min-docedit-topic] 교정·다듬기·맞춤법이 쪽지의 글감이면(뒤에 「쪽지 써 줘」 같은 다른 글이 이어지면) 문서 다듬기로 가지 않음 — 쪽지 글이 사라지지 않게', () => {
  for (const s of ['가정통신문 교정 부탁 쪽지 써 줘', '교감 선생님께 공문 교정 부탁드리는 쪽지 써 줘', '보고서 교정 부탁 쪽지 써 줘', '공문 다듬기 연수 안내 쪽지 써 줘',
    '가정통신문 맞춤법 검사해서 보내기 안내 쪽지 써 줘', '결과 보고서 맞춤법 고쳐서 내 달라고 쪽지 써 줘', '이번 주 가정통신문 교정 봐 주실 분 구하는 쪽지 써 줘',
    '보고서 다듬어서 제출 바란다는 쪽지 써 줘']) {
    const r = route(s);
    assert.notEqual(r.intent, 'docedit', `${s} → ${r.intent} ${r.candidates}`);
    assert.ok(r.intent === 'message' || r.candidates.includes('message'), `${s} → ${r.intent} ${r.candidates}`);
  }
  // 고치는 말로 끝나면(부탁 꼬리만 뒤에) 문서 다듬기
  for (const s of ['통신문 교정 부탁드려요', '파일 교정 부탁해', '공문 좀 다듬어 줘', '가정통신문 맞춤법 검사해 줘', '보고서 교정해 주세요', '공문 맞춤법 좀 봐 줄래?', '이거 손봐 줘']) {
    const r = route(s);
    assert.equal(r.intent, 'docedit', `${s} → ${r.intent} ${r.candidates}`);
  }
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
