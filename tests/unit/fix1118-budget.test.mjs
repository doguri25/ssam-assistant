/* 사업별 예산 집행 현황(스펙 2026-11-18-budget-design) — 규칙·저장. 예시는 지어낸 것 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { GLOBAL } from '../../web/core/years.js';
import * as B from '../../web/menus/purchase/budget-model.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));

test('비교용 글·마감 기본값', () => {
  assert.equal(B.planKey('2026학년도 친구사랑 어깨동무 프로그램 운영 계획(안)'), B.planKey('친구사랑 어깨동무 프로그램'));
  assert.equal(B.planKey('「2026 과학 탐구 동아리 운영 계획서」'), B.planKey('과학 탐구 동아리'));
  assert.notEqual(B.planKey('과학 탐구 동아리'), B.planKey('수학 탐구 동아리'));
  assert.equal(B.defaultDue(2026), '2027-02-28');
  assert.equal(B.defaultDue(2027), '2028-02-29');
  assert.equal(B.dueOf({ due: '2026-12-15' }, 2026), '2026-12-15');
  assert.equal(B.dueOf({ due: '' }, 2026), '2027-02-28');
  assert.ok(GLOBAL.includes('budget:alerts'), '지난 학년도 알림 요약은 학년도와 상관없이');
});

test('사업 저장·고치기·지우기(그 품의는 사업 없음으로)', () => {
  const p = B.saveProject({ name: '친구사랑 어깨동무 프로그램', amount: '1,500,000', due: '2026-12-15' });
  assert.equal(p.amount, 1500000);
  assert.equal(B.saveProject({ id: p.id, name: '친구사랑 어깨동무', amount: 1600000, due: '' }).name, '친구사랑 어깨동무');
  assert.equal(B.listProjects().length, 1);
  B.upsertDraft({ id: 'pcA', project: p.id, title: '사진 인화지 구입', kind: 'goods', amount: 682000, date: '2026-11-17' });
  B.deleteProject(p.id);
  assert.equal(B.listProjects().length, 0);
  assert.equal(B.listLedger()[0].project, '');
});

test('장부: 같은 품의는 한 줄, 올리면 금액을 굳히고 바뀐 금액은 now로, 풀면 지금 금액', () => {
  B.upsertDraft({ id: 'pcA', project: 'p1', title: '초안', kind: 'goods', amount: 682000, date: '2026-11-17' });
  B.upsertDraft({ id: 'pcA', project: 'p1', title: '사진 인화지 외 3종', kind: 'goods', amount: 690000, date: '2026-11-17' });
  assert.equal(B.listLedger().length, 1);
  assert.equal(B.listLedger()[0].amount, 690000);
  B.setPosted('pcA', true, '2026-11-18');
  B.upsertDraft({ id: 'pcA', project: 'p1', title: '사진 인화지 외 3종', kind: 'goods', amount: 700000, date: '2026-11-17' });
  let l = B.listLedger()[0];
  assert.deepEqual([l.posted, l.postedAt, l.amount, l.now], [true, '2026-11-18', 690000, 700000]);
  // 다시 올림 표시(풀고 올림) → 지금 금액으로 굳힘
  B.setPosted('pcA', true, '2026-11-19');
  l = B.listLedger()[0];
  assert.deepEqual([l.amount, l.now, l.postedAt], [700000, undefined, '2026-11-19']);
  B.setPosted('pcA', false);
  assert.equal(B.listLedger()[0].posted, false);
});

test('최근 작성에서 지우면 예정은 빠지고 집행은 남음, 직접 더한 줄은 집행', () => {
  B.upsertDraft({ id: 'pcA', project: 'p1', title: 'A', kind: 'goods', amount: 1000, date: '2026-11-17' });
  B.upsertDraft({ id: 'pcB', project: 'p1', title: 'B', kind: 'goods', amount: 2000, date: '2026-11-17' });
  B.setPosted('pcB', true, '2026-11-18');
  B.onRecentDeleted('pcA'); B.onRecentDeleted('pcB');
  assert.deepEqual(B.listLedger().map(x => x.id), ['pcB']);
  const m = B.addManual({ project: 'p1', title: '11월 전에 쓴 돈', amount: '2,300,000', date: '2026-10-31' });
  assert.ok(m.manual && m.posted && m.amount === 2300000);
  B.setLineProject('pcB', ''); B.removeLine(m.id);
  assert.deepEqual(B.listLedger().map(x => [x.id, x.project]), [['pcB', '']]);
});

test('합계: 예산 − 집행 − 예정 = 남음, 집행률', () => {
  const lines = [{ project: 'p1', amount: 682000, posted: true }, { project: 'p1', amount: 248000, posted: true }, { project: 'p1', amount: 120000, posted: false }, { project: 'p2', amount: 5, posted: true }];
  assert.deepEqual(B.totals({ id: 'p1', amount: 1500000 }, lines), { budget: 1500000, spent: 930000, planned: 120000, left: 450000, rate: 62, rateWithPlan: 70 });
  assert.deepEqual(B.totals({ id: 'p3', amount: 0 }, lines), { budget: 0, spent: 0, planned: 0, left: 0, rate: 0, rateWithPlan: 0 });
});

test('예전 품의 옮기기는 한 번만(예정·사업 없음)', () => {
  const recent = [{ id: 'pcOld', at: Date.parse('2026-10-02T09:00:00'), form: { type: 'goods', items: [{ name: '공책', qty: 10, price: 500 }] }, draft: { title: '공책 구입' } }, { id: 'pcNo', at: 1, form: { items: [] }, draft: null }];
  B.migrateRecent(recent);
  B.migrateRecent([{ id: 'pcLater', at: 2, form: { items: [] }, draft: { title: 'x' } }]);
  assert.deepEqual(B.listLedger().map(x => [x.id, x.project, x.amount, x.posted, x.date]), [['pcOld', '', 5000, false, '2026-10-02']]);
});

test('미리 골라 두기: 관련 「제목」·관련 전체·사업명, 여럿이면 안 고름, 선생님이 고른 것은 그대로', () => {
  const ps = [{ id: 'p1', name: '친구사랑 어깨동무 프로그램', planKey: B.planKey('참여 체험 중심 2026 어깨동무 프로그램 운영 계획') }, { id: 'p2', name: '과학 탐구 동아리', planKey: '' }];
  assert.equal(B.matchProject({ related: '새싹초등학교-xxxxx(2026. xx. xx.) 「참여 체험 중심 2026 어깨동무 프로그램 운영 계획」' }, ps), 'p1');
  assert.equal(B.matchProject({ related: '', project: '2026학년도 과학 탐구 동아리 운영' }, ps), 'p2');
  assert.equal(B.matchProject({ related: '○○교육청 과학과-1234(2026. 11. 2.)', project: '' }, ps), '');
  assert.equal(B.matchProject({ related: '「과학 탐구 동아리」', project: '친구사랑 어깨동무 프로그램' }, ps), '');
  assert.equal(B.matchProject({ project: '과학 탐구 동아리', projectSet: true, projectId: '' }, ps), '');
});

test('알림 줄: 마감 30일 안·올리지 않은 돈, D-3 강조, 지난 학년도 사업', () => {
  const projects = [{ id: 'p1', name: '어깨동무', amount: 1500000, due: '2026-12-15' }, { id: 'p2', name: '다 씀', amount: 1000, due: '2026-12-01' },
    { id: 'p3', name: '먼 마감', amount: 1000, due: '' }, { id: 'p4', name: '지남', amount: 1000, due: '2026-11-01' }, { id: 'p5', name: '곧', amount: 1000, due: '2026-11-20' }];
  const ledger = [{ project: 'p1', amount: 930000, posted: true }, { project: 'p1', amount: 120000, posted: false }, { project: 'p2', amount: 1000, posted: true }];
  const out = B.briefLines({ projects, ledger, year: 2026, today: '2026-11-18' });
  assert.deepEqual(out.map(l => [l.text, l.when, !!l.hot]), [
    ['예산 「곧」 1,000원 남음', 'D-2', true],
    ['예산 「어깨동무」 450,000원 남음 · 예정 120,000원 올리기 전', 'D-27', false]]);
  assert.deepEqual(out[0].route, { to: 'budget' });
  const others = [{ year: 2025, name: '작년 사업', budget: 500000, spent: 100000, planned: 0, left: 400000, due: '2026-02-28' }];
  const feb = B.briefLines({ projects: [], ledger: [], year: 2026, today: '2026-02-20', others });
  assert.deepEqual(feb.map(l => [l.text, l.when]), [['(2025학년도) 예산 「작년 사업」 400,000원 남음', 'D-8']]);
});

test('알림 요약은 학년도별로 고쳐 씀(다른 학년도 것은 마감 전만 남김)', () => {
  store.set('budget:alerts', [{ year: 2025, name: '작년', budget: 1, spent: 0, planned: 0, left: 1, due: '2026-02-28' }, { year: 2024, name: '옛날', budget: 1, spent: 0, planned: 0, left: 1, due: '2025-02-28' }]);
  B.saveProject({ name: '올해 사업', amount: 1000, due: '2026-12-01' });
  B.refreshAlerts(2026, '2026-02-20');
  assert.deepEqual(store.get('budget:alerts').map(a => [a.year, a.name]).sort(), [[2025, '작년'], [2026, '올해 사업']].sort());
  assert.deepEqual(B.otherAlerts(2026).map(a => a.name), ['작년']);
});

test('인수인계서 표: 사업마다 품의·금액·작성일·상태, 집행·예정 합계', () => {
  const projects = [{ id: 'p1', name: '어깨동무' }];
  const ledger = [{ project: 'p1', title: '사진 인화지 외 3종', amount: 682000, date: '2026-11-17', posted: true }, { project: '', title: '공책', amount: 5000, date: '2026-10-02', posted: false }];
  const h = B.handoverRows(projects, ledger);
  assert.deepEqual(h.rows, [['어깨동무', '사진 인화지 외 3종', '682,000', '2026. 11. 17.', '집행'], ['사업 없음', '공책', '5,000', '2026. 10. 2.', '예정']]);
  assert.deepEqual([h.spent, h.planned], [682000, 5000]);
});

test('「오늘」·아침 브리핑: 예산 줄은 공문 기한 다음 차례, 누르면 품의 › 예산', async () => {
  const { briefing } = await import('../../web/core/briefing.js');
  const budgets = B.briefLines({ projects: [{ id: 'p1', name: '어깨동무', amount: 1000, due: '2026-11-20' }], ledger: [], year: 2026, today: '2026-11-18' });
  const out = briefing({ today: '2026-11-18', docs: [{ id: 'd1', title: '과학의 날', due: '2026-11-19' }], events: [{ date: '2026-11-18', title: '교직원 회의' }], budgets });
  assert.deepEqual(out.map(l => l.kind), ['gongmun', 'budget', 'schedule']);
  assert.deepEqual(out[1], { kind: 'budget', text: '예산 「어깨동무」 1,000원 남음', when: 'D-2', hot: true, route: { to: 'budget' } });
});

test('인수인계서 「4. 예산 집행」: 장부가 있으면 사업·상태 칸과 집행·예정 합계', async () => {
  const { budgetRows, buildHandover } = await import('../../web/menus/etc/handover-model.js');
  const purchases = [{ title: '사진 인화지 외 3종', kind: '물품 구입', amount: 682000, date: '2026-11-17', project: '어깨동무', status: '집행' }, { title: '공책', kind: '물품 구입', amount: 5000, date: '2026-10-02', project: '사업 없음', status: '예정' }];
  const b = budgetRows(purchases);
  assert.deepEqual(b.head, ['사업', '품의', '금액(원)', '작성일', '상태']);
  assert.deepEqual([b.spent, b.planned, b.sum], [682000, 5000, 687000]);
  const doc = buildHandover({ year: 2026, purchases, duties: [], events: [], docs: [], reports: [] });
  const t = doc.blocks.find(x => x.part === 'budget' && x.type === 'table');
  assert.deepEqual(t.rows.at(-1), ['합계', '집행 682,000 · 예정 5,000', '687,000', '', '']);
  // 장부가 없으면 예전 표
  assert.equal(budgetRows([{ title: 'a', kind: '협의회', amount: 1000, date: '' }]).head, undefined);
});

test('인수인계서 자료: 장부 줄(최근 작성 20개 밖도)·직접 더한 줄이 들어감', async () => {
  const { collectHandover } = await import('../../web/menus/etc/handover-model.js');
  const p = B.saveProject({ name: '어깨동무', amount: 1500000 });
  B.upsertDraft({ id: 'pcGone', project: p.id, title: '밀려난 품의', kind: 'goods', amount: 1000, date: '2026-05-01' });
  B.setPosted('pcGone', true, '2026-05-02');
  B.addManual({ project: p.id, title: '11월 전에 쓴 돈', amount: 2300000, date: '2026-10-31' });
  const d = collectHandover({ year: 2026 });
  assert.deepEqual(d.purchases.map(x => [x.title, x.project, x.status]), [['밀려난 품의', '어깨동무', '집행'], ['11월 전에 쓴 돈', '어깨동무', '집행']]);
});
