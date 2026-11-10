// 품의 버그 찾기(2026-11-10): 「2만 5천원」「2천원」 같은 한글 금액, 「개당 1,200원 총 12,000원」·「2,000원씩」이 품명에 남던 것,
// 넣기 글을 AI로 읽을 때 전화번호·이메일을 그대로 보내던 것, 초안 AI 메모(메모·대상 칸)의 전화번호
import test from 'node:test';
import assert from 'node:assert/strict';

const calls = [];
globalThis.window = { SSAM: { ai: { generate: async prompt => { calls.push(prompt); return { text: '{"items":[{"name":"알코올램프","qty":10,"price":5000}]}' }; }, engineReady: () => true, errMsg: c => c } } };
const { parseLines, readIntake } = await import('../../web/menus/purchase/intake.js');
const { oneshotPrompt } = await import('../../web/menus/purchase/oneshot.js');
const { emptyForm, draftMemo } = await import('../../web/menus/purchase/rules.js');
const row = it => [it.name, it.unit, it.qty, it.price];

test('한글 금액: 「2만 5천원」「1만2천원」「2천원」「1만 5000원」「3천 500원」「2천5백원」을 원으로 읽고 품명에 남기지 않음', () => {
  assert.deepEqual(parseLines('색종이 5묶음 2만 5천원').items.map(row), [['색종이', '묶음', '5', '25000']]);
  assert.deepEqual(parseLines('네임펜 12개 1만2천원').items.map(row), [['네임펜', '개', '12', '12000']]);
  assert.deepEqual(parseLines('자석 20개 2천원').items.map(row), [['자석', '개', '20', '2000']]);
  assert.deepEqual(parseLines('물감 3세트 1만 5000원').items.map(row), [['물감', '세트', '3', '15000']]);
  assert.deepEqual(parseLines('풀 10개 3천 500원').items.map(row), [['풀', '개', '10', '3500']]);
  assert.deepEqual(parseLines('간식 420개 2천5백원').items.map(row), [['간식', '개', '420', '2500']]);
  assert.deepEqual(parseLines('참가 기념품 1개 5천원, 참가자 3천명').items.map(row), [['참가 기념품', '개', '1', '5000']]);
  assert.deepEqual(parseLines('가위 4자루 총 1만 2천원').items.map(row), [['가위', '자루', '4', '3000']]);
  assert.equal(parseLines('합계 2만 5천원').fields.total, '25000');
  // 「만」만 있는 금액·「천」이 든 이름은 그대로
  assert.deepEqual(parseLines('A4 용지 5박스 2만원').items.map(row), [['A4 용지', '박스', '5', '20000']]);
  assert.deepEqual(parseLines('천 가방 10개 3,000원').items.map(row), [['천 가방', '개', '10', '3000']]);
});

test('단가와 총액을 같이 쓴 줄(「개당 1,200원 총 12,000원」「1200원 합계 12000원」)·「2,000원씩」: 금액이 품명에 남지 않음', () => {
  assert.deepEqual(parseLines('비커 10개 개당 1,200원 총 12,000원').items.map(row), [['비커', '개', '10', '1200']]);
  assert.deepEqual(parseLines('네임펜 10개 1200원 합계 12000원').items.map(row), [['네임펜', '개', '10', '1200']]);
  assert.deepEqual(parseLines('자석 20개 2,000원씩').items.map(row), [['자석', '개', '20', '2000']]);
});

test('넣기 글을 AI로 읽을 때 전화번호·이메일은 가려서 보냄(그 줄의 품목 글은 남김)', async () => {
  calls.length = 0;
  await readIntake({ text: '알코올램프 10개 5,000원\n업체 담당 010-1234-5678, 견적 문의 shop@mail.com\n다음 주 화요일 과학실 실험' });
  assert.equal(calls.length, 1);
  assert.ok(!calls[0].includes('010-1234-5678') && !calls[0].includes('shop@mail.com'), calls[0].slice(-200));
  assert.ok(calls[0].includes('다음 주 화요일 과학실 실험') && calls[0].includes('업체 담당'), calls[0].slice(-200));
});

test('초안 AI 메모: 메모·대상·장소 칸에 적은 전화번호·이메일은 보내지 않음', () => {
  const f = { ...emptyForm(), purpose: '과학 실험', place: '과학실(내선 02-123-4567)', memo: '업체 담당 010-9876-5432로 연락, kim@school.kr',
    items: [{ name: '알코올램프', spec: '', unit: '', qty: '10', price: '5000', vendor: '' }] };
  for (const s of [draftMemo(f), oneshotPrompt(f, '')]) {
    assert.ok(!/010-9876-5432|02-123-4567|kim@school\.kr/.test(s), s);
    assert.ok(s.includes('업체 담당') && s.includes('과학실'), s);
  }
});

test('흔한 세는 말(벌·인분·봉지·갑·곽·송이·다발·그루·마리·포기·줄·쌍·잔·차시)도 수량으로 읽음(1개로 읽어 합계가 줄던 것)', () => {
  const one = s => row(parseLines(s).items[0]);
  assert.deepEqual(one('체육복 30벌 25,000원'), ['체육복', '벌', '30', '25000']);
  assert.deepEqual(one('간식 420인분 2,500원'), ['간식', '인분', '420', '2500']);
  assert.deepEqual(one('과자 50봉지 1,500원'), ['과자', '봉지', '50', '1500']);
  assert.deepEqual(one('분필 10갑 2,000원'), ['분필', '갑', '10', '2000']);
  assert.deepEqual(one('색연필 20곽 3,000원'), ['색연필', '곽', '20', '3000']);
  assert.deepEqual(one('카네이션 30송이 1,000원'), ['카네이션', '송이', '30', '1000']);
  assert.deepEqual(one('꽃다발 2다발 30,000원'), ['꽃다발', '다발', '2', '30000']);
  assert.deepEqual(one('묘목 10그루 5,000원'), ['묘목', '그루', '10', '5000']);
  assert.deepEqual(one('금붕어 5마리 2,000원'), ['금붕어', '마리', '5', '2000']);
  assert.deepEqual(one('배추 20포기 3,000원'), ['배추', '포기', '20', '3000']);
  assert.deepEqual(one('김밥 30줄 3,000원'), ['김밥', '줄', '30', '3000']);
  assert.deepEqual(one('장갑 10쌍 1,500원'), ['장갑', '쌍', '10', '1500']);
  assert.deepEqual(one('커피 10잔 4,000원'), ['커피', '잔', '10', '4000']);
  assert.deepEqual(one('외부 강사 2차시 10만원'), ['외부 강사', '차시', '2', '100000']);
  // 이름 속 같은 글자는 그대로
  assert.deepEqual(one('줄넘기 30개 2,000원'), ['줄넘기', '개', '30', '2000']);
  assert.deepEqual(one('1회용 컵 100개 50원'), ['1회용 컵', '개', '100', '50']);
});

test('계획·공문에서 옮긴 줄 머리(「가.」「나)」「(다)」「①」)는 품명에 넣지 않음', () => {
  const name = s => parseLines(s).items[0].name;
  assert.equal(name('가. 알코올램프 10개 5,000원'), '알코올램프');
  assert.equal(name('  나) 비커 8개 4,500원'), '비커');
  assert.equal(name('(다) 전자저울 4대 23,000원'), '전자저울');
  assert.equal(name('① 유리 막대 8개 1,200원'), '유리 막대');
  assert.equal(name('가위 4자루 2,000원'), '가위');
  assert.equal(name('나무 블록 2세트 15,000원'), '나무 블록');
});

test('검토: 한글 수 단위로 쓴 인원·장 수(「1백 명」「1천 장」「5백 매」)는 금액이 아님 — 앞의 원 금액이 그대로', () => {
  const one = s => parseLines(s).items.map(it => [it.name, it.unit, Number(it.qty), Number(it.price)]);
  assert.deepEqual(one('현장체험 버스 3대 각 45만원, 학생 1백 명').map(r => [r[2], r[3]]), [[3, 450000]]);
  assert.deepEqual(one('간식 300개 각 1,500원, 전교생 3백 명').map(r => [r[2], r[3]]), [[300, 1500]]);
  assert.equal(one('색종이 2만원 1천 장')[0][3], 20000);
  assert.equal(one('스티커 8,000원 5백 장')[0][3], 8000);
  assert.ok(!one('A4 용지 1천 매 5,000원')[0][0].includes('원'), '품명에 「원」이 붙음');
  // 진짜 한글 금액은 그대로
  assert.equal(one('색종이 5묶음 2만 5천원')[0][3], 25000);
});

test('검토: 「(8줄)」「4줄」 같은 공책 규격은 수량이 아님(권이 수량), 「김밥 30줄」은 수량', () => {
  const one = s => parseLines(s).items.map(it => [it.name, it.unit, Number(it.qty), Number(it.price)])[0];
  assert.deepEqual([one('공책 10권(8줄) 1,000원')[2], one('공책 10권(8줄) 1,000원')[1]], [10, '권']);
  assert.equal(one('영어 노트 30권 4줄 900원')[2], 30);
  assert.equal(one('김밥 30줄 3,000원')[2], 30);
});

test('검토: 「1,000개」「2,500매」처럼 쉼표 든 수량', () => {
  const one = s => parseLines(s).items.map(it => [it.name, it.unit, Number(it.qty), Number(it.price)])[0];
  assert.deepEqual([one('종이컵 1,000개 1만원')[0], one('종이컵 1,000개 1만원')[2]], ['종이컵', 1000]);
  assert.equal(one('A4 용지 2,500매 5만원')[0], 'A4 용지');
});
