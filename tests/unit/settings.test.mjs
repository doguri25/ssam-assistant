import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useStorage } from '../../web/core/store.js';
import { getSchool, setSchool, getPurchaseLimit, setPurchaseLimit, defaultYear } from '../../web/core/settings.js';

function fake() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

test('계약 기준 금액 기본값은 2,000만 원', () => {
  useStorage(fake());
  assert.equal(getPurchaseLimit(), 20000000);
});

test('음수·숫자가 아닌 기준 금액은 거절하고 값은 그대로', () => {
  useStorage(fake());
  assert.equal(setPurchaseLimit(-1), false);
  assert.equal(setPurchaseLimit('abc'), false);
  assert.equal(getPurchaseLimit(), 20000000);
  assert.equal(setPurchaseLimit(30000000), true);
  assert.equal(getPurchaseLimit(), 30000000);
});

test('학년도 기본값: 9월까지는 올해, 10월부터는 다음 해', () => {
  assert.equal(defaultYear(new Date(2026, 8, 30)), 2026);
  assert.equal(defaultYear(new Date(2026, 9, 1)), 2027);
});

test('학교 정보 기본값', () => {
  useStorage(fake());
  const s = getSchool(new Date(2026, 9, 29));
  assert.deepEqual(s, { name: '', year: 2027, classes: 0, students: 0, breaks: [] });
});

test('방학 목록에서 시작일이 끝일보다 늦거나 날짜 모양이 아닌 항목은 버림', () => {
  useStorage(fake());
  setSchool({ name: '쌤초', year: 2027, classes: 24, students: 560, breaks: [
    { from: '2027-07-24', to: '2027-08-20', label: '여름방학' },
    { from: '2027-12-31', to: '2027-12-01', label: '거꾸로' },
    { from: '7월', to: '8월', label: '모양 틀림' }
  ] });
  const s = getSchool();
  assert.equal(s.name, '쌤초');
  assert.deepEqual(s.breaks, [{ from: '2027-07-24', to: '2027-08-20', label: '여름방학' }]);
});

test('학급 수·학생 수는 0 이상 정수로', () => {
  useStorage(fake());
  setSchool({ classes: -3, students: 12.7 });
  const s = getSchool();
  assert.equal(s.classes, 0);
  assert.equal(s.students, 12);
});
