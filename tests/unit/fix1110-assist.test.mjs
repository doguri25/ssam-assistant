// 2026-11-10 검토 고침 I2 — 「쌤」 채팅 도우미가 고른 할 일(planActions): 묻기만 한 글에는 저절로 아무것도 하지 않음 —
// 메모는 버리고, 글 넣는 일·메뉴 일은 그 화면으로만 가는 후보 버튼(누르면 감). 메모는 선생님 글이 「3번 …」일 때만, 선생님 말(가린 것)로.
// 학생 번호는 글 맨 앞 「N번 …」만(붙여 넣은 공문의 「붙임 1번」은 번호가 아님)
import test from 'node:test';
import assert from 'node:assert/strict';
import { planActions, parseAssist, mentionedNos } from '../../web/core/chat-assist.js';

test('I2 묻는 글: 메모는 버리고, 글 넣는 일·메뉴 일은 후보 버튼(nav)으로만 — 오늘 할 일·메모 보기는 답이라 함', () => {
  const acts = [{ intent: 'memo', nos: [3], text: '상담 필요함' }, { intent: 'letter', text: '상담 안내' }, { intent: 'weekly' }];
  assert.deepEqual(planActions(acts, { raw: '3번 학생 상담 어떻게 하면 좋을까?', said: '3번 학생 상담 어떻게 하면 좋을까?', question: true }), { run: [], nav: ['letter', 'weekly'] });
  for (const intent of ['purchase', 'message', 'letter', 'report', 'gongmun', 'translate', 'handover', 'unit'])
    assert.deepEqual(planActions([{ intent, text: '넣을 글', lang: 'vi' }], { raw: '이거 어떻게 해?', question: true }), { run: [], nav: [intent] }, intent);
  assert.deepEqual(planActions([{ intent: 'briefing' }], { raw: '이번 주 뭐 해야 해?', question: true }), { run: [{ intent: 'briefing', payload: {} }], nav: [] });
  assert.deepEqual(planActions([{ intent: 'memoView', nos: [3] }], { raw: '3번 메모 어떻게 됐어?', question: true }), { run: [{ intent: 'memoView', payload: { nos: [3] } }], nav: [] });
});

test('I2 메모: 선생님 글이 「3번 …」 메모일 때만, 넣는 글은 선생님 말(AI가 쓴 글이 아님), 번호는 선생님이 쓴 것', () => {
  const raw = '3·5번 가정통신문 회신 챙기기 도움';
  assert.deepEqual(planActions([{ intent: 'memo', nos: [3], text: 'AI가 바꿔 쓴 김민수 칭찬' }], { raw, said: raw, question: false }),
    { run: [{ intent: 'memo', payload: { nos: [3], body: '가정통신문 회신 챙기기 도움' } }], nav: [] });
  assert.deepEqual(planActions([{ intent: 'memo', nos: [], text: 'x' }], { raw, said: raw, question: false }).run, [{ intent: 'memo', payload: { nos: [3, 5], body: '가정통신문 회신 챙기기 도움' } }]);
  // 전화번호는 그 자리에서 가림(이름은 메모에 넣을 때 maskMemo)
  assert.deepEqual(planActions([{ intent: 'memo', nos: [3], text: 'x' }], { raw: '3번 어머니 010-1234-5678 연락 옴', question: false }).run[0].payload.body, '어머니 ○○○ 연락 옴');
  // 메모 꼴이 아니면(「1번 문항 …」「3번 단원평가 …」 포함) 메모는 하지 않음
  for (const r of ['1번 문항 정답 바꿔 줄래', '2번 쪽 다시 보기', '3번 단원평가 결과 정리']) assert.deepEqual(planActions([{ intent: 'memo', nos: [1, 2, 3], text: 'x' }], { raw: r, question: false }).run, [], r);
  assert.deepEqual(mentionedNos('1번 문항 정답 바꿔 줄래'), []);
  assert.deepEqual(planActions([{ intent: 'memo', nos: [3], text: '발표 잘함' }], { raw: '오늘 발표 잘한 학생 정리', question: false }), { run: [], nav: [] });
  // 다른 할 일은 그대로(선생님 글)
  assert.deepEqual(planActions([{ intent: 'letter', text: 'AI 글' }], { raw: '가정통신문 써 줘: 11월 20일 운동회 안내', said: '가정통신문 써 줘: 11월 20일 운동회 안내', question: false }).run,
    [{ intent: 'letter', payload: { text: '11월 20일 운동회 안내' } }]);
});

test('I2 학생 번호는 글 맨 앞 「N번 …」만: 붙여 넣은 공문의 「붙임 1번」「3번 문항」은 번호가 아님', () => {
  assert.deepEqual(mentionedNos('3·5번 발표 잘함'), [3, 5]);
  assert.deepEqual(mentionedNos('3·5번, 12번 줄 서기'), [3, 5, 12]);
  assert.deepEqual(mentionedNos('공문 정리해 줄래? 붙임 1번 참고, 2번 신청서'), []);
  assert.deepEqual(mentionedNos('제목: 과학의 날\n붙임 1번 계획서 1부'), []);
  assert.deepEqual(parseAssist({ actions: [{ intent: 'memo', nos: [1], text: '계획서 참고' }] }, { nos: mentionedNos('공문 정리해 줄래? 붙임 1번 참고') }).actions, []);
});
