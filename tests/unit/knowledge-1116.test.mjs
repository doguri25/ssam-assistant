// 2026-11-16 안내: 「쌤」 채팅이 [바로 마치기]·한눈에 결과 확인 [마치기]·[다시 열기]를 알고, 단원평가·활동지 안내에도 적음
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE, searchGuide } from '../../web/core/chat-knowledge.js';

const top = q => (searchGuide(q)[0] || {}).id;
const why = q => JSON.stringify(searchGuide(q, 4).map(h => [h.id, +h.score.toFixed(1)]));

test('[kn1116] 바로 마치기·마치기 안내: 찾으면 먼저, 단원평가·활동지 안내에도', () => {
  const g = GUIDE.find(x => x.id === 'finish');
  assert.ok(g, '안내 없음');
  for (const w of ['바로 마치기', '쌤비서가 매긴 대로', '결과 확인', '마치기', '끝난 평가', '다시 열기', '선생님 차례']) assert.ok(g.text.includes(w), w);
  for (const q of ['확인 안 하고 바로 마치기', '노란 칸 확인하지 않고 그냥 마치고 싶어', '결과 확인 칸에서 마치기는 뭐야?', '끝난 평가 다시 열기 어떻게 해?'])
    assert.equal(top(q), 'finish', `${q}: ${why(q)}`);
  assert.equal(top('단원평가 채점 어떻게 해?'), 'unit', why('단원평가 채점 어떻게 해?'));
  for (const id of ['unit', 'activity']) assert.ok(GUIDE.find(x => x.id === id).text.includes('[바로 마치기]'), id);
});
