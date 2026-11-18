/* 메뉴 사이 정보 흐름 점검(2026-11-18 「각 정보와 메뉴가 유기적으로 돌아가는지 확인해줘」)에서 고친 것. 예시 이름은 지어낸 것 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));

test('「쌤」 채팅: 예산·수업 아이디어·교체·보강·메모·전담을 알맞은 메뉴로, 「예산 얼마 남았어?」는 AI 없이', async () => {
  const { routeText, INTENT_IDS } = await import('../../web/core/chat-route.js');
  assert.ok(INTENT_IDS.includes('budget') && INTENT_IDS.includes('idea') && INTENT_IDS.includes('training'));
  for (const [q, want] of [['예산 집행 현황 보여줘', 'budget'], ['사업별 예산', 'budget'], ['수업 아이디어 줘', 'idea'], ['다음 차시 수업 아이디어', 'idea'],
    ['보강 넣어줘', 'today'], ['수업 메모', 'today'], ['전담 시간 체크', 'progress'], ['알코올램프 10개 5000원 품의', 'purchase'], ['활동지 채점', 'activity']]) assert.equal(routeText(q).intent, want, q);
  assert.equal(routeText('예산 과목 뭐로 써?').intent, null, '품의의 「예산 과목」은 예산 탭이 아님');
  const { dataQuestion } = await import('../../web/core/chat-data.js');
  assert.equal(dataQuestion('예산 얼마 남았어?').kind, 'budget');
  assert.equal(dataQuestion('예산 과목 뭐야?'), null);
  const B = await import('../../web/menus/purchase/budget-model.js');
  assert.ok(B.chatAnswer([]).includes('아직 사업이 없어요'));
  const a = B.chatAnswer([{ project: { name: '친구사랑 우정 사진전' }, budget: 500000, spent: 296000, planned: 50000, left: 154000, rate: 59, dday: 12 }, { project: null }]);
  assert.equal(a.split('\n')[1], '- 「친구사랑 우정 사진전」 남음 154,000원 (예산 500,000 · 집행 296,000 · 예정 50,000 · 집행률 59%) · 마감 D-12');
  // 안내 답의 단추도 그 화면으로(예산 → 품의 초안이 아니라 예산 탭)
  const K = await import('../../web/core/chat-knowledge.js');
  assert.deepEqual(K.offlineAnswer('예산 집행률 어떻게 봐?').go, ['budget']);
  assert.deepEqual(K.offlineAnswer('수업 아이디어 어떻게 받아?').go, ['idea']);
  assert.deepEqual(K.offlineAnswer('필수연수 이수증 어디에 넣어?').go, ['training']);
});

test('떠 있는 버튼: 이수증은 연수로(「성 명」 칸·스캔 이름이 있어도 학생 답안 아님)', async () => {
  const { classify, KINDS } = await import('../../web/core/inbox-classify.js');
  assert.ok(KINDS.some(k => k[0] === 'cert'));
  assert.equal(classify({ name: 'scan01.pdf', text: '이 수 증\n성 명: 김하늘\n과정명: 2026년 청렴교육\n이수일: 2026. 11. 2.\n위 사람은 위 연수를 이수하였음을 증명합니다.' }).kind, 'cert');
  assert.equal(classify({ name: '청렴 이수증.jpg', scan: true }).kind, 'cert');
  assert.equal(classify({ name: 'IMG_1.jpg', scan: true }).kind, 'unit-scan');
  assert.equal(classify({ name: '단원평가.hwpx', text: '수학 단원평가\n이름: 김하늘\n1. 다음 중 옳은 것은? ① ② ③\n2. 계산하시오' }).kind, 'unit-scan', '학생 문제지는 그대로');
});

test('기초학력 수업 날: 재량휴업일·개교기념일(설정·학사일정)은 건너뜀, 방학은 그대로', async () => {
  store.set('school', { name: '새싹초등학교', breaks: [{ from: '2026-11-19', to: '2026-11-19', label: '재량휴업일' }, { from: '2026-12-28', to: '2027-02-27', label: '겨울방학' }] });
  store.set('calendar', [{ date: '2026-11-23', title: '개교기념일', source: '' }, { date: '2026-11-24', title: '재량휴업일 계획 제출', source: 'gongmun' }]);
  const { closedDays } = await import('../../web/core/calendar.js');
  assert.deepEqual([...closedDays()].sort(), ['2026-11-19', '2026-11-23']);
  const { countDates } = await import('../../web/menus/class/camp-sched.js');
  assert.deepEqual(countDates({ from: '2026-11-18', weekdays: [1, 2, 3, 4, 5], n: 4 }), ['2026-11-18', '2026-11-20', '2026-11-24', '2026-11-25']);
  const { expandDates } = await import('../../web/menus/class/camp-model.js');
  assert.deepEqual(expandDates('2026-11-18', '2026-11-20'), ['2026-11-18', '2026-11-20']);
  assert.deepEqual(expandDates('2026-11-18', '2026-11-20', { skipHolidays: false }), ['2026-11-18', '2026-11-19', '2026-11-20']);
  assert.deepEqual(expandDates('2027-01-04', '2027-01-05'), ['2027-01-04', '2027-01-05'], '방학 중 캠프');
});

test('인수인계서: 기초학력 프로그램(학생 이름 없음)·연수 현황', async () => {
  const C = await import('../../web/menus/class/camp-model.js');
  const camp = { name: '3학년 수학 캠프', unit: 'session', students: [{ id: 'a', name: '김하늘' }, { id: 'b', name: '이바다' }],
    sessions: [{ id: 's1', date: '2026-11-02', start: '', end: '' }, { id: 's2', date: '2026-11-09', start: '', end: '' }], att: { s1: { a: 'O', b: 'X' }, s2: { a: 'O' } } };
  const rows = C.handoverRows([camp]);
  assert.deepEqual(rows, [['3학년 수학 캠프', '2026. 11. 2. ~ 2026. 11. 9.', '2명', '2시간', '67%']]);
  const { buildHandover } = await import('../../web/menus/etc/handover-model.js');
  const doc = buildHandover({ year: 2026, duties: [], events: [], purchases: [], docs: [], reports: [], camps: rows });
  const t = doc.blocks.find(b => b.part === 'camp' && b.type === 'table');
  assert.ok(t && t.rows[0].join('|') === '프로그램|기간|학생|지도 시간|출석률' && !JSON.stringify(doc).includes('김하늘'), JSON.stringify(t));
});
