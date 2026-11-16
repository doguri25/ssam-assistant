/* 2026-11-16 회의록 버그 고침: AI 줄 앞 날짜·소수를 번호로 잘라 내던 것, 메모 뒤 끝 줄 「회의록 써 줘」가 다른 일로 가던 것,
   「이 공문 맞춤법 고쳐 줘」「한글 파일 공문체로」가 공문 처리로 가던 것, 마지막 할 일을 빼도 저장되지 않던 것,
   다시 정리할 때 AI가 이름을 비우면 종류가 「기타」로 바뀌던 것. 이름은 모두 지어낸 것 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { normMinutes, keepFields } from '../../web/menus/etc/minutes-ai.js';
import { blankMinutes, listMinutes, putMinutes } from '../../web/menus/etc/minutes-model.js';
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
