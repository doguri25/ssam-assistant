// 「쌤」 채팅 → 기타 › 다면평가(스펙 2026-11-11): 「다면평가」「자기실적평가서」「정량평가」「정성평가」는 이 탭으로(정성·자기실적은 정성 쪽),
// 안내에서 찾힘, 문서·소통(전 「기타」) 메뉴 설명에 탭 이름
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeText, isSure, INTENT_IDS, intentLabel, payloadFor } from '../../web/core/chat-route.js';
import { searchGuide, offlineAnswer, guideText } from '../../web/core/chat-knowledge.js';

test('채팅 할 일 multi(다면평가)', () => {
  assert.ok(INTENT_IDS.includes('multi'));
  assert.equal(intentLabel('multi'), '다면평가');
  for (const t of ['다면평가', '다면 평가 써 줘', '자기실적평가서', '자기 실적 평가서 만들어 줘', '정량평가', '정성평가 열어 줘', '교사 다면평가 정량평가 점수 계산']) {
    const r = routeText(t);
    assert.ok(isSure(r) && r.intent === 'multi', `${t}: ${JSON.stringify(r)}`);
  }
  assert.equal(payloadFor('multi', '정성평가 열어 줘').view, 'qual');
  assert.equal(payloadFor('multi', '자기실적평가서').view, 'qual');
  assert.equal(payloadFor('multi', '정량평가').view, 'quant');
  assert.equal(payloadFor('multi', '다면평가').view, '');
  assert.equal(routeText('인수인계서').intent, 'handover', '다른 문서·소통 탭은 그대로');
  assert.equal(routeText('수행평가 채점').intent, 'gr');
});

test('안내: 다면평가를 찾고, 문서·소통 메뉴 설명에 탭 이름', () => {
  for (const q of ['다면평가 근거자료 넣는 법', '자기실적평가서 어떻게 써?', '정량평가 점수 계산은 어떻게 해?']) assert.equal((searchGuide(q)[0] || {}).id, 'multi', q);
  const a = offlineAnswer('다면평가는 어떻게 써?');
  assert.ok(a && a.go.includes('multi'), JSON.stringify(a));
  const all = guideText();
  assert.ok(all.includes('문서·소통(쪽지 작성·가정통신문·공문 처리·인수인계서·다면평가'), '메뉴 설명');
  assert.ok(all.includes('입력 필요') && all.includes('근거자료'), '안내 글');
});
