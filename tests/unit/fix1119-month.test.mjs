/* 한 달 달력(스펙 2026-11-19-month-calendar-design) — 달력 칸·그날 할 것·달 옮기기·「쌤」 길 고르기. 예시 이름은 지어낸 것 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));

test('달력 칸: 일요일부터, 앞뒤 달 날짜는 inMonth=false, 달 옮기기·이름', async () => {
  const M = await import('../../web/menus/home/month-model.js');
  const nov = M.monthGrid('2026-11');
  assert.equal(nov.length, 5);
  assert.deepEqual(nov[0].map(c => c.date), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
  assert.deepEqual(nov[4].map(c => c.inMonth), [true, true, false, false, false, false, false]);
  const feb = M.monthGrid('2026-02'); // 2026년 2월 1일은 일요일, 28일은 토요일 → 4줄
  assert.equal(feb.length, 4);
  assert.equal(M.monthGrid('2026-08').length, 6, '6줄인 달');
  assert.equal(M.shiftMonth('2026-12', 1), '2027-01'); assert.equal(M.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(M.monthTitle('2027-02'), '2027년 2월');
  assert.ok(M.isMonth('2026-11') && !M.isMonth('2026-13') && !M.isMonth('11'));
});

test('그날 할 것: 공휴일·방학·학사일정·공문·연수·예산·기초학력·쪽지·회의 할 일, 차례·중복·눈에 띄게', async () => {
  const M = await import('../../web/menus/home/month-model.js');
  const it = M.monthItems({
    events: [{ date: '2026-11-20', title: '[제출] 청렴 실적', source: 'gongmun' }, { date: '2026-11-25', title: '학예회', source: 'event:e1' }, { date: '2026-11-11', title: '수학 경시', source: 'year:y1' },
      { date: '2026-11-30', title: '청렴교육(부패방지)', source: 'training' }],
    breaks: [{ from: '2026-11-26', to: '2026-11-27', label: '재량휴업일' }],
    courses: [{ title: '청렴교육', due: '2026-11-21', left: 2 }, { title: '안전교육', due: '2026-11-20', left: 0 }],
    budgets: [{ name: '과학실', due: '2026-11-22', left: 0 }, { name: '도서', due: '2026-11-21', left: 50000 }],
    camps: [{ id: 'c', name: '수학 교실', dates: ['2026-11-19', '2026-11-19', '2026-12-03', '2027-01-04'] }],
    messages: [{ title: '[다시 안내] 회신', due: '2026-11-21' }, { title: '[제출 안내] 회신', due: '2026-11-21' }],
    todos: [{ id: 'm1', task: '자료 정리', due: '2026-11-23' }]
  }, '2026-11', '2026-11-19');
  assert.deepEqual(it['2026-11-20'].map(r => [r.kind, r.hot]), [['gongmun', true], ['training', false]], '미제출 0명이면 눈에 띄지 않음');
  assert.deepEqual(it['2026-11-21'].map(r => r.kind), ['training', 'budget', 'message'], '종류 차례, 같은 쪽지(머리말만 다름)는 한 줄');
  assert.equal(it['2026-11-21'][1].text, '예산 「도서」 집행 마감 · 남은 50,000원');
  assert.equal(it['2026-11-22'][0].hot, false, '남은 돈 없으면 눈에 띄지 않음');
  assert.deepEqual(it['2026-11-25'][0].route, { to: 'event', id: 'e1' });
  assert.deepEqual(it['2026-11-11'][0].route, { to: 'year' });
  assert.equal(it['2026-11-30'][0].text, '필수연수 청렴교육(부패방지)');
  assert.equal(it['2026-11-19'][0].text, '기초학력 「수학 교실」 수업 2번');
  assert.ok(it['2026-12-03'] && !it['2027-01-04'], '칸에 보이는 다음 달 날짜까지만');
  assert.deepEqual(it['2026-11-26'].map(r => r.kind), ['off']);
  assert.deepEqual(it['2026-11-23'][0].route, { to: 'minutes', id: 'm1' });
  assert.equal(it['2026-11-25'][0].hot, false, '사흘 넘게 남은 것');
  assert.equal(M.monthCount(it, '2026-11'), 11, '쉬는 날·다음 달 칸은 빼고');
  const dec = M.monthItems({}, '2026-12', '2026-11-19');
  assert.equal(dec['2026-12-25'][0].text, '성탄절');
});

test('「쌤」: 이번 달·다음 달·12월 일정은 한 달 달력, 다른 일 낱말이 분명하면 그 일', async () => {
  const { routeText, payloadFor } = await import('../../web/core/chat-route.js');
  for (const q of ['이번 달 일정 보여 줘', '다음 달 달력', '한 달 달력 열어 줘', '12월 일정', '3월 학사일정 보여 줘', '달력 보여줘']) assert.equal(routeText(q).intent, 'month', q);
  assert.deepEqual(payloadFor('month', '다음 달 일정'), { text: '다음 달', mon: 0 });
  assert.deepEqual(payloadFor('month', '12월 일정'), { text: '', mon: 12 });
  for (const [q, want] of [['연간계획에 달력 일정 넣어 줘', 'year'], ['이번 달 공문 기한', 'gongmun'], ['11월 13일 보강 수업 넣어 줘', 'today']]) assert.equal(routeText(q).intent, want, q);
  assert.notEqual(routeText('학교 달력\n12월 1일 학예회\n12월 24일 방학식\n선생님들 참고해 주세요').intent, 'month', '붙여 넣은 글');
});
