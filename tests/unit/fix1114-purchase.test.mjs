// 품의 버그 찾기(2026-11-14): 한 줄에 쉼표로 이어 쓴 품목 여럿(「색종이 10묶음 3,000원, 풀 20개 500원」)이 한 품목으로 섞여 합계가 틀리던 것,
// 견적서·엑셀 머리줄 「수량(개)」「단가(원)」을 못 읽어 수량이 1이 되던 것, 넣은 글의 「김하늘 학생」 같은 학생 이름을 AI로 보내던 것,
// 「관련」 칸의 주민번호·계좌번호를 막지 않던 것
import test from 'node:test';
import assert from 'node:assert/strict';

const calls = [];
globalThis.window = { SSAM: { ai: { generate: async prompt => { calls.push(prompt); return { text: '{"items":[{"name":"상장 액자","qty":1,"price":5000}]}' }; }, engineReady: () => true, errMsg: c => c } } };
const { parseLines, readIntake, maskNames, tableItems } = await import('../../web/menus/purchase/intake.js');
const { oneshotPrompt } = await import('../../web/menus/purchase/oneshot.js');
const { emptyForm, checkPurchase } = await import('../../web/menus/purchase/rules.js');
const { findItems } = await import('../../web/core/sheet.js');
const row = it => [it.name, it.unit, it.qty, it.price];

test('한 줄에 쉼표로 이은 품목 여럿은 품목마다 따로 읽음(앞 품목의 수량·단가가 사라지지 않게)', () => {
  assert.deepEqual(parseLines('색종이 10묶음 3,000원, 풀 20개 500원').items.map(row), [['색종이', '묶음', '10', '3000'], ['풀', '개', '20', '500']]);
  assert.deepEqual(parseLines('보드게임 3개 25,000원, 배송비 3,000원').items.map(row), [['보드게임', '개', '3', '25000'], ['배송비', '건', '1', '3000']]);
  // 줄 머리·일시 조각이 섞여도
  assert.deepEqual(parseLines('1. 우유 20개 1,000원; 빵 20개 1,500원, 6월 3일 현장체험학습').items.map(row), [['우유', '개', '20', '1000'], ['빵', '개', '20', '1500']]);
  // 품목 하나를 쉼표로 나눠 쓴 것은 그대로 한 품목
  assert.deepEqual(parseLines('A4 용지 5박스, 2만원').items.map(row), [['A4 용지', '박스', '5', '20000']]);
  assert.deepEqual(parseLines('간식 2,500원, 420명').items.map(row), [['간식', '명', '420', '2500']]);
  assert.deepEqual(parseLines('알코올램프 10개 5,000원, 다음 주 화요일 과학실').items.map(row), [['알코올램프', '개', '10', '5000']]);
  assert.deepEqual(parseLines('볼펜(검정, 빨강) 20자루 500원').items.map(row), [['볼펜(검정, 빨강)', '자루', '20', '500']]);
});

test('쉼표로 이은 품목 여럿: 「총」으로 적은 금액은 조각마다 맞춰 셈(총액 칸이 틀리지 않게)', () => {
  const r = parseLines('건전지 40개 총 2만원, 풀 10개 500원');
  assert.deepEqual(r.items.map(row), [['건전지', '개', '40', '500'], ['풀', '개', '10', '500']]);
  assert.equal(r.fields.total, undefined);
});

test('견적서·엑셀 머리줄의 괄호 붙은 열 이름(「수량(개)」「단가(원)」「금액(원)」「수량(EA)」)도 읽음', () => {
  assert.deepEqual(findItems([['품명', '규격', '수량(개)', '단가(원)', '금액(원)'], ['비커', '500ml', '8', '4,500', '36,000']]),
    [{ name: '비커', spec: '500ml', qty: 8, price: 4500 }]);
  assert.deepEqual(findItems([['품목', '수량(EA)', '금액（원）'], ['A4 용지', '5', '100,000']]), [{ name: 'A4 용지', spec: '', qty: 5, price: 20000 }]);
  assert.deepEqual(tableItems('품명\t수량(개)\t단가(원)\n공책\t20\t1,000').items.map(row), [['공책', '', '20', '1000']]);
});

test('원 표시 「￦3,000」(전각)·「\\3,000」(한글 윈도 CSV)·「₩3,000」 금액을 0원이나 수량으로 읽지 않음', async () => {
  const { toNumber } = await import('../../web/menus/purchase/rules.js');
  for (const v of ['\\3,000', '￦3,000', '₩3,000', '￦ 3,000']) assert.equal(toNumber(v), 3000, v);
  assert.deepEqual(findItems([['품명', '수량', '단가'], ['비커', '4', '\\3,000'], ['스포이트', '20', '￦500']]).map(x => [x.name, x.qty, x.price]), [['비커', 4, 3000], ['스포이트', 20, 500]]);
  assert.deepEqual(tableItems('비커\t4\t￦3,000\n스포이트\t20\t\\500').items.map(it => [it.name, it.spec, it.qty, it.price]), [['비커', '', '4', '3000'], ['스포이트', '', '20', '500']]);
  assert.deepEqual(parseLines('비커 4개 ￦3,000\n스포이트 20개 ₩500').items.map(row), [['비커', '개', '4', '3000'], ['스포이트', '개', '20', '500']]);
});

test('AI로 보내는 글의 학생·보호자 이름(「김하늘 학생」「학생 이바다」「한가람 어머니」)은 ○○○로 가림', () => {
  assert.equal(maskNames('김하늘 학생 상장 액자 1개 5,000원'), '○○○ 학생 상장 액자 1개 5,000원');
  assert.equal(maskNames('학생 이바다 체험학습비 1명 30,000원'), '학생 ○○○ 체험학습비 1명 30,000원');
  assert.equal(maskNames('한가람 학생의 보조 기구'), '○○○ 학생의 보조 기구');
  assert.equal(maskNames('이바다 어머니 상담 다과'), '○○○ 어머니 상담 다과');
  // 학생을 꾸미는 말·학생 모임 이름은 그대로
  for (const s of ['학생회 간식 30개 1,000원', '학생 수 30명', '성실한 학생 시상품', '신청한 학생 간식', '학생 자치회 운영', '고학년 학생 간식']) assert.equal(maskNames(s), s);
});

test('학생 이름은 넣기 글을 AI로 읽을 때도, 초안 AI에도 가지 않음', async () => {
  calls.length = 0;
  await readIntake({ text: '김하늘 학생 상장 액자 하나 부탁해요' });
  assert.equal(calls.length, 1);
  assert.ok(!calls[0].includes('김하늘'), calls[0].slice(-200));
  const f = { ...emptyForm('goods'), purpose: '시상', memo: '이바다 학생 전학 기념', items: [{ name: '한가람 학생 앨범', spec: '', unit: '권', qty: '1', price: '15000', vendor: '' }] };
  const p = oneshotPrompt(f, '한가람 학생 앨범 1권 15,000원');
  for (const n of ['이바다', '한가람']) assert.ok(!p.includes(n), p);
});

test('한글 파일(.hwpx·.hwp)에 품목 머리줄 없는 표나 줄글로 적은 목록도 읽음(「품목을 찾지 못했어요」로 끝나지 않게)', async () => {
  let text = '';
  window.SSAM.files = { readHwpText: async () => text };
  const file = name => new File([new Uint8Array([80, 75, 3, 4])], name);
  calls.length = 0;
  text = '알코올램프 10개 5,000원\n비커 500ml 8개 4,500원';
  let r = await readIntake({ file: file('구입 목록.hwpx') });
  assert.deepEqual(r.items.map(row), [['알코올램프', '개', '10', '5000'], ['비커', '개', '8', '4500']]);
  assert.equal(calls.length, 0);
  // 머리줄 없는 표(칸은 「 | 」로 옴)
  text = '알코올램프 | 10 | 5,000\n비커 | 8 | 4,500';
  r = await readIntake({ file: file('목록.hwp') });
  assert.deepEqual(r.items.map(it => [it.name, it.qty, it.price]), [['알코올램프', '10', '5000'], ['비커', '8', '4500']]);
  // 품명·단가 머리줄이 있는 견적서 표는 지금처럼 표로
  text = '품명 | 규격 | 수량 | 단가\n비커 | 500ml | 4 | 3,000';
  r = await readIntake({ file: file('견적서.hwpx') });
  assert.deepEqual(r.items.map(it => [it.name, it.spec, it.qty, it.price]), [['비커', '500ml', '4', '3000']]);
  // 강사 수당은 한글 파일 줄글도 AI로 보내지 않음
  text = '외부 강사 김하늘 특강 부탁드려요';
  calls.length = 0;
  r = await readIntake({ file: file('강사.hwpx'), noAI: true });
  assert.equal(calls.length, 0);
  delete window.SSAM.files;
});

test('「관련」 칸에 주민번호·계좌번호가 있으면 막음(다른 칸과 같게)', () => {
  const base = { ...emptyForm('goods'), purpose: '수업', items: [{ name: '공책', spec: '', unit: '', qty: '1', price: '1000', vendor: '' }] };
  for (const related of ['900101-1234567', '신한은행 110-123-456789']) {
    const r = checkPurchase({ ...base, related });
    assert.deepEqual(r.personal, ['related']);
    assert.equal(r.canDraft, false);
  }
  assert.equal(checkPurchase({ ...base, related: '○○교육청 과학과-1234(2026. 11. 2.)' }).canDraft, true);
});
