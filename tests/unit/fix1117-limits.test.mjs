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

import { payloadOf, startItems } from '../../web/menus/etc/docedit-model.js';

test('[limit-thing-head] 「준비물:」 같은 물건 머리 줄의 이름(흔한 이름 목록에 없는 이바다·박솔빛)도, 다른 줄에서 사람으로 쓰이면(「이바다 기록 담당」) 배워 가림 — 물건 낱말은 그대로', () => {
  const doc = ['가. 준비물: 도시락, 우비, 이바다, 박솔빛', '나. 이바다 기록 담당, 박솔빛은 사진 촬영', '다. 도시락은 각자 준비하고 우비는 미리 챙겨요.'];
  const r = makeRedactor(), out = r.lines(doc);
  assert.equal(out[0], null, '명단 줄은 보내지 않음');
  assert.ok(!/이바다|박솔빛/.test(out[1].text), out[1].text);
  assert.equal(out[2].text, doc[2], '물건 낱말은 배우지 않음');
  assert.equal(r.back(out[1].text), doc[1]);
  // 문서 다듬기도: 맨 이름(조사 없음)이 다른 줄에 나오면 가림, 「김치전 담당」의 김치전·사람으로 쓰이지 않은 오미자는 그대로
  const p = payloadOf(startItems(['메뉴: 김치전, 고구마, 이바다, 오미자', '이바다 배식 도우미, 이바다는 김치전 담당', '오미자 차를 준비합니다.'].map(text => ({ text }))), '공문체로 다듬어 줘');
  const s = p.sent.map(x => x.text);
  assert.ok(!s.some(t => t.includes('이바다')), JSON.stringify(s));
  assert.ok(s.some(t => t.includes('김치전 담당')) && s.includes('오미자 차를 준비합니다.'), '사람으로 쓰이지 않은 낱말은 배우지 않음: ' + JSON.stringify(s));
  // 사람이 아닌 목록만 있으면 아무것도 배우지 않음(예전 그대로)
  const z = makeRedactor(); z.lines(['가. 준비물: 도시락, 우비, 안내문, 신분증', '나. 도시락은 각자 담당 선생님께 냅니다.']);
  assert.deepEqual(z.names, []);
});
