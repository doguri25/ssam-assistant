// 설치 안내: 코드 서명이 없는 설치 파일 — 처음 실행할 때 「Windows의 PC 보호」 창이 뜨면 [추가 정보] → [실행] (채팅 안내도 같게)
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE, searchGuide, offlineAnswer } from '../../web/core/chat-knowledge.js';

test('「Windows와 웹판」 안내에 「Windows의 PC 보호」 창 넘기는 방법', () => {
  const g = GUIDE.find(x => x.id === 'platform');
  assert.ok(g.text.includes('Windows의 PC 보호') && g.text.includes('[추가 정보]') && g.text.includes('[실행]'), g.text);
});

test('경고 창을 물으면 그 안내가 먼저(AI 없이도)', () => {
  for (const q of ['Windows의 PC 보호 창이 떠요', '설치하는데 PC 보호라고 막혀', '스마트스크린 경고가 나와', '설치 파일이 실행이 안 돼'])
    assert.equal((searchGuide(q)[0] || {}).id, 'platform', `${q}: ${JSON.stringify(searchGuide(q).map(h => [h.id, h.score]))}`);
  const a = offlineAnswer('Windows의 PC 보호 창이 떠요');
  assert.ok(a && a.text.includes('[추가 정보]'), a && a.text);
});
