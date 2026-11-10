// 메뉴마다 마지막 탭: 저장된 값 읽기, 열 탭 고르기(정한 탭 → 마지막 탭 → 첫 탭, 평가의 기존 앱 화면은 mode)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTabs, pickTab, TABS_KEY } from '../../web/core/nav-tabs.js';
import { isYearKey } from '../../web/core/years.js';

const menu = (id, ...tabs) => ({ id, tabs: tabs.map(t => ({ id: t })) });
const plan = menu('plan', 'year', 'event', 'class', 'report');
const evaluate = menu('evaluate', 'pyeongeo', 'cc', 'hk', 'gr', 'unit', 'activity');
const LEGACY = ['pyeongeo', 'cc', 'hk', 'gr'];

test('저장된 값: 망가졌거나 없으면 빈 것, 글자가 아닌 탭은 버림', () => {
  for (const bad of [null, '', '망가진 값', '[1,2]', '"plan"', '3']) assert.deepEqual(parseTabs(bad), {}, String(bad));
  assert.deepEqual(parseTabs(JSON.stringify({ plan: 'event', class: 3, etc: null, evaluate: 'unit' })), { plan: 'event', evaluate: 'unit' });
});

test('공통 키(학년도를 옮겨도 그대로, 백업에 넣지 않음)', () => {
  assert.equal(TABS_KEY, 'ssam:nav:tabs');
  assert.ok(!isYearKey(TABS_KEY.slice('ssam:'.length)));
});

test('정한 탭이 있으면 그 탭 (채팅·받은 편지함·브리핑 링크)', () => {
  assert.equal(pickTab(plan, 'report', { plan: 'event' }), 'report');
  assert.equal(pickTab(evaluate, 'gr', { evaluate: 'unit' }, { legacy: LEGACY, mode: 'hk' }), 'gr');
});

test('탭을 정하지 않으면 마지막으로 연 탭, 없거나 이제 없는 탭이면 첫 탭', () => {
  assert.equal(pickTab(plan, undefined, { plan: 'event' }), 'event');
  assert.equal(pickTab(plan, undefined, {}), 'year');
  assert.equal(pickTab(plan, undefined, null), 'year');
  assert.equal(pickTab(plan, undefined, { plan: 'gone' }), 'year');
  assert.equal(pickTab(plan, 'gone', { plan: 'class' }), 'class');
  assert.equal(pickTab(plan, undefined, { class: 'event' }), 'year', '다른 메뉴의 탭은 쓰지 않음');
});

test('평가: 새 탭(단원평가·활동지)은 마지막 탭, 기존 앱 화면은 지금 mode를 따름', () => {
  const o = mode => ({ legacy: LEGACY, mode });
  assert.equal(pickTab(evaluate, undefined, { evaluate: 'unit' }, o('hk')), 'unit');
  assert.equal(pickTab(evaluate, undefined, { evaluate: 'activity' }, o('pyeongeo')), 'activity');
  assert.equal(pickTab(evaluate, undefined, { evaluate: 'hk' }, o('gr')), 'gr', '기존 앱이 스스로 화면을 바꿨으면 그 화면');
  assert.equal(pickTab(evaluate, undefined, { evaluate: 'hk' }, o('hk')), 'hk');
  assert.equal(pickTab(evaluate, undefined, {}, o('cc')), 'cc', '처음이면 기존 앱 화면(예전과 같음)');
  assert.equal(pickTab(evaluate, undefined, {}, o(undefined)), 'pyeongeo');
  assert.equal(pickTab(evaluate, undefined, { evaluate: 'hk' }, o(undefined)), 'hk', '기존 앱이 아직 없으면 마지막 탭');
  assert.equal(pickTab(evaluate, undefined, { evaluate: 'gone' }, o('unit')), 'pyeongeo', 'mode가 기존 앱 화면이 아니면 쓰지 않음');
});
