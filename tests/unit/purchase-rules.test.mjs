// 품의 계산·점검 규칙 (PRD 5.2 P-1·P-4~P-7)
import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, emptyForm, toNumber, itemAmount, cleanItems, sumItems, findPersonal, checkPurchase, itemsTSV, composeReason } from '../../web/menus/purchase/rules.js';

test('품의 종류 4개', () => {
  assert.deepEqual(TYPES.map(t => [t.id, t.label]), [['goods', '물품 구입'], ['lecturer', '강사 수당'], ['event', '행사 운영'], ['meeting', '협의회']]);
  for (const t of TYPES) { assert.ok(t.hint); assert.ok(t.example && t.example.items.length); }
  assert.equal(emptyForm().type, 'goods'); assert.equal(emptyForm('meeting').items.length, 1);
});

test('숫자 읽기와 금액', () => {
  assert.equal(toNumber('12,000원'), 12000); assert.equal(toNumber(' 2.5 '), 2.5); assert.equal(toNumber('abc'), 0);
  assert.equal(itemAmount({ qty: '2.5', price: '1,000' }), 2500);
  assert.deepEqual(cleanItems([{ name: ' ', qty: 1, price: 5 }, { name: '비커', qty: '', price: 3000 }]).map(i => [i.name, i.qty]), [['비커', 1]]);
  assert.equal(sumItems([{ name: '비커', qty: 2, price: 3000 }, { name: '', qty: 9, price: 9 }]), 6000);
});

test('주민번호·계좌번호 찾기', () => {
  assert.equal(findPersonal('강사 900101-1234567'), 'rrn');
  assert.equal(findPersonal('국민은행 123-45-6789-012'), 'account');
  assert.equal(findPersonal('연락처 010-1234-5678'), null);
  assert.equal(findPersonal('신한 12-34'), null);
  assert.equal(findPersonal('우리 반 연락처 010-1234-5678'), null);   // 「우리」만으로는 은행이 아님, 휴대전화는 계좌 아님
  assert.equal(findPersonal('우리은행 1002-123-456789'), 'account');
});

const ok = { ...emptyForm(), purpose: '실험', date: '2026-11-10', target: '5학년', budget: '', budgetUnknown: false, total: 6000, items: [{ name: '비커', spec: '500ml', qty: 2, price: 3000 }] };

test('필수 칸이 비면 초안을 만들지 않음', () => {
  const f = { ...emptyForm(), purpose: '', date: '', target: '5학년', items: [{ name: '', spec: '', qty: '', price: '' }] };
  const r = checkPurchase(f, { limit: 20000000 });
  assert.deepEqual(r.missing.sort(), ['date', 'items', 'purpose']); assert.equal(r.canDraft, false);
});

test('확인 목록: 예산 과목·총액·계약 기준·개인정보', () => {
  let r = checkPurchase(ok, { limit: 20000000 });
  assert.ok(r.canDraft); assert.equal(r.total, 6000);
  assert.ok(r.warnings.includes('예산 과목 · 행정실 확인 필요'));
  assert.ok(r.oks.includes('품목 금액의 합과 총액이 같아요'));
  assert.ok(r.oks.includes('주민번호·계좌번호가 들어 있지 않아요'));
  assert.ok(checkPurchase({ ...ok, total: 7000 }, { limit: 20000000 }).warnings.some(w => w.startsWith('품목 금액의 합(6,000원)과 총액(7,000원)이 달라요')));
  assert.ok(!checkPurchase({ ...ok, total: '' }, { limit: 20000000 }).oks.includes('품목 금액의 합과 총액이 같아요'));
  assert.ok(checkPurchase({ ...ok, total: '' }, { limit: 5000 }).warnings.some(w => w.startsWith('별도 계약 절차 확인 필요')));
  r = checkPurchase({ ...ok, memo: '계좌 농협 123-4567-8901-23' }, { limit: 20000000 });
  assert.deepEqual(r.personal, ['memo']); assert.equal(r.canDraft, false);
  assert.ok(!r.oks.includes('주민번호·계좌번호가 들어 있지 않아요'));
  assert.deepEqual(checkPurchase({ ...ok, items: [{ name: '강사 900101-1234567', spec: '', qty: 1, price: 1 }] }, { limit: 20000000 }).personal, ['items']);
  assert.equal(checkPurchase({ ...ok, budgetUnknown: true }, { limit: 20000000 }).warnings.includes('예산 과목 · 행정실 확인 필요'), true);
  assert.equal(checkPurchase({ ...ok, budget: '운영비' }, { limit: 20000000 }).warnings.includes('예산 과목 · 행정실 확인 필요'), false);
});

test('표 복사와 품의 사유', () => {
  assert.equal(itemsTSV(ok.items), '품명\t규격\t수량\t단가\t금액\n비커\t500ml\t2\t3000\t6000\n합계\t\t\t\t6000');
  assert.equal(composeReason({ intro: '실험 재료를 구입하고자 합니다.', purpose: '실험', date: '11월 10일', target: '5학년', place: '' }),
    '실험 재료를 구입하고자 합니다.\n\n가. 목적: 실험\n나. 일시: 11월 10일\n다. 대상: 5학년');
  assert.equal(composeReason({ intro: 'A', purpose: 'p', date: 'd', target: 't', place: '과학실' }).split('\n').pop(), '라. 장소: 과학실');
});
