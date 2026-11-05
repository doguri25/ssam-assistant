// 3차 고치기(공통·설정): 학교 정보를 저장해도 「계획 학년도」가 그해로 굳지 않음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useStorage } from '../../web/core/store.js';
import { getSchool, setSchool, defaultYear } from '../../web/core/settings.js';

function fake(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, m };
}
const J = JSON.stringify;
const raw = s => JSON.parse(s.getItem('ssam:school'));
const MAY = new Date(2026, 4, 10), NOV = new Date(2026, 10, 5), JAN = new Date(2027, 0, 20), NEXT_OCT = new Date(2027, 9, 5);

test('[settings-planyear-4] 계획 학년도를 주지 않고 학교 정보(학교명·방학)만 저장하면 학년도는 저장하지 않고 자동값(defaultYear)을 따름', () => {
  const s = fake({ 'ssam:years': J({ current: 2026 }) });
  useStorage(s);
  setSchool({ name: '가나초', breaks: [{ from: '2026-07-24', to: '2026-08-20', label: '여름방학' }] });
  assert.equal(raw(s).year, undefined, '학년도가 저장됨: ' + s.getItem('ssam:school'));
  assert.equal(getSchool(MAY).year, 2026);
  assert.equal(getSchool(NOV).year, 2027);
  assert.equal(getSchool(NEXT_OCT).year, defaultYear(NEXT_OCT));
  assert.equal(getSchool(NOV).name, '가나초');
});

test('[settings-planyear-4] 고치기 전에 화면 값이 그대로 저장된 학년도(지금 자료 학년도와 같음)는 10월부터 다음 학년도로 봄', () => {
  useStorage(fake({ 'ssam:years': J({ current: 2026 }), 'ssam:school': J({ name: '가나초', year: 2026, classes: 0, students: 0, breaks: [] }) }));
  assert.equal(getSchool(MAY).year, 2026, '9월까지는 그대로');
  assert.equal(getSchool(NOV).year, 2027, '11월인데 지난 학년도');
  assert.equal(getSchool(JAN).year, 2027, '1월인데 지난 학년도');
});

test('[settings-planyear-4] 학년도를 옮기지 않고 지낸 경우(자료 2025학년도)에도 예전에 굳은 2026은 11월에 2027로', () => {
  useStorage(fake({ 'ssam:years': J({ current: 2025 }), 'ssam:school': J({ name: '가나초', year: 2026, classes: 0, students: 0, breaks: [] }) }));
  assert.equal(getSchool(NOV).year, 2027);
});

test('[settings-planyear-4] 예전 값이라도 지금 자료 학년도보다 앞선 해(일부러 고른 지난 학년도)나 자동값보다 뒤인 해는 그대로', () => {
  useStorage(fake({ 'ssam:years': J({ current: 2026 }), 'ssam:school': J({ year: 2025 }) }));
  assert.equal(getSchool(NOV).year, 2025);
  useStorage(fake({ 'ssam:years': J({ current: 2026 }), 'ssam:school': J({ year: 2028 }) }));
  assert.equal(getSchool(NOV).year, 2028);
});

test('[core3-1] 선생님이 고른 학년도는 지금 자료 학년도와 같아도 10월 뒤 그대로 (일부러 정한 해는 지킴)', () => {
  const s = fake({ 'ssam:years': J({ current: 2026 }) });
  useStorage(s);
  setSchool({ name: '가나초', year: 2026 });
  assert.equal(raw(s).year, 2026);
  assert.equal(getSchool(NOV).year, 2026);
  assert.equal(getSchool(JAN).year, 2026);
  // 학년도를 주지 않고 다시 저장(방학만 바꿈)해도 고른 해는 그대로
  setSchool({ breaks: [{ from: '2026-12-24', to: '2027-02-28', label: '겨울방학' }] });
  assert.equal(getSchool(NOV).year, 2026);
  assert.equal(getSchool(NOV).breaks.length, 1);
  // 틀린 값(빈 칸 등)도 고른 해를 지우지 않음
  setSchool({ year: 0 });
  assert.equal(getSchool(NOV).year, 2026);
});

test('[core3-1] year: null이면 저장한 학년도를 지워 다시 자동값을 따름', () => {
  const s = fake({ 'ssam:years': J({ current: 2026 }), 'ssam:school': J({ name: '가나초', year: 2025, classes: 3, students: 60, breaks: [] }) });
  useStorage(s);
  const r = setSchool({ year: null });
  assert.equal(raw(s).year, undefined, s.getItem('ssam:school'));
  assert.equal(getSchool(NOV).year, 2027);
  assert.equal(getSchool(NOV).classes, 3);
  assert.equal(r.year, defaultYear(), '돌려준 값은 화면에 보일 학년도');
});

test('[core3-1] setSchool이 돌려준 값은 getSchool과 같은 모양(화면이 그대로 그림)', () => {
  useStorage(fake({ 'ssam:years': J({ current: 2026 }) }));
  const r = setSchool({ name: ' 쌤초 ', year: 2030, classes: 12, students: 280 });
  assert.deepEqual(r, { name: '쌤초', year: 2030, classes: 12, students: 280, breaks: [] });
  assert.deepEqual(Object.keys(getSchool()), ['name', 'year', 'classes', 'students', 'breaks']);
});
