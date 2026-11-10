// 가정통신문 번역본 남은 고침(2026-11-10): M5 처음부터 다시 번역이 중간에 멈춰도 다시 번역하지 못한 줄은 전 번역을 남김,
// M6 번역하는 동안 선생님이 고친 줄은 새 번역으로 덮지 않음, M7 개인정보라 보내지 않은(한국어 그대로) 줄을 세어 내려받기 알림에 씀
import test from 'node:test';
import assert from 'node:assert/strict';
import { planTr, trPairs, missingCount, heldCount, bilingualLetter, mergeTr } from '../../web/menus/etc/letter-translate.js';

const OUT = { title: '현장체험학습 안내', date: '2026-11-06', body: ['안녕하십니까?', '정우진, 강민준, 이서연', '협조를 부탁드립니다.'], replyOn: false, reply: { title: '', fields: [], due: '' }, short: '' };

test('M5 처음부터 다시(all): 다 됐으면 새 번역으로 바꾸고, 중간에 멈췄으면(partial) 다시 번역하지 못한 줄은 전 번역을 남김', () => {
  const now = { a: 'OLD a', b: 'OLD b', c: 'OLD c' };
  assert.deepEqual(mergeTr(now, { a: 'NEW a', b: 'NEW b', c: 'NEW c' }, { all: true }), { a: 'NEW a', b: 'NEW b', c: 'NEW c' });
  assert.deepEqual(mergeTr(now, { a: 'NEW a' }, { all: true, partial: true }), { a: 'NEW a', b: 'OLD b', c: 'OLD c' });
  // 다 됐는데(멈추지 않음) 전 번역에만 있던 글은 버림(처음부터 다시)
  assert.deepEqual(mergeTr({ ...now, z: 'OLD z' }, { a: 'NEW a', b: 'NEW b', c: 'NEW c' }, { all: true }), { a: 'NEW a', b: 'NEW b', c: 'NEW c' });
  // 없는 줄만(all 아님): 저장해 둔 것에 새 번역을 더함
  assert.deepEqual(mergeTr({ a: 'OLD a' }, { b: 'NEW b' }), { a: 'OLD a', b: 'NEW b' });
});

test('M6 번역하는 동안 선생님이 고친 줄(edited)은 새 번역으로 덮지 않음(처음부터 다시도), 고치다 비운 줄은 새 번역', () => {
  assert.deepEqual(mergeTr({ a: 'OLD a', b: '선생님이 친 번역' }, { a: 'NEW a', b: 'NEW b' }, { edited: ['b'] }), { a: 'NEW a', b: '선생님이 친 번역' });
  assert.deepEqual(mergeTr({ a: 'OLD a', b: '선생님이 친 번역' }, { a: 'NEW a', b: 'NEW b' }, { all: true, edited: ['b'] }), { a: 'NEW a', b: '선생님이 친 번역' });
  assert.deepEqual(mergeTr({ a: 'OLD a' }, { a: 'NEW a', b: 'NEW b' }, { edited: ['b'] }), { a: 'NEW a', b: 'NEW b' }, '비운 칸');
  assert.deepEqual(mergeTr(null, { a: 'NEW a' }), { a: 'NEW a' });
});

test('M7 개인정보라 보내지 않은 줄(번역이 한국어 그대로)은 heldCount로 세고, 번역본 글에 held로 알림(missing과 따로)', () => {
  const plan = planTr(OUT);
  assert.equal(plan.personal, 1);
  const units = plan.finish(Object.fromEntries(plan.jobs.map(j => [j.id, `VI: ${j.text}`]))).units;
  assert.equal(units['정우진, 강민준, 이서연'], '정우진, 강민준, 이서연');
  const p = trPairs(OUT, units);
  assert.equal(missingCount(p), 0);
  assert.equal(heldCount(p), 1);
  const b = bilingualLetter(OUT, units, 'vi');
  assert.equal(b.missing, 0);
  assert.equal(b.held, 1);
  assert.deepEqual(b.body, ['안녕하십니까?', 'VI: 안녕하십니까?', '정우진, 강민준, 이서연', '협조를 부탁드립니다.', 'VI: 협조를 부탁드립니다.']);
  // 같은 글은 한 번, 그대로 두는 줄(날짜만)·빈 줄은 세지 않음
  const dup = { ...OUT, body: [...OUT.body, '정우진, 강민준, 이서연', '2026. 11. 12.(목)', ''] };
  assert.equal(heldCount(trPairs(dup, units)), 1);
  assert.equal(bilingualLetter(OUT, {}, 'vi').held, 0);
});
