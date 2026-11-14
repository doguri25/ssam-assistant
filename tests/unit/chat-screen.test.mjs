// 「쌤」 채팅 — 지금 화면 맞춤 도움(스펙 2026-11-14-chat-smarter §3)
import test from 'node:test';
import assert from 'node:assert/strict';
const { screenQuestion, screenAnswer } = await import('../../web/core/chat-screen.js');

test('이 화면·여기·다음에 무엇을 하는지 묻는 말', () => {
  for (const t of ['이 화면에서 뭐 해야 돼?', '여기서 뭐 하는 거야', '다음에 뭐 해?', '뭐부터 해야 돼?', '지금 뭐 하면 돼?', '이 단계는 뭐야?', '이거 어떻게 해?', '현재 화면 뭐 하는 곳이야'])
    assert.ok(screenQuestion(t), t);
  for (const t of ['오늘 뭐 해야 돼', '단원평가 화면에서 뭐 해?', '지금 뭐 남았어?', '가정통신문 써 줘', '다음 주 주간학습안내', '3번 다음에 발표 잘함'])
    assert.ok(!screenQuestion(t), t);
});

test('답: 메뉴 › 탭 · n단계, 화면 설명, 다음 할 일(평가 한 바퀴 띠·다음 단계)', () => {
  const a = screenAnswer({ place: '평가 › 단원평가', step: { n: 3, label: '채점 확인' }, next: '피드백', flow: '평가 한 바퀴 1/6 · 다음: 틀린 까닭', intro: '학생 문제지와 답안을 넣으면 채점해요.' });
  assert.ok(a.includes('**평가 › 단원평가** · 3단계 「채점 확인」'), a);
  assert.ok(a.includes('이 화면은: 학생 문제지와 답안을 넣으면 채점해요.'), a);
  assert.ok(a.includes('다음 할 일: 「틀린 까닭」(평가 한 바퀴 1/6)'), a);
  assert.ok(a.includes('4단계 「피드백」'), a);
  assert.ok(screenAnswer({ place: '계획 › 연간계획', step: { n: 5, label: '일정' }, next: '' }).includes('마지막 단계예요'));
  assert.ok(screenAnswer({ place: '평가 › 단원평가', flow: '평가 한 바퀴 6/6 ✓' }).includes('평가 한 바퀴를 다 했어요'));
  assert.ok(screenAnswer({ place: '오늘', home: true }).includes('오늘 챙길 일'));
  assert.ok(screenAnswer({ place: '설정 › 테마' }).includes('물어봐 주세요'));
  assert.ok(screenAnswer({}).includes('찾지 못했어요'));
});
