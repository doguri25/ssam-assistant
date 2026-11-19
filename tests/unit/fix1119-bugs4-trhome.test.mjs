/* 네 번째 버그 찾기(연수·오늘 화면·한 달 달력·학년말 마감) — 다시 생기지 않게. 예시 이름은 지어낸 것 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));

test('명단: 「부서 ⇥ 이름」「연번 ⇥ 부서 ⇥ 직위 ⇥ 성명」 차례·머리 「이름(성명)」도 이름과 부서가 바뀌지 않음', async () => {
  const T = await import('../../web/menus/training/training-model.js');
  const P = await import('../../web/core/privacy.js');
  assert.deepEqual(T.parseStaff('교무부\t남다율\n연구부\t탁보결'), [{ name: '남다율', dept: '교무부' }, { name: '탁보결', dept: '연구부' }]);
  assert.deepEqual(T.parseStaff('1\t교무부\t남다율\n2\t3학년 1반\t탁보결'), [{ name: '남다율', dept: '교무부' }, { name: '탁보결', dept: '3학년 1반' }]);
  assert.deepEqual(T.parseStaff('1\t교무부\t교사\t남다율'), [{ name: '남다율', dept: '교무부 교사' }]);
  assert.deepEqual(T.parseStaff('교무부 남다율\n보건\t한가람\n행정실\t김진실'), [{ name: '남다율', dept: '교무부' }, { name: '한가람', dept: '보건' }, { name: '김진실', dept: '행정실' }]);
  assert.deepEqual(T.parseStaff('연번\t부서\t직위'), []);
  // 이름이 먼저인 줄은 그대로(끝 글자가 「실」인 이름, 과목 칸)
  assert.deepEqual(T.parseStaff('김진실\t행정실\n김하늘\t영어\n김진실\t이바다'), [{ name: '김진실', dept: '행정실' }, { name: '김하늘', dept: '영어' }, { name: '김진실', dept: '이바다' }]);
  assert.deepEqual(T.staffFromRows([['연번', '부서', '이름(성명)'], ['1', '교무부', '남다율']]), [{ name: '남다율', dept: '교무부' }]);
  T.saveBoard({ staff: T.parseStaff('교무부\t남다율\n연구부\t탁보결'), courses: [], marks: {} });
  assert.equal(P.stripNames('교무부 회의 자료는 남다율에게, 탁보결은 연구부 담당').text, '교무부 회의 자료는 ○○○에게, ○○○은 연구부 담당');
  assert.ok(T.matchFile({ name: '청렴교육_남다율.pdf' }, T.getBoard()).sid);
});

test('현황판 파일의 학년도(boardFileYear) — 다른 학년도 파일을 가져올 때 물으려고', async () => {
  const T = await import('../../web/menus/training/training-model.js');
  assert.equal(T.boardFileYear(T.exportBoard({ staff: [], courses: [], marks: {} }, 2025)), 2025);
  assert.equal(T.boardFileYear('{"kind":"training-board","board":{}}'), 0);
  assert.equal(T.boardFileYear('not json'), 0);
});

test('결과 보고 「나. 대상」 구분별 인원에 구분 없는 사람도(합이 대상 수와 맞음)', async () => {
  const T = await import('../../web/menus/training/training-model.js');
  const b = T.normBoard({ staff: [{ id: 'a', name: '김하늘', dept: '3학년 담임' }, { id: 'b', name: '이바다', dept: '교무부' }, { id: 'c', name: '한가람', dept: '행정실 주무관' },
    { id: 'd', name: '박솔빛', dept: '행정실' }, { id: 'e', name: '남다율', dept: '' }], courses: [{ id: 'c1', title: '청렴교육' }], marks: {} });
  const p = T.reportDoc(b, { cids: ['c1'], year: 2026 }).blocks.find(x => x.type === 'p' && /대상/.test(x.text)).text;
  assert.equal(p, '  나. 대상: 교직원 5명(교원 2명, 직원 2명, 구분 없음 1명)');
});

test('구글 폼 이수번호 칸의 「없음」「-」「모름」은 이수번호가 아님', async () => {
  const T = await import('../../web/menus/training/training-model.js');
  const b = T.normBoard({ staff: [{ id: 'a', name: '김하늘' }, { id: 'b', name: '이바다' }, { id: 'c', name: '한가람' }, { id: 'd', name: '박솔빛' }], courses: [{ id: 'c1', title: '청렴교육' }] });
  const r = T.formResponses([['타임스탬프', '성명', '이수번호'], ['2026-11-02', '김하늘', '없음'], ['2026-11-02', '이바다', '-'], ['2026-11-02', '한가람', '충남-특직-2026-001'], ['2026-11-02', '박솔빛', '2026-0012345']], b);
  assert.deepEqual(r.hits.map(h => h.code), ['', '', '충남-특직-2026-001', '2026-0012345']);
});

test('한 달 달력·학년말 마감: 기초학력 줄은 그 프로그램(id)으로 감', async () => {
  const M = await import('../../web/menus/home/month-model.js');
  const it = M.monthItems({ camps: [{ id: 'k2', name: '국어 교실', dates: ['2026-11-24'] }] }, '2026-11', '2026-11-19');
  assert.deepEqual(it['2026-11-24'][0].route, { to: 'camp', id: 'k2', section: 'att' });
  const Y = await import('../../web/menus/home/yearend-model.js');
  const rows = Y.yearendRows({ camps: [{ id: 'k1', name: '수학 교실', docs: [{ label: '수업 확인서', state: 'ready', note: '' }] }, { id: 'k2', name: '국어 교실', docs: [{ label: '결과 보고서', state: 'todo', note: '2칸 비어 있음' }] }] }, new Set());
  assert.deepEqual(rows.find(r => r.id === 'camp').go, { to: 'camp', id: 'k2', section: 'docs' });
});
