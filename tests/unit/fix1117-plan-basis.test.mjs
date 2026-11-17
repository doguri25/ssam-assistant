/* 2026-11-17 선생님 요청: 계획서를 넣으면 품명이 규격 칸에 들어가던 것 — 예산 표 「항목 | 산출 근거 | 금액」의 산출 근거 칸
   (「인화지 37,000원*8개=296,000원 전시 용품 11,000원*31학급=341,000원 …」)을 품목마다 나눔. 예시는 지어낸 것 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basisItems, splitBasis, tableItems, parseLines, normIntake } from '../../web/menus/purchase/intake.js';
import { reasonTail, emptyForm, sumItems } from '../../web/menus/purchase/rules.js';

const CELL = '사진 인화지(RP-108) 37,000원*8개=296,000원 전시판·집게줄 등 전시 용품 11,000원*31학급=341,000원 포토존 소품(피켓·머리띠 등) 45,000원*1식=45,000원';
const pick = its => its.map(it => [it.name, it.spec, it.unit, it.qty, it.price]);

test('산출 근거 한 칸에 든 여러 품목을 나눔(단위는 학급·식처럼 아무 말이나)', () => {
  assert.deepEqual(pick(basisItems(CELL)), [['사진 인화지(RP-108)', '', '개', '8', '37000'], ['전시판·집게줄 등 전시 용품', '', '학급', '31', '11000'], ['포토존 소품(피켓·머리띠 등)', '', '식', '1', '45000']]);
  // 곱하기가 둘이면 수량은 곱, 규격에 「420명×2회」
  assert.deepEqual(pick(basisItems('간식 2,500원*420명*2회=2,100,000원')), [['간식', '420명×2회', '', '840', '2500']]);
  assert.deepEqual(pick(basisItems('비커 4,500원 × 8개 = 36,000원')), [['비커', '', '개', '8', '4500']]);
  // 품명이 없으면 줄의 품명, 앞 글이 크기뿐이면 규격
  assert.deepEqual(pick(basisItems('4,500원×8개=36,000원', '비커')), [['비커', '', '개', '8', '4500']]);
  assert.deepEqual(pick(basisItems('500ml 4,500원×8개=36,000원', '비커')), [['비커', '500ml', '개', '8', '4500']]);
  // 산출 근거 꼴이 아니거나 다른 숫자가 남으면 null
  for (const s of ['500ml', 'A4 80g 2500매', '비커 4,500원 8개', '인화지 37,000원*8개=296,000원 외 배송비 3,000원', ''])
    assert.equal(basisItems(s), null, s);
  assert.deepEqual(pick(basisItems('인화지 37,000원*8개=296,000원 (부가세 포함)')), [['인화지', '', '개', '8', '37000']]);
});

test('계획서 예산 표: 항목은 품명이 아니고, 산출 근거의 품목들이 품명·단위·수량·단가로', () => {
  const table = ['항목\t산출 근거\t금액', `친구 사진전\t${CELL}\t682,000원`, '평화 퍼즐\t학급용 빈 퍼즐(협동 작품) 8,000원*31학급=248,000원\t248,000원', '마음 요리사\t운영비(상품) 300,000원*1식=300,000원\t300,000원'].join('\n');
  const r = tableItems(table);
  assert.deepEqual(r.items.map(it => it.name), ['사진 인화지(RP-108)', '전시판·집게줄 등 전시 용품', '포토존 소품(피켓·머리띠 등)', '학급용 빈 퍼즐(협동 작품)', '운영비(상품)']);
  assert.ok(r.items.every(it => it.spec === ''), JSON.stringify(r.items));
  assert.equal(sumItems(r.items), 682000 + 248000 + 300000);
  // 3개 이상이면 「첫 품목 외 n종」
  assert.match(reasonTail({ ...emptyForm('goods'), items: r.items }), /가\. 구입 품목: 사진 인화지\(RP-108\) 외 4종\n/);
  // 머리줄이 없거나(표가 15줄 아래에 있음) 머리줄을 못 찾으면: 둘째 칸(산출 근거)이 규격으로 읽혔던 줄도 나눔
  assert.deepEqual(tableItems(`친구 사진전\t${CELL}\t682,000원`).items.map(it => it.name), ['사진 인화지(RP-108)', '전시판·집게줄 등 전시 용품', '포토존 소품(피켓·머리띠 등)']);
  // 산출 근거 칸이 그 꼴이 아니면 예전처럼 항목 한 줄(금액 그대로)
  assert.deepEqual(pick(tableItems('항목\t산출 근거\t금액\n체험 학습 버스\t버스 2대 왕복\t900,000원').items), [['체험 학습 버스', '', '', '1', '900000']]);
  // 금액이 없는 줄(계획서 본문·날짜)은 못 읽은 줄로 세지 않음(금액이 있는데 못 읽은 줄만)
  assert.deepEqual(tableItems(`1. 목적\n2026. 11. 25.(수) 3~4교시\n친구 사진전\t${CELL}\t682,000원\n알 수 없는 줄 5,000원 정도`).missed, ['알 수 없는 줄 5,000원 정도']);
  // 산출 근거 꼴이 아닌 규격은 그대로
  assert.deepEqual(pick(splitBasis([{ name: '비커', spec: '500ml', unit: '개', qty: '8', price: '4500', vendor: '' }])), [['비커', '500ml', '개', '8', '4500']]);
});

test('줄글·AI가 읽은 것도 같은 규칙', () => {
  assert.deepEqual(pick(parseLines('전시 용품 11,000원*31학급=341,000원\n포토존 소품 45,000원*1식=45,000원').items), [['전시 용품', '', '학급', '31', '11000'], ['포토존 소품', '', '식', '1', '45000']]);
  const n = normIntake({ items: [{ name: '친구 사진전', spec: CELL, qty: 1, price: 682000 }] });
  assert.deepEqual(n.items.map(it => [it.name, it.unit, it.qty, it.price]), [['사진 인화지(RP-108)', '개', '8', '37000'], ['전시판·집게줄 등 전시 용품', '학급', '31', '11000'], ['포토존 소품(피켓·머리띠 등)', '식', '1', '45000']]);
});
