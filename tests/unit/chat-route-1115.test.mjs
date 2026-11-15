// 2026-11-15 검토 고침 — 「쌤」 채팅의 회의록·문서 다듬기 말: 다른 탭을 분명히 말한 글(결과 보고서·가정통신문·쪽지·공문 처리)은 그 탭(이 기능 전과 같게),
// 여러 줄 글은 첫 줄(명령)로, 짧은 회의록 말(「3학년 협의회 회의록 보여 줘」)은 회의록 탭만 엶(메모로 넣어 AI를 부르지 않음). 이름은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
const { routeText, payloadFor, handoffText } = await import('../../web/core/chat-route.js');
const route = s => routeText(handoffText(s));

test('[cr-other-tabs] 「협의회 결과·내용」「회의록」「문서 맞춤법」이 들어도 다른 탭을 분명히 말한 글은 그 탭', () => {
  const cases = [
    ['협의회 결과 보고서 써 줘', 'report'], ['학년 협의회 결과 안내 가정통신문 써 줘', 'letter'], ['협의회 결과 안내 쪽지 써 줘', 'message'],
    ['학부모 협의회 내용 안내장 만들어 줘', 'letter'], ['협의회 결과 선생님들께 안내해 줘', 'message'], ['협의회 내용 쪽지로 보내 줘', 'message'],
    ['협의회 결과 공문 처리', 'gongmun'], ['운영위원회 회의 결과 정리해서 가정통신문 써 줘', 'letter'], ['교과 협의회 결과 보고서', 'report'],
    ['가정통신문 써 줘\n학년 협의회 결과 현장체험학습을 과학관으로 가기로 했습니다. 11월 20일', 'letter'],
    ['결과 보고서 써 줘\n교과 협의회 결과에 따라 수업 나눔 3회 운영', 'report'],
    ['쪽지 써 줘\n학교운영위원회 회의록 열람 안내: 행정실에서 11/20까지', 'message'],
    ['가정통신문 써 줘\n방과후학교 신청 안내\n신청서(한글 파일)를 내려받아 고쳐서 11월 20일까지 제출해 주세요', 'letter'],
    ['쪽지 써 줘\n각 학년 계획 문서 맞춤법 확인 후 11/20까지 제출 바랍니다', 'message'],
    ['공문 처리해 줘\n제출 문서는 맞춤법을 확인하여 보내 주시기 바랍니다', 'gongmun'],
    ['공문 처리해 줘\n제5차 학교운영위원회 회의록 제출 요청, 기한 11월 25일', 'gongmun'],
    ['결과 보고서 써 줘\n학생 문집 문서 맞춤법 교정 활동 운영', 'report']];
  for (const [s, want] of cases) { const r = route(s); assert.equal(r.intent, want, `${JSON.stringify(s)} → ${r.intent} ${r.candidates}`); }
});

test('[cr-minutes-head] 「회의록 정리해 줘」+메모: 메모에 행사 계획·가정통신문·쪽지로·문서 맞춤법이 들어도 회의록(애매하지 않음), 문서 다듬기는 그대로', () => {
  const memo = ['회의록 정리해 줘', '5학년 협의회 11/12', '1. 운동회 행사 계획 검토 - 11월 말까지 확정', '2. 학부모 상담 안내 가정통신문은 이바다 선생님이 11/20까지',
    '3. 쪽지로 각 반에 안내하기', '4. 학년 문서 맞춤법 확인해서 다시 내기', '5. 체험학습 결과 보고서 다음 주까지', '6. 교육청 공문 처리 기한 확인함'].join('\n');
  const r = route(memo);
  assert.equal(r.intent, 'minutes', JSON.stringify(r));
  assert.ok(r.payload.text.startsWith('5학년 협의회') && r.payload.text.includes('4. 학년 문서 맞춤법'), r.payload.text);
  for (const s of ['회의록 정리해 줘\n- 학년 문서 맞춤법 확인해서 다시 내기', '협의회 결과 정리해 줘\n- 체험학습 장소 과학관으로 정함\n- 버스 예약 11/20까지 쪽지로 안내'])
    assert.equal(route(s).intent, 'minutes', s);
  for (const s of ['한글 파일 맞춤법 고쳐 줘', '문서 다듬어 줘', '이 문서 공문체로 다듬어 줘', '문서 다듬기']) assert.equal(route(s).intent, 'docedit', s);
  assert.equal(route('문서 다듬어 줘\n공문체로 바꾸고 쪽지로 보낼 수 있게 짧게').intent, 'docedit');
});

test('[cr-minutes-short] 짧은 회의록 말은 회의록 탭만 엶(넘길 메모 없음), 줄을 바꿔 쓴 메모·긴 메모는 넘김', () => {
  for (const s of ['3학년 협의회 회의록 보여 줘', '지난주 학년 회의록 열어 줘', '회의 내용 정리해 줘', '협의회 결과 정리해 줘', '어제 회의록 다시 정리해 줘',
    '교과 협의회 회의록 써 줘', '학교운영위원회 회의록', '회의록 정리해 줘 지난주 학년 회의']) {
    const r = route(s);
    assert.equal(r.intent, 'minutes', `${s} → ${r.intent} ${r.candidates}`);
    assert.equal(r.payload.text, '', `${s} → ${JSON.stringify(r.payload)}`);
  }
  assert.equal(payloadFor('minutes', '회의록 정리해 줘\n과학관으로 정함').text, '과학관으로 정함');
  const long = '회의록 정리해 줘: 체험학습 장소는 과학관으로 정하고 버스 예약은 11월 20일까지 하기로 함';
  assert.equal(route(long).intent, 'minutes');
  assert.equal(payloadFor('minutes', long).text, '체험학습 장소는 과학관으로 정하고 버스 예약은 11월 20일까지 하기로 함');
});
