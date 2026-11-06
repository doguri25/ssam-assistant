// 한 줄에 품목과 일시·장소·목적을 쉼표로 이어 쓴 넣기(「알코올램프 10개 5,000원, 다음 주 화요일 과학실 실험」):
// 수량·금액이 있는 조각만 품목으로 읽고, 숫자 없는 조각은 품명에 붙이지 않음
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLines } from '../../web/menus/purchase/intake.js';

const one = t => { const r = parseLines(t); assert.equal(r.items.length, 1, JSON.stringify(r)); return r.items[0]; };

test('쉼표 뒤 일시·장소·목적은 품명에 붙지 않음', () => {
  const a = one('알코올램프 10개 5,000원, 다음 주 화요일 과학실 실험');
  assert.deepEqual([a.name, a.unit, a.qty, a.price], ['알코올램프', '개', '10', '5000']);
  assert.equal(one('A4 용지 5박스 2만원, 3학년 교실용').name, 'A4 용지');
  assert.equal(one('다음 주 금요일 체육대회, 줄다리기 줄 2개 3만원').name, '줄다리기 줄');
});

test('숫자 속 쉼표·괄호 속 쉼표·품목을 이룬 조각은 그대로', () => {
  const b = one('볼펜(검정, 빨강) 10개 500원');
  assert.deepEqual([b.name, b.qty, b.price], ['볼펜(검정, 빨강)', '10', '500']);
  const c = one('A4 용지 5박스, 2만원');
  assert.deepEqual([c.name, c.qty, c.price], ['A4 용지', '5', '20000']);
  const d = one('물티슈 10팩, 100매, 1,200원');
  assert.deepEqual([d.name, d.spec, d.qty, d.price], ['물티슈', '100매', '10', '1200']);
  assert.equal(one('알코올램프 10개 5000원').name, '알코올램프');
});
