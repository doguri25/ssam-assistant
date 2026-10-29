import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, set, remove, list, useStorage } from '../../web/core/store.js';

function fake(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _m: m
  };
}

test('저장한 값을 그대로 읽음 (키 앞에 ssam:)', () => {
  const s = fake(); useStorage(s);
  set('a', { x: 1 });
  assert.deepEqual(get('a'), { x: 1 });
  assert.equal(s._m.get('ssam:a'), '{"x":1}');
});

test('JSON이 아닌 값이면 기본값', () => {
  useStorage(fake({ 'ssam:a': '{깨짐' }));
  assert.equal(get('a', 5), 5);
});

test('없는 키는 기본값', () => {
  useStorage(fake());
  assert.equal(get('없음', 'd'), 'd');
});

test('list는 그 접두어의 ssam: 키만 돌려줌', () => {
  useStorage(fake({ 'ssam:plan:1': '1', 'ssam:plan:2': '2', 'ssam:other': '3', 'plan:9': '9' }));
  assert.deepEqual(list('plan:').sort(), ['plan:1', 'plan:2']);
});

test('remove는 그 키를 지움', () => {
  const s = fake({ 'ssam:a': '1' }); useStorage(s);
  remove('a');
  assert.equal(s._m.has('ssam:a'), false);
});

test('저장소가 예외를 던져도 set은 밖으로 던지지 않고 false', () => {
  useStorage({ getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {}, key: () => null, length: 0 });
  assert.equal(set('a', 1), false);
});

test('저장소가 없으면 읽기는 기본값, 쓰기는 false', () => {
  useStorage(null);
  assert.equal(get('a', 3), 3);
  assert.equal(set('a', 1), false);
});
