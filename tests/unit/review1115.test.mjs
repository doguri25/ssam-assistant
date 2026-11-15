// 버그 사냥 합친 뒤 새 검토(2026-11-15)에서 나온 것 — 고치기 전에 실패하는지 먼저 봄
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
store.useStorage(mem());
const E = await import('../../web/menus/plan/event-model.js');
const last = { id: 'r1', kind: 'last', name: '2026 운동회 계획서', text: 'Ⅰ. 목적\nⅡ. 방침\nⅢ. 세부 운영 계획\n1. 일시\nⅣ. 평가' };
const ev = (plan, extra = {}) => ({ ...E.newEvent(), name: '가을 운동회', purpose: '체력 기르기', date: '2027-05-06', grades: '전교생', place: '운동장', refs: [last],
  options: [{ label: '안', summary: '', timetable: [{ time: '09:00', activity: '개회식', place: '운동장' }, { time: '10:00', activity: '이어달리기', place: '운동장' }], pros: [], staffNeed: '', budget: [{ name: '상품', amount: 100000 }] }], picked: 0,
  docs: { plan, safety: '', letter: '', rain: '', done: false }, ...extra });

test('[ev-outline-sub] 큰 제목(Ⅳ. 평가)으로 시작하는 「1.」 작은 줄을 큰 제목으로 올리지 않음', () => {
  const plan = 'Ⅰ. 목적\n가. 체력을 기른다.\nⅡ. 방침\n가. 모두 참여\nⅢ. 세부 운영 계획\n1. 일시 및 장소: 운동장, 개회식·이어달리기\n2. 평가 방법: 설문\nⅣ. 평가\n가. 만족도 설문(상품 수령 확인)';
  const heads = E.docDoc(ev(plan), 'plan').blocks.filter(b => b.type === 'h').map(b => b.text);
  assert.deepEqual(heads, ['Ⅰ. 목적', 'Ⅱ. 방침', 'Ⅲ. 세부 운영 계획', 'Ⅳ. 평가']);
});

test('[ev-outline-toc] 계획서 글 앞에 차례가 있어도 큰 제목은 본문 자리에서 나눔', () => {
  const plan = 'Ⅰ. 목적\nⅡ. 방침\nⅢ. 세부 운영 계획\nⅣ. 평가\nⅠ. 목적\n가. 체력을 기른다.\nⅡ. 방침\n가. 모두 참여\nⅢ. 세부 운영 계획\n1. 개회식 · 이어달리기\nⅣ. 평가\n가. 만족도 설문(상품)';
  const blocks = E.docDoc(ev(plan), 'plan').blocks;
  const i = blocks.findIndex(b => b.type === 'h' && b.text === 'Ⅱ. 방침');
  assert.ok(i > 0, JSON.stringify(blocks));
  assert.equal(blocks[i - 1].type, 'p', '목적 칸 글이 큰 제목 사이에 있어야 함: ' + JSON.stringify(blocks));
  assert.match(blocks[i - 1].text, /체력을 기른다/);
});

test('[ev-outline-tables] 작년 목차로 쓴 계획서 글에 시간표·예산이 없으면 붙임으로 더함(있으면 더하지 않음)', () => {
  const bare = 'Ⅰ. 목적\n가. 체력을 기른다.\nⅡ. 방침\n가. 모두 참여\nⅢ. 세부 운영 계획\n가. 학년별 경기\nⅣ. 평가\n가. 만족도 설문';
  const doc = E.docDoc(ev(bare), 'plan');
  const heads = doc.blocks.filter(b => b.type === 'h').map(b => b.text);
  assert.deepEqual(heads, ['Ⅰ. 목적', 'Ⅱ. 방침', 'Ⅲ. 세부 운영 계획', 'Ⅳ. 평가', '붙임 1. 시간표', '붙임 2. 예산 내역']);
  const tables = doc.blocks.filter(b => b.type === 'table');
  assert.deepEqual(tables[0].rows[1], ['09:00', '개회식', '운동장']);
  assert.deepEqual(tables[1].rows.at(-1), ['합계', '100,000']);
  const full = 'Ⅰ. 목적\n가. 체력을 기른다.\nⅡ. 방침\n가. 모두 참여\nⅢ. 세부 운영 계획\n가. 09:00 개회식\n나. 10:00 이어달리기\nⅣ. 평가\n가. 예산: 상품 100,000원';
  assert.deepEqual(E.docDoc(ev(full), 'plan').blocks.filter(b => b.type === 'h').map(b => b.text), ['Ⅰ. 목적', 'Ⅱ. 방침', 'Ⅲ. 세부 운영 계획', 'Ⅳ. 평가']);
});
