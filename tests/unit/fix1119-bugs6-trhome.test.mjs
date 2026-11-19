/* 여섯 번째 버그 찾기(연수·오늘 화면·한 달 달력·학년말 마감·브리핑) — 다시 생기지 않게. 예시 이름은 지어낸 것 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));

test('공문에서 넣는 연수: 기본 목록의 같은 연수 줄에 이음(「청렴교육」 → 「청렴교육(부패방지)」), 다른 연수는 새 줄', async () => {
  const T = await import('../../web/menus/training/training-model.js');
  const l = T.withDefaults([]).list;
  const pick = t => (T.sameCourse(l, T.courseTitle(t), 'gongmun:g1') || {}).title || null;
  assert.equal(pick('2026년 청렴교육 실시 안내'), '청렴교육(부패방지)');
  assert.equal(pick('2026학년도 아동학대 예방교육 이수 안내'), '아동학대 예방 및 신고의무자 교육');
  assert.equal(pick('교직원 자살예방교육 실시 안내'), '생명존중(자살예방) 교육');
  assert.equal(pick('2026년 심폐소생술 교육 이수 협조'), '심폐소생술 등 응급처치 교육');
  assert.equal(pick('2026 장애인식 개선 교육 실시 안내'), '장애인식개선 교육', '이름 열쇠가 같은 것은 예전처럼');
  // 낱말이 다 들지 않거나 여러 줄에 들면 새 줄
  assert.equal(pick('2026 학교폭력 사안처리 역량강화 연수 안내'), null);
  assert.equal(pick('4대폭력 예방교육 실시 안내'), null);
  assert.equal(pick('폭력 예방교육 실시 안내'), null);
  assert.equal(pick('법정의무교육 이수 안내'), null);
  // 이미 다른 공문을 이은 줄에는 낱말로 잇지 않음, 같은 공문이면 그 줄
  const linked = l.map(x => (x.title === '청렴교육(부패방지)' ? { ...x, from: 'gongmun:g0' } : x));
  assert.equal(T.sameCourse(linked, '청렴교육', 'gongmun:g1'), null);
  assert.equal(T.sameCourse(linked, '청렴교육', 'gongmun:g0').title, '청렴교육(부패방지)');
  // 공문 id가 없어(from '') 아무 줄에나 붙지 않음
  assert.equal(T.sameCourse(l, '교권보호 연수', ''), null);
  // 현황판 연수(courses)도 같은 규칙
  assert.equal(T.sameCourse([{ id: 'c1', title: '청렴교육(부패방지)', from: '' }, { id: 'c2', title: '학교폭력 예방교육', from: '' }], '청렴교육', 'gongmun:g1').id, 'c1');
});

test('필수연수 이수 기한(학사일정 출처 training)은 행사·연간계획 날짜 겹침으로 세지 않음', async () => {
  const T = await import('../../web/menus/training/training-model.js');
  const C = await import('../../web/core/calendar.js');
  T.saveMine([{ title: '청렴교육(부패방지)', due: '2026-12-04' }]);
  assert.ok(C.listEvents().some(e => e.source === 'training' && e.date === '2026-12-04'), '연수 기한은 학사일정에 그대로');
  assert.deepEqual(C.dayIssues('2026-12-04', { events: C.listEvents(), source: 'event:x' }), []);
  assert.deepEqual(C.dayIssues('2026-12-04', { events: [...C.listEvents(), { date: '2026-12-04', title: '학예회', source: 'year:p' }], source: 'event:x' }), ['「학예회」 일정과 겹쳐요']);
  assert.deepEqual(C.dayIssues('2026-12-05', { events: C.listEvents(), source: 'event:x' }), ['토요일']);
});

test('학년말 마감 카드: 1·2월에 새 학년도를 이미 시작했으면 띄우지 않음, 시트의 새 학년도 줄은 「시작했어요」', async () => {
  const Y = await import('../../web/menus/home/yearend-model.js');
  assert.equal(Y.yearendSeason('2027-02-10', 2026), true);
  assert.equal(Y.yearendSeason('2027-02-10', 2027), false);
  assert.equal(Y.yearendSeason('2027-01-05', 2027), false);
  assert.equal(Y.yearendSeason('2026-12-10', 2026), true);
  assert.equal(Y.yearendSeason('2027-02-10'), true, '학년도를 모르면 달만');
  assert.equal(Y.yearendSeason('2027-03-02', 2027), false);
  const row = d => Y.yearendRows(d).find(r => r.id === 'newyear');
  assert.equal(row({ prepYear: 0, started: 2027 }).line, '2027학년도를 시작했어요');
  assert.equal(row({ prepYear: 2027, started: 0 }).state, 'todo');
  assert.equal(row({ prepYear: 0, started: 0 }).line, '1·2월에 새 학년도를 시작해요');
});

test('이수 시간: 교육 일시·발급 시각의 「14시 30분」「10시 20분」은 시간이 아님(분만 적은 학습 시간은 그대로)', async () => {
  const T = await import('../../web/menus/training/training-model.js');
  assert.equal(T.certHours('과정명: 심폐소생술 등 응급처치 교육\n교육일시: 2026. 11. 3.(화) 14시 30분 ~ 16시 30분'), null);
  assert.equal(T.certHours('과정명: 청렴교육\n학습량: 총 3차시\n발급일시: 2026년 11월 5일 10시 20분'), 3);
  assert.equal(T.certHours('교육일시 14시30분~16시30분\n학습시간: 120분'), 2);
  assert.equal(T.certHours('학습시간 90분'), 1.5);
  assert.equal(T.certHours('이수시간: 1시간 30분'), 1.5);
  const it = T.applyCert(T.normItem({ id: 'x', title: '심폐소생술 등 응급처치 교육' }),
    { name: '응급처치 이수증.pdf', ...T.readCert({ name: '응급처치 이수증.pdf', text: '이 수 증\n성명: 김하늘\n과정명: 심폐소생술 등 응급처치 교육\n교육일시: 2026. 11. 3.(화) 14시 30분 ~ 16시 30분\n2026. 11. 3.' }, [], '2026-11-19') }, '2026-11-19');
  assert.equal(it.hours, null);
  assert.equal(it.doneDate, '2026-11-03');
});
