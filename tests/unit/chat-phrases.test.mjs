// 「쌤」 채팅 말 모음 시험(스펙 2026-11-14-chat-smarter §2): 선생님 말투 100문장을 채팅과 같은 차례(지금 화면 → 앱 자료 → 할 일 규칙)로 나눠
// 기대와 맞힌 비율을 셈(AI 없이). 95% 아래면 실패. 기대: 할 일 id(바로 함) · data:종류(앱 자료로 답) · screen(지금 화면 도움) ·
// ask(묻는 글 → 쌤비서 도우미·안내) · cand:id(애매 → 그 할 일이 후보 버튼에)
import test from 'node:test';
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), key: () => null, length: 0 };
const { routeText, isSure } = await import('../../web/core/chat-route.js');
const { dataQuestion } = await import('../../web/core/chat-data.js');
const { screenQuestion } = await import('../../web/core/chat-screen.js');

export const PHRASES = [
  // 품의
  ['알코올램프 10개 사야 돼', 'purchase'], ['과학실 소모품 품의 올려야 하는데', 'purchase'], ['방과후 강사 수당 품의', 'purchase'], ['복사용지 5박스 구입', 'purchase'],
  ['체육 대회 물품 주문해야 해', 'purchase'], ['견적서 받은 거 품의 써줘', 'purchase'], ['품의서 초안 만들어줘', 'purchase'], ['학급 운영비로 색종이 20묶음 살 거야', 'purchase'],
  // 쪽지
  ['동료 선생님들한테 회의 안내 메신저', 'message'], ['선생님들께 연수 안내 쪽지 써줘', 'message'], ['내일 3시 협의회 있다고 쪽지로 알려줘', 'message'],
  ['부장님께 보낼 메신저 초안', 'message'], ['교직원 회의 안내 쪽지', 'message'], ['학년 선생님들에게 알려야 해 체육복 입고 오라고', 'message'],
  // 가정통신문·번역
  ['학부모님께 현장체험학습 안내문 보내야 해', 'letter'], ['가정통신문 써줘 다음주 수요일 단축수업', 'letter'], ['보호자 안내장 만들어줘', 'letter'],
  ['현장체험학습 동의서 가정통신문', 'letter'], ['부모님께 알림장 보내야 하는데 내용은 준비물 챙기기', 'letter'], ['안내문 써줘', 'letter'],
  ['가정통신문 베트남어로', 'translate'], ['이 통신문 중국어로 번역해줘', 'translate'], ['영어판 가정통신문', 'translate'],
  // 공문·결과 보고
  ['공문 왔는데 정리해줘', 'gongmun'], ['공문 처리', 'gongmun'], ['공문 왔는데 뭐 해야 돼', 'ask'], ['공문 기한 정리', 'gongmun'],
  ['결과보고서 써야 함', 'report'], ['운동회 결과 보고서 만들어줘', 'report'], ['행사 끝났으니 결과 보고 정리', 'report'],
  // 계획
  ['운동회 계획 세워야 해', 'event'], ['학예회 계획서 초안', 'event'], ['연간 업무 계획 짜줘', 'year'], ['학급 운영 계획 만들어줘', 'classplan'], ['현장체험학습 계획', 'event'],
  // 평가
  ['단원평가 채점', 'unit'], ['채점해줘', 'cand:unit'], ['활동지 채점해줘', 'activity'], ['수행평가 채점', 'gr'], ['서술형 평가지 채점해줘', 'gr'],
  ['세특 써줘', 'pyeongeo'], ['교과 평어 만들어줘', 'pyeongeo'], ['행특 써줘', 'hk'], ['행동특성 종합의견', 'hk'], ['창체 특기사항 써줘', 'cc'],
  ['생기부 점검해줘', 'check'], ['학생부 기재 점검', 'check'], ['쓰면 안 되는 말 있는지 봐줘', 'check'], ['평어 너무 비슷해', 'cand:pyeongeo'],
  // 관찰 메모
  ['3번 오늘 친구 도와줌', 'memo'], ['5번 발표 때 근거 들어 말함', 'memo'], ['3번 메모 보여줘', 'memoView'], ['행특 쓰는 중인데 3번 오늘 친구 도와줌', 'hk'],
  // 학급
  ['다음주 주안 만들어줘', 'weekly'], ['주간학습안내 써줘', 'weekly'], ['오늘 수업 뭐야', 'data:timetable'], ['내일 시간표', 'data:timetable'],
  ['진도표 넣을래', 'progress'], ['시수 계산해줘', 'progress'], ['수학 진도 어디까지 나갔지', 'data:progress'],
  // 기초학력
  ['기초학력 출석 체크', 'camp'], ['캠프 출석 체크', 'camp'], ['기초학력 출석률 알려줘', 'data:attendance'], ['출결', 'cand:camp'],
  // 오늘 할 일
  ['오늘 뭐 해야 돼', 'briefing'], ['오늘 할 일', 'briefing'], ['급한 거 뭐 있어?', 'briefing'], ['이번 주 공문 마감 뭐 남았어?', 'data:gongmun'],
  // 문서·소통 그 밖
  ['인계서', 'handover'], ['업무 인수인계서 만들어줘', 'handover'], ['다면평가 점수', 'multi'], ['자기실적평가서 써줘', 'multi'], ['번역', 'translate'], ['둘러보기', 'tour'],
  // 설정·AI
  ['AI 키 넣을래', 'aikey'], ['키 어디서 넣어', 'ask'], ['AI로 뭐 보냈어?', 'aiLog'], ['보낸 글 보여줘', 'aiLog'], ['AI 키 없이 써도 돼?', 'ask'],
  // 앱 자료로 답
  ['우리 반 단원평가 평균 몇 점이야', 'data:unit'], ['3번 학생 수학 점수 어때?', 'data:student'], ['12번 성적 알려줘', 'data:student'], ['도달 못한 학생 누구야', 'data:gap'],
  ['진도 늦은 과목 있어?', 'data:progress'], ['금요일 3교시 뭐야?', 'data:timetable'], ['기한 남은 공문 있어?', 'data:gongmun'], ['국어 단원평가 결과 어땠어?', 'data:unit'],
  // 지금 화면
  ['이 화면에서 뭐 해야 돼?', 'screen'], ['여기서 뭐 하는 거야', 'screen'], ['다음에 뭐 해?', 'screen'], ['뭐부터 해야 돼?', 'screen'], ['이거 어떻게 해?', 'screen'],
  // 하는 법을 묻는 글
  ['단원평가 결과지 어떻게 뽑아?', 'ask'], ['서술형 채점 기준 어떻게 정해?', 'ask'], ['나이스에 어떻게 넣어', 'ask'], ['행특 쓸 때 주의할 점이 뭐야?', 'ask'],
  ['에듀파인 붙여넣기 어떻게 해', 'ask'], ['사후 점수 어떻게 넣어', 'ask'], ['틀린 문제 많은 애들 뭐 해주지', 'ask'], ['쌤비서 뭐 할 수 있어?', 'ask']
];

/* 채팅(chat.js send)과 같은 차례로 나눔 */
export function classify(text) {
  if (screenQuestion(text)) return 'screen';
  const dq = dataQuestion(text, { today: '2026-11-11' });
  if (dq) return 'data:' + dq.kind;
  const r = routeText(text);
  if (isSure(r)) return r.intent;
  if (r.question) return 'ask';
  return r.candidates.length ? 'cand:' + r.candidates.join(',') : 'none';
}
const hit = (got, want) => got === want || (want.startsWith('cand:') && got.startsWith('cand:') && got.slice(5).split(',').includes(want.slice(5)));

test('선생님 말투 100문장: 95% 이상 알아들음', () => {
  assert.equal(PHRASES.length, 100);
  const miss = PHRASES.map(([t, want]) => [t, want, classify(t)]).filter(([, want, got]) => !hit(got, want));
  const rate = Math.round((100 - miss.length));
  console.log(`# 알아들은 비율 ${rate}% (${100 - miss.length}/100)`);
  for (const [t, want, got] of miss) console.log(`#   ✗ 「${t}」 기대 ${want} · 지금 ${got}`);
  assert.ok(rate >= 95, `알아들은 비율 ${rate}%`);
});
