/* 품의 짧게(2026-11-17 선생님 요청): 구입 품목 3개 이상은 「○○ 외 2개」, 「기타:」 바로 아래 붙임(빈 줄 없음),
   첫 문장은 한두 줄의 한 문장(「… 운영 물품을 구매하고자 합니다.」), 관련 기본값은 「학교명-xxxxx(올해. xx. xx.)」 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyForm, reasonTail, reasonTailV2, reasonTailV1, oldTails, itemsSummary, relatedLine, relatedLineV1, relatedFill, hasDocNo, composeReason, shortIntro, TYPES } from '../../web/menus/purchase/rules.js';
import { oneshotPrompt, normOneshot, confirmChips } from '../../web/menus/purchase/oneshot.js';
import { purchaseReviewPrompt } from '../../web/core/ai-review.js';

const it3 = [{ name: '비커', spec: '500ml', qty: 8, price: 4500 }, { name: '유리 막대', spec: '30cm', qty: 8, price: 1200 }, { name: '전자저울', spec: '', qty: 4, price: 23000 }];
const goods = items => ({ ...emptyForm('goods'), items });

test('구입 품목이 3개 이상이면 첫 품목 외 n개', () => {
  assert.equal(itemsSummary(it3, 'goods'), '비커(500ml) 외 2개');
  assert.equal(itemsSummary([...it3, { name: '스포이트', qty: 10, price: 300 }], 'goods'), '비커(500ml) 외 3개');
  assert.match(reasonTail(goods(it3)), /^ {2}가\. 구입 품목: 비커\(500ml\) 외 2개\n {2}나\. 지출액: 금137,600원\(금일십삼만칠천육백원\)\n {2}다\. 기타:\n붙임/);
  // 강사 수당은 사람 수로
  const lec = { ...emptyForm('lecturer'), items: [{ name: '강사 수당', spec: '2시간', qty: 2, price: 50000 }, { name: '강사 수당', qty: 2, price: 50000 }, { name: '보조 강사 수당', qty: 2, price: 30000 }] };
  assert.match(reasonTail(lec), /가\. 지급 내역: 강사 수당\(2시간\) 외 2명\n/);
});

test('품목이 1~2개면 산출 근거 그대로', () => {
  assert.match(reasonTail(goods(it3.slice(0, 2))), /가\. 구입 품목: 비커\(500ml\) 4,500원 × 8개 = 36,000원, 유리 막대\(30cm\) 1,200원 × 8개 = 9,600원\n/);
  assert.match(reasonTail(goods(it3.slice(0, 1))), /가\. 구입 품목: 비커\(500ml\) 4,500원 × 8개 = 36,000원\n/);
});

test('「기타:」 바로 아래에 붙임(빈 줄 없음)', () => {
  const t = reasonTail(goods(it3));
  assert.match(t, / {2}다\. 기타:\n붙임 {2}1\. 지출품의서 1부\.\n {6}2\. 견적서 1부\. {2}끝\.$/);
  assert.ok(!t.includes('\n\n'), t);
});

test('예전 꼴(0.34·0.33)은 견줄 때만 — 지금 꼴과 다름', () => {
  const f = goods([...it3, { name: '스포이트', qty: 10, price: 300 }]);
  assert.match(reasonTailV2(f), /가\. 구입 품목: 비커\(500ml\) 4,500원 × 8개 = 36,000원 외 3건\n {2}나\. 지출액: [^\n]+\n {2}다\. 기타:\n\n붙임/);
  assert.notEqual(reasonTailV2(f), reasonTail(f));
  assert.deepEqual(oldTails(f), [reasonTailV2(f), reasonTailV1(f)]);
});

test('관련 기본값: 저장된 학교 이름-xxxxx(올해. xx. xx.)', () => {
  assert.equal(relatedLine(emptyForm('goods'), 2026, '새싹초등학교'), '새싹초등학교-xxxxx(2026. xx. xx.)');
  assert.equal(relatedLine(emptyForm('goods'), 2027, ' 새싹초등학교 '), '새싹초등학교-xxxxx(2027. xx. xx.)');
  // 학교 이름을 저장하지 않았으면 xx초등학교
  assert.equal(relatedLine(emptyForm('goods'), 2026), 'xx초등학교-xxxxx(2026. xx. xx.)');
  // 사업명이 있어도 기본값은 같음(지어낸 「○○ 운영 계획」 제목은 붙이지 않음)
  assert.equal(relatedLine({ ...emptyForm('event'), project: '가을 학교 축제' }, 2026, '새싹초등학교'), '새싹초등학교-xxxxx(2026. xx. xx.)');
  // 선생님이 쓴 관련은 그대로
  assert.equal(relatedLine({ ...emptyForm('goods'), related: '과학 동아리 운영 계획' }, 2026, '새싹초등학교'), '과학 동아리 운영 계획');
  assert.equal(composeReason({ intro: '과학 탐구 동아리 운영 물품을 구매하고자 합니다.', form: goods(it3), year: 2026, school: '새싹초등학교' }).split('\n').slice(0, 3).join('\n'),
    '1. 관련: 새싹초등학교-xxxxx(2026. xx. xx.)\n2. 과학 탐구 동아리 운영 물품을 구매하고자 합니다.\n  가. 구입 품목: 비커(500ml) 외 2개');
});

test('예전 관련 기본값(0.34까지)은 견줄 때만', () => {
  assert.equal(relatedLineV1(emptyForm('goods'), 2026), '2026학년도 학교 교육과정 운영 계획');
  assert.equal(relatedLineV1({ ...emptyForm('event'), project: '가을 학교 축제' }, 2026), '2026학년도 가을 학교 축제 운영 계획');
});

test('계획서·AI가 채운 관련: 문서 번호가 없으면 「학교-xxxxx(올해. xx. xx.) 「제목」」', () => {
  const ctx = { school: '새싹초등학교', year: 2026 };
  assert.equal(relatedFill('2026학년도 과학 탐구 동아리 운영 계획', ctx), '새싹초등학교-xxxxx(2026. xx. xx.) 「2026학년도 과학 탐구 동아리 운영 계획」');
  assert.equal(relatedFill('「2026학년도 과학 탐구 동아리 운영 계획」', ctx), '새싹초등학교-xxxxx(2026. xx. xx.) 「2026학년도 과학 탐구 동아리 운영 계획」');
  // 문서 번호·날짜가 있으면 그대로
  for (const s of ['○○교육청 과학과-1234(2026. 11. 2.)', '새싹초등학교-567(2026. 3. 5.) 「과학 동아리 운영 계획」', '2026학년도 과학 동아리 운영 계획(새싹초등학교-567, 2026. 3. 5.)', '새싹초등학교-xxxxx(2026. xx. xx.)'])
    assert.equal(relatedFill(s, ctx), s);
  // 다른 기관 공문 제목은 우리 학교 번호를 붙이지 않음
  assert.equal(relatedFill('○○교육지원청 독서 교육 활성화 계획', ctx), '○○교육지원청 독서 교육 활성화 계획');
  assert.equal(relatedFill('', ctx), '');
  assert.equal(relatedFill('  ', ctx), '');
  // 이름 속 붙임표는 문서 번호가 아님
  assert.ok(!hasDocNo('AI-디지털 교육 운영 계획'));
  assert.ok(!hasDocNo('1-2학기 방과후 운영 계획'));
  assert.ok(hasDocNo('과학과-1234'));
});

test('첫 문장은 한 문장, 「다음과 같이」 없이', () => {
  assert.equal(shortIntro('2. 과학 탐구 동아리 운영을 위하여 필요한 물품을 다음과 같이 구매하고자 합니다. 이 물품은 동아리 활동에 쓰입니다.'),
    '과학 탐구 동아리 운영을 위하여 필요한 물품을 구매하고자 합니다.');
  assert.equal(shortIntro('과학 탐구 동아리 운영 물품을 구매하고자 합니다.'), '과학 탐구 동아리 운영 물품을 구매하고자 합니다.');
  // 날짜로 시작하는 문장은 날짜에서 자르지 않음
  assert.equal(shortIntro('2026. 11. 20.(금) 가을 학교 축제 운영 물품을 구매하고자 합니다.'), '2026. 11. 20.(금) 가을 학교 축제 운영 물품을 구매하고자 합니다.');
  assert.equal(shortIntro(''), '');
});

test('초안 AI 규칙: 짧은 한 문장 예시, 「다음과 같이」를 시키지 않음', () => {
  for (const t of TYPES) {
    const p = oneshotPrompt({ ...emptyForm(t.id), purpose: '동아리 활동', items: it3 }, '');
    assert.ok(!/다음과 같이 (?:구입|지급|운영)/.test(p), t.id);
    assert.match(p, /intro: 한 문장, 번호 없이, 한두 줄\(40자 안팎\)/);
  }
  assert.match(oneshotPrompt(goods(it3), ''), /과학 탐구 동아리 운영 물품을 구매하고자 합니다/);
  assert.match(oneshotPrompt({ ...emptyForm('lecturer'), items: it3 }, ''), /진로 체험 특강 강사 수당을 지급하고자 합니다/);
  const n = normOneshot({ title: '과학 동아리 물품 구입', intro: '2. 과학 탐구 동아리 운영을 위하여 물품을 다음과 같이 구매하고자 합니다. 자세한 내용은 아래와 같습니다.' }, goods(it3));
  assert.equal(n.intro, '과학 탐구 동아리 운영을 위하여 물품을 구매하고자 합니다.');
  assert.ok(!/…다음과 같이/.test(purchaseReviewPrompt('- 종류: 물품 구입', { title: 't', intro: 'i' })));
});

test('관련 칩: 비었거나 xxxxx가 남아 있으면 문서 번호·날짜를 채우라고', () => {
  const chip = f => confirmChips(f, { warnings: [] }, []).find(c => c.key === 'related');
  assert.equal(chip(goods(it3)).text, '관련 · 문서 번호·날짜 채우기');
  assert.equal(chip({ ...goods(it3), related: '새싹초등학교-xxxxx(2026. xx. xx.) 「과학 동아리 운영 계획」' }).text, '관련 · 문서 번호·날짜 채우기');
  assert.equal(chip({ ...goods(it3), related: '새싹초등학교-567(2026. 3. 5.)' }), undefined);
});
