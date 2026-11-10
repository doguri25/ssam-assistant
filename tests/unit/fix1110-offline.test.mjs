// 2026-11-10 검토 고침 M2 — AI 없이 답하는 길(offlineWay): 「일정·마감·할 일」이 든 하는 법 물음은 오늘 할 일이 아니라 안내,
// 「감사」로 시작하는 물음(감사 = 점검)은 인사가 아님. 인사·할 일을 묻는 말·애매한 명령은 그대로
import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineWay } from '../../web/core/chat-assist.js';
import { routeText } from '../../web/core/chat-route.js';

const way = t => { const r = routeText(t); return offlineWay(t, { question: r.question, candidates: r.candidates }); };

test('M2 하는 법 물음은 안내(오늘 할 일을 띄우지 않음), 할 일·일정을 물으면 오늘 할 일', () => {
  for (const t of ['학사일정 어떻게 넣어?', '마감 기한 어떻게 바꿔?', '할 일 체크는 어떻게 해?', '일정 넣는 법 알려줘', '공문 마감일은 어떻게 고쳐?']) assert.equal(way(t), 'guide', t);
  for (const t of ['이번 주 할 일 정리해줘', '다음 주 일정 알려줘', '마감 언제야?', '급한 거 있어?']) assert.equal(way(t), 'briefing', t);
});

test('M2 「감사」로 시작하는 물음은 인사가 아님, 고맙다는 말·인사는 인사', () => {
  for (const t of ['감사 자료 어떻게 준비해?', '감사 대비 서류 뭐 챙겨?', '감사 지적 사항 정리 방법']) assert.notEqual(way(t), 'greet', t);
  for (const t of ['안녕', '안녕하세요', '고마워', '감사합니다', '감사해요!', '수고했어']) assert.equal(way(t), 'greet', t);
  assert.notEqual(offlineWay('안녕', { failed: true }), 'greet', 'AI가 답하지 못했을 때는 인사로 넘기지 않음');
  assert.equal(offlineWay('채점', { question: false, candidates: ['unit', 'gr'] }), 'pick');
});
