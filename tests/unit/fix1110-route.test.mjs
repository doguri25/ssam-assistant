// 2026-11-10 검토 고침 — 「쌤」 채팅 글 → 할 일(I1·M1): 「방법」「누구나」「언제든」「몇 시」「어디서」가 든 명령도 바로 함(묻는 글로 보지 않음),
// 진짜 묻는 꼴(어떻게·하는 법·뭐야·돼? …)만 묻는 글. 도우미가 고른 글 넣는 일은 선생님 글을 넘김(AI가 바꿔 쓴 글로 바꾸지 않음).
// M1: 「줄 수 있어요?」「주실래요?」「주시겠어요?」「해 줄래?」 꼬리도 떼고 메뉴에 넘김
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeText, isSure, isQuestion, payloadFor } from '../../web/core/chat-route.js';
import { actionPayload } from '../../web/core/chat-assist.js';

const sure = (t, intent) => { const r = routeText(t); assert.ok(isSure(r) && !r.question, `${t}: ${JSON.stringify(r)}`); assert.equal(r.intent, intent, t); return r; };

test('I1 「방법·누구나·언제든·몇 시·어디서」가 든 명령은 바로 그 일(넣을 내용은 그대로)', () => {
  assert.equal(sure('방과후 신청 방법 안내 가정통신문 만들어 줘', 'letter').payload.text, '방과후 신청 방법 안내 가정통신문');
  assert.equal(sure('급식 신청 방법 안내 쪽지 써 줘', 'message').payload.text, '급식 신청 방법 안내 쪽지');
  assert.equal(sure('누구나 참여 가능한 독서 행사 안내 쪽지 써 줘', 'message').payload.text, '누구나 참여 가능한 독서 행사 안내 쪽지');
  assert.equal(sure('가정통신문 써 줘: 내일 몇 시까지 등교하는지 안내', 'letter').payload.text, '내일 몇 시까지 등교하는지 안내');
  assert.equal(sure('언제든 신청할 수 있는 상담 주간 가정통신문 만들어 주세요', 'letter').payload.text, '언제든 신청할 수 있는 상담 주간 가정통신문');
  assert.equal(sure('어디서 모이는지 장소 안내 쪽지 써 줘', 'message').payload.text, '어디서 모이는지 장소 안내 쪽지');
  assert.equal(sure('독서 감상문 제출 방법 안내 가정통신문 써 줄래?', 'letter').payload.text, '독서 감상문 제출 방법 안내 가정통신문');
  for (const t of ['방과후 신청 방법 안내 가정통신문 만들어 줘', '누구나 참여 가능한 독서 행사 안내 쪽지 써 줘', '가정통신문 써 줘: 내일 몇 시까지 등교하는지 안내']) assert.ok(!isQuestion(t), t);
});

test('I1 진짜 묻는 꼴은 그대로 묻는 글(바로 하지 않음): 어떻게·하는 법·요령·뭐야·돼?·언제까지 …?', () => {
  for (const t of ['가정통신문 어떻게 써?', '행특 잘 쓰는 법 알려줘', '가정통신문 쓰는 방법?', '쪽지 쓰는 요령 좀 알려줄래?', '제출 방법 알려줘', '공문 언제까지 내야 해?',
    '몇 시에 시작해?', '누가 담당이야?', '학부모님께 공개수업 안내는 어떻게 보내?', '가정통신문 베트남어로 번역 돼?', '쪽지랑 가정통신문 차이가 뭐야?', '품의 사유는 어떻게 써?',
    '가정통신문 어떻게 쓰는지 알려줘', '결과 보고 쓰는 방법 알려 줘']) {
    const r = routeText(t);
    assert.ok(isQuestion(t) && !isSure(r) && r.question, `${t}: ${JSON.stringify(r)}`);
  }
});

test('I1 도우미가 고른 글 넣는 일: 선생님이 내용을 줬으면 선생님 글(AI가 바꿔 쓴 글이 아님), 내용이 없을 때만 AI가 옮긴 글', () => {
  const said = '가정통신문 써 줘: 11월 20일 운동회 안내, 체육복';
  assert.equal(payloadFor('letter', said).text, '11월 20일 운동회 안내, 체육복');
  assert.deepEqual(actionPayload({ intent: 'letter', text: '가을 운동회를 안내드립니다(AI가 바꿔 씀)' }, { said, question: false }), { text: '11월 20일 운동회 안내, 체육복' });
  // 「방법」이 든 명령(묻는 글이 아님)도 선생님 글
  assert.deepEqual(actionPayload({ intent: 'letter', text: 'AI 글' }, { said: '방과후 신청 방법 안내 가정통신문 만들어 줘', question: false }), { text: '방과후 신청 방법 안내 가정통신문' });
  assert.deepEqual(actionPayload({ intent: 'message', text: '11월 12일 연수 안내' }, { said: '그거 쪽지로 써 줘', question: false }), { text: '11월 12일 연수 안내' }, '선생님 글에 내용이 없으면(앞 대화를 가리킴) AI가 옮긴 글');
  assert.deepEqual(actionPayload({ intent: 'translate', lang: 'vi' }, { said: '번역해 줘', question: false }), { lang: 'vi' });
});

test('M1 부탁 꼬리 「줄 수 있어요?」「주실래요?」「주시겠어요?」「해 줄래?」도 떼고 넘김', () => {
  for (const [t, intent, out] of [['11월 20일 현장체험학습 안내 가정통신문 써 줄 수 있어요?', 'letter', '11월 20일 현장체험학습 안내 가정통신문'],
    ['11월 12일 3시 과학실 AI 연수 안내 쪽지 만들어 주실래요?', 'message', '11월 12일 3시 과학실 AI 연수 안내 쪽지'],
    ['12월 4일 학예회 안내 가정통신문 써 주시겠어요?', 'letter', '12월 4일 학예회 안내 가정통신문'],
    ['알코올램프 10개 5,000원 품의 해 줄래?', 'purchase', '알코올램프 10개 5,000원'],
    ['과학의 날 행사 결과 보고 써 줄 수 있어?', 'report', '과학의 날 행사 결과 보고'],
    ['독서 주간 안내 쪽지 써 주실 수 있나요?', 'message', '독서 주간 안내 쪽지'],
    ['체육복 준비 안내 가정통신문 작성해 주시겠어요', 'letter', '체육복 준비 안내 가정통신문'],
    ['겨울방학 안내 가정통신문 만들어 줄 수 있을까요?', 'letter', '겨울방학 안내 가정통신문']]) assert.equal(sure(t, intent).payload.text, out, t);
});
