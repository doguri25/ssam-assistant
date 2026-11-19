/* 여섯 번째 버그 찾기(2026-11-19) — 「쌤」 채팅: 「n번 … 해 줘」 메모, 한 줄 보는 말(기간·품의), 「이번 주 월요일」. 다시 생기지 않게 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));

test('「n번」 뒤가 부탁 말(「메모 지워 줘」「평어 다시 써 줘」「점수 고쳐 줘」)이면 관찰 메모에 넣지 않음', async () => {
  const { routeText } = await import('../../web/core/chat-route.js');
  for (const t of ['3번 메모 지워줘', '3번 평어 다시 써줘', '3번 점수 고쳐줘', '3번 출석 체크해줘', '3번 기초학력에 넣어줘', '3번 학부모 상담 안내 문자 써줘', '3번 메모 수정해 줘', '3번 메모 지워줘요', '3번 점수 고쳐줘요'])
    assert.notEqual(routeText(t).intent, 'memo', t);
  // 다른 할 일은 후보로(메모 말이면 행동특성)
  assert.deepEqual(routeText('3번 메모 지워줘').candidates, ['hk']);
  assert.deepEqual(routeText('3번 평어 다시 써줘').candidates, ['pyeongeo']);
  assert.ok(routeText('3번 출석 체크해줘').candidates.includes('camp'));
});

test('「3번 메모 봐 줘·확인해 줘·열어 줘」는 메모 보기', async () => {
  const { routeText } = await import('../../web/core/chat-route.js');
  for (const t of ['3번 메모 좀 봐줘', '3번 메모 확인해줘', '3번 메모 열어줘', '3번 메모 보여줘', '3번 메모 보여 주세요', '3번 메모 확인', '3번 메모 보기', '3번 메모', '3·5번 메모 알려 줘']) {
    const r = routeText(t);
    assert.equal(r.intent, 'memoView', t);
  }
  assert.deepEqual(routeText('3·5번 메모 확인해 줘').payload, { nos: [3, 5] });
});

test('「… 메모해 줘」「메모에 … 넣어 줘」「… 행특에 넣어 줘」「… 함 기록해 줘」는 꼬리를 뺀 글이 메모', async () => {
  const { routeText, memoAsk } = await import('../../web/core/chat-route.js');
  for (const [t, body] of [['3번 발표 잘함 메모해 줘', '발표 잘함'], ['3번 오늘 발표 잘함 메모해 주세요', '오늘 발표 잘함'], ['3번 친구 도와줌 행특에 넣어 줘', '친구 도와줌'],
    ['3번 친구 도와줌 행특 메모에 넣어줘', '친구 도와줌'], ['3번 메모에 발표 잘함 넣어 줘', '발표 잘함'], ['3번 메모: 토론 잘함 적어 줘', '토론 잘함'], ['3번 발표 잘함 기록해 줘', '발표 잘함'],
    ['3번 숙제 안 해 옴 메모 좀 해 줘', '숙제 안 해 옴'], ['3번 수학 단원평가 잘 봄 메모해 줘', '수학 단원평가 잘 봄']]) {
    const r = routeText(t);
    assert.equal(r.intent, 'memo', t);
    assert.equal(r.payload.body, body, t);
  }
  assert.deepEqual(routeText('3·5번 모둠 활동 잘함 메모해 줘').payload, { nos: [3, 5], body: '모둠 활동 잘함' });
  // 「출석 기록해 줘」(메모 끝말이 아님)·「메모해 줘」(글 없음)는 메모가 아님
  assert.equal(memoAsk('출석 기록해 줘'), null);
  assert.equal(memoAsk('메모해 줘'), null);
  assert.deepEqual(memoAsk('메모 확인해 줘'), { view: true });
});

test('관찰 메모는 그대로: 메모 끝말(「도와줌」「도와줬어요」), 해요체 「도와줘요」, 부탁 꼬리 없는 글', async () => {
  const { routeText } = await import('../../web/core/chat-route.js');
  for (const [t, body] of [['3번 발표할 때 친구를 도와줌', '발표할 때 친구를 도와줌'], ['3번 친구 도와줘서 칭찬함', '친구 도와줘서 칭찬함'], ['3번 수업 중 친구 도와줬어요', '수업 중 친구 도와줬어요'],
    ['3번 청소 도와줘요', '청소 도와줘요'], ['3번 친구한테 양보해 줘요', '친구한테 양보해 줘요'], ['3번 쉬는 시간에 친구 도와 줌', '쉬는 시간에 친구 도와 줌'],
    ['12번은 발표 목소리가 커짐', '발표 목소리가 커짐'], ['3번 오늘 결석', '오늘 결석'], ['3번 토론에서 근거 들어 반론 잘함', '토론에서 근거 들어 반론 잘함']]) {
    const r = routeText(t);
    assert.equal(r.intent, 'memo', t);
    assert.equal(r.payload.body, body, t);
  }
});

test('도우미(AI)가 메모를 골라도: 「3번 메모 보여 줘」는 넣지 않고, 「… 메모해 줘」는 꼬리를 뺀 글', async () => {
  const { planActions } = await import('../../web/core/chat-assist.js');
  assert.deepEqual(planActions([{ intent: 'memo', nos: [3] }], { raw: '3번 메모 보여줘' }).run, []);
  assert.deepEqual(planActions([{ intent: 'memo', nos: [3] }], { raw: '3번 발표 잘함 메모해 줘' }).run, [{ intent: 'memo', payload: { nos: [3], body: '발표 잘함' } }]);
});

test('한 줄 글의 기간·제출 말(「다음 주 공문 기한」「11월 가정통신문 다시 보기」「이번 달 쪽지 목록」)은 넣을 글이 아님 — 그 탭만', async () => {
  const { routeText, payloadFor } = await import('../../web/core/chat-route.js');
  for (const [t, intent] of [['다음 주 공문 기한', 'gongmun'], ['11월 공문 기한', 'gongmun'], ['이번 달 공문 기한', 'gongmun'], ['내일까지 낼 공문', 'gongmun'], ['아직 안 낸 공문', 'gongmun'],
    ['다음 주 마감 공문', 'gongmun'], ['이번 달 쪽지 목록', 'message'], ['저번에 쓴 쪽지', 'message'], ['11월 가정통신문 다시 보기', 'letter'], ['2학기 가정통신문 목록', 'letter']]) {
    const r = routeText(t);
    assert.equal(r.intent, intent, t);
    assert.equal(r.payload.text, '', t);
    assert.equal(payloadFor(intent, t).text, '', t);
  }
  // 내용이 있으면 그대로 넘김
  for (const [t, intent, text] of [['11월 20일 교직원 회의 안내 쪽지 써 줘', 'message', '11월 20일 교직원 회의 안내 쪽지'], ['다음 주 현장체험학습 안내 가정통신문 써 줘', 'letter', '다음 주 현장체험학습 안내 가정통신문'],
    ['12월 3일까지 방과후 신청서 제출 공문', 'gongmun', '12월 3일까지 방과후 신청서 제출 공문'], ['이번 달 생일 축하 쪽지', 'message', '이번 달 생일 축하 쪽지'], ['내일 회의 쪽지 보내줘', 'message', '내일 회의 쪽지'],
    ['2학기 학부모 상담 안내 가정통신문', 'letter', '2학기 학부모 상담 안내 가정통신문'], ['아직 안 낸 선생님들께 이수증 제출 쪽지', 'message', '아직 안 낸 선생님들께 이수증 제출 쪽지'],
    ['11월 독서의 달 행사 결과 보고', 'report', '11월 독서의 달 행사 결과 보고']])
    assert.equal(payloadFor(intent, t).text, text, t);
});

test('품의: 「쓰던 품의 이어서」「최근 품의 보여 줘」「품의 목록」「저장한 품의 템플릿」은 품목이 아님(쓰던 품의를 치우지 않음) — 템플릿·최근 작성은 그 탭', async () => {
  const { routeText, payloadFor } = await import('../../web/core/chat-route.js');
  for (const [t, view] of [['쓰던 품의 이어서', ''], ['품의 쓰던 거 이어서', ''], ['최근 품의 보여줘', 'recent'], ['품의 목록', 'recent'], ['어제 쓴 품의', 'recent'], ['최근 작성한 품의', 'recent'],
    ['저장한 품의 템플릿', 'templates'], ['품의 템플릿', 'templates'], ['품의 다시 보기', '']]) {
    assert.equal(routeText(t).intent, 'purchase', t);
    assert.deepEqual(payloadFor('purchase', t), { text: '', view }, t);
  }
  for (const [t, text] of [['알코올램프 10개 5,000원 품의해 줘', '알코올램프 10개 5,000원'], ['과학 실험 재료 품의', '과학 실험 재료'], ['강사 수당 품의', '강사 수당'],
    ['체육 대회 물품 구입 품의 써 줘', '체육 대회 물품 구입'], ['학급 문고 구입 품의', '학급 문고 구입'], ['남은 예산으로 색종이 구입 품의 부탁해', '남은 예산으로 색종이 구입']])
    assert.equal(payloadFor('purchase', t).text, text, t);
});

test('시간표: 「이번 주(금주) 월요일」은 이번 주 그 요일(지난 요일이어도 다음 주로 넘기지 않음)', async () => {
  const { dataQuestion } = await import('../../web/core/chat-data.js');
  const today = '2026-11-19'; // 목요일
  for (const [t, day] of [['이번 주 월요일 시간표', '2026-11-16'], ['이번주 화요일 3교시 뭐였지?', '2026-11-17'], ['이번 주 수요일 수업 뭐였어?', '2026-11-18'], ['금주 월요일 시간표', '2026-11-16'],
    ['이번 주 목요일 시간표', '2026-11-19'], ['이번 주 금요일 시간표', '2026-11-20'], ['다음 주 월요일 시간표', '2026-11-23'], ['지난주 월요일 시간표', '2026-11-09'], ['월요일 시간표', '2026-11-23']])
    assert.equal(dataQuestion(t, { today }).day, day, t);
  // 일요일에 묻는 이번 주는 그 주 월요일부터(월~일)
  assert.equal(dataQuestion('이번 주 월요일 시간표', { today: '2026-11-22' }).day, '2026-11-16');
});
