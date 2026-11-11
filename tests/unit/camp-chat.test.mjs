// 「쌤」 채팅 → 학급 › 기초학력 캠프(스펙 2026-11-11): 「캠프 출석」「기초학력 캠프」「교과캠프」는 이 탭으로, 안내에서 찾힘,
// 「영어 캠프 안내 가정통신문」은 그대로 가정통신문
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeText, isSure, INTENT_IDS, intentLabel } from '../../web/core/chat-route.js';
import { searchGuide, offlineAnswer, guideText } from '../../web/core/chat-knowledge.js';

test('채팅 할 일 camp(기초학력 캠프)', () => {
  assert.ok(INTENT_IDS.includes('camp'));
  assert.equal(intentLabel('camp'), '기초학력 캠프');
  for (const t of ['캠프 출석', '기초학력 캠프', '교과캠프', '교과 캠프 출석부 열어 줘', '기초학력 캠프 관찰 기록부 만들어 줘', '캠프 출석 체크할래', '기초학력 캠프 결과 보고서 써 줘']) {
    const r = routeText(t);
    assert.ok(isSure(r) && r.intent === 'camp', `${t}: ${JSON.stringify(r)}`);
  }
  assert.equal(routeText('영어 캠프 안내 가정통신문 써 줘').intent, 'letter', '영어 캠프 가정통신문은 그대로');
  assert.equal(routeText('주간학습안내').intent, 'weekly');
});

test('안내: 기초학력 캠프를 찾고, 학급 메뉴 설명에 탭 이름', () => {
  for (const q of ['기초학력 캠프 출석부 어떻게 만들어?', '교과캠프 수업 확인서', '캠프 관찰 기록부 양식 넣는 법']) assert.equal((searchGuide(q)[0] || {}).id, 'camp', q);
  const a = offlineAnswer('기초학력 캠프는 어떻게 써?');
  assert.ok(a && a.go.includes('camp'), JSON.stringify(a));
  const all = guideText();
  assert.ok(all.includes('기초학력 캠프') && all.includes('학생A'), '안내 글');
});
