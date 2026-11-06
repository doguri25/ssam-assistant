// 피드백 쪽지·결과지를 번호별로 한 장씩: 기억하는 설정(학년도와 상관없이) + 활동지 쪽지·단원평가 결과지의 쪽 나누기
import test from 'node:test';
import assert from 'node:assert/strict';
import { useStorage } from '../../web/core/store.js';
import { isYearKey } from '../../web/core/years.js';
import { onePerPage, setOnePerPage } from '../../web/core/slip-layout.js';
import { slipsDoc } from '../../web/menus/evaluate/activity/activity-docs.js';
import { feedbackDoc } from '../../web/menus/evaluate/unit/unit-docs.js';
import { newTest } from '../../web/menus/evaluate/unit/unit-model.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const breaks = doc => doc.blocks.filter(b => b.type === 'break').length;
// 학생 칸이 시작하는 머리 줄 앞의 블록이 쪽 나누기인지
const headsAfterBreak = doc => doc.blocks.map((b, i) => (b.type === 'h' ? (doc.blocks[i - 1] || {}).type === 'break' : null)).filter(v => v !== null);

test('번호별로 한 장씩: 처음엔 꺼짐, 켜고 끄면 기억, 학년도를 옮겨도 남는 설정', () => {
  useStorage(mem());
  assert.equal(onePerPage(), false);
  assert.equal(setOnePerPage(true), true);
  assert.equal(onePerPage(), true);
  setOnePerPage(false);
  assert.equal(onePerPage(), false);
  assert.equal(isYearKey('slips'), false);
});

const ACT = n => ({
  meta: { title: '물의 여행' },
  items: [{ no: 1, type: 'write', ask: '설명하기' }, { no: 2, type: 'draw', ask: '그리기' }],
  students: [...Array(n)].map((_, i) => ({ no: i + 1, skip: false, status: 'done', marks: { 1: { mark: 'o' }, 2: { mark: 't' } }, level: 'good', good: `잘함${i + 1}`, next: `더${i + 1}` }))
    .concat([{ no: n + 1, skip: true, status: 'idle' }])
});

test('활동지 피드백 쪽지: 기본은 한 쪽에 4명, 한 장씩이면 번호마다 새 쪽', () => {
  const a = ACT(6);
  const four = slipsDoc(a);
  assert.equal(breaks(four), 1);
  const one = slipsDoc(a, { one: true });
  assert.equal(breaks(one), 5);
  assert.deepEqual(headsAfterBreak(one), [false, true, true, true, true, true]);
  assert.ok(one.blocks.some(b => b.type === 'h' && b.text === '6번 · 물의 여행'));
  assert.ok(!one.blocks.some(b => b.type === 'h' && b.text.startsWith('7번')), '채점하지 않은 학생은 빼요');
  assert.equal(breaks(slipsDoc(ACT(1), { one: true })), 0, '한 명이면 쪽 나누기 없음');
});

const ITEMS = [{ no: 1, content: '내용 파악', domain: '이해', type: 'choice', answer: '③', points: 50, criteria: '', pages: '36쪽' },
  { no: 2, content: '낱말 뜻', domain: '지식', type: 'choice', answer: '②', points: 50, criteria: '', pages: '40쪽' }];
const C = pts => ({ read: pts ? '③' : '①', pts, ai: pts, flag: '', why: '', ok: true, manual: false });
const UNIT = n => ({ ...newTest({ meta: { subject: '국어', grade: 3, term: 2, unitNo: 1, unitName: '이해', round: 1, date: '2026-10-20' }, key: { domains: ['지식', '이해'], items: ITEMS }, paper: { text: '' } }),
  id: 'u', students: [...Array(n)].map((_, i) => ({ no: i + 1, skip: false, status: 'done', items: { 1: C(50), 2: C(i % 2 ? 0 : 50) }, good: 'G', cheer: 'C' })) });

test('단원평가 결과지: 기본은 2명마다 쪽·가운데 자르는 줄, 한 장씩이면 번호마다 새 쪽이고 자르는 줄 없음', () => {
  const t = UNIT(5);
  const two = feedbackDoc(t, t.students);
  assert.equal(breaks(two), 2);
  assert.ok(two.blocks.some(b => b.type === 'p' && b.text.startsWith('✂')));
  const one = feedbackDoc(t, t.students, { one: true });
  assert.equal(breaks(one), 4);
  assert.deepEqual(headsAfterBreak(one), [false, true, true, true, true]);
  assert.ok(!one.blocks.some(b => b.type === 'p' && b.text.startsWith('✂')), '자르는 줄');
});
