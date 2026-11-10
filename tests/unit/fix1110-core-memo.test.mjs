// 2026-11-10 공통 영역 버그 찾기(core) — 행특 메모의 이름: 관찰 메모가 「한결같이」를 이름으로 가리던 것(core/chat-names.js),
// 메모 한꺼번에 넣기의 띄어 쓴 이름 칸(「1 김민수 발표 잘함」)이 메모에 저장되고 AI로 가던 것(core/bundle.js memoRows·memoForAI)
// 글은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { maskMemo } from '../../web/core/chat-route.js';
import { memoRows, memoForAI } from '../../web/core/bundle.js';

test('[core-memo-hangyeol] 관찰 메모의 「한결같이·한결같은」은 이름이 아님(그대로), 이름 + 조사는 그대로 가림', () => {
  for (const s of ['한결같이 성실함', '한결같이 친구를 도움', '처음과 한결같은 태도로 청소함'])
    assert.equal(maskMemo(s).text, s, s);
  assert.equal(maskMemo('박찬울이 발표함').text, '○○○이 발표함');
  assert.equal(maskMemo('김다빈이 토론에서 반론함').text, '○○○이 토론에서 반론함');
});

test('[core-hk-bulk-space] 행특 메모 한꺼번에 넣기: 「1 김민수 발표 잘함」처럼 띄어 쓴 이름 칸도 빼고 넣음(저장·AI로 가지 않음)', () => {
  const r = memoRows('1 김민수 발표 잘함\n2 이서연 청소를 열심히 함\n3 박지훈 독서를 즐김');
  assert.deepEqual(r.rows, [{ no: 1, memo: '발표 잘함' }, { no: 2, memo: '청소를 열심히 함' }, { no: 3, memo: '독서를 즐김' }]);
  assert.equal(r.names, 3);
  // 번호 없이 이름 + 메모, 이름만 있는 줄은 빈 메모
  const u = memoRows('김민수 발표 잘함\n이서연 청소 열심\n최윤슬 독서');
  assert.deepEqual(u.rows.map(x => x.memo), ['발표 잘함', '청소 열심', '독서']);
  assert.equal(u.names, 3);
  assert.deepEqual(memoRows('1 김민수 발표 잘함\n2 이서연\n3 박지훈 독서').rows, [{ no: 1, memo: '발표 잘함' }, { no: 2, memo: '' }, { no: 3, memo: '독서' }]);
  // 이름이 아닌 첫 낱말(부사·낱말)은 그대로
  const keep = memoRows('1 조용히 앉아 있음\n2 성실히 참여함\n3 박물관 견학 소감을 씀\n4 정확히 계산함');
  assert.deepEqual(keep.rows.map(x => x.memo), ['조용히 앉아 있음', '성실히 참여함', '박물관 견학 소감을 씀', '정확히 계산함']);
  assert.equal(keep.names, 0);
  // 몇 줄만 이름처럼 보이면(대부분 메모) 빼지 않음
  const few = memoRows('1 김민수가 도와줌\n2 성실함\n3 차분함\n4 발표 자신감');
  assert.deepEqual(few.rows.map(x => x.memo), ['김민수가 도와줌', '성실함', '차분함', '발표 자신감']);
  // 원래 규칙(탭 칸)은 그대로
  assert.deepEqual(memoRows('1\t김민수\t성실함\n2\t이서연\t차분함').rows, [{ no: 1, memo: '성실함' }, { no: 2, memo: '차분함' }]);
  assert.deepEqual(memoRows('1 성실함\n\n2 차분함').rows, [{ no: 1, memo: '성실함' }, { no: 2, memo: '차분함' }]);
});

test('[core-hk-bulk-space] AI로 보내는 행특 메모: 앞에 띄어 쓴 이름(예전에 넣은 「김민수 발표 잘함」)도 뺌, 메모 낱말은 그대로', () => {
  assert.equal(memoForAI('김민수 발표 잘함'), '발표 잘함');
  assert.equal(memoForAI('김민수\t1인 1역 성실함, 친구를 잘 도와줌'), '1인 1역 성실함, 친구를 잘 도와줌');
  for (const s of ['성실함, 차분함, 조용함, 정리정돈 잘함', '조용히 앉아 있음', '박물관 견학 소감을 씀', '한결같이 성실함', '성실함\t꾸준함'])
    assert.equal(memoForAI(s), s, s);
});
