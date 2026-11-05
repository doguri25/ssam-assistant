// 2026-11-05 고침(단원평가): 결과 모아 보기 학기 거르기
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { filterTests, termOf } from '../../web/menus/evaluate/unit/unit-model.js';
import { termOf as actTermOf } from '../../web/menus/evaluate/activity/activity-read.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const SUMMER = { label: '여름방학', from: '2026-07-24', to: '2026-08-16' };

test('[unit-term-6] 정답지에서 읽은 학기가 있으면 그 학기로 거름(8월 말에 본 2학기 평가는 2학기)', () => {
  store.useStorage(mem());
  const list = [{ id: 'a', subject: '국어', date: '2026-08-27', term: 2 }, { id: 'b', subject: '국어', date: '2026-08-27', term: 1 }];
  assert.deepEqual(filterTests(list, { term: 2 }).map(x => x.id), ['a']);
  assert.deepEqual(filterTests(list, { term: 1 }).map(x => x.id), ['b']);
});

test('[unit-term-6] 학기를 모르면 학교 여름방학 끝 다음 날부터 2학기(활동지와 같게), 방학을 모르면 3~8월 1학기', () => {
  store.useStorage(mem());
  const list = [{ id: 'a', subject: '국어', date: '2026-08-27', term: null }, { id: 'b', subject: '국어', date: '2026-08-10' }, { id: 'c', subject: '수학', date: '2026-10-01' }];
  assert.deepEqual(filterTests(list, { term: 1 }).map(x => x.id), ['a', 'b']);
  store.set('school', { breaks: [SUMMER] });
  assert.deepEqual(filterTests(list, { term: 2 }).map(x => x.id), ['a', 'c']);
  assert.deepEqual(filterTests(list, { term: 1 }).map(x => x.id), ['b']);
  assert.equal(termOf('2026-08-27', [SUMMER]), actTermOf('2026-08-27', [SUMMER]));
  assert.equal(termOf('2026-08-27', [SUMMER]), 2);
  // 날짜가 없으면 예전처럼 2학기
  assert.equal(termOf(''), 2);
});
