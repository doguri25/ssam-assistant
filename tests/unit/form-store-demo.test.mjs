// 둘러보기(체험용 학년도) 중에는 학교 양식을 지우지 않음 — 양식은 학년도와 상관없이 하나라 체험이 끝나도 되돌릴 수 없음(검토 #3)
import test from 'node:test';
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const { forms, DEMO_DEL } = await import('../../web/core/form-store.js');
const { DEMO_YEAR } = await import('../../web/core/years.js');

test('체험용 학년도에서는 양식 지우기를 막고(code DEMO·알림 글), 진짜 학년도에서는 지움', async () => {
  const f = await forms('demo-test');
  await f.put({ id: 'fm1', name: '양식', kind: 'plain', plain: '본문', savedAt: 1 });
  mem.set('ssam:years', JSON.stringify({ current: DEMO_YEAR }));
  await assert.rejects(f.del('fm1'), e => e.code === 'DEMO' && e.message === DEMO_DEL);
  assert.equal((await f.list()).length, 1, '그대로 있음');
  mem.set('ssam:years', JSON.stringify({ current: 2026 }));
  await f.del('fm1');
  assert.equal((await f.list()).length, 0);
});
