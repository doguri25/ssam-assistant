/* 네 번째 버그 찾기 고침의 회귀(2026-11-19 다섯 번째 버그 찾기) — 다시 생기지 않게. 예시 이름은 지어낸 것(김민준·이서연·박지훈·남다율·탁보결도 지어낸 이름) */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));
const NAMES = ['김하늘', '이바다', '한가람', '박솔빛', '남다율', '탁보결', '김민준', '이서연', '박지훈', '김솔', '이산', '박하은'];
const leak = t => NAMES.filter(n => String(t).includes(n));

test('품의 AI 글(maskForAI): 물건 머리 줄(「내용:」「품목:」「준비물:」)의 이름도 가림 — 되살린 품목 줄로 이름이 새지 않음', async () => {
  const { maskForAI } = await import('../../web/menus/purchase/intake.js');
  for (const s of ['내용: 6학년 1반 김민준 이서연 박지훈 체험학습비 45,000원', '품목: 남다율 탁보결 한가람 상장 3매 3,000원', '준비물: 남다율 탁보결 한가람 각 1개 3,000원', '간식: 남다율 탁보결 한가람 3인분 9,000원'])
    assert.deepEqual(leak(maskForAI(s)), [], s);
  // 금액·수량은 남음(품목이 조용히 사라지지 않게)
  assert.equal(maskForAI('내용: 6학년 1반 김민준 이서연 박지훈 체험학습비 45,000원'), '내용: 6학년 1반 ○○○ ○○○ ○○○ 체험학습비 45,000원');
  assert.equal(maskForAI('이순신 장영실 정약용 위인전 3권 36,000원'), '○○○ ○○○ ○○○ 위인전 3권 36,000원');
  // 물건 머리 줄의 물건 이름은 그대로
  assert.equal(maskForAI('간식: 김밥 고구마 옥수수 바나나 30인분 90,000원'), '간식: 김밥 고구마 옥수수 바나나 30인분 90,000원');
});

test('품의 AI 읽기(readIntake): 못 읽은 줄이 있어 글을 AI로 보내도 「내용:」 줄의 학생 이름은 가림', async () => {
  const sent = [];
  globalThis.window = { ...(globalThis.window || {}), SSAM: { ...((globalThis.window || {}).SSAM || {}), ai: { engineReady: () => true, generate: async p => { sent.push(p); return { text: '{"items":[{"name":"체험학습비","qty":3,"price":15000}]}' }; } } } };
  const { readIntake } = await import('../../web/menus/purchase/intake.js');
  const r = await readIntake({ text: '6학년 체험학습비 품의\n내용: 6학년 1반 김민준 이서연 박지훈 체험학습비 45,000원\n버스 임차료는 견적 받는 중' });
  assert.equal(r.by, 'ai');
  assert.ok(sent.length);
  assert.deepEqual(leak(sent.join('\n')), []);
});

test('품의 표 붙여넣기: 금액이 수량 × 단가와 딱 맞지 않아도(부가세·할인·끝수) 포장 칸이 수량 — 단가를 수량으로 읽지 않음', async () => {
  const { tableItems } = await import('../../web/menus/purchase/intake.js');
  const one = t => { const x = tableItems(t).items[0]; return [Number(x.qty), Number(x.price)]; };
  assert.deepEqual(one('현수막\t2개\t45,000\t99,000'), [2, 45000]);
  assert.deepEqual(one('간식\t30인분\t2,500\t70,000'), [30, 2500]);
  assert.deepEqual(one('사인펜\t3세트\t3,333\t10,000'), [3, 3333]);
  assert.deepEqual(one('도서\t10권\t15,000\t135,000'), [10, 15000]);
  assert.deepEqual(one('물티슈\t10팩\t1,200\t11,000'), [10, 1200]);
  // 규격 칸은 그대로 규격(네 번째 고침)
  const sum = t => tableItems(t).items.reduce((n, x) => n + Number(x.qty) * Number(x.price), 0);
  assert.equal(sum('색연필\t12자루\t30\t4,500\n종이컵\t1000개\t2\t15,000\n면장갑\t10켤레\t3\t8,000'), 189000);
  assert.equal(sum('면장갑\t10켤레\t3\t8,000\t24,000'), 24000);
  assert.equal(sum('현수막\t1식\t1\t90,000'), 90000);
  assert.equal(sum('종이컵\t1000개\t20\t15,000'), 300000);
  assert.equal(sum('색연필\t12자루\t30\t4,500\t135,100'), 135000);
  assert.equal(sum('현수막\t2개\t45,000\t90,000\t9,000'), 90000);
});

test('「쌤」 채팅: 띄어 쓴 교과 낱말(원주율 반지름·오대양 육대주)은 이름이 아님 — 띄어 쓴 이름 목록은 그대로 가림', async () => {
  const R = await import('../../web/core/chat-route.js');
  for (const s of ['원주율 반지름 구하기 활동지 만들어 줘', '6학년 사회 오대양 육대주 단원평가 만들어 줘', '오대양 육대주 지도 그리기 대회 가정통신문 써 줘', '용수철 저울 오리온자리 활동지'])
    assert.equal(R.safeText(s), s, s);
  assert.equal(R.handoffText('오대양 육대주 지도 그리기 대회 가정통신문 써 줘'), '오대양 육대주 지도 그리기 대회 가정통신문 써 줘');
  for (const s of ['탁보결 남다율 한가람 셋이 자꾸 늦어요', '남다율 탁보결 둘이 다퉜어요', '이바다 남다율 둘이 다퉜어요', '김민준 이서연 둘이 싸웠어요'])
    assert.deepEqual(leak(R.safeText(s)), [], s);
});

test('행사 칸(evAI)·창체 칸(colonOnly): 직함 뒤 이름 + 을·를·도(「강사 박솔빛을」「부장 탁보결을」)와 두 글자 이름(「강사 김솔」「담당 이산」)도 가림', async () => {
  const P = await import('../../web/core/privacy.js');
  const { maskPersons } = await import('../../web/core/chat-names.js');
  const ev = v => P.maskStaff(maskPersons(P.maskContacts(String(v))).text, { colonOnly: true }).text.trim();
  for (const s of ['그림책 작가 강사 박솔빛을 모시고 독서 흥미를 높임', '부장 탁보결을 중심으로 준비', '강사 남다율도 함께 참여', '진로 특강(강사 김솔)', '담당 이산', '강사 박하은을 모시고', '강사 박솔빛 초청 진로 특강', '한가람 선생님 정년퇴임 기념식'])
    assert.deepEqual(leak(ev(s)), [], s);
  assert.equal(ev('그림책 작가 강사 박솔빛을 모시고 독서 흥미를 높임'), '그림책 작가 강사 ○○○을 모시고 독서 흥미를 높임');
  for (const s of ['학급 부장 선거 안내', '부장 선거를 실시', '담당 구역을 청소', '강사 이력서를 받아', '강사 수당을 지급', '외부 강사 인력풀을 활용', '강사 강의료를 지급', '부장 회의를 통해 결정', '담당 업무를 나누어', '선생님 설명을 듣고', '선생님 목소리를 듣고'])
    assert.equal(ev(s), s, s);
  const src = (await import('node:fs')).readFileSync(new URL('../../web/menus/plan/event.js', import.meta.url), 'utf8');
  assert.ok(/const evAI = [^\n]*maskPersons\([^\n]*colonOnly: true/.test(src), '행사 칸은 maskPersons 다음 colonOnly');
});

test('활동지(colonOnly)·쪽지(maskStaff): 「선생님 한마디·도움말·인사말」「강사 소개말」은 이름이 아님', async () => {
  const { cleanSheet } = await import('../../web/menus/evaluate/activity/activity-read.js');
  const P = await import('../../web/core/privacy.js');
  const doc = '4학년 과학 활동지\n1. 자석에 붙는 물체를 찾아봅시다.\n★ 선생님 한마디: 자석의 성질을 잘 기억해요.\n선생님 도움말 - 클립, 못, 지우개를 준비해요.\n선생님 인사말과 함께 수업을 시작해요.';
  assert.equal(cleanSheet(doc, { staff: false }).text, doc);
  for (const w of ['한마디', '도움말', '인사말', '소개말', '지시문', '주제어', '연락망', '강의안', '강의록', '장학금', '조례안', '조회대'])
    for (const t of ['선생님', '강사', '담당'])
      for (const s of [`${t} ${w}`, `${t} ${w}과 함께`]) assert.equal(P.maskStaff(s, { colonOnly: true }).text, s, s);
  // 직함 뒤 이름은 그대로 가림(네 번째 고침)
  for (const s of ['강사 박솔빛', '담당 김하늘', '선생님 이바다', '주무관 탁보결', '담당 이바다에게 제출', '선생님 한가람이 설명'])
    assert.deepEqual(leak(cleanSheet(s, { staff: false }).text), [], s);
});

test('기초학력 요일 읽기: 「운영 요일 - 화, 목」「교육일 - 화, 목」의 「일」은 일요일이 아님, 「월-수-금」은 목록, 범위에 이은 요일도', async () => {
  const { findWeekdays } = await import('../../web/menus/class/camp-ai.js');
  const cases = [['운영 요일 - 화, 목', [2, 4]], ['교육일 - 화, 목', [2, 4]], ['수업일 - 월, 수', [1, 3]], ['운영 요일 - 월~목', [1, 2, 3, 4]], ['◦ 운영 요일 - 화·목', [2, 4]],
    ['운영 요일: 월-수-금', [1, 3, 5]], ['월요일-수요일-금요일', [1, 3, 5]], ['요일: 월~수, 금', [1, 2, 3, 5]], ['월, 수-금', [1, 3, 4, 5]],
    // 네 번째 고침의 범위는 그대로
    ['월~목 방과후', [1, 2, 3, 4]], ['월요일~금요일', [1, 2, 3, 4, 5]], ['(월)~(금)', [1, 2, 3, 4, 5]], ['월요일부터 목요일까지', [1, 2, 3, 4]], ['화-목', [2, 3, 4]], ['월~목 (금 제외)', [1, 2, 3, 4]],
    ['1월~3월 매주 화요일', [2]], ['운영 기간: 2027. 1. 11.(월) ~ 1. 22.(금)', null], ['매주 화, 목요일', [2, 4]]];
  for (const [s, want] of cases) assert.deepEqual(findWeekdays(s), want, s);
});
