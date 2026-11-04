// 2026-11-04 버그 찾기에서 고친 것(품의): 날짜로 시작하는 첫 문장, 1인칭·구어 빼기가 맞는 말까지 지우던 것, 관련 기본값 말 겹침
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyForm, composeReason, introOf, withIntro, relatedLine, plainItemName, plainOfficial } from '../../web/menus/purchase/rules.js';
import { parseLines, normIntake } from '../../web/menus/purchase/intake.js';
import { normOneshot } from '../../web/menus/purchase/oneshot.js';

const ev = { ...emptyForm('event'), project: '가을 학교 축제', purpose: '학교 축제', items: [{ name: '현수막', spec: '', unit: '개', qty: '1', price: '50000', vendor: '' }] };
const DATED = '2026. 11. 20.(금) 개최하는 가을 학교 축제 운영을 위하여 물품을 다음과 같이 구입하고자 합니다.';

test('[purchase-3] 2. 첫 문장이 「2026. 11. 20.(금)」처럼 날짜로 시작해도 연도를 지우지 않음', () => {
  const r = composeReason({ intro: DATED, form: ev, year: 2026 });
  assert.equal(r.split('\n')[1], `2. ${DATED}`);
  assert.equal(introOf(r), DATED);
  // 선생님이 2. 줄을 날짜로 고친 사유에 첫 문장만 바꿔 넣기([검토 안 쓰기]·다시 맞추기)
  const typed = r.replace(/\n2\. [^\n]*/, '\n2. 2026. 11. 21.(토) 여는 축제를 위하여 다음과 같이 구입하고자 합니다.');
  assert.equal(withIntro(typed, DATED).split('\n')[1], `2. ${DATED}`);
  assert.equal(composeReason({ intro: introOf(typed), form: ev, year: 2026 }).split('\n')[1], '2. 2026. 11. 21.(토) 여는 축제를 위하여 다음과 같이 구입하고자 합니다.');
  // 번호는 여전히 뺌(「2. 2.」가 되지 않음)
  assert.equal(composeReason({ intro: '2. 비커를 다음과 같이 구입하고자 합니다.', form: ev, year: 2026 }).split('\n')[1], '2. 비커를 다음과 같이 구입하고자 합니다.');
  assert.equal(composeReason({ intro: '2.비커를 구입하고자 합니다.', form: ev, year: 2026 }).split('\n')[1], '2. 비커를 구입하고자 합니다.');
  // AI 답(normOneshot)도 같은 규칙
  assert.equal(normOneshot({ title: '축제 물품 구입', intro: DATED }, ev).intro, DATED);
  assert.equal(normOneshot({ title: '비커 구입', intro: '2. 비커를 다음과 같이 구입하고자 합니다.' }, ev).intro, '비커를 다음과 같이 구입하고자 합니다.');
});

test('[purchase-4] 품명: 주어 바로 뒤에 「필요한·쓸」이 올 때만 지움, 진짜 책 이름·「공동구매」는 그대로', () => {
  for (const name of ['우리 반 채무 관계', '나는 기다립니다', '내가 가장 슬플 때', '우리가 빛의 속도로 갈 수 없다면', '나는 나로 살기로 했다', '내가 원하는 것을 나도 모를 때', '공동구매', '쓸 만한 인간'])
    assert.equal(plainItemName(name), name);
  // 처음에 원한 것은 그대로
  assert.equal(plainItemName('내가 필요한 책'), '책');
  assert.equal(plainItemName('제가 쓸 A4 용지 사주세요'), 'A4 용지');
  assert.equal(plainItemName('우리 반에서 쓸 색연필'), '색연필');
  assert.equal(plainItemName('저희 반에서 쓸 풀'), '풀');
  assert.equal(plainItemName('보드마커 구입'), '보드마커');
  assert.equal(plainItemName('색연필 좀'), '색연필');
  // 넣기 칸(줄글)·AI가 읽은 캡처 품명
  assert.deepEqual(parseLines('우리 반 채무 관계 2권 12,000원\n나는 기다립니다 1권 13,000원\n내가 가장 슬플 때 1권 15,000원').items.map(it => it.name), ['우리 반 채무 관계', '나는 기다립니다', '내가 가장 슬플 때']);
  assert.equal(parseLines('내가 필요한 책 50권 12,000원').items[0].name, '책');
  assert.deepEqual(normIntake({ items: [{ name: '우리가 빛의 속도로 갈 수 없다면', qty: 1, price: 15000 }, { name: '나는 나로 살기로 했다', qty: 1, price: 13800 }] }, 'image').items.map(it => it.name),
    ['우리가 빛의 속도로 갈 수 없다면', '나는 나로 살기로 했다']);
});

test('[purchase-4] 제목·목적·첫 문장: 「소리 나는」「하늘을 나는」「우리 반」은 그대로, 「내가 필요한」은 뺌', () => {
  for (const s of ['소리 나는 악기 만들기', '하늘을 나는 드론 만들기 재료 구입', '빛이 나는 LED 키트', '우리 반 학급 문고 도서 구입', '「내가 가장 슬플 때」 외 도서 구입', '내가 가장 슬플 때 외 2권 구입', '우리가 빛의 속도로 갈 수 없다면 외 도서 구입'])
    assert.equal(plainOfficial(s), s);
  assert.equal(plainOfficial('내가 필요한 도서 구입'), '도서 구입');
  const n = normOneshot({ title: '소리 나는 악기 만들기 재료 구입', intro: '3학년 과학 소리 나는 악기 만들기 수업을 위하여 재료를 다음과 같이 구입하고자 합니다.', fields: { purpose: '소리 나는 악기 만들기' } }, { ...emptyForm('goods') });
  assert.equal(n.title, '소리 나는 악기 만들기 재료 구입');
  assert.ok(n.intro.startsWith('3학년 과학 소리 나는 악기'), n.intro);
  assert.equal(n.fields.purpose, '소리 나는 악기 만들기');
  assert.equal(normIntake({ items: [], fields: { purpose: '하늘을 나는 드론 수업' } }).fields.purpose, '하늘을 나는 드론 수업');
});

test('[purchase-5] 관련 기본값: 「운영 운영 계획」「2026학년도 2026학년도」처럼 겹치지 않음', () => {
  const rel = (type, project) => relatedLine({ ...emptyForm(type), project }, 2026);
  assert.equal(rel('event', '가을 학교 축제 운영'), '2026학년도 가을 학교 축제 운영 계획');
  assert.equal(rel('lecturer', '방과후학교 운영'), '2026학년도 방과후학교 운영 계획');
  assert.equal(rel('meeting', '학년 교육과정 협의회 운영'), '2026학년도 학년 교육과정 협의회 운영 계획');
  assert.equal(rel('event', '2026학년도 가을 학교 축제'), '2026학년도 가을 학교 축제 운영 계획');
  assert.equal(rel('event', '2026학년도 학생 자치회 운영'), '2026학년도 학생 자치회 운영 계획');
  assert.equal(rel('event', '학생 자치회 운영비'), '2026학년도 학생 자치회 운영 계획');
  assert.equal(rel('event', '가을 학교 축제 운영 계획'), '2026학년도 가을 학교 축제 운영 계획');
  assert.equal(rel('event', '가을 학교 축제'), '2026학년도 가을 학교 축제 운영 계획');
  // 학년도를 모르면 사업명에 적은 학년도를 씀
  assert.equal(relatedLine({ ...emptyForm('event'), project: '2026학년도 학생 자치회 운영' }), '2026학년도 학생 자치회 운영 계획');
  assert.equal(composeReason({ intro: '방과후학교 운영을 위하여 강사 수당을 다음과 같이 지급하고자 합니다.', form: { ...emptyForm('lecturer'), project: '방과후학교 운영' }, year: 2026 }).split('\n')[0], '1. 관련: 2026학년도 방과후학교 운영 계획');
});

test('[purchase-2] 손으로 고친 사유의 「1. 관련:」 줄만 바꿈(나머지는 그대로), 예전 꼴은 그대로', async () => {
  const { withRelated, relatedOf } = await import('../../web/menus/purchase/rules.js');
  const r = composeReason({ intro: '실험을 위하여 비커를 구입하고자 합니다.', form: ev, year: 2026 }).replace('  가. 목적: 학교 축제', '  가. 목적: 학교 축제(손으로)');
  const w = withRelated(r, '○○교육청 과학과-1234(2026. 11. 2.)');
  assert.equal(w.split('\n')[0], '1. 관련: ○○교육청 과학과-1234(2026. 11. 2.)');
  assert.equal(w.split('\n').slice(1).join('\n'), r.split('\n').slice(1).join('\n'));
  assert.equal(relatedOf(w), '○○교육청 과학과-1234(2026. 11. 2.)');
  const old = '실험 재료를 구입하고자 합니다.\n\n가. 목적: 실험\n\n붙임  지출품의서 1부.  끝.';
  assert.equal(withRelated(old, 'x'), old);
});
