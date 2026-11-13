// 3분 둘러보기(스펙 2026-11-13-miss-tour-check §3): 채팅 「둘러보기」「체험」 → 둘러보기, 안내(chat-knowledge), 단계 목록(늘릴 수 있게)
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeText, isSure, INTENT_IDS, intentLabel } from '../../web/core/chat-route.js';
import { offlineAnswer, GUIDE } from '../../web/core/chat-knowledge.js';
import { TOUR_STEPS, addTourStep, tourSteps } from '../../web/core/tour-steps.js';

const sure = (t, id) => { const r = routeText(t); assert.ok(isSure(r) && r.intent === id, `${t} → ${JSON.stringify(r)}`); };

test('채팅: 「둘러보기」「체험」 → 3분 둘러보기', () => {
  assert.ok(INTENT_IDS.includes('tour'));
  assert.equal(intentLabel('tour'), '3분 둘러보기');
  for (const t of ['둘러보기', '3분 둘러보기', '둘러볼래', '둘러보기 시작', '체험', '체험 시작', '체험하기', '체험해 볼래', '체험 모드', '앱 체험', '쌤비서 둘러보기 해 줘']) sure(t, 'tour');
});

test('채팅: 「체험」이 다른 일의 낱말이면 둘러보기가 아님', () => {
  sure('현장체험학습 계획', 'event');
  sure('창의적 체험활동 써 줘', 'cc');
  sure('숲 체험 안내 가정통신문 써 줘', 'letter');
  assert.notEqual(routeText('체험학습 운영 계획 세워 줘').intent, 'tour');
  assert.notEqual(routeText('AI 키 없이 체험하려면 어떻게 해?').intent, 'tour');
});

test('안내: 「둘러보기」를 물으면 둘러보기 안내, 버튼은 둘러보기', () => {
  const g = GUIDE.find(x => x.id === 'tour');
  assert.ok(g && g.go.includes('tour') && /\[체험 끝내기\]/.test(g.text) && /그대로/.test(g.text), JSON.stringify(g));
  const a = offlineAnswer('3분 둘러보기는 뭐예요?');
  assert.equal(a.ids[0], 'tour');
  assert.ok(a.go.includes('tour'));
  // 시험용 AI(키 없이 쓰기) 안내는 그대로
  assert.equal(offlineAnswer('키 없이 무료로 써도 돼?').ids[0], 'trial');
});

test('단계: 오늘 → 단원평가 결과 → 도달하지 못한 학생 → 기초학력 사전·사후 → 근거 평어 → 기재 점검 → 끝(글은 짧게)', () => {
  const ids = TOUR_STEPS.map(s => s.id);
  assert.deepEqual(ids, ['home', 'unit', 'gap', 'growth', 'evidence', 'check', 'end']);
  for (const s of TOUR_STEPS) {
    assert.ok(s.title && s.text && s.text.length <= 90, `${s.id}: ${s.text}`);
    assert.equal(typeof s.go, 'function', s.id);
    assert.ok(s.id === 'end' || (typeof s.target === 'string' && s.target), s.id);
    assert.ok(/요[.!]?$|요\. /.test(s.text), `해요체: ${s.text}`);
  }
});

test('단계 늘리기: 끝 단계 앞에 끼워 넣음(같은 id는 바꿈)', () => {
  const before = tourSteps().map(s => s.id);
  addTourStep({ id: 'extra', title: '더', text: '더 보여 줘요.', target: '.x', go: () => {} });
  const after = tourSteps().map(s => s.id);
  assert.deepEqual(after, [...before.slice(0, -1), 'extra', 'end']);
  addTourStep({ id: 'extra', title: '더', text: '바꾼 글이에요.', target: '.y', go: () => {} });
  assert.equal(tourSteps().filter(s => s.id === 'extra').length, 1);
  assert.equal(tourSteps().find(s => s.id === 'extra').target, '.y');
  addTourStep({ id: 'first', title: '처음', text: '앞에 넣어요.', target: '.z', go: () => {} }, { before: 'unit' });
  assert.deepEqual(tourSteps().map(s => s.id).slice(0, 3), ['home', 'first', 'unit']);
});
