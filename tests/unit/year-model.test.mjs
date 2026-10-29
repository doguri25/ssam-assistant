// 연간계획 모델: 저장·목록, AI 답 다듬기, 문장 나누기, 작년과 겹침(Y-5), 지침 반영(Y-3), 한글 문서
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { SECTIONS, newPlan, listPlans, getPlan, savePlan, deletePlan, currentId, setCurrent, normReview, normGuide, normDraft, draftText, sentences, overlap, guideStatus, insertSentence, planDoc, planText } from '../../web/menus/plan/year-model.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

test('섹션 순서', () => {
  assert.deepEqual(SECTIONS.map(s => s[0]), ['purpose', 'policy', 'details', 'schedule', 'budget', 'evaluation']);
});

test('저장·목록·지우기·현재', () => {
  store.useStorage(mem());
  const a = savePlan({ ...newPlan(), name: '독서교육' });
  const b = savePlan({ ...newPlan(), name: '생활교육' });
  assert.ok(a.id && b.id && a.id !== b.id);
  assert.equal(typeof newPlan().year, 'number');
  assert.deepEqual(listPlans().map(p => p.name), ['생활교육', '독서교육']);
  savePlan({ ...getPlan(a.id), goal: '목표' });
  assert.equal(listPlans()[0].name, '독서교육');
  setCurrent(b.id); assert.equal(currentId(), b.id);
  deletePlan(b.id); assert.equal(listPlans().length, 1); assert.equal(getPlan(b.id), null);
});

test('망가진 저장 값', () => {
  store.useStorage(mem());
  store.set('yearplans', 'x'); assert.deepEqual(listPlans(), []);
  store.set('yearplans', {}); assert.deepEqual(listPlans(), []);
  store.set('yearplans', [null, { id: 1 }, { id: 'a', name: '독서' }]);
  const l = listPlans();
  assert.equal(l.length, 1); assert.equal(l[0].name, '독서'); assert.equal(l[0].status, 'draft'); assert.deepEqual(l[0].sources, { lastPlan: '', lastResult: '', guide: '' });
  assert.equal(l[0].step, 1); assert.equal(l[0].maxStep, 1);
});

test('단계 기억: 1~5만, maxStep은 step보다 작지 않음', () => {
  store.useStorage(mem());
  const p = savePlan({ ...newPlan(), name: 'a', step: 3, maxStep: 2 });
  assert.equal(getPlan(p.id).step, 3); assert.equal(getPlan(p.id).maxStep, 3);
  const q = savePlan({ ...newPlan(), name: 'b', step: 9, maxStep: 'x' });
  assert.equal(getPlan(q.id).step, 1); assert.equal(getPlan(q.id).maxStep, 1);
});

test('AI 답 다듬기', () => {
  const d = normDraft({ purpose: '목적', schedule: [{ title: '협의회', date: '2027-13-40', month: 14 }, { title: '발표회', date: '2027-10-15' }, { date: '2027-03-02' }], budget: [{ name: '도서 구입', amount: '1,200,000원' }, { amount: 5 }] });
  assert.equal(d.policy, '');
  assert.equal(d.schedule.length, 2);
  assert.equal(d.schedule[0].date, ''); assert.equal(d.schedule[0].month, null);
  assert.equal(d.schedule[1].month, 10);
  assert.equal(d.budget.length, 1); assert.equal(d.budget[0].amount, 1200000);
  assert.equal(normDraft(null), null); assert.equal(normDraft('글'), null);
  assert.deepEqual(normReview({ good: ['a', 3], bad: [{ text: '저학년', ideas: ['짝 독서', ''] }, 'x'] }), { good: ['a'], bad: [{ text: '저학년', ideas: ['짝 독서'] }], numbers: [], picked: [] });
  assert.equal(normReview([]), null);
  assert.deepEqual(normGuide([{ item: '시간 확보', keywords: ['아침 독서'], sentence: 's', section: '없는' }, { keywords: [] }]), [{ item: '시간 확보', keywords: ['아침 독서'], sentence: 's', section: 'details' }]);
  assert.deepEqual(normGuide('x'), []);
});

test('문장 나누기: 줄·문장 끝, 「가.」 번호는 뒤에 붙임', () => {
  assert.deepEqual(sentences('가. 목적: 독서 습관을 기른다. 나. 방침\n- 매주 1회 운영함.'), ['가. 목적: 독서 습관을 기른다.', '나. 방침', '- 매주 1회 운영함.']);
});

const D = (o = {}) => ({ purpose: '', policy: '', details: '', evaluation: '', schedule: [], budget: [], ...o });

test('작년 계획과 겹침', () => {
  const r = overlap('독서 습관을 기른다. 매월 독서 행사를 한다.', D({ purpose: '독서 습관을 기른다.', policy: '학생 주도 독서 동아리를 운영한다.' }));
  assert.equal(r.percent, 50); assert.deepEqual(r.same, ['독서 습관을 기른다.']);
  assert.equal(overlap('독서 습관을 기른다.', D({ purpose: '독서습관을 기른다!' })).percent, 100);
  const law = overlap('학교도서관진흥법 제15조에 따라 운영한다. 독서 습관을 기른다.', D({ purpose: '학교도서관진흥법 제15조에 따라 운영한다.\n새 목표를 세운다.' }));
  assert.equal(law.percent, 0);
  assert.equal(overlap('', D({ purpose: 'a' })), null);
  assert.equal(overlap('  ', D({ purpose: 'a' })), null);
  const big = Array.from({ length: 2500 }, (_, i) => `작년 문장 ${i}번은 여기에 있습니다.`).join(' ');
  const t0 = Date.now();
  overlap(big, D({ details: Array.from({ length: 100 }, (_, i) => `올해 새로 쓴 문장 ${i}입니다.`).join(' ') }));
  assert.ok(Date.now() - t0 < 500, '느림: ' + (Date.now() - t0) + 'ms');
});

test('지침 반영 여부와 문장 넣기', () => {
  const items = [{ item: '아침 독서 시간 확보', keywords: ['아침 독서', '20분'], sentence: '매일 아침 독서 20분을 운영한다.', section: 'details' }];
  assert.equal(guideStatus(items, D({ details: '아침독서를 운영한다.' }))[0].included, true);   // 2개 중 1개 = 절반(올림 1)
  assert.equal(guideStatus(items, D({ details: '독서 행사를 한다.' }))[0].included, false);
  assert.equal(guideStatus(items, null)[0].included, false);
  const d = insertSentence(D({ details: '첫 줄' }), 'details', '매일 아침 독서 20분을 운영한다.');
  assert.equal(d.details, '첫 줄\n매일 아침 독서 20분을 운영한다.');
  assert.equal(insertSentence(D(), 'details', 'a').details, 'a');
  assert.ok(draftText(D({ purpose: 'p', schedule: [{ title: '발표회', date: '', month: null }] })).includes('발표회'));
});

test('한글 문서', () => {
  const doc = planDoc({ ...newPlan(), name: '독서교육', year: 2027, draft: D({ purpose: '목적 글', schedule: [{ title: '발표회', date: '2027-10-15', month: 10 }, { title: '협의회', date: '', month: 3 }], budget: [{ name: '도서 구입', amount: 1200000, note: '' }] }) });
  assert.equal(doc.title, '2027학년도 독서교육 운영 계획');
  const tables = doc.blocks.filter(b => b.type === 'table');
  assert.deepEqual(tables[0].rows[0], ['날짜', '내용']);
  assert.deepEqual(tables[0].rows[1], ['2027-10-15', '발표회']);
  assert.deepEqual(tables[0].rows[2], ['3월', '협의회']);
  assert.deepEqual(tables[1].rows.at(-1), ['합계', '1,200,000', '']);
  assert.deepEqual(doc.blocks.filter(b => b.type === 'h').map(b => b.text), ['1. 목적', '2. 방침', '3. 세부 추진 계획', '4. 월별 추진 일정', '5. 예산', '6. 평가 계획']);
});

test('지난 계획을 글로 (다음 해 작년 계획서)', () => {
  const t = planText({ ...newPlan(), name: '독서교육', year: 2027, draft: D({ purpose: '목적 글', schedule: [{ title: '발표회', date: '2027-10-15', month: 10 }], budget: [{ name: '도서 구입', amount: 1200000, note: '' }] }) });
  assert.ok(t.startsWith('2027학년도 독서교육 운영 계획\n'));
  assert.ok(t.includes('1. 목적\n목적 글'));
  assert.ok(t.includes('2027-10-15 | 발표회'));
  assert.ok(t.includes('합계 | 1,200,000 |'));
});
