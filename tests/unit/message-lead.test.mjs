// 쪽지 첫 문장(선생님 요청 2026-11-10): 「안녕하세요 선생님.」 뒤 첫 문장에 제목을 넣음 — 종류(연수·회의·행사·제출·그 밖)마다 말투,
// 조사(을/를·과/와)는 마지막 한글 글자의 받침으로(끝 괄호는 빼고, 숫자는 읽는 소리, 영어는 읽는 소리 짐작), 짧게·다시 안내, 제목이 없으면 예전 말
import test from 'node:test';
import assert from 'node:assert/strict';
import { batchim, josa, leadTitle, leadSentence, composeMessage, normMessage } from '../../web/menus/etc/message-ai.js';

test('받침: 한글 끝 글자, 끝 괄호·따옴표·문장 부호는 빼고 봄', () => {
  for (const [w, b] of [['연수', false], ['협의회', false], ['행사', false], ['회의', false], ['모임', true], ['운영', true], ['제출', true], ['신청', true],
    ['교원 연수(1차)', false], ['교원 연수 (온라인)', false], ['교원 연수 [필수]', false], ['교원 연수(1차)(온라인)', false], ['학년 협의회(11월)', false],
    ['「AI와 함께」', false], ['“행복 교실”', true], ["'함께 크는 교실'", true], ['《어린 왕자》', false], ['연수!', false], ['연수…', false], ['(공개 수업)', true]]) {
    assert.equal(batchim(w), b, w);
  }
});

test('받침: 숫자는 읽는 소리(일·삼·육·칠·팔·영·십·백·천·만·억은 받침, 이·사·오·구·조는 없음)', () => {
  for (const [w, b] of [['연수 1', true], ['연수 2', false], ['3', true], ['4', false], ['5', false], ['6', true], ['7', true], ['8', true], ['9', false], ['0', true],
    ['2026', true], ['2025', false], ['10', true], ['20', true], ['100', true], ['1000', true], ['1,000', true], ['10000', true], ['1000000', true], ['100000000', true],
    ['1000000000000', false], ['2.0', true], ['1.5', false], ['ver 3.1', true], ['Ⅱ', false], ['Ⅲ', true], ['②', false], ['⑥', true]]) {
    assert.equal(batchim(w), b, w);
  }
});

test('받침: 영어는 읽는 소리 짐작 — 대문자 줄임말은 한 글자씩(엘·엠·엔·알만 받침), 낱말은 끝 글자로', () => {
  for (const [w, b] of [['AI', false], ['SW', false], ['ICT', false], ['IT', false], ['PBL', true], ['VR', true], ['AR', true], ['STEM', true], ['STEAM', true], ['ZOOM', true],
    ['NEIS', false], ['ChatGPT', false], ['Zoom', true], ['Google', true], ['Google Classroom', true], ['Padlet', true], ['Canva', false], ['Python', true], ['Excel', true],
    ['Workshop', true], ['camp', false], ['Meeting', true], ['coding', true], ['Notion', true], ['Teams', false], ['YouTube', false], ['PowerPoint', false], ['Day', false],
    ['Festival', true], ['Book', true], ['Lab', true], ['Club', true], ['game', true], ['online', true], ['code', false], ['music', true], ['check', false], ['week', false],
    ['iPad', false], ['GitHub', false], ['test', false], ['layout', true]]) {
    assert.equal(batchim(w), b, w);
  }
});

test('받침: 모르는 끝 글자(한자·빈 글)는 null, 조사는 그때 null', () => {
  assert.equal(batchim('漢字'), null);
  assert.equal(batchim(''), null);
  assert.equal(batchim('   '), null);
  assert.equal(josa('漢字', '을', '를'), null);
  assert.equal(josa('연수', '을', '를'), '를');
  assert.equal(josa('모임', '과', '와'), '과');
  assert.equal(josa('2026', '을', '를'), '을');
});

test('첫 문장 제목: 앞 꼬리표·끝 「안내」「알림」「에 대한 안내」「(안내)」는 뺌', () => {
  assert.equal(leadTitle('2026 AI 활용 수업 연수 안내'), '2026 AI 활용 수업 연수');
  assert.equal(leadTitle('2026 AI 활용 수업 연수안내'), '2026 AI 활용 수업 연수');
  assert.equal(leadTitle('겨울방학 중 학교 시설 이용에 대한 안내'), '겨울방학 중 학교 시설 이용');
  assert.equal(leadTitle('학부모 공개 수업 알림'), '학부모 공개 수업');
  assert.equal(leadTitle('교직원 연수(안내)'), '교직원 연수');
  assert.equal(leadTitle('교직원 연수 안내(1차)'), '교직원 연수(1차)');
  assert.equal(leadTitle('[교무] 교직원 연수'), '교직원 연수');
  assert.equal(leadTitle('연수 안내!'), '연수');
  assert.equal(leadTitle('안내'), '');
  assert.equal(leadTitle(''), '');
});

test('첫 문장(기본·자세히): 연수·행사·그 밖은 「○○을/를 아래와 같이 안내드립니다.」', () => {
  const S = (t, k, o) => leadSentence(t, k, o);
  assert.equal(S('2026 AI 활용 수업 역량 강화 연수', 'training'), '2026 AI 활용 수업 역량 강화 연수를 아래와 같이 안내드립니다.');
  assert.equal(S('2026 AI 활용 수업 연수 안내', 'training'), '2026 AI 활용 수업 연수를 아래와 같이 안내드립니다.');
  assert.equal(S('2026 과학의 날 행사', 'event'), '2026 과학의 날 행사를 아래와 같이 안내드립니다.');
  assert.equal(S('가을 운동회', 'event'), '가을 운동회를 아래와 같이 안내드립니다.');
  assert.equal(S('겨울방학 방과후 운영', 'etc'), '겨울방학 방과후 운영을 아래와 같이 안내드립니다.');
  assert.equal(S('교원 역량 강화 연수 2026', 'training'), '교원 역량 강화 연수 2026을 아래와 같이 안내드립니다.');
  assert.equal(S('생성형 AI', 'training'), '생성형 AI를 아래와 같이 안내드립니다.');
  assert.equal(S('PBL', 'training'), 'PBL을 아래와 같이 안내드립니다.');
  assert.equal(S('교직원 연수(1차)', 'training', { len: 'long' }), '교직원 연수(1차)를 아래와 같이 안내드립니다.');
  assert.equal(S('겨울방학 중 학교 시설 이용에 대한 안내', 'etc'), '겨울방학 중 학교 시설 이용을 아래와 같이 안내드립니다.');
});

test('첫 문장: 회의는 「○○과/와 관련하여」, 제출은 「○○에 대하여」', () => {
  const S = (t, k, o) => leadSentence(t, k, o);
  assert.equal(S('2학기 학년 협의회', 'meeting'), '2학기 학년 협의회와 관련하여 아래와 같이 안내드립니다.');
  assert.equal(S('교육과정 위원회 회의', 'meeting'), '교육과정 위원회 회의와 관련하여 아래와 같이 안내드립니다.');
  assert.equal(S('전문적 학습 공동체 모임', 'meeting'), '전문적 학습 공동체 모임과 관련하여 아래와 같이 안내드립니다.');
  assert.equal(S('학년 부장 회의(11월)', 'meeting'), '학년 부장 회의(11월)와 관련하여 아래와 같이 안내드립니다.');
  assert.equal(S('교과협의회 2', 'meeting'), '교과협의회 2와 관련하여 아래와 같이 안내드립니다.');
  assert.equal(S('PLC', 'meeting'), 'PLC와 관련하여 아래와 같이 안내드립니다.');
  assert.equal(S('Zoom 회의 링크', 'meeting'), 'Zoom 회의 링크와 관련하여 아래와 같이 안내드립니다.');
  assert.equal(S('학업성적관리규정 개정 의견 제출', 'submit'), '학업성적관리규정 개정 의견 제출에 대하여 아래와 같이 안내드립니다.');
  assert.equal(S('2학기 교육과정 평가 설문 안내', 'submit'), '2학기 교육과정 평가 설문에 대하여 아래와 같이 안내드립니다.');
});

test('첫 문장: [짧게]는 「○○를 안내드립니다.」, [다시 안내]는 「○○를 다시 한번 안내드립니다.」', () => {
  const S = (t, k, o) => leadSentence(t, k, o);
  assert.equal(S('AI 활용 수업 연수', 'training', { len: 'short' }), 'AI 활용 수업 연수를 안내드립니다.');
  assert.equal(S('2학기 학년 협의회', 'meeting', { len: 'short' }), '2학기 학년 협의회와 관련하여 안내드립니다.');
  assert.equal(S('의견 제출', 'submit', { len: 'short' }), '의견 제출에 대하여 안내드립니다.');
  assert.equal(S('AI 활용 수업 연수', 'training', { again: true }), 'AI 활용 수업 연수를 다시 한번 안내드립니다.');
  assert.equal(S('AI 활용 수업 연수', 'training', { again: true, len: 'short' }), 'AI 활용 수업 연수를 다시 한번 안내드립니다.');
  assert.equal(S('2학기 학년 협의회', 'meeting', { again: true }), '2학기 학년 협의회와 관련하여 다시 한번 안내드립니다.');
  assert.equal(S('의견 제출', 'submit', { again: true }), '의견 제출에 대하여 다시 한번 안내드립니다.');
});

test('첫 문장: 조사를 정할 수 없는 끝 글자는 「에 대하여」, 제목이 없으면 예전 말(짧게는 인사만)', () => {
  const S = (t, k, o) => leadSentence(t, k, o);
  assert.equal(S('漢字 교실 漢字', 'training'), '漢字 교실 漢字에 대하여 아래와 같이 안내드립니다.');
  assert.equal(S('', 'training'), '아래와 같이 안내드립니다.');
  assert.equal(S('안내', 'etc'), '아래와 같이 안내드립니다.');
  assert.equal(S('', 'training', { len: 'short' }), '');
  assert.equal(S('', 'training', { again: true }), '다시 한번 안내드립니다.');
  assert.equal(S('  ', 'meeting', { again: true, len: 'short' }), '다시 한번 안내드립니다.');
});

test('쪽지 글: 인사 뒤 첫 문장에 제목(짧게·기본·자세히·다시 안내 모두)', () => {
  const m = normMessage({ kind: 'meeting', title: '2학기 학년 협의회 안내', when: [{ date: '2026-11-12', time: '15:00' }], place: '회의실' }, { year: 2026 });
  const at = len => composeMessage(m, { len, thisYear: 2026 }).body.split('\n')[2];
  assert.equal(at('base'), '안녕하세요 선생님. 2학기 학년 협의회와 관련하여 아래와 같이 안내드립니다.');
  assert.equal(at('long'), '안녕하세요 선생님. 2학기 학년 협의회와 관련하여 아래와 같이 안내드립니다.');
  assert.equal(at('short'), '안녕하세요 선생님. 2학기 학년 협의회와 관련하여 안내드립니다.');
  assert.equal(composeMessage(m, { again: true, thisYear: 2026 }).body.split('\n')[2], '안녕하세요 선생님. 2학기 학년 협의회와 관련하여 다시 한번 안내드립니다.');
  // 첫 줄(제목 줄)은 그대로
  assert.equal(composeMessage(m, { thisYear: 2026 }).title, '[회의 안내] 2학기 학년 협의회 안내');
});
