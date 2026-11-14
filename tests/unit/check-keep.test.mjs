// 기재 점검 「그대로 두기」(스펙 2026-11-14-eval-redesign §7): 둔 곳의 열쇠를 학년도 저장소 check:keep에 둠 → 다시 열어도 그대로 둔 채.
// 그 글이 점검에 들어왔는데 그 곳이 이제 없으면(고쳤거나 글이 바뀜) 열쇠를 지움. 이번에 읽지 못한 글의 열쇠는 남김
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { isYearKey } from '../../web/core/years.js';
import { KEEP_KEY, readKeep, addKeep, pruneKeep, clearKeep } from '../../web/menus/evaluate/check/check-keep.js';
import { issueKey } from '../../web/menus/evaluate/check/check-view.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m };
}
const k = (ref, w) => issueKey(ref, `${w} 문장.`, { kind: 'ban', start: 0, end: w.length, word: w, why: '' });

test('학년도 저장소 열쇠', () => {
  assert.equal(KEEP_KEY, 'check:keep');
  assert.ok(isYearKey(KEEP_KEY), '학년도마다 따로');
});

test('그대로 둔 곳: 더하고 다시 읽기(같은 것은 한 번), 저장 모양은 열쇠 목록', () => {
  const s = mem(), prev = store.useStorage(s);
  try {
    assert.equal(readKeep().size, 0);
    assert.ok(addKeep([k('hk:a:0', '학원'), k('py:P:u:high:1', '토익')]));
    addKeep([k('hk:a:0', '학원')]);
    const got = readKeep();
    assert.deepEqual([...got].sort(), [k('hk:a:0', '학원'), k('py:P:u:high:1', '토익')].sort());
    const raw = JSON.parse(s.getItem('ssam:check:keep'));
    assert.ok(Array.isArray(raw) && raw.length === 2 && raw.every(x => typeof x === 'string'), JSON.stringify(raw));
  } finally { store.useStorage(prev); }
});

test('정리: 읽은 글의 지금 없는 곳만 지움, 읽지 못한 글은 남김', () => {
  const s = mem(), prev = store.useStorage(s);
  try {
    const a = k('hk:a:0', '학원'), b = k('hk:b:0', '과외'), c = k('gr:g9:s1', '토익');
    addKeep([a, b, c]);
    pruneKeep(new Set(['hk:a:0', 'hk:b:0']), new Set([a]));
    assert.deepEqual([...readKeep()].sort(), [a, c].sort());
    clearKeep(new Set(['gr:g9:s1']));
    assert.deepEqual([...readKeep()], [a]);
    clearKeep();
    assert.equal(readKeep().size, 0);
  } finally { store.useStorage(prev); }
});

test('망가진 저장 값·저장소 없음에도 깨지지 않음', () => {
  const s = mem(), prev = store.useStorage(s);
  try {
    s.setItem('ssam:check:keep', '{"x":1}');
    assert.equal(readKeep().size, 0);
    s.setItem('ssam:check:keep', JSON.stringify(['ok', 3, null]));
    assert.deepEqual([...readKeep()], ['ok']);
    store.useStorage(null);
    assert.equal(readKeep().size, 0);
    assert.equal(addKeep(['x']), false);
  } finally { store.useStorage(prev); }
});

test('너무 많으면 오래된 것부터 버림', () => {
  const s = mem(), prev = store.useStorage(s);
  try {
    addKeep(Array.from({ length: 2100 }, (_, i) => `r${i}\u001fban\u001fx\u001fy`));
    const got = readKeep();
    assert.equal(got.size, 2000);
    assert.ok(got.has('r2099\u001fban\u001fx\u001fy') && !got.has('r0\u001fban\u001fx\u001fy'));
  } finally { store.useStorage(prev); }
});
