/* 2026-11-19 여섯 번째 버그 찾기(화면 흐름) — 다시 생기지 않게. 화면에서만 드러나는 것(회의록 다시 켜기·[모두 참석으로]·못 맞춘 이수증 줄)은 e2e fix1119-bugs6-ui.mjs.
   예시 이름은 지어낸 것 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));

test('연수 시간 칸: 「2시간」「1.5시간」「90분」「1시간 30분」도 읽고(말없이 버리지 않음), 못 읽는 글은 null', async () => {
  const T = await import('../../web/menus/training/training-model.js');
  const cases = [['2', 2], [2, 2], ['1.5', 1.5], ['2시간', 2], ['1.5시간', 1.5], ['2 시간', 2], ['90분', 1.5], ['1시간 30분', 1.5], ['15차시', 15], ['', null], ['두 시간', null], [null, null], [0, null]];
  for (const [v, want] of cases) {
    assert.equal(T.hoursIn(v), want, `hoursIn(${JSON.stringify(v)})`);
    assert.equal(T.normItem({ title: '청렴교육', hours: v }).hours, want, `normItem hours ${JSON.stringify(v)}`);
  }
  // 내 필수연수 이수 시간 합계에 들어감
  assert.ok(T.saveMine([{ title: '청렴교육', hours: '2시간', status: 'done' }, { title: '개인정보보호 교육', hours: '90분', status: 'ok' }]));
  assert.equal(T.mineSummary(T.listMine(), '2026-11-19').hours, 3.5);
  // 교내 연수 「연수 시간」: 안내·결과 보고·[모두 참석으로] 이수 시간
  const b = T.normBoard({ staff: [{ id: 's1', name: '김하늘', dept: '교무부' }], courses: [{ id: 'c1', title: '교내 수업 나눔 연수', inhouse: { date: '2026-12-03', time: '15:00~16:30', place: '도서실', lecturer: '', hours: '2시간' } }] });
  assert.equal(b.courses[0].inhouse.hours, 2);
  assert.match(T.inhouseNotice(b.courses[0]), /연수 시간: 2시간/);
  assert.equal(T.markOf(T.allPresent(b, 'c1'), 'c1', 's1').hours, 2);
});

test('한 달 달력: 기초학력 수업 줄은 그날 출석 칸으로(날짜를 가지고 감)', async () => {
  const M = await import('../../web/menus/home/month-model.js');
  const it = M.monthItems({ camps: [{ id: 'k1', name: '국어 교실', dates: ['2026-11-16', '2026-11-16', '2026-11-23'] }] }, '2026-11', '2026-11-19');
  assert.deepEqual(it['2026-11-16'][0].route, { to: 'camp', id: 'k1', section: 'att', date: '2026-11-16' });
  assert.deepEqual(it['2026-11-23'][0].route, { to: 'camp', id: 'k1', section: 'att', date: '2026-11-23' });
});
