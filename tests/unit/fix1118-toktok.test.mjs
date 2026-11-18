/* 2026-11-18 선생님 승인: 「쌤」 채팅의 규정 질문(복무·수당·여비·민원·정책 …)에는 답 위에 마주온 톡톡 안내(AI 없이),
   AI는 금액·날짜·조항을 지어내지 않음. 쌤비서 쓰는 법 질문·명령에는 붙이지 않음 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { policyAsk, TOKTOK_NOTE } from '../../web/core/chat-route.js';
import { assistGuide } from '../../web/core/chat-assist.js';
import { guideText } from '../../web/core/chat-knowledge.js';

test('규정 질문이면 톡톡 안내', () => {
  for (const s of ['육아시간 하루 몇 시간까지 쓸 수 있어?', '출장비 얼마 받아?', '병가 쓰면 진단서 필요해?', '학부모 민원 어떻게 처리해야 해?',
    '연수 학점 몇 점 필요해?', '맞춤형 복지 포인트 언제까지 써야 돼?', '시간외 근무 수당 계산 어떻게 해?', '연가 쓸 때 사유 적어야 하나요?', '교원 성과급 등급은 어떻게 정해?'])
    assert.equal(policyAsk(s), true, s);
});

test('쌤비서 쓰는 법·명령·넣을 글이면 안내 없음', () => {
  for (const s of ['강사 수당 품의 어떻게 해?', '품의 사유는 어떻게 써?', '출장비 품의 써 줘', '가정통신문 어떻게 써?', '오늘 할 일 뭐야?',
    '복무 안내 쪽지 써 줘', '연수 메뉴는 언제 생겨?', '출장 신청 방법 안내 가정통신문 만들어 줘', '육아시간 안내\n하루 2시간까지 쓸 수 있어요', '안녕하세요', ''])
    assert.equal(policyAsk(s), false, s);
});

test('안내 글·AI 규칙·안내 찾기', () => {
  assert.equal(TOKTOK_NOTE, '교육청 규정은 **마주온 톡톡**이 정확해요. 마주온(ai.cne.go.kr) 로그인 → 첫 화면 맨 아래 「마주온 톡톡」에서 물어보세요.');
  assert.match(assistGuide(), /복무·수당·여비[^\n]*금액·날짜·조항/);
  assert.match(guideText(), /마주온 톡톡/);
});
