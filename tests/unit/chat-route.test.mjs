// 「쌤」 채팅 글 → 할 일(스펙 2026-11-06 D·F): 낱말 규칙, 메뉴에 넘길 글, 애매하면 후보, 관찰 메모 번호(AI 도우미는 chat-assist.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeText, payloadFor, isSure, parseMemo, INTENTS, INTENT_IDS, intentLabel, LANGS } from '../../web/core/chat-route.js';

const R = t => routeText(t);
const sure = (t, intent) => { const r = R(t); assert.ok(isSure(r), `${t}: 분명하지 않음 ${JSON.stringify(r)}`); assert.equal(r.intent, intent, t); return r; };

test('품의: 품의 낱말·명령 꼬리를 뺀 글을 넘김(앱이 품목으로 읽음)', () => {
  assert.equal(sure('알코올램프 10개 5,000원 품의', 'purchase').payload.text, '알코올램프 10개 5,000원');
  assert.equal(sure('알코올램프 10개 5,000원 품의해 줘', 'purchase').payload.text, '알코올램프 10개 5,000원');
  assert.equal(sure('품의 올려 줘 알코올램프 10개 5,000원', 'purchase').payload.text, '알코올램프 10개 5,000원');
  assert.equal(sure('품의서 써 줘', 'purchase').payload.text, '', '내용이 없으면 빈칸(메뉴로만)');
  assert.equal(sure('현장체험학습 품의', 'purchase').intent, 'purchase', '품의가 행사 낱말보다 앞섬');
});

test('쪽지·가정통신문·공문·결과 보고: 내용이 있으면 명령 꼬리만 뺀 글, 없으면 빈칸', () => {
  assert.equal(sure('11월 12일 3시 과학실 AI 연수 안내 쪽지 써 줘', 'message').payload.text, '11월 12일 3시 과학실 AI 연수 안내 쪽지');
  assert.equal(sure('연수 안내 쪽지', 'message').payload.text, '');
  assert.equal(sure('가정통신문 써 줘 11월 20일 현장체험학습 안내 준비물 도시락', 'letter').payload.text, '11월 20일 현장체험학습 안내 준비물 도시락');
  assert.equal(sure('운동회 가정통신문', 'letter').payload.text, '');
  assert.equal(sure('공문 처리', 'gongmun').payload.text, '');
  assert.equal(sure('공문: 과학의 날 행사 참가 신청서를 11월 20일까지 제출', 'gongmun').payload.text, '과학의 날 행사 참가 신청서를 11월 20일까지 제출');
  assert.equal(sure('결과 보고 써 줘', 'report').payload.text, '');
  assert.equal(sure('과학의 날 공문 쪽지로 안내', 'message').intent, 'message', '「쪽지로」가 공문보다 앞섬');
});

test('메뉴로 가는 할 일: 계획·평가 탭·학급·브리핑·인수인계서·AI 키', () => {
  for (const [t, id] of [['연간계획', 'year'], ['행사계획', 'event'], ['운동회 계획', 'event'], ['학급운영계획', 'classplan'], ['단원평가 채점', 'unit'], ['활동지', 'activity'],
    ['수행평가 채점', 'gr'], ['평가지 채점', 'gr'], ['교과 평어', 'pyeongeo'], ['행특', 'hk'], ['행동특성', 'hk'], ['창체', 'cc'], ['주간학습안내', 'weekly'], ['오늘 수업', 'today'],
    ['진도표', 'progress'], ['브리핑', 'briefing'], ['오늘 할 일', 'briefing'], ['인수인계서', 'handover'], ['AI 키 넣기', 'aikey'], ['결과 보고서', 'report'],
    ['기재 점검', 'check'], ['생기부 점검해 줘', 'check'], ['행특 기재 점검', 'check']]) sure(t, id);
});

test('번역: 언어 낱말 + 번역·통신문·「~어로」, 언어를 모르면 빈칸(언어 고르기)', () => {
  assert.equal(sure('가정통신문 베트남어로', 'translate').payload.lang, 'vi');
  assert.equal(sure('중국어로 번역', 'translate').payload.lang, 'zh');
  assert.equal(sure('러시아어 가정통신문', 'translate').payload.lang, 'ru');
  assert.equal(sure('영어로 번역해 줘', 'translate').payload.lang, 'en');
  assert.equal(sure('번역해 줘', 'translate').payload.lang, '');
  assert.equal(sure('영어 단원평가', 'unit').intent, 'unit', '언어 낱말만으로는 번역이 아님');
  assert.deepEqual(LANGS.map(l => l[0]), ['vi', 'zh', 'ru', 'en']);
});

test('애매하면 후보 2~3개(분명하지 않음), 모르면 할 일 없음', () => {
  const r = R('채점');
  assert.equal(r.intent, null); assert.ok(!isSure(r));
  assert.deepEqual([...r.candidates].sort(), ['activity', 'gr', 'unit']);
  const n = R('안녕');
  assert.equal(n.intent, null); assert.deepEqual(n.candidates, []); assert.equal(n.confidence, 0);
  assert.equal(R('').intent, null);
  const amb = R('운동회 계획 가정통신문');
  assert.equal(amb.intent, null); assert.deepEqual(amb.candidates.slice(0, 2), ['event', 'letter']);
});

test('관찰 메모: 「3번 …」「3·5번 …」「3, 5번」「3번, 7번」「3~5번」 → 번호와 글', () => {
  const r = sure('3번 토론에서 근거 들어 반론 잘함', 'memo');
  assert.deepEqual(r.payload, { nos: [3], body: '토론에서 근거 들어 반론 잘함' });
  assert.deepEqual(sure('3·5번 모둠 활동에서 친구를 잘 도와줌', 'memo').payload.nos, [3, 5]);
  assert.deepEqual(sure('3, 5번 발표', 'memo').payload.nos, [3, 5]);
  assert.deepEqual(sure('3번, 7번 청소 열심히 함', 'memo').payload.nos, [3, 7]);
  assert.deepEqual(sure('3~5번 줄 서기 잘함', 'memo').payload.nos, [3, 4, 5]);
  assert.deepEqual(sure('3 ~ 5번 줄 서기 잘함', 'memo').payload.nos, [3, 4, 5]);
  assert.deepEqual(sure('12번은 발표 목소리가 커짐', 'memo').payload, { nos: [12], body: '발표 목소리가 커짐' });
  assert.equal(sure('5번 활동지 정리를 꼼꼼히 함', 'memo').intent, 'memo', '메모 끝말이면 다른 낱말이 있어도 메모');
  assert.deepEqual(sure('3번 메모 보기', 'memoView').payload, { nos: [3] });
  assert.deepEqual(sure('3·5번 메모 보여 줘', 'memoView').payload, { nos: [3, 5] });
  assert.equal(R('3번 단원평가 결과').intent, 'unit', '「3번 단원…」은 메모가 아님');
  assert.equal(R('1번 문항 정답 바꿔').intent, null);
  assert.equal(parseMemo('토론 잘함'), null);
  assert.equal(parseMemo('99번 잘함'), null, '60번 넘는 번호는 없음');
  assert.deepEqual(payloadFor('memo', '4번 독서를 즐김'), { nos: [4], body: '독서를 즐김' });
});

test('할 일 목록: 이름·설명이 있고 id는 겹치지 않음', () => {
  assert.ok(INTENTS.every(([id, label, d]) => intentLabel(id) === label && d), '이름·설명');
  assert.equal(new Set(INTENT_IDS).size, INTENTS.length);
  assert.equal(intentLabel('zzz'), '');
});

// AI로 보낸 글(스펙 2026-11-13 §2): 「보낸 글」「AI로 뭐 보냈어」「AI에 보낸 내용」 → 설정 › AI 「AI로 보낸 글」. 쪽지·가정통신문·공문을 「보낸」 글은 그 일
test('AI로 보낸 글: 「보낸 글」「AI로 뭐 보냈어」「AI에 보낸 내용」 → aiLog(묻는 꼴이어도)', () => {
  assert.ok(INTENT_IDS.includes('aiLog'));
  assert.equal(intentLabel('aiLog'), 'AI로 보낸 글');
  for (const t of ['보낸 글', '보낸 글 보기', '보낸 글 보여 줘', '보낸 내용', 'AI로 보낸 글', 'AI로 보낸 글 보여 줘', 'AI에 보낸 내용', 'AI에 보낸 내용 보여 주세요',
    'AI로 뭐 보냈어', 'AI로 뭐 보냈어?', 'ai한테 뭐 보냈어?', 'AI에 무엇을 보냈나요?', 'AI로 보낸 거 확인', '에이아이로 보낸 글', 'Gemini로 보낸 글'])
    sure(t, 'aiLog');
});

test('AI로 보낸 글: 다른 일의 「보낸」·「AI」 글은 그 일', () => {
  sure('쪽지 보낸 글', 'message');
  sure('어제 보낸 가정통신문 다시 써 줘', 'letter');
  sure('공문 보낸 내용 정리', 'gongmun');
  sure('AI 키 넣기', 'aikey');
  sure('AI 설정', 'aikey');
  for (const t of ['email 보낸 글 정리해 줘', '학부모님께 보낸 안내장 내용으로 가정통신문 써 줘', '선생님들께 보낸 쪽지 다시', '3번 학생이 보낸 글을 칭찬함'])
    assert.notEqual(R(t).intent, 'aiLog', t);
});
