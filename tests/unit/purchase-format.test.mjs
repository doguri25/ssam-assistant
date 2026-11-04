// 품의 사유 꼴(에듀파인 기안문): 1. 관련: … / 2. 첫 문장 / 가. 나. 다.(들여 씀) / 붙임 … 끝.
// 넣은 글의 1인칭·구어(「내가 필요한」「사 주세요」)는 품명·제목·목적에 들어가지 않음
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyForm, composeReason, reasonTail, relatedLine, introOf, withIntro, plainItemName, plainOfficial } from '../../web/menus/purchase/rules.js';
import { parseLines, normIntake, intakePrompt } from '../../web/menus/purchase/intake.js';
import { oneshotPrompt, normOneshot } from '../../web/menus/purchase/oneshot.js';

const goods = { ...emptyForm('goods'), purpose: '실험', date: '11월 10일', target: '5학년', items: [{ name: '비커', spec: '500ml', unit: '', qty: 2, price: 3000 }] };

test('품의 사유: 1. 관련 / 2. 첫 문장 / 가. 나. 다.는 두 칸 들여 씀 / 붙임', () => {
  const r = composeReason({ intro: '실험 재료를 다음과 같이 구입하고자 합니다.', form: goods, year: 2026 });
  const lines = r.split('\n');
  assert.equal(lines[0], '1. 관련: 2026학년도 학교 교육과정 운영 계획');
  assert.equal(lines[1], '2. 실험 재료를 다음과 같이 구입하고자 합니다.');
  assert.equal(lines[2], '  가. 목적: 실험');
  assert.ok(r.includes('\n  라. 소요 예산: 금6,000원(금육천원)\n  마. 산출 근거: 비커(500ml) 3,000원 × 2개 = 6,000원'), r);
  assert.ok(r.endsWith('\n\n붙임  1. 지출품의서 1부.\n      2. 견적서 1부.  끝.'), r);
  assert.ok(r.endsWith(reasonTail(goods)), '끝부분은 reasonTail 그대로');
});

test('관련: 선생님(또는 AI)이 적은 것 → 그대로, 없으면 사업명 운영 계획(물품 외) → 학교 교육과정 운영 계획', () => {
  assert.equal(relatedLine({ ...goods, related: '○○교육청 과학과-1234(2026. 11. 2.)' }, 2026), '○○교육청 과학과-1234(2026. 11. 2.)');
  assert.equal(relatedLine({ ...emptyForm('event'), project: '가을 학교 축제' }, 2026), '2026학년도 가을 학교 축제 운영 계획');
  assert.equal(relatedLine({ ...emptyForm('goods'), project: '5학년 과학 실험 재료 구입' }, 2026), '2026학년도 학교 교육과정 운영 계획');
  assert.equal(relatedLine(goods), '학교 교육과정 운영 계획');
  // AI가 첫 문장 앞에 번호를 붙여 와도 「2. 2.」가 되지 않음
  assert.ok(composeReason({ intro: '2. 비커를 다음과 같이 구입하고자 합니다.', form: goods, year: 2026 }).includes('\n2. 비커를 다음과'));
});

test('첫 문장 찾기·바꾸기: 새 꼴은 「2.」 줄, 예전 꼴(첫 문단)도 읽음', () => {
  const r = composeReason({ intro: '실험 재료를 다음과 같이 구입하고자 합니다.', form: goods, year: 2026 });
  assert.equal(introOf(r), '실험 재료를 다음과 같이 구입하고자 합니다.');
  const w = withIntro(r, '과학 실험 수업을 위하여 다음과 같이 물품을 구입하고자 합니다.');
  assert.equal(w.split('\n')[1], '2. 과학 실험 수업을 위하여 다음과 같이 물품을 구입하고자 합니다.');
  assert.equal(w.split('\n')[0], '1. 관련: 2026학년도 학교 교육과정 운영 계획');
  assert.ok(w.endsWith(reasonTail(goods)));
  const old = '실험 재료를 구입하고자 합니다.\n\n가. 목적: 실험\n\n붙임  지출품의서 1부.  끝.';
  assert.equal(introOf(old), '실험 재료를 구입하고자 합니다.');
  assert.ok(withIntro(old, '새 문장.').startsWith('새 문장.\n\n가. 목적'));
});

test('품명에서 1인칭·구어 빼기', () => {
  assert.equal(plainItemName('내가 필요한 책'), '책');
  assert.equal(plainItemName('제가 쓸 A4 용지 사주세요'), 'A4 용지');
  assert.equal(plainItemName('우리 반 학급문고 책 구입'), '학급문고 책');
  assert.equal(plainItemName('필요한 물티슈 좀'), '물티슈');
  assert.equal(plainItemName('저희가 사용할 보드마커 주문해 주세요'), '보드마커');
  assert.equal(plainItemName('비커'), '비커');
  assert.equal(plainItemName('필요 물품 목록'), '필요 물품 목록');
  assert.equal(plainItemName('사주세요'), '사주세요', '다 지워지면 그대로');
});

test('넣기 칸: 줄글·AI가 읽은 품명도 1인칭·구어를 뺌, AI 지시에도 적음', () => {
  assert.equal(parseLines('내가 필요한 책 50권 12,000원').items[0].name, '책');
  assert.equal(parseLines('제가 쓸 A4 용지 5박스 2만원 사주세요').items[0].name, 'A4 용지');
  assert.equal(normIntake({ items: [{ name: '내가 필요한 책', qty: 50, price: 12000 }] }).items[0].name, '책');
  assert.equal(normIntake({ items: [], fields: { purpose: '내가 필요한 책 구입' } }).fields.purpose, '책 구입');
  assert.ok(intakePrompt('text', '내가 필요한 책 50권').includes('「내가 필요한」'), '넣기 AI 지시');
});

test('제목·첫 문장·목적: AI가 옮겨 온 1인칭·구어를 빼고, 지시에 공문서 말투·관련 칸', () => {
  assert.equal(plainOfficial('내가 필요한 도서 구입'), '도서 구입');
  assert.equal(plainOfficial('제가 수업에 쓸 비커를 다음과 같이 구입하고자 합니다.'), '수업에 쓸 비커를 다음과 같이 구입하고자 합니다.');
  assert.equal(plainOfficial('학급 문고 도서 구입'), '학급 문고 도서 구입');
  const n = normOneshot({ title: '내가 필요한 책 구입', intro: '내가 필요한 책을 다음과 같이 구입하고자 합니다.', fields: { purpose: '내가 필요한 책 구입', related: '2026학년도 독서 교육 계획' } }, { ...emptyForm('goods') });
  assert.equal(n.title, '책 구입');
  assert.equal(n.intro, '책을 다음과 같이 구입하고자 합니다.');
  assert.equal(n.fields.purpose, '책 구입');
  assert.equal(n.fields.related, '2026학년도 독서 교육 계획');
  // 선생님이 관련을 적었으면 덮지 않음
  assert.ok(!('related' in normOneshot({ title: 't', intro: 'i', fields: { related: 'x' } }, { ...emptyForm('goods'), related: '내 계획' }).fields));
  const p = oneshotPrompt({ ...emptyForm('goods') }, '내가 필요한 책 50권 구입');
  assert.ok(p.includes('1인칭') && p.includes('「내가 필요한」') && p.includes('related'), p);
});
