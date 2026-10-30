// 단원평가 답안 스캔: 모아찍기(한 면에 2쪽)는 왼쪽·오른쪽으로 자르고, 양면 스캔에서 거꾸로 나온 뒷면은 돌림
import test from 'node:test';
import assert from 'node:assert/strict';
import { pagePlan } from '../../web/menus/evaluate/unit/unit-pages.js';

const L = { w: 1200, h: 800 }, P = { w: 800, h: 1200 };

test('모아찍기 + 뒷면 거꾸로: 앞면은 왼쪽·오른쪽, 뒷면은 돌린 뒤 왼쪽·오른쪽', () => {
  assert.deepEqual(pagePlan([L, L], { twoUp: true, flipBack: true }), [
    { src: 0, rotate: 0, half: 'L' }, { src: 0, rotate: 0, half: 'R' },
    { src: 1, rotate: 180, half: 'L' }, { src: 1, rotate: 180, half: 'R' }]);
});

test('세로로 긴 쪽은 모아찍기여도 자르지 않음, 뒷면 거꾸로만이면 둘째·넷째 장만 돌림', () => {
  assert.deepEqual(pagePlan([P], { twoUp: true }), [{ src: 0, rotate: 0, half: null }]);
  assert.deepEqual(pagePlan([P, P, P], { flipBack: true }).map(x => x.rotate), [0, 180, 0]);
});

test('설정이 없으면 그대로', () => {
  assert.deepEqual(pagePlan([L, P], {}), [{ src: 0, rotate: 0, half: null }, { src: 1, rotate: 0, half: null }]);
});
