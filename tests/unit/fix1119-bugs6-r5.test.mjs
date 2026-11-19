/* 다섯 번째 버그 찾기 고침의 회귀(2026-11-19 여섯 번째 버그 찾기) — 다시 생기지 않게. 예시 이름은 지어낸 것(남다해·탁지해·김다해도 지어낸 이름) */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));
const NAMES = ['김하늘', '이바다', '한가람', '박솔빛', '남다율', '탁보결', '김민준', '이서연', '박지훈', '남다해', '탁지해', '김다해', '이다해'];
const leak = t => NAMES.filter(n => String(t).includes(n));

test('[0] 품의 AI 글(maskForAI): 되살린 품목 줄의 물건 이름(현수막·마이크·안전모·도화지·지우개·우드락)은 ○○○이 되지 않고, 줄이 통째로 빠지지 않음', async () => {
  const { maskForAI } = await import('../../web/menus/purchase/intake.js');
  for (const l of ['- 품목: 현수막 1개 × 45,000원, 마이크 2개 × 30,000원, 안전모 30개 × 8,000원',
    '- 품목: 지우개 30개 × 300원, 우드락(5T) 20장 × 2,000원, 고무판 10장 × 3,000원',
    '- 품목: 도화지(8절) 100매 × 80원, 지점토 30개 × 1,500원, 조각칼 30세트 × 3,000원, 물감(12색) 30세트 × 5,000원',
    '- 품목: 고구마 3박스 × 15,000원, 양배추 5통 × 3,000원, 양동이 2개 × 5,000원',
    '품목: 나침반 지구본 유리컵 각 10개 120,000원', '준비물: 지우개, 우드락, 고무판 각 30개 90,000원'])
    assert.equal(maskForAI(l), l, l);
  // 물건 머리 줄의 학생 이름은 그대로 가림(다섯 번째 고침) — 흔한 이름 목록 밖 이름도 가린 이름과 이어 쓰면
  for (const l of ['내용: 6학년 1반 김민준 이서연 박지훈 체험학습비 45,000원', '품목: 남다율 탁보결 한가람 상장 3매 3,000원', '준비물: 남다율 탁보결 한가람 각 1개 3,000원',
    '간식: 남다율 탁보결 한가람 3인분 9,000원', '품목: 김하늘 이바다 박솔빛 상장 3매 3,000원', '상품: 남다율, 탁보결, 이바다 메달 3개 15,000원'])
    assert.deepEqual(leak(maskForAI(l)), [], l);
  assert.equal(maskForAI('품목: 김하늘 이바다 박솔빛 상장 3매 3,000원'), '품목: ○○○ ○○○ ○○○ 상장 3매 3,000원');
});

test('[0] 품의 초안·검토 AI의 「- 품목:」 줄: 물건 이름이 그대로 감', async () => {
  const { oneshotPrompt } = await import('../../web/menus/purchase/oneshot.js');
  const { emptyForm, draftMemo } = await import('../../web/menus/purchase/rules.js');
  const { maskForAI } = await import('../../web/menus/purchase/intake.js');
  const form = rows => ({ ...emptyForm('goods'), items: rows.map(([name, spec, unit, qty, price]) => ({ name, spec, unit, qty: String(qty), price: String(price) })) });
  const line = p => p.split('\n').find(l => /^- 품목/.test(l)) || '';
  const a = form([['현수막', '', '개', 1, 45000], ['마이크', '', '개', 2, 30000], ['안전모', '', '개', 30, 8000]]);
  assert.equal(line(oneshotPrompt(a, '', {})), '- 품목: 현수막 1개 × 45,000원, 마이크 2개 × 30,000원, 안전모 30개 × 8,000원');
  assert.equal(line(maskForAI(draftMemo(a))), '- 품목: 현수막 1개 × 45,000원, 마이크 2개 × 30,000원, 안전모 30개 × 8,000원');
  const b = form([['지우개', '', '개', 30, 300], ['우드락', '5T', '장', 20, 2000], ['고무판', '', '장', 10, 3000]]);
  assert.equal(line(oneshotPrompt(b, '', {})), '- 품목: 지우개 30개 × 300원, 우드락(5T) 20장 × 2,000원, 고무판 10장 × 3,000원');
  assert.equal(line(maskForAI(draftMemo(b))), '- 품목: 지우개 30개 × 300원, 우드락(5T) 20장 × 2,000원, 고무판 10장 × 3,000원');
});

test('[1] 기초학력 메모·행특 메모 AI: 「진단평가」「기초평가」「진단결과」는 이름이 아님(친구 이름은 그대로 가림)', async () => {
  const { maskPersons } = await import('../../web/core/chat-names.js');
  for (const s of ['3월 진단평가 결과 읽기 미도달', '진단평가 재응시에서 도달함', '기초평가 미도달이었으나 2학기 도달', '진단결과 읽기 미도달', '정기평가 결과', '최종평가 도달'])
    assert.equal(maskPersons(s, { memo: true }).text, s, s);
  assert.equal(maskPersons('진단평가 남다율과 함께 봄', { memo: true }).text, '진단평가 ○○○과 함께 봄');
  globalThis.window = globalThis.window || {};
  await import('../../web/menus/evaluate/gr-bundle.js');
  const hide = window.SSAM.memoNames.hide;
  assert.equal(hide('진단평가 결과 향상, 수업 시간 발표 잘함'), '진단평가 결과 향상, 수업 시간 발표 잘함');
  const M = await import('../../web/menus/class/camp-model.js');
  const A = await import('../../web/menus/class/camp-ai.js');
  const c = M.newCamp({
    name: '겨울 교과캠프', target: '3학년', subjects: ['국어'],
    students: [{ id: 'a', grade: 3, cls: 2, no: 5, name: '김하늘' }, { id: 'b', grade: 3, cls: 2, no: 11, name: '이바다' }],
    sessions: [{ id: 's1', date: '2027-01-08', start: '09:00', end: '09:40', subject: '국어', content: '낱말 읽기' }],
    att: { s1: { a: 'O', b: 'O' } },
    memo: { a: '3월 진단평가 결과 읽기 미도달. 탁보결과 짝 활동', b: '' },
    obs: { a: '진단평가 재응시에서 도달함.', b: '' },
  });
  const p = A.obsPrompt(c, ['a']);
  assert.match(p, /선생님 메모: 3월 진단평가 결과 읽기 미도달\. ○○○과 짝 활동/);
  assert.deepEqual(leak(p), []);
  assert.match(A.reportPrompt(c), /학생A: 진단평가 재응시에서 도달함/);
});

test('[2] 행특·채팅 메모: 「…해」로 끝나는 이름을 조사 없이 써도 가림 — 「양보해 줌」 같은 동사만 그대로', async () => {
  const { maskPersons } = await import('../../web/core/chat-names.js');
  const { maskMemo } = await import('../../web/core/chat-route.js');
  for (const s of ['남다해 때문에 울음', '쉬는 시간에 남다해 괴롭힘', '남다해 짝꿍이 되어 기뻐함', '탁지해 놀림에 속상해함', '김다해 쉬는 시간에 혼자 있음', '짝 김다해 때문에 속상함', '이다해 옆자리에서 장난침']) {
    assert.deepEqual(leak(maskPersons(s, { memo: true }).text), [], s);
    assert.deepEqual(leak(maskMemo(s).text), [], s);
  }
  for (const s of ['친구에게 양보해 줌', '모둠 친구에게 설명해 줌', '교실을 깨끗이 정리해 줌', '모둠 활동을 주도해 나감', '친구의 실수를 이해해 줌', '친구를 위로해 줌',
    '교실 놀이를 제안해 함께 즐김', '어려운 과제를 해결해 냄', '새 방법을 시도해 봄', '성실해 보임', '친구를 배려해 주는 모습', '설명해 주었음', '모둠 일을 분담해 나가는 모습이 보임']) {
    assert.equal(maskPersons(s, { memo: true }).text, s, s);
    assert.equal(maskMemo(s).text, s, s);
  }
});

test('[3] 연간·행사계획 참고 자료(sourceForAI): 「사진: 방송반」「발표: 우수작」「기록: 기자단」의 낱말은 이름으로 배우지 않음(맡은 일 쌍점 뒤 이름은 그대로 가림)', async () => {
  const { sourceForAI } = await import('../../web/menus/plan/year-model.js');
  const doc = ['2026학년도 독서의 달 운영 계획', ' 가. 독후감 쓰기 대회 — 심사 뒤 발표: 우수작 학급 게시판에 전시', ' 나. 행사 사진: 방송반 학생이 찍어 누리집에 올림',
    '3. 시상: 우수상 학년별 3명, 우수작 10편 문집에 실음', '4. 평가: 방송반 협조가 잘 됨. 우수작 전시 반응이 좋음', '5. 역할 — 기록: 기자단, 사서: 도서실, 사회: 반대표'].join('\n');
  assert.equal(sourceForAI(doc), doc);
  const r = sourceForAI('진행: 남다율, 사진 기록: 탁보결, 사회: 한가람\n반성: 탁보결과 협의, 남다율 진행 매끄러움\n촬영: 김은실\n김은실 촬영 협조');
  assert.deepEqual(leak(r), []);
  assert.ok(!r.includes('김은실'), r);
});

test('[4] 품의 AI 글(maskNames 주문서 머리 말): 쌍점 뒤 「도서실·방송실·전교생·전학년·지원청·연구부」는 이름이 아님', async () => {
  const { maskForAI } = await import('../../web/menus/purchase/intake.js');
  for (const l of ['수령인: 도서실', '구매 요청: 도서실 책 30권', '신청자: 전교생', '신청자: 전학년', '수령인: 방송실', '수령인: 지원청', '신청자: 연구부', '요청자: 전담실'])
    assert.equal(maskForAI(l), l, l);
  for (const l of ['주문자: 남다율', '수령자 : 탁보결', '받는 사람: 박솔빛', '수령인: 남다율님', '신청자: 탁보결', '수령인: 김은실'])
    assert.ok(!/남다율|탁보결|박솔빛|김은실/.test(maskForAI(l)), l);
});
