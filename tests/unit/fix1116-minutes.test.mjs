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

