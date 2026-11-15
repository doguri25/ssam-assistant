// 2026-11-15 새 기능(스펙 docedit-minutes-quiz) 안내: 「쌤」 채팅이 회의록·문서 다듬기·새 서식으로 바꾸기·문항/활동지 만들기를 알고 그 화면으로 보냄
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE, searchGuide, offlineAnswer, guideText } from '../../web/core/chat-knowledge.js';
import { INTENTS } from '../../web/core/chat-route.js';

const top = q => (searchGuide(q)[0] || {}).id;
const why = q => JSON.stringify(searchGuide(q, 4).map(h => [h.id, +h.score.toFixed(1)]));

test('[kn1115-about] 「쌤비서는」 메뉴 안내에 문서·소통 › 회의록·문서 다듬기', () => {
  const a = GUIDE.find(g => g.id === 'about');
  assert.match(a.text, /문서·소통\([^)]*회의록[^)]*문서 다듬기/);
});

test('[kn1115-entries] 새 안내 4개: 있고, 바로 가기는 채팅 할 일 이름, 실제 단추 이름을 씀', () => {
  const ids = new Set(INTENTS.map(i => i[0]));
  const want = {
    minutes: ['정리하기', '할 일', '오늘', '학교 양식', '참석'],
    docedit: ['.hwpx', '다듬기', '되돌리기', '한글로 내려받기', '모양'],
    reform: ['새 서식으로 바꾸기', '이대로 바꾸기', '되돌리기', '작년 계획서 서식'],
    'unit-make': ['문항 만들기', '평가 만들기', '정답지', '진도표'],
    'activity-make': ['활동지 만들기', '이대로 활동지 만들기', '○·△']
  };
  for (const [id, words] of Object.entries(want)) {
    const g = GUIDE.find(x => x.id === id);
    assert.ok(g, id + ' 안내 없음');
    for (const w of words) assert.ok(g.text.includes(w), `${id}: 「${w}」 없음`);
    for (const go of g.go || []) assert.ok(ids.has(go), `${id}: 바로 가기 ${go}가 채팅 할 일에 없음`);
    assert.ok(guideText().includes(g.title), id);
  }
});

test('[kn1115-search] 묻는 말로 찾으면 그 안내가 먼저(AI 없이도)', () => {
  const cases = [
    ['회의록 어떻게 정리해?', 'minutes'],
    ['협의회 메모 정리하는 기능 있어?', 'minutes'],
    ['한글 문서 다듬기 어떻게 해?', 'docedit'],
    ['hwpx 파일 공문체로 고쳐 주는 거 있어?', 'docedit'],
    ['올해 계획서 서식이 바뀌었는데 어떻게 해?', 'reform'],
    ['새 서식으로 바꾸기 뭐야?', 'reform'],
    ['단원평가 문항 만들어 줄 수 있어?', 'unit-make'],
    ['형성평가 문제 만들기', 'unit-make'],
    ['활동지 만들기는 어떻게 해?', 'activity-make']
  ];
  for (const [q, id] of cases) assert.equal(top(q), id, `${q}: ${why(q)}`);
  // 원래 안내는 그대로 먼저
  assert.equal(top('단원평가 채점 어떻게 해?'), 'unit', why('단원평가 채점 어떻게 해?'));
  assert.equal(top('공문 기한 어디서 봐?'), 'gongmun', why('공문 기한 어디서 봐?'));
  // 「회의 할 일이 오늘 화면에 떠?」는 오늘 할 일 안내가 먼저여도 회의 할 일을 말함
  const t = offlineAnswer('회의 할 일이 오늘 화면에 떠?');
  assert.ok(t && t.text.includes('회의 할 일'), t && t.text);
  const a = offlineAnswer('회의록 어떻게 정리해?');
  assert.ok(a && a.go.includes('minutes'), JSON.stringify(a));
});
