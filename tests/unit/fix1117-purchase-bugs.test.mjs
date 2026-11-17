// 2026-11-17 품의 버그(선생님 알림 「품의에서 합계가 두 번 더해지는 버그」): 견적서·엑셀·CSV·한글 표, 줄글 메모, AI 답에서
// 합계·총계·계·총액·결제금액·공급가액·세액 같은 줄이 품목으로 읽혀 합계(소요 예산)에 한 번 더 들어가던 것,
// AI가 배송비를 품목과 배송비 두 곳에 넣으면 두 번 들어가던 것, 행사계획 예산의 「합계」 줄이 품목으로 넘어오던 것
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { SSAM: { ai: { generate: async () => ({ text: '{}' }), engineReady: () => false, errMsg: c => c } } };
const { parseLines, tableItems, normIntake, shippingItems, readIntake } = await import('../../web/menus/purchase/intake.js');
const { sumItems } = await import('../../web/menus/purchase/rules.js');
const { findItems, isTotalName } = await import('../../web/core/sheet.js');
const { normQuoteItems } = await import('../../web/menus/purchase/quote.js');
const { normOptions } = await import('../../web/menus/plan/event-model.js');

const names = items => items.map(it => it.name);
const total = items => sumItems(items.map(it => ({ ...it, qty: String(it.qty), price: String(it.price) })));

test('[fix1117-sum-1] 줄글: 합계·총계·계·결제금액 같은 줄은 품목이 아니라 총액 칸으로(두 번 더하지 않음)', () => {
  const cases = [
    ['보드게임 3개 25,000원\n배송비 3,000원\n총 결제금액 78,000원', ['보드게임', '배송비'], 78000],
    ['색종이 10묶음 3,000원\n결제금액 30,000원', ['색종이'], 30000],
    ['비커 8개 4,500원\n총계 36,000원', ['비커'], 36000],
    ['비커 8개 4,500원\n총계: 36,000원', ['비커'], 36000],
    ['비커 8개 4,500원\n계 36,000원', ['비커'], 36000],
    ['비커 8개 4,500원\n총합 36,000원', ['비커'], 36000],
    ['비커 8개 4,500원\n합계 36,000원 (VAT 포함)', ['비커'], 36000],
    ['비커 8개 4,500원\n합계(10% 부가세 포함) 36,000원', ['비커'], 36000],
    ['비커 8개 4,500원\n총 36,000원(배송비 포함)', ['비커'], 36000],
    ['비커 8개 4,500원\n소요 예산 36,000원', ['비커'], 36000],
    ['비커 8개 4,500원\n주문금액 36,000원', ['비커'], 36000],
    ['비커 8개 4,500원\n상품금액 합계 36,000원', ['비커'], 36000],
    ['비커 8개 4,500원\n총 구입비 36,000원', ['비커'], 36000],
    ['비커 8개 4,500원\n합계 = 36,000원', ['비커'], 36000],
    ['비커 8개 4,500원\n총액은 36,000원 정도', ['비커'], 36000],
    ['모나미 볼펜 2개 6,780원\n총 상품가격 13,560원\n총 주문금액 13,560원', ['모나미 볼펜'], 13560],
    ['비커 8개 4,500원\n예산: 36,000원', ['비커'], 36000],
    ['가. 현수막 2개 45,000원\n나. 간식 420명 2,500원\n계 1,140,000원', ['현수막', '간식'], 1140000]
  ];
  for (const [text, want, said] of cases) {
    const r = parseLines(text);
    assert.deepEqual(names(r.items), want, text);
    assert.equal(r.fields.total, String(said), text);
    assert.deepEqual(r.missed, [], text);
  }
});

test('[fix1117-sum-2] 줄글: 소계·공급가액·부가세(세액) 줄은 품목도 총액도 아님, 할인 줄은 품목으로 더하지 않고 못 읽은 줄로', () => {
  let r = parseLines('비커 8개 4,500원\n공급가액 32,727원\n부가세 3,273원\n합계 36,000원');
  assert.deepEqual(names(r.items), ['비커']);
  assert.equal(r.fields.total, '36000');
  r = parseLines('비커 8개 4,500원\n부가가치세 3,273원\n소계 36,000원');
  assert.deepEqual(names(r.items), ['비커']);
  assert.equal(total(r.items), 36000);
  r = parseLines('비커 8개 4,500원\n할인 -2,000원\n배송비 할인 -3,000원\n합계 - 31,000원');
  assert.deepEqual(names(r.items), ['비커']);
  assert.deepEqual(r.missed, ['할인 -2,000원', '배송비 할인 -3,000원']);
  assert.equal(r.fields.total, '31000');
});

test('[fix1117-sum-3] 줄글: 이름이 「계·총·세」로 시작하는 품목은 그대로 품목(계량컵·총채·세제·합판)', () => {
  const r = parseLines('계량컵 5개 3,000원\n총채 2개 5,000원\n세제 3통 4,000원\n합판 10장 2,000원\n포인트 스티커 10장 500원');
  assert.deepEqual(names(r.items), ['계량컵', '총채', '세제', '합판', '포인트 스티커']);
  assert.equal(r.fields.total, undefined);
});

test('[fix1117-sum-4] 엑셀에서 복사한 표(탭): 계·합 계·총액·공급가액·세액·결제금액 줄은 빼고 셈(머리줄이 있어도 없어도)', () => {
  const cases = [
    ['항목\t내역\t금액\n현수막\t5m×0.9m 2개\t90000\n간식\t420명\t1050000\n계\t\t1140000', 1140000],
    ['품명\t규격\t수량\t단가\t금액\n비커\t500ml\t8\t4500\t36000\n합   계\t\t\t\t36000', 36000],
    ['품명\t수량\t단가\t금액\n비커\t8\t4500\t36000\n총액\t\t\t36000', 36000],
    ['품명\t수량\t단가\t금액\n비커\t8\t4500\t36000\n공급가액\t\t\t32727\n세액\t\t\t3273', 36000],
    ['품명\t수량\t단가\t금액\n비커\t8\t4500\t36000\n부가가치세\t\t\t3273', 36000],
    ['상품명\t수량\t가격\n비커\t8\t4500\n총 결제금액\t\t36000', 36000],
    ['현수막\t2\t45000\n간식\t420\t2500\n계\t\t1140000', 1140000],
    ['현수막\t2\t45000\n간식\t420\t2500\n총계\t\t1140000', 1140000],
    ['현수막\t2\t45000\n총액\t\t90000', 90000]
  ];
  for (const [text, want] of cases) {
    const r = tableItems(text);
    assert.equal(total(r.items), want, text + '\n→ ' + names(r.items).join('|'));
  }
});

test('[fix1117-sum-5] 견적서 표(학교장터 꼴): 「합 계」「총 계」「총 액(부가세 포함)」「계」「결제 금액」 줄은 품목이 아님', () => {
  const rows = [['견 적 서'], ['수신', '새싹초등학교'], ['순번', '품명', '규격', '단위', '수량', '단가', '공급가액', '세액', '비고'],
    ['1', '비커', '500ml', '개', '8', '4,091', '32,727', '3,273', ''], ['2', '스포이트', '3ml', '개', '20', '455', '9,091', '909', ''],
    ['', '합 계', '', '', '', '', '41,818', '4,182', ''], ['', '총 계', '', '', '', '', '46,000', '', ''], ['', '총 액(부가세 포함)', '', '', '', '', '46,000', '', '']];
  assert.deepEqual(names(findItems(rows)), ['비커', '스포이트']);
  assert.equal(total(findItems(rows)), 46000);
  assert.deepEqual(names(findItems([['품명', '수량', '단가', '금액'], ['비커', '8', '4500', '36000'], ['계', '', '', '36000']])), ['비커']);
  assert.deepEqual(names(findItems([['품목', '수량', '금액'], ['비커', '8', '36000'], ['배송비', '1', '3000'], ['결제 금액', '', '39000']])), ['비커', '배송비']);
  // 계량컵·총채 같은 품목은 그대로
  assert.deepEqual(names(findItems([['품명', '수량', '단가'], ['계량컵', '5', '600'], ['총채', '2', '2500'], ['세척솔', '3', '1000']])), ['계량컵', '총채', '세척솔']);
});

test('[fix1117-sum-6] CSV·한글 파일: 계·총액 줄을 빼고 셈(머리줄이 있어도, 「물품·가격」처럼 다른 이름이어도, 없어도)', async () => {
  const csv = t => readIntake({ file: new File([t], '견적.csv') });
  for (const [t, want] of [['품명,수량,단가,금액\n비커,8,4500,36000\n계,,,36000\n', 36000], ['비커,8,4500\n계,,36000\n', 36000],
    ['비커,8,4500\n총액,,36000\n', 36000], ['물품,개수,가격\n공책,20,1000\n계,,20000\n', 20000], ['물품,개수,가격\n공책,20,1000\n총액,,20000\n', 20000]]) {
    assert.equal(total((await csv(t)).items), want, t);
  }
  let hwp = '';
  window.SSAM.files = { readHwpText: async () => hwp };
  const hwpx = async t => { hwp = t; return readIntake({ file: new File([new Uint8Array([80, 75, 3, 4])], '행사 계획서.hwpx') }); };
  for (const [t, want] of [['소요 예산\n항목 | 내역 | 금액\n현수막 | 5m×0.9m 2개 | 90,000\n간식 | 420명 | 1,050,000\n계 | | 1,140,000', 1140000],
    ['현수막 | 2 | 45,000\n간식 | 420 | 2,500\n계 | | 1,140,000', 1140000], ['현수막 | 2 | 45,000\n간식 | 420 | 2,500\n총 계 | | 1,140,000', 1140000],
    ['가. 현수막 2개 45,000원\n나. 간식 420명 2,500원\n계 1,140,000원', 1140000]]) {
    assert.equal(total((await hwpx(t)).items), want, t);
  }
  delete window.SSAM.files;
});

test('[fix1117-sum-7] AI 답: 총계·계·총액 같은 품목은 버리고, 배송비를 품목과 배송비 두 곳에 넣으면 한 번만', () => {
  const v = normIntake({ items: [{ name: '보드게임', qty: 3, price: 25000, vendor: '가나몰' }, { name: '배송비', qty: 1, price: 3000, vendor: '가나몰' },
    { name: '총 결제금액', qty: 1, price: 78000 }, { name: '총계', qty: 1, price: 78000 }, { name: '합 계', qty: 1, price: 78000 }], shipping: [{ vendor: '가나몰', fee: 3000 }] });
  const all = [...v.items, ...shippingItems(v.shipping)];
  assert.deepEqual(names(all), ['보드게임', '배송비']);
  assert.equal(total(all), 78000);
  // 판매처가 다른 배송비는 따로, 배송비가 품목에만 있으면 그대로
  const w = normIntake({ items: [{ name: '공책', qty: 10, price: 1000, vendor: '가나몰' }, { name: '풀', qty: 5, price: 800, vendor: '다라몰' }, { name: '배송비', qty: 1, price: 2500, vendor: '다라몰' }],
    shipping: [{ vendor: '가나몰', fee: 3000 }] });
  assert.equal(total([...w.items, ...shippingItems(w.shipping)]), 10000 + 4000 + 2500 + 3000);
  assert.deepEqual(names(normQuoteItems({ items: [{ name: '비커', qty: 8, price: 4500 }, { name: '총계', qty: 1, price: 36000 }, { name: '계', qty: 1, price: 36000 }, { name: '총액', qty: 1, price: 36000 }] })), ['비커']);
});

test('[fix1117-sum-8] 행사계획 구성안 예산에 AI가 넣은 「합계·계」 줄은 빼서 품의로 넘어가도 두 번 더하지 않음', () => {
  const o = normOptions([{ label: '새로운 안', timetable: [{ time: '09:00', activity: '개회식' }],
    budget: [{ name: '현수막', amount: 90000 }, { name: '간식', amount: 1050000 }, { name: '합계', amount: 1140000 }, { name: '계', amount: 1140000 }] }]);
  assert.deepEqual(o[0].budget.map(b => b.name), ['현수막', '간식']);
});

test('[fix1117-sum-9] isTotalName: 띄어쓰기·괄호를 빼고 보고, 짧은 말은 칸 전체가 그 말일 때만', () => {
  for (const s of ['합계', '합   계', '총 계', '소 계', '계', '총액', '총 액(부가세 포함)', '공급가액', '세액', '부가가치세', 'VAT', '결제 금액', '총 결제금액', '주문금액', '총 상품가격', '할인', 'Total', 'Sub Total']) assert.ok(isTotalName(s), s);
  for (const s of ['계량컵', '총채', '세제', '합판', '공급 상자', '배송비', '모두의 마블', '할인점 상품권', '소 계량컵', '합 계산기', '', null]) assert.ok(!isTotalName(s), String(s));
});
