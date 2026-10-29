import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, set, remove, list, useStorage } from '../../web/core/store.js';
import * as store from '../../web/core/store.js';

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

test('저장이 실패하면(저장 공간 꽉 참) 알림 함수를 부름, 멈춰 둔 동안은 부르지 않음', () => {
  const m = new Map(), seen = [];
  store.useStorage({ getItem: k => m.get(k) ?? null, setItem: (k, v) => { if (k.includes('big')) throw new Error('QuotaExceededError'); m.set(k, v); }, removeItem: k => m.delete(k), key: () => null, length: 0 });
  const off = store.onFail(k => seen.push(k));
  assert.equal(store.set('ok', 1), true);
  assert.equal(store.set('big', 1), false);
  store.freeze(); store.set('big', 2); store.unfreeze();
  off();
  store.set('big', 3);
  assert.deepEqual(seen, ['big']);
});

test('미뤄 둔 저장: flushAll이 등록한 함수를 모두 부르고, 뺀 함수는 부르지 않음', () => {
  const seen = [];
  const a = store.onFlush(() => seen.push('a'));
  store.onFlush(() => seen.push('b'));
  a();
  store.flushAll();
  assert.deepEqual(seen, ['b']);
});

test('저장 공간 사용량: 이 사이트의 모든 키·값 글자 수를 약 5MB(5,242,880자)와 견줌', () => {
  const m = new Map([['ssam:a', 'x'.repeat(1000)], ['other', 'y'.repeat(2000)]]);
  const s = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
  const u = store.usage(s);
  assert.equal(u.used, 'ssam:a'.length + 1000 + 'other'.length + 2000);
  assert.equal(u.limit, 5242880);
  assert.ok(Math.abs(u.ratio - u.used / 5242880) < 1e-9);
  assert.deepEqual(store.usage(null), { used: 0, limit: 5242880, ratio: 0 });
});
