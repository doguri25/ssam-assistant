// 학년도 고침(2026-11-10): 새 학년도에 가져가는 방학·재량휴업일, 지금 학년도를 백업 파일로 되돌릴 때 다른 탭에 알림
import test from 'node:test';
import assert from 'node:assert/strict';
import { carryOver, moveTo } from '../../web/core/years.js';
import { memArchive } from '../../web/core/archive.js';

const J = v => JSON.stringify(v);

test('새 학년도에 가져가기: 2월에 넣어 둔 새 학년도(3월 1일부터)의 방학·재량휴업일은 가져가고, 지난 학년도 방학은 비움', () => {
  const school = { name: '가나초', classes: 12, students: 280, breaks: [
    { from: '2026-12-24', to: '2027-02-28', label: '겨울방학' }, { from: '2027-02-27', to: '2027-03-01', label: '봄방학' },
    { from: '2027-03-03', to: '2027-03-03', label: '재량휴업일' }, { from: '2027-07-23', to: '2027-08-22', label: '여름방학' }, 'x', { from: 3 }] };
  const c = JSON.parse(carryOver({ school: J(school) }, 2027).school);
  assert.deepEqual(c.breaks, [{ from: '2027-03-03', to: '2027-03-03', label: '재량휴업일' }, { from: '2027-07-23', to: '2027-08-22', label: '여름방학' }]);
  assert.deepEqual(JSON.parse(carryOver({ school: J({ ...school, breaks: school.breaks.slice(0, 2) }) }, 2027).school).breaks, []);
});

/* 다른 탭(shell.js)은 ssam:years가 바뀔 때만 다시 엶 — 같은 값을 다시 쓰면 storage 알림이 가지 않음 */
function watched(init) {
  const m = new Map(Object.entries(init)), events = [];
  const set = (k, v) => { const old = m.has(k) ? m.get(k) : null; v = String(v); m.set(k, v); if (old !== v) events.push(k); };
  return { events, getItem: k => (m.has(k) ? m.get(k) : null), setItem: set, removeItem: k => { if (m.has(k)) { m.delete(k); events.push(k); } }, key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

test('지금 학년도를 백업 파일 내용으로 바꾸면(같은 학년도로 옮김) 다른 탭이 알 수 있게 ssam:years가 바뀜, 값은 그대로', async () => {
  const ls = watched({ 'ssam:years': J({ current: 2026 }), 'ssam:class:info': J({ grade: 3, room: 1 }) });
  const r = await moveTo(2026, { ls, archive: memArchive(), data: { 'class:info': J({ grade: 5, room: 2 }) }, today: '2026-10-29' });
  assert.deepEqual(r, { ok: true });
  assert.ok(ls.events.includes('ssam:years'), ls.events.join(','));
  assert.deepEqual(JSON.parse(ls.getItem('ssam:years')), { current: 2026 });
  assert.equal(ls.getItem('ssam:class:info'), J({ grade: 5, room: 2 }));
});

test('같은 학년도로 옮기다 쓰지 못하면 학년도 표시(ssam:years)도 되돌림', async () => {
  const ls = watched({ 'ssam:years': J({ current: 2026 }), 'ssam:hk': '{}' });
  const set = ls.setItem;
  let n = 0;
  ls.setItem = (k, v) => { if (k === 'ssam:years' && !n++) throw new Error('quota'); set(k, v); }; // 지운 뒤 다시 쓰기가 한 번 실패
  const r = await moveTo(2026, { ls, archive: memArchive(), data: { hk: '{"x":1}' }, today: '2027-02-10' });
  assert.deepEqual(r, { ok: false, code: 'WRITE_FAILED' });
  assert.equal(ls.getItem('ssam:hk'), '{}');
  assert.deepEqual(JSON.parse(ls.getItem('ssam:years')), { current: 2026 });
});
