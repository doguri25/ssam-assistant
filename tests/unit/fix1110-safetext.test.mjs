// 2026-11-10 검토 고침 M3 — 채팅 기록·AI로 보내는 글(safeText): 명단 줄(이름만 늘어선 줄)이 아니면 줄을 통째로 빼지 않고 이름만 그 자리에서 가림
// (「김다빈 엄마가 상담 요청했는데 어떻게 답하지?」가 빈 글이 되지 않음)
import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterLine } from '../../web/core/chat-names.js';
import { safeText, handoffText } from '../../web/core/chat-route.js';

test('M3 채팅 기록·AI로 보내는 글: 명단이 아닌 줄은 빼지 않고 이름만(묻는 글이 남음), 명단 줄은 뺌', () => {
  assert.equal(safeText('김다빈 엄마가 상담 요청했는데 어떻게 답하지?'), '○○○ 엄마가 상담 요청했는데 어떻게 답하지?');
  assert.equal(safeText('김민수 어머니가 상담 요청했는데 어떻게 하지?'), '○○○ 어머니가 상담 요청했는데 어떻게 하지?');
  assert.equal(safeText('지호가 아파서 조퇴했는데 어떻게 기록해?'), '○○○가 아파서 조퇴했는데 어떻게 기록해?');
  // 명단 줄(이름만 늘어섬)은 여전히 뺌
  assert.equal(safeText('명단\n김민수 이서연 박지훈 최하은'), '명단');
  assert.equal(safeText('김다빈, 최윤슬, 조예담'), '');
  assert.ok(rosterLine('김민수 이서연 박지훈 최하은') && rosterLine('김다빈, 최윤슬, 조예담'));
  assert.ok(!rosterLine('김다빈 엄마가 상담 요청했는데 어떻게 답하지?') && !rosterLine('이야기 나눔 어떻게 하지?'));
  // 넘길 글(handoffText)도 같은 규칙
  assert.equal(handoffText('김다빈 결석계 가정통신문'), '○○○ 결석계 가정통신문');
  assert.equal(handoffText('최윤슬이 상장 받은 것 가정통신문'), '○○○이 상장 받은 것 가정통신문');
});
