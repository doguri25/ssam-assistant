// 2026-11-16 검토 고침 — 계획서 「새 서식으로 바꾸기」(스펙 2026-11-15 1B): 행사·연간계획 [되돌리기]가 바꾸기와 상관없는 칸까지 되돌리던 것,
// 연간계획 큰 제목 줄에 함께 적힌 글, 로마 숫자 서식에서 고치거나 더한 큰 제목 줄, 제목을 마무리하는 낱말(「근거 법령」), 새 서식 제목의 빈칸 자리. 이름은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
store.useStorage(mem());

const R = await import('../../web/menus/plan/reform-model.js');
const Y = await import('../../web/menus/plan/year-model.js');
const E = await import('../../web/menus/plan/event-model.js');
const C = await import('../../web/menus/plan/classplan-model.js');

const count = (s, x) => s.split(x).length - 1;
const reformYear = (d, form) => {
  const H = R.yearHeads(form), olds = R.yearOlds(d);
  const f = R.mergeReform(H.heads, olds, R.ruleMap(olds, H.heads, { accepts: R.yearAccepts }), null, { accepts: R.yearAccepts });
  return R.applyYear(d, f, H, olds);
};

test('[C15] 행사계획 [되돌리기]: 계획서 글·서식 제목 줄·계획서 검토 의견만 — 가정통신문을 손으로 고쳐 지운 의견은 되살아나지 않음', () => {
  const rvPlan = { section: 'plan', problem: '목적이 흐려요', fix: '고친 계획서' };
  const rvSafety = { section: 'safety', problem: '보건실 위치가 없어요', fix: '고친 점검표', done: 'main' };
  const rvLetter = { section: 'letter', problem: '문의처가 없어요', fix: '옛 글로 쓴 가정통신문 수정안' };
  const e = { docs: { plan: '2027 가을 운동회 운영 계획\nⅠ. 개요\n가. 일시: 2027. 5. 6.', safety: '- 안전', letter: '옛 가정통신문', rain: '', done: false }, rv: [rvPlan, rvSafety, rvLetter] };
  const snap = R.eventSnap(e);
  // [이대로 바꾸기](계획서 의견만 지움) → 가정통신문 칸을 손으로 고침(그 칸의 열린 의견이 지워짐)
  e.docs = { ...e.docs, plan: '1. 추진 목적\n2. 운영 개요\n가. 일시: 2027. 5. 6.\n3. 평가', form: ['1. 추진 목적', '2. 운영 개요', '3. 평가'] };
  e.rv = e.rv.filter(x => x.section !== 'plan');
  e.docs.letter = '김하늘 선생님이 고친 가정통신문';
  e.rv = e.rv.filter(x => x.section !== 'letter' || x.done);
  const back = R.eventRestore(e, snap);
  assert.equal(back.docs.plan, '2027 가을 운동회 운영 계획\nⅠ. 개요\n가. 일시: 2027. 5. 6.');
  assert.deepEqual(back.docs.form, []);
  assert.equal(back.docs.letter, '김하늘 선생님이 고친 가정통신문', '가정통신문은 지금 글 그대로');
  assert.equal(back.docs.safety, '- 안전');
  assert.deepEqual(back.rv, [rvPlan, rvSafety], '가정통신문 옛 의견이 되살아남: ' + JSON.stringify(back.rv));
  // 바꾸기 뒤 [다시 만들기](의견 모두 지움) → 새 가정통신문 의견만 있음 → 되돌려도 계획서 옛 의견만 돌아옴
  const fresh = { section: 'letter', problem: '복장이 없어요', fix: '새 수정안' };
  const b2 = R.eventRestore({ ...e, rv: [fresh] }, snap);
  assert.deepEqual(b2.rv, [rvPlan, fresh]);
  // 스냅숏은 바꾸기 뒤에 바뀌지 않음
  assert.deepEqual(snap.rv, [rvPlan]);
});
