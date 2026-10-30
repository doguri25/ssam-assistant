// 견적서 읽기: 엑셀·CSV는 표에서(AI 없이), AI 답 다듬기(합계·부가세 줄 빼기)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readQuote, normQuoteItems, quotePrompt } from '../../web/menus/purchase/quote.js';

test('견적서 CSV: 머리 줄을 찾아 품목 3개, 합계 줄은 뺌, AI 안 씀', async () => {
  const buf = readFileSync(new URL('../fixtures/quote.csv', import.meta.url));
  const r = await readQuote(new File([buf], '견적서.csv'));
  assert.equal(r.by, 'table');
  assert.deepEqual(r.items.map(i => [i.name, i.spec, i.qty, i.price]), [['비커', '500ml', 4, 3000], ['스포이트', '3ml', 20, 500], ['실험 장갑', 'M', 2, 4500]]);
});

test('AI 답 다듬기: 합계·소계·부가세·공급가액 줄과 이름 없는 줄은 빼고 숫자로', () => {
  const v = { items: [{ name: '비커', spec: '500ml', qty: '2', price: '3,000' }, { name: '합계', price: 6000 }, { name: '부가세', price: 600 }, { name: '', price: 1 }, { name: '공급가액', price: 6000 }] };
  assert.deepEqual(normQuoteItems(v), [{ name: '비커', spec: '500ml', qty: 2, price: 3000 }]);
  assert.ok(quotePrompt().startsWith('[견적서 읽기]'));
});
