// 「쌤」 채팅: 회의록·문서 다듬기·문항 만들기로 가는 말 (스펙 2026-11-15)
import test from 'node:test';
import assert from 'node:assert/strict';
const R = await import('../../web/core/chat-route.js');

test('[chat-minutes] 「회의록 정리해 줘」 + 메모 → 회의록, 넘길 글은 명령 꼬리를 뺀 메모', () => {
  const t = '회의록 정리해 줘\n- 안건: 학년 현장체험학습 장소\n- 과학관으로 정함, 11월 20일까지 버스 예약';
  const r = R.routeText(t);
  assert.equal(r.intent, 'minutes', JSON.stringify(r));
  const p = R.payloadFor('minutes', t);
  assert.ok(p.text.startsWith('- 안건') && !p.text.includes('정리해 줘'), p.text);
  assert.equal(R.routeText('학년 협의회 협의록 써 줘').intent, 'minutes');
  assert.equal(R.payloadFor('minutes', '회의록 정리해 줘').text, '', '내용이 없으면 빈칸');
});

test('[chat-docedit] 「문서 공문체로 다듬어 줘」「한글 파일 고쳐 줘」 → 문서 다듬기(쪽지·공문 처리가 아님)', () => {
  for (const s of ['이 문서 공문체로 다듬어 줘', '한글 파일 맞춤법 고쳐 줘', '문서 다듬기']) assert.equal(R.routeText(s).intent, 'docedit', s);
  assert.equal(R.routeText('공문 처리해 줘: 독서 주간 운영 결과를 12월 1일까지 제출').intent, 'gongmun');
});
