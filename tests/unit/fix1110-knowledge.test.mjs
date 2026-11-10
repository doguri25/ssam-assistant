// 2026-11-10 검토 고침 I4 — 쌤비서 안내(chat-knowledge): 「다른 메뉴로 가도 AI 일은 이어짐」 안내 — 실제 동작대로
// (이어서 함·시작한 기록에 결과·돌아오면 「읽는 중」·진행·다른 메뉴 버튼의 작은 점·돌아오면 그 메뉴에서 마지막으로 연 탭)
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE, searchGuide, offlineAnswer, guideText } from '../../web/core/chat-knowledge.js';

test('I4 「다른 메뉴로 가도 이어짐」 안내: 실제 동작(이어서·시작한 기록·읽는 중·점·마지막으로 연 탭)', () => {
  const g = GUIDE.find(x => x.id === 'background');
  assert.ok(g, '안내 없음');
  for (const k of ['다른 메뉴', '이어서', '뒤에서', '백그라운드', '점', '멈추나']) assert.ok(g.keys.includes(k), k);
  // 세로 메뉴로 돌아오면 그 메뉴에서 마지막으로 연 탭(nav-tabs.js — 이 안내를 쓴 뒤에 바뀜)
  for (const s of ['채점', '평어', '행특', '계획 초안', '품의', '쪽지', '가정통신문', '번역', '공문 처리', '시작한', '읽는 중', '작은 점', '마지막으로 연 탭', '그 탭을 눌러']) assert.ok(g.text.includes(s), `${s}: ${g.text}`);
  assert.ok(!g.text.includes('첫 탭이 열려요'), g.text);
  assert.ok(guideText().includes(g.title));
});

test('I4 묻는 말로 찾으면 그 안내가 먼저(AI 없이도)', () => {
  for (const q of ['채점하다가 다른 메뉴로 가면 멈추나?', '다른 메뉴 가도 이어서 돼?', '뒤에서 계속 돌아가?', '백그라운드로 돼?', '메뉴 버튼에 점은 뭐야?', '가정통신문 쓰는 중에 다른 메뉴 가도 돼?'])
    assert.equal((searchGuide(q)[0] || {}).id, 'background', `${q}: ${JSON.stringify(searchGuide(q).map(h => [h.id, h.score]))}`);
  const a = offlineAnswer('채점하다가 다른 메뉴로 가면 멈추나?');
  assert.ok(a && a.text.includes('이어서') && a.text.includes('작은 점'), a && a.text);
});
