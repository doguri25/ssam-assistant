// 평가 옛 화면(평가지 채점·행특) 2차 고침 (11월 5일): 한꺼번에 넣은 정답 글은 이름 칸만 가림, 행특 메모 한꺼번에 넣기의 이름 칸 빼기
// 글은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { maskNameFields, memoRows } from '../../web/core/bundle.js';

test('[gr-bundle-strip-key-3] 정답 글의 인물 이름·도형 이름·큰 수는 그대로 둠', () => {
  const keys = [
    '6학년 사회 2단원 평가 정답\n1. 안중근\n2. 윤봉길\n3. 유관순\n4. 3000 4000 5000',
    '5학년 수학 정답\n1. 오각형\n2. 육각형\n3. 원기둥\n4. 12 cm',
    '번호 | 정답 | 배점\n1 | 안중근 | 10\n2 | 윤봉길 | 10\n3 | 유관순 | 10',
    '5학년 사회 정답\n1. 이성계\n2. 정도전\n3. 정몽주',
    '정답 1) 안중근 2) 윤봉길 3) 유관순',
    '1. 도형의 이름: 오각형\n2. 인물 이름: 세종대왕',
    '전화번호 쓰기 연습 정답: 010-1234-5678'
  ];
  for (const k of keys) assert.equal(maskNameFields(k), k, k);
});

test('[gr-bundle-strip-key-3] 이름 칸(「이름: 김민수」「5번 이름 김민수」「성명 김철수」「이름 | 김민수」)만 가림', () => {
  assert.equal(maskNameFields('곱셈 평가\n3학년 2반 5번 이름: 김민수\n1. 92'), '곱셈 평가\n3학년 2반 5번 이름: ○○○\n1. 92');
  assert.equal(maskNameFields('3학년 2반 5번 이름 김민수 1. 23 x 4 답 92'), '3학년 2반 5번 이름 ○○○ 1. 23 x 4 답 92');
  assert.equal(maskNameFields('학번: 20501 성명: 김철수'), '학번: 20501 성명: ○○○');
  assert.equal(maskNameFields('이름 | 김민수 | 번호 | 5'), '이름 | ○○○ | 번호 | 5');
  assert.equal(maskNameFields('6번 이름: 김솔'), '6번 이름: ○○○');
  assert.equal(maskNameFields('이름: 이서연의 답'), '이름: ○○○의 답');
});

test('[gr-bundle-strip-key-3] 이름 칸 같아도 사람 이름이 아니면 그대로(「이름 정답」「이름 날짜」「모둠 이름: 하늘반」「이름: 교사용」)', () => {
  for (const k of ['곱셈 평가 이름 정답 1. 92', '반 번 이름 날짜', '모둠 이름: 하늘반', '이름: 교사용', '3학년 반 번 이름', '이름 정하기 활동'])
    assert.equal(maskNameFields(k), k, k);
});

test('[hk-bulk-name-4] 엑셀 번호·이름·메모 칸을 붙여넣으면 이름 칸은 빼고 메모만, 뺀 이름 수', () => {
  const r = memoRows('1\t김민수\t1인 1역 성실함, 친구를 잘 도와줌\n2\t이서연\t독서를 즐김, 질문을 많이 함\n3\t박지훈\t성실함');
  assert.deepEqual(r.rows, [{ no: 1, memo: '1인 1역 성실함, 친구를 잘 도와줌' }, { no: 2, memo: '독서를 즐김, 질문을 많이 함' }, { no: 3, memo: '성실함' }]);
  assert.equal(r.names, 3);
  assert(!JSON.stringify(r.rows).includes('김민수'));
});

test('[hk-bulk-name-4] 머리 줄(번호·이름·메모)은 넣지 않고 그 이름 칸을 뺌, 번호 없는 줄은 차례대로', () => {
  const r = memoRows('번호\t이름\t메모\n1\t김민수\t성실함\n2\t이서연\t차분함');
  assert.deepEqual(r.rows, [{ no: 1, memo: '성실함' }, { no: 2, memo: '차분함' }]);
  const plain = memoRows('1 성실함, 1인 1역 꾸준함\n2 친구를 잘 도와줌\n3\t독서를 즐김, 질문을 많이 함\n정리정돈 잘함');
  assert.deepEqual(plain.rows, [{ no: 1, memo: '성실함, 1인 1역 꾸준함' }, { no: 2, memo: '친구를 잘 도와줌' }, { no: 3, memo: '독서를 즐김, 질문을 많이 함' }, { no: null, memo: '정리정돈 잘함' }]);
  assert.equal(plain.names, 0);
});

test('[hk-bulk-name-4] 메모만 있는 칸(「성실함」「차분함」 한 칸)은 이름으로 보지 않음, 이름 칸·번호 칸 둘 다 있을 때만 뺌', () => {
  const r = memoRows('1\t성실함\n2\t차분함\n3\t조용함');
  assert.deepEqual(r.rows.map(x => x.memo), ['성실함', '차분함', '조용함']);
  assert.equal(r.names, 0);
  // 이름 없이 메모가 두 칸(학기별)이면 둘 다 메모로
  const two = memoRows('1\t1인 1역 성실함\t2학기 발표 자신감\n2\t독서를 즐김\t질문을 많이 함');
  assert.deepEqual(two.rows.map(x => x.memo), ['1인 1역 성실함, 2학기 발표 자신감', '독서를 즐김, 질문을 많이 함']);
});

test('[hk-bulk-name-4] AI로 보내는 메모: 예전에 붙여넣은 「김민수⇥메모」의 이름 칸·「이름: 김민수」는 빼고 메모 글은 그대로', async () => {
  const { memoForAI } = await import('../../web/core/bundle.js');
  assert.equal(memoForAI('김민수\t1인 1역 성실함, 친구를 잘 도와줌'), '1인 1역 성실함, 친구를 잘 도와줌');
  assert.equal(memoForAI('성실함\t꾸준함'), '성실함\t꾸준함');
  assert.equal(memoForAI('성실함, 차분함, 조용함, 정리정돈 잘함'), '성실함, 차분함, 조용함, 정리정돈 잘함');
  assert.equal(memoForAI('이름: 김민수 / 발표에 자신감'), '이름: ○○○ / 발표에 자신감');
});

test('[기능-AI하나] 설정 › AI의 채점 줄 이름에 평가지 채점 평어도 채점 AI로 쓴다는 뜻이 담김', async () => {
  const { TASKS } = await import('../../web/core/ai-roles.js');
  assert.equal(TASKS[0][0], 'grade');
  assert.equal(TASKS[0][1], '채점(평가지 채점 평어 포함)');
});
