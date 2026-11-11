// 「쌤」 채팅 도우미(2026-11-10): 묻는 글은 규칙으로 바로 하지 않음, AI에 주는 글(안내·상태·대화·선생님 글)에는 이름·전화번호가 없음,
// AI 답(JSON) 정리(모르는 할 일은 버림·2개까지·번호는 선생님이 말한 것만), 답 글은 HTML로 넣지 않음, AI 없이 안내 찾기
import test from 'node:test';
import assert from 'node:assert/strict';
import { assistPrompt, assistGuide, stateLines, parseAssist, replyHTML, mentionedNos, TAG, GUIDE_TAG, MAX_ACTIONS } from '../../web/core/chat-assist.js';
import { GUIDE, guideText, searchGuide, offlineAnswer } from '../../web/core/chat-knowledge.js';
import { routeText, isSure, isQuestion, INTENT_IDS } from '../../web/core/chat-route.js';
// core/shell.js MENUS와 같은 메뉴·탭(shell.js는 화면이 있어야 읽힘)
const MENUS = [['평가', ['교과 평어', '창의적 체험활동', '행동특성', '평가지 채점', '단원평가', '활동지']], ['연수', ['내 필수연수', '연수 현황판']],
  ['계획', ['연간계획', '행사계획', '학급운영계획', '결과 보고']], ['학급', ['오늘 수업', '진도표·시수', '주간학습안내', '기초학력 캠프']], ['품의', ['새 품의', '저장한 템플릿', '최근 작성']],
  ['기타', ['쪽지 작성', '가정통신문', '공문 처리', '인수인계서', '다면평가']], ['설정', ['학급 명단', 'AI', '화면', '학교 정보', '학년도', '품의 기준']]];

const NAMES = ['김민수', '박지훈', '이서연', '최하은', '김철수', '민준', '김솔'];
const PHONE = /0\d{1,2}-?\d{3,4}-?\d{4}|@/;
const clean = (s, what) => { for (const n of NAMES) assert.ok(!s.includes(n), `${what}: ${n} 남음`); assert.ok(!PHONE.test(s), `${what}: 전화번호·전자 우편 남음`); };

test('묻는 글: 메뉴 낱말이 있어도 바로 하지 않음(도우미가 답함), 부탁 꼴·명령은 그대로', () => {
  for (const t of ['단원평가 결과지 어떻게 뽑아?', 'AI 키 없이 써도 돼?', '행특 잘 쓰는 법 알려줘', '품의 사유는 어떻게 써?', '가정통신문 베트남어로 번역 돼?', '공문 처리할 거 있어?',
    '쪽지랑 가정통신문 차이가 뭐야?', '3번 학생 상담 어떻게 하면 좋을까?']) {
    const r = routeText(t);
    assert.ok(isQuestion(t) && !isSure(r) && r.question, `${t}: ${JSON.stringify(r)}`);
  }
  assert.deepEqual(routeText('단원평가 결과지 어떻게 뽑아?').candidates, ['unit'], '후보는 남김(그 화면 버튼)');
  // 오늘 할 일·메모 보기는 묻는 꼴이어도 답이 곧 그 일
  assert.equal(routeText('오늘 할 일 뭐 있어?').intent, 'briefing');
  for (const [t, id] of [['가정통신문 써 줄래?', 'letter'], ['AI 키 넣을래', 'aikey'], ['연간계획 보여 줘', 'year'], ['주간학습안내 열어 줄래?', 'weekly'], ['번역해 줘', 'translate'],
    ['알코올램프 10개 5,000원 품의해 줘', 'purchase'], ['3번 발표 잘함', 'memo'], ['인수인계서 만들어 줘', 'handover']]) {
    const r = routeText(t);
    assert.ok(isSure(r) && r.intent === id && !isQuestion(t), `${t}: ${JSON.stringify(r)}`);
  }
  // 여러 줄·긴 글은 넣을 내용(묻는 말이 들어 있어도)
  assert.ok(!isQuestion('공문 처리\n언제까지 내는지 정리'));
  assert.equal(routeText('이번 주 할 일 정리해줘').intent, null, '규칙에 없는 말 → 도우미');
});

test('AI에 주는 글: 공통 안내(캐시) + 상태·대화·선생님 글, 이름·전화번호 없음', () => {
  const p = assistPrompt({
    text: '박지훈 결석계 가정통신문 어떻게 써? 어머니 010-1234-5678',
    history: [{ who: 'me', text: '김민수 엄마한테 쪽지' }, { who: 'bot', text: '쪽지 작성에 넣었어요.' }, { who: 'me', text: '담임 김철수 ssam@school.kr' }],
    state: { place: '기타 › 가정통신문', brief: [{ text: '공문 「과학의 날 참가 신청」 제출', when: 'D-3' }, { text: '이서연 상담', when: '11/10(화)' }],
      ai: { ready: true, name: 'Claude' }, letter: { title: '최하은 표창 안내' }, purchase: { title: '', items: 2 }, classCount: 25, app: 'web' },
    hints: ['letter', 'zzz'], today: '2026-11-10'
  });
  assert.ok(p.shared.startsWith(GUIDE_TAG) && p.own.startsWith(TAG), '태그');
  assert.equal(p.shared, assistGuide(), '공통 안내는 대화마다 같음(캐시)');
  for (const g of GUIDE) assert.ok(p.shared.includes(g.title), `안내 ${g.title}`);
  for (const id of INTENT_IDS) assert.ok(p.shared.includes(`- ${id}:`), `할 일 ${id}`);
  for (const s of ['해요체', '저장·결재·상신·나이스 저장', '지어내지 않아요', '일반 안내', '"reply"', '"actions"']) assert.ok((p.shared + p.own).includes(s), s);
  clean(p.shared + p.own, '프롬프트');
  for (const s of ['[지금 앱 상태]', '기타 › 가정통신문', '공문 「과학의 날 참가 신청」 제출(D-3)', '○○○ 상담', 'AI: Claude', '가정통신문: 쓰던 것 있음', '품의: 쓰던 초안 있음 · 품목 2개', '학급 명단: 25명',
    '[최근 대화]', '선생님: ○○○ 엄마한테 쪽지', '쌤비서: 쪽지 작성에 넣었어요.', '[앱 규칙이 짐작한 할 일] letter', '[선생님 글]', '○○○ 결석계 가정통신문 어떻게 써?', '오늘: 2026-11-10'])
    assert.ok(p.own.includes(s), `${s} 없음:\n${p.own}`);
  assert.ok(!p.own.includes('zzz'), '모르는 할 일 짐작');
});

test('대화는 최근 10개까지, 긴 글은 줄임, AI가 없으면 상태에 그렇게', () => {
  const history = Array.from({ length: 25 }, (_, i) => ({ who: i % 2 ? 'bot' : 'me', text: `말 ${i} ` + '가'.repeat(600) }));
  const p = assistPrompt({ text: '나'.repeat(4000), history, state: { ai: { ready: false } } });
  assert.equal((p.own.match(/^(선생님|쌤비서): 말 /gm) || []).length, 10);
  assert.ok(!p.own.includes('말 14 ') && p.own.includes('말 15 ') && p.own.includes('말 24 '), '오래된 것은 뺌');
  assert.ok(p.own.length < 4000 + 400 * 10, String(p.own.length));
  assert.ok(stateLines({ ai: { ready: false } }).some(l => l.includes('준비 안 됨')));
  assert.ok(stateLines({ ai: { ready: true, name: '시험용 업스테이지', trial: true } }).some(l => l.includes('시험용')));
  assert.ok(stateLines({ brief: [] }).includes('- 오늘 할 일: 급한 일 없음'));
});

test('AI 답 정리: 모르는 할 일 버림, 2개까지, 같은 할 일 한 번, 번역 언어·메모 번호 확인, 넘길 글도 가림', () => {
  const v = parseAssist({ reply: '가정통신문 쓰기를 시작할게요.', actions: [{ intent: 'hack' }, { intent: 'letter', text: '박지훈 결석 안내 010-1234-5678' }, { intent: 'letter', text: '또' },
    { intent: 'translate', lang: 'xx' }, { intent: 'purchase', text: 'A4 5박스' }], choices: ['unit', 'nope', 'letter', 'gr', 'year', 'cc'] });
  assert.equal(v.reply, '가정통신문 쓰기를 시작할게요.');
  assert.equal(v.actions.length, MAX_ACTIONS);
  assert.deepEqual(v.actions, [{ intent: 'letter', text: '○○○ 결석 안내 ○○○' }, { intent: 'translate', lang: '' }]);
  assert.deepEqual(v.choices, ['unit', 'gr', 'year'], '할 일과 겹치지 않게, 3개까지');
  // 메모: 선생님 글에 있는 번호만, 글이 없으면 하지 않음
  assert.deepEqual(parseAssist({ actions: [{ intent: 'memo', nos: [3, 9], text: '발표 잘함' }] }, { nos: [3] }).actions, [{ intent: 'memo', text: '발표 잘함', nos: [3] }]);
  assert.deepEqual(parseAssist({ actions: [{ intent: 'memo', nos: [9], text: '발표 잘함' }] }, { nos: [3] }).actions, []);
  assert.deepEqual(parseAssist({ actions: [{ intent: 'memo', nos: [3] }] }, { nos: [3] }).actions, []);
  assert.deepEqual(parseAssist({ actions: [{ intent: 'memoView', nos: ['3'] }] }, { nos: [3] }).actions, [{ intent: 'memoView', nos: [3] }]);
  // 모양이 이상하면 빈 답
  for (const x of [null, [], 'text', { reply: 3, actions: 'x', choices: {} }]) assert.deepEqual(parseAssist(x), { reply: '', actions: [], choices: [] });
  assert.equal(parseAssist({ reply: '가'.repeat(5000) }).reply.length, 2001);
});

test('선생님 글의 번호: 「3번」「3·5번」「3~5번」', () => {
  assert.deepEqual(mentionedNos('3번 발표 잘함'), [3]);
  assert.deepEqual(mentionedNos('3·5번, 12번 발표'), [3, 5, 12]);
  assert.deepEqual(mentionedNos('붙임 1번 계획서, 2번 신청서'), [], '글 맨 앞 「N번 …」 메모 꼴만(검토 I2)');
  assert.deepEqual(mentionedNos('3~5번 줄 서기'), [3, 4, 5]);
  assert.deepEqual(mentionedNos('99번, 단원평가'), []);
});

test('답 글 → HTML: 글자를 바꾸고 줄·목록·굵게만(HTML을 넣지 않음)', () => {
  assert.equal(replyHTML('<img src=x onerror=alert(1)> **굵게** & "따옴"'), '<p>&lt;img src=x onerror=alert(1)&gt; <b>굵게</b> &amp; &quot;따옴&quot;</p>');
  assert.equal(replyHTML('차례예요.\n1. 정답지 넣기\n2. 채점하기\n\n- 한글\n- 워드\n끝'), '<p>차례예요.</p><ol><li>정답지 넣기</li><li>채점하기</li></ol><ul><li>한글</li><li>워드</li></ul><p>끝</p>');
  assert.equal(replyHTML('3. 셋째부터'), '<ol start="3"><li>셋째부터</li></ol>');
  assert.equal(replyHTML('한 줄\n두 줄'), '<p>한 줄<br>두 줄</p>');
  assert.ok(!replyHTML('**<script>x</script>**').includes('<script>'));
  assert.equal(replyHTML(''), '');
});

test('쌤비서 안내: 메뉴·탭을 모두 다루고, 낱말로 찾으면 맞는 안내가 먼저', () => {
  const all = guideText();
  for (const [m, tabs] of MENUS) { assert.ok(all.includes(m), m); for (const t of tabs) assert.ok(all.includes(t), `${m} › ${t}`); }
  for (const s of ['2027. 3. 31.', '하루 400번', 'Windows 앱만', '저장·결재·상신']) assert.ok(all.includes(s), s);
  for (const [q, id] of [['단원평가 결과지 어떻게 뽑아?', 'unit-sheet'], ['AI 키 없이 써도 돼?', 'trial'], ['행특 잘 쓰는 법 알려줘', 'hk'], ['품의 사유는 어떻게 써?', 'purchase-reason'],
    ['이번 주 할 일 정리해줘', 'briefing'], ['윈도우 앱이랑 웹판 차이가 뭐야?', 'platform'], ['개인정보 안전해?', 'privacy'], ['에듀파인에 어떻게 붙여 넣어?', 'edufine'],
    ['가정통신문 양식 어떻게 넣어?', 'letter'], ['백업은 어떻게 해?', 'years'], ['채점 정확도는?', 'accuracy'], ['진도표 넣는 법', 'class']])
    assert.equal((searchGuide(q)[0] || {}).id, id, q);
  assert.deepEqual(searchGuide('안녕'), []);
  const a = offlineAnswer('단원평가 결과지 어떻게 뽑아?');
  assert.ok(a.text.includes('결과지 · 한글로 내려받기') && a.text.includes('잘한 점·격려 쓰기') && a.go.includes('unit'), a.text);
  assert.equal(offlineAnswer('날씨 어때'), null);
});
