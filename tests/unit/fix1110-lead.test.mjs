// 2026-11-10 검토 고침 I3 — 쪽지 첫 문장: 흔한 제목 끝(「관련 안내」「위한 안내」「따른 안내」「안내문」「공지」)과 앞 부서 꼬리표(「(교무)」「〔교무〕」)에서
// 「…관련을 …」「…관련과 관련하여 …」「…위한을 …」「…따른을 …」처럼 깨진 문장을 쓰지 않음
import test from 'node:test';
import assert from 'node:assert/strict';
import { leadTitle, leadSentence, composeMessage, normMessage } from '../../web/menus/etc/message-ai.js';

const S = (t, k, o) => leadSentence(t, k, o);

test('I3 「관련 안내」: 「관련」은 빼고 「○○과/와 관련하여」로 한 번만(회의도)', () => {
  assert.equal(leadTitle('학년말 성적 처리 관련 안내'), '학년말 성적 처리');
  assert.equal(S('학년말 성적 처리 관련 안내', 'etc'), '학년말 성적 처리와 관련하여 아래와 같이 안내드립니다.');
  assert.equal(S('학년 협의회 관련 안내', 'meeting'), '학년 협의회와 관련하여 아래와 같이 안내드립니다.');
  assert.equal(S('교육과정 편성 관련 공지', 'training'), '교육과정 편성과 관련하여 아래와 같이 안내드립니다.');
  assert.equal(S('학업성적관리규정 개정 관련하여 안내', 'submit'), '학업성적관리규정 개정과 관련하여 아래와 같이 안내드립니다.');
  assert.equal(S('방과후 학교 관련 사항 안내', 'etc'), '방과후 학교와 관련하여 아래와 같이 안내드립니다.');
  assert.equal(S('학년 협의회 관련 안내', 'meeting', { len: 'short' }), '학년 협의회와 관련하여 안내드립니다.');
  assert.equal(S('학년 협의회 관련 안내', 'meeting', { again: true }), '학년 협의회와 관련하여 다시 한번 안내드립니다.');
  for (const t of ['학년말 성적 처리 관련 안내', '학년 협의회 관련 안내']) for (const k of ['etc', 'meeting', 'training', 'event', 'submit']) {
    const s = S(t, k);
    assert.ok(!/관련을|관련를|관련과|관련와|관련에 대하여/.test(s) && (s.match(/관련/g) || []).length === 1, `${t}/${k}: ${s}`);
  }
});

test('I3 「위한·따른·향한·통한 안내」처럼 꾸미는 말로 끝나면 「안내 사항을 … 알려 드립니다」', () => {
  assert.equal(S('신규 교사를 위한 안내', 'training'), '신규 교사를 위한 안내 사항을 아래와 같이 알려 드립니다.');
  assert.equal(S('학업성적관리규정 개정에 따른 안내', 'etc'), '학업성적관리규정 개정에 따른 안내 사항을 아래와 같이 알려 드립니다.');
  assert.equal(S('행복한 학교를 향한 공지', 'event'), '행복한 학교를 향한 안내 사항을 아래와 같이 알려 드립니다.');
  assert.equal(S('원격 수업을 통한 안내', 'etc'), '원격 수업을 통한 안내 사항을 아래와 같이 알려 드립니다.');
  assert.equal(S('학기 초 학급 운영에 관한 안내문', 'etc'), '학기 초 학급 운영을 아래와 같이 안내드립니다.', '「에 관한 안내」는 예전처럼 빼고 이름말로');
  assert.equal(S('겨울방학을 앞둔 안내', 'etc'), '겨울방학을 앞둔 안내 사항을 아래와 같이 알려 드립니다.');
  assert.equal(S('새로 바뀌는 안내', 'etc'), '새로 바뀌는 안내 사항을 아래와 같이 알려 드립니다.');
  assert.equal(S('신규 교사를 위한 안내(1차)', 'training'), '신규 교사를 위한 안내 사항(1차)을 아래와 같이 알려 드립니다.');
  assert.equal(S('신규 교사를 위한 안내', 'training', { len: 'short' }), '신규 교사를 위한 안내 사항을 알려 드립니다.');
  assert.equal(S('신규 교사를 위한 안내', 'meeting', { again: true }), '신규 교사를 위한 안내 사항을 다시 한번 알려 드립니다.');
  for (const t of ['신규 교사를 위한 안내', '학업성적관리규정 개정에 따른 안내']) for (const k of ['etc', 'meeting', 'training', 'submit'])
    assert.ok(!/(?:위한|따른)(?:을|를|과|와|에 대하여)/.test(S(t, k)), `${t}/${k}: ${S(t, k)}`);
  // 이름말로 끝나면 그대로(「~를 위한 연수를」)
  assert.equal(S('신규 교사를 위한 연수 안내', 'training'), '신규 교사를 위한 연수를 아래와 같이 안내드립니다.');
  assert.equal(S('학부모 상담 주간 안내', 'etc'), '학부모 상담 주간을 아래와 같이 안내드립니다.');
  assert.equal(S('제출 기한 안내', 'submit'), '제출 기한에 대하여 아래와 같이 안내드립니다.');
});

test('I3 끝 「안내문·공지·공고·알림」, 앞 부서 꼬리표 「(교무)」「〔교무〕」「<교무>」「[공지]」는 뺌', () => {
  assert.equal(leadTitle('현장체험학습 안내문'), '현장체험학습');
  assert.equal(leadTitle('교직원 회의 공지'), '교직원 회의');
  assert.equal(leadTitle('도서관 이용 시간 공고'), '도서관 이용 시간');
  assert.equal(leadTitle('교내 행사 알림'), '교내 행사');
  assert.equal(leadTitle('교직원 연수 공지사항'), '교직원 연수');
  assert.equal(leadTitle('(교무) 교직원 연수 안내'), '교직원 연수');
  assert.equal(leadTitle('〔교무〕 학년말 성적 처리 관련 안내'), '학년말 성적 처리');
  assert.equal(leadTitle('<교무> 교직원 연수'), '교직원 연수');
  assert.equal(leadTitle('〈연구부〉 수업 공개 안내'), '수업 공개');
  assert.equal(leadTitle('[공지] (교무) 교직원 회의'), '교직원 회의');
  assert.equal(leadTitle('（교무）교직원 연수 안내'), '교직원 연수');
  assert.equal(S('(교무) 교직원 연수 안내문', 'training'), '교직원 연수를 아래와 같이 안내드립니다.');
  // 꼬리표뿐이거나 따옴표 제목은 그대로
  assert.equal(leadTitle('(공개 수업)'), '(공개 수업)');
  assert.equal(leadTitle('「AI와 함께」 연수 안내'), '「AI와 함께」 연수');
  assert.equal(leadTitle('공지'), '');
  assert.equal(S('안내문', 'etc'), '아래와 같이 안내드립니다.');
});

test('I3 쪽지 글: 인사 뒤 첫 문장(제목 줄은 그대로)', () => {
  const at = (kind, title) => composeMessage(normMessage({ kind, title, when: [{ date: '2026-11-12', time: '15:00' }], place: '회의실' }, { year: 2026 }), { thisYear: 2026 });
  const m = at('meeting', '(교무) 학년 협의회 관련 안내');
  assert.equal(m.body.split('\n')[2], '안녕하세요 선생님. 학년 협의회와 관련하여 아래와 같이 안내드립니다.');
  assert.equal(at('training', '신규 교사를 위한 안내').body.split('\n')[2], '안녕하세요 선생님. 신규 교사를 위한 안내 사항을 아래와 같이 알려 드립니다.');
  assert.equal(at('etc', '학년말 성적 처리 관련 안내').body.split('\n')[2], '안녕하세요 선생님. 학년말 성적 처리와 관련하여 아래와 같이 안내드립니다.');
});
