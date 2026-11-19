/* 2026-11-19 다섯 번째 멀티에이전트 버그 찾기 — 계획·품의·예산(확인 6건). 다시 생기지 않게. 예시 이름은 지어낸 것 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));
const NAMES = ['김하늘', '이바다', '한가람', '박솔빛', '남다율', '탁보결', '남궁하늘'];
const leak = t => NAMES.filter(n => String(t).includes(n));
const row = it => `${it.name}|${it.spec}|${it.unit}|${it.qty}|${it.price}`;
const sum = items => items.reduce((n, x) => n + Number(x.qty) * Number(x.price), 0);

test('[0] 단가 뒤 「원」 없이 쓴 산출 근거 「간식 2,500×120명=300,000원」: 끝 금액을 단가로 읽어 합계가 부풀지 않음', async () => {
  const { parseLines, tableItems } = await import('../../web/menus/purchase/intake.js');
  for (const [t, want, total] of [
    ['간식 2,500×120명=300,000원', '간식||명|120|2500', 300000],
    ['- 간식비: 2,500×120명=300,000원', '간식비||명|120|2500', 300000],
    ['인화지 37,000×8개=296,000원', '인화지||개|8|37000', 296000],
    ['강사비 50,000×2시간=100,000원', '강사비||시간|2|50000', 100000],
    ['간식 2,500 × 120명 = 300,000원', '간식||명|120|2500', 300000],
    ['다과 5,000×20명×2회=200,000원', '다과|20명×2회||40|5000', 200000],
    ['연필 500×12자루=6,000원', '연필||자루|12|500', 6000]]) {
    const r = parseLines(t);
    assert.deepEqual(r.missed, [], t);
    assert.equal(r.items.map(row).join(' ; '), want, t);
    assert.equal(sum(r.items), total, t);
  }
  // 한 줄에 둘(원 있음·없음 섞임), 쉼표로 이은 조각 안
  assert.equal(sum(parseLines('인화지 37,000*8개=296,000원 전시 용품 11,000*31학급=341,000원').items), 637000);
  assert.equal(sum(parseLines('간식 2,500×120명=300,000원, 현수막 45,000원 2개').items), 390000);
  // 계획서 표 「항목 | 산출 근거 | 금액」의 산출 근거 칸
  const tb = tableItems('항목\t산출 근거\t금액\n간식\t2,500×120명=300,000원\t300,000');
  assert.equal(tb.items.map(row).join(' ; '), '간식||명|120|2500');
  // 단가 × 수량이 끝 금액과 맞지 않으면 어느 수가 단가인지 몰라 못 읽은 줄(예전에는 37,200,000원)
  assert.deepEqual(parseLines('간식 2,500×120명=310,000원').items, []);
  assert.equal(parseLines('간식 2,500×120명=310,000원').missed.length, 1);
  // 「=금액」 없이: × 뒤 수에 세는 말이 붙으면 그 수가 수량, × 앞 수가 단가(예전에는 20원 × 5,000명)
  for (const [t, want] of [['다과 5,000×20명', '다과||명|20|5000'], ['색연필 @1,000 x 10개', '색연필||개|10|1000'], ['간식:2,500×120명', '간식||명|120|2500'],
    ['현수막 45,000×2개=90,000', '현수막||개|2|45000'], ['다과 5,000×20명 100,000원', '다과||명|20|5000'], ['다과 5,000×20명 총 100,000원', '다과||명|20|5000']])
    assert.equal(parseLines(t).items.map(row).join(' ; '), want, t);
  // 예전 꼴은 그대로
  assert.equal(sum(parseLines('간식 2,500원×120명=300,000원').items), 300000);
  assert.equal(sum(parseLines('현수막 45,000원 × 2').items), 90000);
  assert.equal(sum(parseLines('현수막 2 × 45,000원').items), 90000);
  assert.equal(sum(parseLines('A4 용지 5박스 × 25,000원').items), 125000);
  assert.equal(sum(parseLines('볼펜 10개 × 500원').items), 5000);
  assert.equal(parseLines('하드보드지 30x40 1,000원').items[0].qty, '1');
  assert.equal(sum(parseLines('물 500ml×20병 10,000원').items), 200000);
});

test('[0] AI가 되어도 맞는 산출 근거 줄은 규칙으로 읽고 합계·품의 사유가 맞음', async () => {
  const sent = [];
  globalThis.window = { SSAM: { ai: { engineReady: () => true, generate: async p => { sent.push(p); return { text: '{"items":[]}' }; }, errMsg: () => '', providerName: () => '' } } };
  try {
    const { readIntake } = await import('../../web/menus/purchase/intake.js');
    const { reasonTail, emptyForm } = await import('../../web/menus/purchase/rules.js');
    const r = await readIntake({ text: '간식 2,500 × 120명 = 300,000원\n현수막 45,000×2개=90,000원' });
    assert.equal(r.by, 'rule');
    assert.equal(sent.length, 0);
    assert.equal(sum(r.items), 390000);
    assert.match(reasonTail({ ...emptyForm('event'), items: r.items }), /간식 2,500원 × 120명 = 300,000원/);
  } finally { delete globalThis.window; }
});

test('[1] 주문서·장바구니의 「주문자·수령인·받는 사람·구매자·요청자·신청자·구매 요청」 뒤 이름은 품의 AI로 가지 않음', async () => {
  const sent = [];
  globalThis.window = { SSAM: { ai: { engineReady: () => true, generate: async p => { sent.push(p); return { text: JSON.stringify({ items: [{ name: '색연필', spec: '12색', unit: '개', qty: 10, price: 5000 }], shipping: [], fields: {} }) }; }, errMsg: () => '', providerName: () => '' } } };
  try {
    const { readIntake, maskForAI } = await import('../../web/menus/purchase/intake.js');
    const { oneshotPrompt } = await import('../../web/menus/purchase/oneshot.js');
    const { emptyForm } = await import('../../web/menus/purchase/rules.js');
    const text = ['주문 상품', '색연필 12색 10개 5,000원', '배송비 3,000원', '주문자 남다율', '수령인 박솔빛', '구매 요청: 탁보결'].join('\n');
    const r = await readIntake({ text });
    assert.equal(r.by, 'ai');
    assert.deepEqual(leak(sent.join('\n')), [], '넣기 AI');
    assert.deepEqual(leak(oneshotPrompt({ ...emptyForm('goods'), items: r.items }, text, {})), [], '초안 AI');
    for (const l of ['주문자: 남다율', '주문자 남다율', '주문자명 남다율', '주문자 성명: 남다율', '수령인 박솔빛', '수령자 : 탁보결 (행정실)', '받는 사람: 박솔빛', '받는분: 이바다',
      '구매자 탁보결', '요청자: 탁보결', '신청자: 탁보결', '신청인 남다율', '구입 요청: 탁보결', '주문하신 분 남다율', '수령인 남다율님', '주문자: 남궁하늘', '주문자 남다율 010-1234-5678'])
      assert.deepEqual(leak(maskForAI(l)), [], l);
    // 이름이 아닌 말·품목 줄은 그대로(품목 이름이 ○○○이 되지 않게)
    for (const l of ['주문자 정보', '주문자 정보 확인', '수령인 연락처', '받는 사람 주소', '구매자 부담', '신청자 명단', '신청자 수 20명', '구매 요청 사항', '구매 요청서 1부',
      '신청인 서명란', '신청자 안내문 10장 500원', '신청자 모집 포스터 2장 3,000원', '보내는 분 새싹초등학교', '수령인: 행정실'])
      assert.equal(maskForAI(l), l, l);
  } finally { delete globalThis.window; }
});

test('[2] 예산 탭에서 바꾼 품의 줄의 사업: 최근 작성의 품의도 그 사업(자리·시각은 그대로)', async () => {
  const { pushRecent, listRecent, setRecentProject } = await import('../../web/menus/purchase/library.js');
  pushRecent({ id: 'pcA', at: 100, form: { type: 'goods', items: [], projectId: 'bpA', projectSet: true }, draft: { title: '과학 실험 재료 구입' } });
  pushRecent({ id: 'pcB', at: 200, form: { type: 'goods', items: [], projectId: '', projectSet: false }, draft: { title: '학급 문고 도서 구입' } });
  assert.equal(setRecentProject('pcA', 'bpB'), true);
  const l = listRecent();
  assert.deepEqual(l.map(x => x.id), ['pcB', 'pcA'], '자리 그대로');
  assert.equal(l[1].at, 100, '시각 그대로');
  assert.equal(l[1].form.projectId, 'bpB');
  assert.equal(l[1].form.projectSet, true, '선생님이 고른 것(미리 골라 두기가 덮지 않음)');
  setRecentProject('pcB', '');
  assert.deepEqual([listRecent()[0].form.projectId, listRecent()[0].form.projectSet], ['', true], '「사업 없음」도 고른 것');
  assert.equal(setRecentProject('pcZ', 'bpB'), false, '최근 작성에 없는 품의');
  // budget.js가 바꾼 뒤 알림을 보내고 purchase.js가 받음(화면 흐름은 e2e fix1119-bugs5-budget-move.mjs)
  const fs = await import('node:fs');
  const src = f => fs.readFileSync(new URL(`../../web/menus/purchase/${f}`, import.meta.url), 'utf8');
  assert.match(src('budget.js'), /setRecentProject\(id, project\)[\s\S]*ssam:budget-move/);
  assert.match(src('purchase.js'), /addEventListener\('ssam:budget-move'/);
});

test('[3] 강사 수당 원천징수는 정수로: 소득세·지방소득세를 따로 10원 아래 버림(180,000원 → 15,840원)', async () => {
  const { withholding } = await import('../../web/menus/purchase/rules.js');
  assert.deepEqual([withholding(180000, 'other').tax, withholding(180000, 'other').net], [15840, 164160]);
  assert.equal(withholding(360000, 'other').tax, 31680);
  assert.equal(withholding(720000, 'other').tax, 63360);
  assert.deepEqual([withholding(200000, 'other').tax, withholding(200000, 'other').net], [17600, 182400]);
  assert.equal(withholding(125000, 'other').tax, 0);
  assert.equal(withholding(123456, 'business').tax, 4070);
  const right = (a, inc) => { if (inc === 'other' && a <= 125000) return 0; const it = Math.floor(a * (inc === 'business' ? 3 : 8) / 1000) * 10; return it + Math.floor(it / 100) * 10; };
  for (let a = 130000; a <= 2000000; a += 10000) for (const inc of ['other', 'business']) assert.equal(withholding(a, inc).tax, right(a, inc), `${a} ${inc}`);
  assert.equal(withholding(1, 'staff').tax, null);
});

test('[4] 괄호 안 크기 「현수막(5m×0.9m) 2개 45,000원」: 품명 「현수막」, 규격 「5m×0.9m」, 크기를 수량으로 읽지 않음', async () => {
  const { parseLines } = await import('../../web/menus/purchase/intake.js');
  const { reasonTail, emptyForm } = await import('../../web/menus/purchase/rules.js');
  for (const [t, want] of [
    ['현수막(5m×0.9m) 2개 45,000원', '현수막|5m×0.9m|개|2|45000'],
    ['현수막 (5m x 0.9m) 2개 45,000원', '현수막|5m×0.9m|개|2|45000'],
    ['현수막 5mx0.9m 1개 45,000원', '현수막|5m×0.9m|개|1|45000'],
    ['배너 (60×180cm) 1개 30,000원', '배너|60×180cm|개|1|30000'],
    ['돗자리(2m×3m) 5개 12,000원', '돗자리|2m×3m|개|5|12000'],
    ['현수막(5m×0.9m) 45,000원', '현수막|5m×0.9m||1|45000'],
    ['현수막 5m×0.9m 45,000원', '현수막|5m×0.9m||1|45000'],
    ['현수막(5m×0.9m) 2개 45,000', '현수막|5m×0.9m|개|2|45000'],
    ['색종이 10×10cm 5묶음 3,000원', '색종이|10×10cm|묶음|5|3000']])
    assert.equal(parseLines(t).items.map(row).join(' ; '), want, t);
  const tail = reasonTail({ ...emptyForm('goods'), items: parseLines('현수막(5m×0.9m) 2개 45,000원\n비커(500ml) 8개 4,500원').items });
  assert.match(tail, /현수막\(5m×0\.9m\) 45,000원 × 2개 = 90,000원/);
  assert.doesNotMatch(tail, /\(\s*\)/);
  // 예전 꼴은 그대로
  assert.equal(parseLines('비커(500ml) 8개 4,500원').items.map(row).join(), '비커|500ml|개|8|4500');
  assert.equal(parseLines('천 1.5m 3개 9,000원').items.map(row).join(), '천|1.5m|개|3|9000');
  assert.equal(parseLines('현수막 5m 1개 45,000원').items.map(row).join(), '현수막|5m|개|1|45000');
});

test('[5] 예산 사업·직접 더하기 금액 「50만원」「150만 원」「1만 5천원」을 읽음(말없이 0원으로 저장되지 않음)', async () => {
  const B = await import('../../web/menus/purchase/budget-model.js');
  for (const [a, want] of [['50만원', 500000], ['50만', 500000], ['150만 원', 1500000], ['1만 5천원', 15000], ['1만 5000원', 15000], ['1.5만', 15000], ['120만원', 1200000],
    ['500,000', 500000], ['1,500,000원', 1500000], ['₩500,000', 500000], ['', 0], ['abc', 0]])
    assert.equal(B.saveProject({ name: `사업 ${a}`, amount: a }).amount, want, a);
  assert.equal(B.addManual({ project: 'bpA', title: '11월 전에 쓴 돈', amount: '12만원', date: '2026-11-18' }).amount, 120000);
  assert.equal(B.toWon('50만원'), 500000);
  assert.equal(B.toWon('오십만'), 0);
  const fs = await import('node:fs');
  assert.match(fs.readFileSync(new URL('../../web/menus/purchase/budget.js', import.meta.url), 'utf8'), /!B\.toWon\(amt\)\) \{ toast\('예산을 숫자로 넣어 주세요/);
});
