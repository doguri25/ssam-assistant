// 학년도: 공통 키와 학년도 키 나누기, 백업 파일, 새 학년도에 가져가는 것, 학년도 옮기기(보관함), 저장 멈춤
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { schoolYearOf } from '../../web/core/calendar.js';
import { schoolYearOf as fromClass } from '../../web/menus/class/class-import.js';
import { memArchive } from '../../web/core/archive.js';
import { isYearKey, getYears, ensureYears, snapshot, carryOver, makeBackup, parseBackup, moveTo } from '../../web/core/years.js';

function mem(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, dump: () => Object.fromEntries(m) };
}
const J = v => JSON.stringify(v);
const seed = () => mem({
  'ssam:engine': J({ engine: 'claude', keys: { claude: 'sk-secret' } }), 'ssam:theme': J('mono'), 'ssam:nav': J({ menu: 'class' }), 'ssam:mode': 'hk', 'ssam:mig:fable': '1',
  'ssam:class:log': J({ '2026-10-28': { 1: { subject: '국어', status: 'done' } } }), 'ssam:class:subjects': J([{ id: 'a', name: '국어', lessons: [] }]),
  'ssam:hk': J({ students: [{ id: 's', no: 1 }] }), 'ssam:yearplans': J([{ id: 'p', name: '독서' }]), 'ssam:events': J([{ id: 'e', name: '운동회' }]),
  'ssam:calendar': J([{ date: '2027-02-27', title: '졸업식', source: 'year:p' }, { date: '2027-03-02', title: '입학식', source: 'year:p' }]),
  'ssam:school': J({ name: '가나초', year: 2027, classes: 12, students: 280, breaks: [{ from: '2026-12-24', to: '2027-02-28', label: '겨울방학' }] }),
  'other:x': '1'
});

test('학년도 = 3월~다음 해 2월, 학급 메뉴와 같은 답', () => {
  assert.equal(schoolYearOf('2027-02-10'), 2026); assert.equal(schoolYearOf('2026-03-02'), 2026);
  assert.equal(fromClass('2026-10-29'), schoolYearOf('2026-10-29'));
});

test('공통 키와 학년도 키', () => {
  for (const k of ['class:log', 'hk', 'school', 'yearplans', 'events', 'calendar', 'plans', 'sets:x']) assert.ok(isYearKey(k), k);
  for (const k of ['engine', 'theme', 'nav', 'mode', 'updSkip', 'years', 't', 'mig:fable']) assert.ok(!isYearKey(k), k);
});

test('지금 학년도: 없으면 오늘이 든 학년도', () => {
  assert.deepEqual(getYears(mem(), '2026-10-29'), { current: 2026 });
  assert.deepEqual(getYears(mem({ 'ssam:years': J({ current: 2027 }) }), '2026-10-29'), { current: 2027 });
  assert.deepEqual(getYears(mem({ 'ssam:years': 'x' }), '2027-01-05'), { current: 2026 });
});

test('묶음: 공통 키·ssam이 아닌 키는 빼고 저장된 글 그대로', () => {
  const s = snapshot(seed());
  assert.ok(!('engine' in s) && !('theme' in s) && !('mig:fable' in s) && !('other:x' in s));
  assert.equal(s.hk, J({ students: [{ id: 's', no: 1 }] }));
  assert.equal(s['class:log'], seed().getItem('ssam:class:log'));
});

test('새 학년도에 가져가는 것', () => {
  const c = carryOver(snapshot(seed()), 2027);
  assert.deepEqual(Object.keys(c).sort(), ['calendar', 'events', 'school', 'yearplans']);
  assert.deepEqual(JSON.parse(c.calendar).map(e => e.date), ['2027-03-02']);
  assert.deepEqual(JSON.parse(c.school), { name: '가나초', classes: 12, students: 280, breaks: [] });
});

test('백업 파일: 만들기·읽기, AI 키 없음, 틀린 파일', () => {
  const snap = snapshot(seed());
  const b = makeBackup({ current: 2026, snap, archives: { 2025: { hk: '{}' }, 2026: { hk: 'stale' } } }, new Date('2026-10-29T00:00:00Z'));
  assert.equal(b.app, 'ssam'); assert.equal(b.kind, 'backup'); assert.equal(b.version, 1); assert.equal(b.current, 2026);
  assert.equal(b.years['2026'].hk, snap.hk);
  assert.ok(!JSON.stringify(b).includes('sk-secret'));
  const r = parseBackup(JSON.stringify(b));
  assert.equal(r.current, 2026); assert.deepEqual(r.years['2025'], { hk: '{}' }); assert.deepEqual(r.years['2026'], snap);
  const sneaky = { ...b, years: { 2026: { ...snap, engine: '{"keys":1}' } } };
  assert.ok(!('engine' in parseBackup(JSON.stringify(sneaky)).years['2026']));
  for (const bad of ['x', '{"a":1}', JSON.stringify({ ...b, version: 2 }), JSON.stringify({ ...b, years: { 2026: { hk: 3 } } }), JSON.stringify({ ...b, years: { abc: {} } })]) {
    assert.throws(() => parseBackup(bad), e => e.code === 'NOT_BACKUP', bad.slice(0, 30));
  }
});

test('학년도 옮기기: 새 학년도 → 다시 돌아오기', async () => {
  const ls = seed(), archive = memArchive();
  const before = ls.dump();
  let frozen = 0;
  const r = await moveTo(2027, { ls, archive, freeze: () => frozen++, unfreeze: () => frozen--, data: carryOver(snapshot(ls), 2027), today: '2026-10-29' });
  assert.deepEqual(r, { ok: true });
  assert.equal(ls.getItem('ssam:class:log'), null); assert.equal(ls.getItem('ssam:hk'), null);
  assert.equal(ls.getItem('ssam:yearplans'), before['ssam:yearplans']);
  assert.equal(ls.getItem('ssam:engine'), before['ssam:engine']); assert.equal(ls.getItem('ssam:mode'), 'hk'); assert.equal(ls.getItem('other:x'), '1');
  assert.deepEqual(JSON.parse(ls.getItem('ssam:years')), { current: 2027 });
  assert.deepEqual((await archive.list()).map(x => x.year), [2026]);
  assert.equal(frozen, 1);
  ls.setItem('ssam:class:info', J({ grade: 4, room: 1 }));
  const back = await moveTo(2026, { ls, archive, today: '2026-10-29' });
  assert.deepEqual(back, { ok: true });
  for (const k of Object.keys(before)) assert.equal(ls.getItem(k), before[k], k);
  assert.equal(ls.getItem('ssam:class:info'), null);
  assert.deepEqual((await archive.list()).map(x => x.year), [2027, 2026]);
  assert.equal(await archive.get(2027).then(s => s['class:info']), J({ grade: 4, room: 1 }));
});

test('보관함에 못 쓰면 아무것도 바꾸지 않음', async () => {
  const ls = seed(), before = ls.dump();
  const archive = { ...memArchive(), put: async () => { throw new Error('quota'); } };
  let un = 0;
  const r = await moveTo(2027, { ls, archive, freeze: () => {}, unfreeze: () => un++, data: {}, today: '2026-10-29' });
  assert.deepEqual(r, { ok: false, code: 'ARCHIVE_FAILED' });
  assert.deepEqual(ls.dump(), before);
  assert.equal(un, 1);
});

test('저장 멈춤: 멈춘 동안 set은 false', () => {
  store.useStorage(mem());
  store.freeze();
  assert.equal(store.set('a', 1), false); assert.equal(store.get('a'), null);
  store.unfreeze();
  assert.equal(store.set('a', 1), true); assert.equal(store.get('a'), 1);
});

test('검토 고침: 처음 연 날의 학년도를 저장해 두어 3월이 와도 바뀌지 않음', () => {
  const ls = mem();
  assert.deepEqual(ensureYears(ls, '2026-11-10'), { current: 2026 });
  assert.deepEqual(JSON.parse(ls.getItem('ssam:years')), { current: 2026 });
  assert.deepEqual(ensureYears(ls, '2027-03-02'), { current: 2026 });
  assert.deepEqual(getYears(ls, '2027-03-02'), { current: 2026 });
  assert.deepEqual(getYears(null, '2027-03-02'), { current: 2027 });
  assert.deepEqual(snapshot(null), {});
});

test('검토 고침: 보관함에 이미 있는 학년도를 새로 시작하지 않음', async () => {
  const ls = seed(), archive = memArchive();
  await archive.put(2027, { hk: '"2027 real work"' });
  const before = ls.dump();
  let un = 0;
  const r = await moveTo(2027, { ls, archive, unfreeze: () => un++, data: {}, today: '2026-10-29' });
  assert.deepEqual(r, { ok: false, code: 'EXISTS' });
  assert.deepEqual(ls.dump(), before); assert.equal(un, 1);
  assert.deepEqual(await archive.get(2027), { hk: '"2027 real work"' });
  // 지금 학년도를 백업으로 바꾸는 것(같은 학년도)은 됨
  assert.deepEqual(await moveTo(2026, { ls, archive, data: { hk: '"restored"' }, today: '2026-10-29' }), { ok: true });
  assert.equal(ls.getItem('ssam:hk'), '"restored"');
});

test('검토 고침: 새 학년도에 설정(평어·행특·채점·나이스·품의 기준)은 가져가고 학생 자료는 비움', () => {
  const snap = {
    prefs: J({ current: 'plan1', settings: { len: 'long', ending: 'eum' } }),
    hk: J({ settings: { min: 400, max: 600 }, students: [{ id: 's', memo: '학생 메모' }] }),
    grset: J({ pagesPer: 2, startNo: 5, except: [7], mask: [{ x: 1 }], mix: 'top' }),
    purchaseLimit: '30000000', neis: J({ overwrite: true }), 'neis:hk': J({ x: 1 }), 'class:log': '{}'
  };
  const c = carryOver(snap, 2027);
  assert.deepEqual(JSON.parse(c.prefs), { current: null, settings: { len: 'long', ending: 'eum' } });
  assert.deepEqual(JSON.parse(c.hk), { settings: { min: 400, max: 600 }, students: [] });
  assert.deepEqual(JSON.parse(c.grset), { pagesPer: 2, startNo: 1, except: [], mask: [{ x: 1 }], mix: 'top' });
  assert.equal(c.purchaseLimit, '30000000'); assert.equal(c.neis, snap.neis); assert.equal(c['neis:hk'], snap['neis:hk']);
  assert.ok(!('class:log' in c));
  assert.ok(!JSON.stringify(c).includes('학생 메모'));
});

test('다듬기: 가려는 학년도를 쓰다 실패하면 지금 자료로 되돌리고 WRITE_FAILED', async () => {
  const ls = seed(), before = ls.dump(), archive = memArchive();
  const set = ls.setItem;
  let n = 0;
  ls.setItem = (k, v) => { if (k === 'ssam:hk' && n++ === 0) throw new Error('quota'); return set(k, v); };
  const r = await moveTo(2027, { ls, archive, data: { hk: '"new"' }, today: '2026-10-29' });
  assert.deepEqual(r, { ok: false, code: 'WRITE_FAILED' });
  assert.deepEqual(ls.dump(), before);
});

test('다듬기: 되돌리기도 실패하면 RESTORE_FAILED (지금 자료는 보관함에 있음)', async () => {
  const ls = seed(), archive = memArchive();
  const set = ls.setItem;
  ls.setItem = (k, v) => { if (k === 'ssam:hk') throw new Error('quota'); return set(k, v); };
  const r = await moveTo(2027, { ls, archive, data: { hk: '"new"' }, today: '2026-10-29' });
  assert.deepEqual(r, { ok: false, code: 'RESTORE_FAILED' });
  assert.ok((await archive.get(2026)).hk);
});

test('다듬기: 보관함을 읽지 못하면 ARCHIVE_READ, 응답이 없으면 기다리다 멈춤을 풂', async () => {
  const ls = seed(), before = ls.dump();
  let un = 0;
  const bad = { ...memArchive(), get: async () => { throw new Error('read'); } };
  assert.deepEqual(await moveTo(2027, { ls, archive: bad, unfreeze: () => un++, today: '2026-10-29' }), { ok: false, code: 'ARCHIVE_READ' });
  const hang = { ...memArchive(), put: () => new Promise(() => {}) };
  assert.deepEqual(await moveTo(2027, { ls, archive: hang, unfreeze: () => un++, data: {}, today: '2026-10-29', timeout: 50 }), { ok: false, code: 'ARCHIVE_FAILED' });
  assert.equal(un, 2); assert.deepEqual(ls.dump(), before);
});

test('마지막 백업 시각(backupAt)은 학년도마다 따로가 아니라 모든 학년도가 같이 씀', async () => {
  const { isYearKey } = await import('../../web/core/years.js');
  assert.equal(isYearKey('backupAt'), false);
});

test('새 학년도에 학급 준비도 가져가기(고르면): 명단·학급 정보·시간표·진도표(진도 위치는 처음부터), 체크·주간학습안내는 비움', () => {
  const ls = seed();
  ls.setItem('ssam:class', J({ count: 25, except: [7] }));
  ls.setItem('ssam:class:info', J({ grade: 4, room: 2 }));
  ls.setItem('ssam:class:timetable', J({ periods: 6, days: [] }));
  ls.setItem('ssam:class:subjects', J([{ id: 'a', name: '국어', start: '2027-02-20', offset: 3, lessons: [{ no: '1/8', title: '첫 차시' }] }]));
  ls.setItem('ssam:class:weekly:2027-02-22', J({ x: 1 }));
  const plain = carryOver(snapshot(ls), 2027);
  assert.ok(!('class' in plain) && !('class:subjects' in plain), '고르지 않았는데 가져감');
  const c = carryOver(snapshot(ls), 2027, { classSetup: true });
  assert.deepEqual(JSON.parse(c.class), { count: 25, except: [7] });
  assert.deepEqual(JSON.parse(c['class:info']), { grade: 4, room: 2 });
  assert.ok(c['class:timetable']);
  const sub = JSON.parse(c['class:subjects'])[0];
  assert.equal(sub.offset, 0); assert.equal(sub.start, ''); assert.equal(sub.lessons.length, 1);
  assert.ok(!('class:log' in c) && !Object.keys(c).some(k => k.startsWith('class:weekly:')));
});

test('1·2월에 지난 학년도에서 학급 준비를 하면 새 학년도를 먼저 시작하라고 알릴 학년도', async () => {
  const { prepYear } = await import('../../web/core/years.js');
  assert.equal(prepYear('2027-02-20', 2026), 2027);
  assert.equal(prepYear('2027-01-05', 2026), 2027);
  assert.equal(prepYear('2027-02-20', 2027), 0); // 이미 새 학년도
  assert.equal(prepYear('2026-10-29', 2026), 0); // 학기 중
});

test('떠 있는 버튼 설정·위치는 학년도와 상관없음', () => {
  assert.equal(isYearKey('inbox'), false);
  assert.equal(isYearKey('bubble'), false);
});
