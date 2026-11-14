// 품의: 「1인당 1만원」「부스당 3만원」처럼 「~당」 단가를 쓰면 품명에 「1인당」「부스당」이 붙어 나오던 것(규칙으로 읽을 때도, AI가 읽을 때도)
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { SSAM: { ai: { generate: async () => ({ text: '{}' }), engineReady: () => false, errMsg: c => c } } };
const { parseLines } = await import('../../web/menus/purchase/intake.js');
const { plainItemName } = await import('../../web/menus/purchase/rules.js');
const one = t => { const r = parseLines(t); assert.equal(r.items.length, 1, t + ' ' + JSON.stringify(r)); const i = r.items[0]; return [i.name, i.unit, i.qty, i.price]; };

test('「~당」 단가: 품명에서 빼고 수량·단가는 그대로', () => {
  assert.deepEqual(one('간식 30명 1인당 1만원'), ['간식', '명', '30', '10000']);
  assert.deepEqual(one('간식 1인당 5,000원 30명'), ['간식', '명', '30', '5000']);
  assert.deepEqual(one('학생 간식 1인당 3천원 25명'), ['학생 간식', '명', '25', '3000']);
  assert.deepEqual(one('도시락 인당 8천원 25인분'), ['도시락', '인분', '25', '8000']);
  assert.deepEqual(one('체험 부스 재료 부스당 3만원 12개'), ['체험 부스 재료', '개', '12', '30000']);
  assert.deepEqual(one('현수막 장당 4만원 2장'), ['현수막', '장', '2', '40000']);
  assert.deepEqual(one('복사지 박스당 25,000원 3박스'), ['복사지', '박스', '3', '25000']);
  assert.deepEqual(one('버스 대당 50만원 2대'), ['버스', '대', '2', '500000']);
});

test('수량이 없으면 「~당」의 단위를 단위 칸에(「강사 시간당 5만원」→ 시간)', () => {
  assert.deepEqual(one('강사 시간당 5만원'), ['강사', '시간', '1', '50000']);
  assert.deepEqual(one('다과 1인당 5천원'), ['다과', '명', '1', '5000']);
});

test('「당」으로 끝나는 진짜 이름(강당·식당·사탕)은 그대로', () => {
  assert.equal(one('강당 대관료 1식 50만원')[0], '강당 대관료');
  assert.equal(one('식당 이용권 10장 5천원')[0], '식당 이용권');
  assert.equal(one('사탕 3봉지 2천원')[0], '사탕');
});

test('AI가 읽은 품명도 정리: 「간식 (1인당)」「학생 간식 1인당」「부스당 재료」', () => {
  assert.equal(plainItemName('간식 (1인당)'), '간식');
  assert.equal(plainItemName('학생 간식 1인당'), '학생 간식');
  assert.equal(plainItemName('부스당 재료'), '재료');
  assert.equal(plainItemName('강당 대관'), '강당 대관');
  assert.equal(plainItemName('1인당'), '1인당', '다 빼면 비니 그대로');
});
