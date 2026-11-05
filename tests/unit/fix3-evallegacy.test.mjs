// 평가 옛 화면(평가지 채점·행특) 3차 고침 (11월 5일): 정답 글의 「~ 이름: 답」은 그대로, 행특 메모 한꺼번에 넣기의 빈 메모 칸
// 글은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { maskNameFields, memoRows, memoForAI } from '../../web/core/bundle.js';

test('[gr-maskkey-1] 정답 글의 「문화재 이름: 경복궁」「산 이름: 한라산」처럼 앞말이 붙은 이름은 정답 낱말이라 그대로', () => {
  const keys = [
    '1. 문화유산 이름: 석굴암\n2. 산 이름: 한라산\n3. 마을 이름: 하회마을',
    '3. 문화재 이름: 경복궁', '| 문화재 이름 | 석가탑 |', '문화유산 이름 | 석굴암', '문화재이름: 경복궁',
    '산 이름: 백두산', '강 이름: 한강', '궁궐 이름: 경복궁', '채소 이름: 고구마', '음식 이름: 송편', '악기 이름: 장구',
    '고장 이름: 안동', '별자리 이름: 백조자리', '탑의 이름: 석가탑', '도형의 이름: 정사각형', '인물 이름: 세종대왕', '모둠 이름: 하늘반'
  ];
  for (const k of keys) assert.equal(maskNameFields(k), k, k);
});

test('[gr-maskkey-1] 사람 이름 칸(앞말 없음·학생·번호·학년·반 뒤·「N번 이름 ○○」)은 그대로 가림', () => {
  const pairs = [
    ['이름: 김민수', '이름: ○○○'],
    ['학생 이름: 김민수', '학생 이름: ○○○'],
    ['학생이름: 김민수', '학생이름: ○○○'],
    ['학생의 이름: 이서연', '학생의 이름: ○○○'],
    ['3학년 2반 5번 학생 이름: 김민수', '3학년 2반 5번 학생 이름: ○○○'],
    ['( 2 )반 ( 5 )번 이름: 김민수', '( 2 )반 ( 5 )번 이름: ○○○'],
    ['5번, 이름: 김민수', '5번, 이름: ○○○'],
    ['번호 5 이름 김민수', '번호 5 이름 ○○○'],
    ['보호자 성명: 김철수', '보호자 성명: ○○○'],
    ['짝 이름: 이서연', '짝 이름: ○○○'],
    ['이름(김민수)', '이름(○○○)'],
    ['이 름: 최하은', '이 름: ○○○'],
    ['사회 수행평가 정답\n3학년 2반 5번 이름: 김민수\n1. 문화유산 이름: 석굴암\n2. 산 이름: 한라산', '사회 수행평가 정답\n3학년 2반 5번 이름: ○○○\n1. 문화유산 이름: 석굴암\n2. 산 이름: 한라산']
  ];
  for (const [a, b] of pairs) assert.equal(maskNameFields(a), b, a);
  // AI로 보내는 행특 메모도 같은 규칙
  assert.equal(memoForAI('짝 이름: 이서연, 사이좋게 지냄'), '짝 이름: ○○○, 사이좋게 지냄');
});

test('[hk-bulk-blank-2] 엑셀 번호·메모 칸에서 메모 칸이 빈 줄(「4⇥」)은 번호 숫자를 메모로 넣지 않고 빈 메모로', () => {
  const r = memoRows('1\t성실함\r\n2\t친구를 잘 도와줌\r\n3\t독서를 즐김\r\n4\t\r\n5\t발표에 자신감\r\n');
  assert.deepEqual(r.rows, [{ no: 1, memo: '성실함' }, { no: 2, memo: '친구를 잘 도와줌' }, { no: 3, memo: '독서를 즐김' }, { no: 4, memo: '' }, { no: 5, memo: '발표에 자신감' }]);
  assert.equal(r.names, 0);
  assert.deepEqual(memoRows('4번\n5. 차분함').rows, [{ no: 4, memo: '' }, { no: 5, memo: '차분함' }]);
  // 번호·이름·메모 세 칸에서 메모 칸만 빈 줄
  const three = memoRows('1\t김민수\t성실함\n2\t이서연\t\n3\t박지훈\t독서를 즐김');
  assert.deepEqual(three.rows, [{ no: 1, memo: '성실함' }, { no: 2, memo: '' }, { no: 3, memo: '독서를 즐김' }]);
  assert.equal(three.names, 3);
  // 번호가 있는 붙여넣기의 빈 줄은 자리가 아님
  assert.deepEqual(memoRows('1 성실함\n\n2 차분함').rows, [{ no: 1, memo: '성실함' }, { no: 2, memo: '차분함' }]);
});

test('[hk-bulk-blank-2] 번호 없이 메모 한 칸만 붙이면 빈 줄도 한 학생 자리(뒤 학생이 당겨지지 않음), 끝의 빈 줄은 버림', () => {
  assert.deepEqual(memoRows('성실함\n도와줌\n\n독서').rows, [{ no: null, memo: '성실함' }, { no: null, memo: '도와줌' }, { no: null, memo: '' }, { no: null, memo: '독서' }]);
  assert.deepEqual(memoRows('성실함\r\n\r\n독서\r\n\r\n').rows, [{ no: null, memo: '성실함' }, { no: null, memo: '' }, { no: null, memo: '독서' }]);
  // 이름·메모 두 칸에서 메모 칸이 빈 학생도 자리를 지킴
  const r = memoRows('김민수\t성실함\n이서연\t\n박지훈\t독서를 즐김');
  assert.deepEqual(r.rows, [{ no: null, memo: '성실함' }, { no: null, memo: '' }, { no: null, memo: '독서를 즐김' }]);
  assert.equal(r.names, 3);
  // 머리 줄은 자리가 아님
  assert.deepEqual(memoRows('이름\t메모\n김민수\t성실함\n이서연\t차분함').rows, [{ no: null, memo: '성실함' }, { no: null, memo: '차분함' }]);
});

test('[gr-maskkey-1] 양식 머리의 이름 칸(「월 일 이름」「과목: 국어 이름:」「당번 이름」)은 앞말이 있어도 가림', () => {
  const pairs = [
    ['11월 5일 이름: 김민수', '11월 5일 이름: ○○○'],
    ['( )월 ( )일 ( )요일 이름: 김민수', '( )월 ( )일 ( )요일 이름: ○○○'],
    ['과목: 국어 이름: 김민수', '과목: 국어 이름: ○○○'],
    ['단원: 곱셈 이름 김민수', '단원: 곱셈 이름 ○○○'],
    ['우유 당번 이름: 이서연', '우유 당번 이름: ○○○'],
    ['한글 이름: 김민수', '한글 이름: ○○○']
  ];
  for (const [a, b] of pairs) assert.equal(maskNameFields(a), b, a);
  // 번호 뒤 정답(「1)산 이름」「2번 산 이름」)은 그대로
  for (const k of ['1)산 이름: 한라산', '2번 산 이름: 한라산', '1.문화재 이름: 경복궁']) assert.equal(maskNameFields(k), k, k);
});
