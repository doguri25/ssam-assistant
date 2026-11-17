/* 2026-11-17 남은 한계 고침: 품의 「총 N자루 M원」, 이름 가리기(「김정대로 바꿔 줘」·물건 머리 아래 이름), 기준표 칸의 이름이 채점 AI로 가는 것.
   이름은 모두 지어낸 것 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLines } from '../../web/menus/purchase/intake.js';

const rows = t => parseLines(t).items.map(i => [i.name, i.qty, i.unit, i.price]);

test('[limit-qty-all] 「볼펜 총 30자루 15,000원」: 수량 앞 「총」은 모두 합한 수량, 같이 적은 금액은 총액(단가 = 금액 ÷ 수량)', () => {
  assert.deepEqual(rows('볼펜 총 30자루 15,000원'), [['볼펜', '30', '자루', '500']]);
  assert.deepEqual(rows('공책 총 20권 1만원'), [['공책', '20', '권', '500']]);
  assert.deepEqual(rows('간식 총 30인분 90,000원'), [['간식', '30', '인분', '3000']]);
  // 예전부터 되던 꼴은 그대로
  assert.deepEqual(rows('볼펜 30자루 총 15,000원'), [['볼펜', '30', '자루', '500']]);
  assert.deepEqual(rows('색종이 10묶음 3000원'), [['색종이', '10', '묶음', '3000']]);
  assert.equal(parseLines('총 5만원').fields.total, '50000');
  // 단가·금액을 함께 적었으면 단가(「총 30자루 500원 = 15,000원」)
  assert.deepEqual(rows('볼펜 총 30자루 500원 = 15,000원'), [['볼펜', '30', '자루', '500']]);
});

import { maskJosaNames } from '../../web/core/privacy.js';
import { maskPersons } from '../../web/core/chat-names.js';
import { makeRedactor } from '../../web/core/redact.js';

test('[limit-jeongdae] 「김정대로 바꿔 줘」의 이름(정대)은 가리고, 「예정대로·지정대로·설정대로·규정대로」 같은 낱말은 그대로', () => {
  for (const [l, n] of [['담당자를 김정대로 바꿔 줘.', '김정대'], ['학생회장은 이정대로 정함.', '이정대'], ['대표를 박정대로 변경합니다.', '박정대']]) {
    const r = makeRedactor(), out = r.line(l).text;
    assert.ok(!out.includes(n), `${l} → ${out}`);
    assert.equal(r.back(out), l);
    assert.ok(!maskPersons(l).text.includes(n), `persons: ${l}`);
  }
  for (const w of ['예정대로', '지정대로', '설정대로', '규정대로', '결정대로', '확정대로', '책정대로', '측정대로', '약정대로', '선정대로', '수정대로', '조정대로', '배정대로', '정반대로']) {
    for (const l of [`${w} 바꿔 줘`, `${w} 변경합니다.`, `${w} 진행합니다.`]) {
      const r = makeRedactor();
      assert.equal(r.line(l).text, l, l);
      assert.deepEqual(r.names, [], l);
      assert.equal(maskJosaNames(l).text, l, `josa: ${l}`);
      assert.equal(maskPersons(l).text, l, `persons: ${l}`);
    }
  }
});
