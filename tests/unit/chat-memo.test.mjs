// 「쌤」 채팅 한 줄 관찰 메모(스펙 2026-11-06 F): 저장 전 이름 가리기, 「[11. 6.] …」 줄, 행특 메모 끝에 덧붙이기, 번호 글
import test from 'node:test';
import assert from 'node:assert/strict';
import { maskMemo, memoLine, appendMemo, nosText } from '../../web/core/chat-route.js';

test('이름 가리기: 흔한 성 세 글자 이름(+조사), 「이름: …」, 메모 끝말·낱말은 그대로', () => {
  assert.deepEqual(maskMemo('김민수가 토론에서 근거 들어 반론 잘함'), { text: '○○○가 토론에서 근거 들어 반론 잘함', masked: 1, dropped: 0 });
  assert.equal(maskMemo('이서연과 박하늘을 잘 도와줌').text, '○○○과 ○○○을 잘 도와줌');
  assert.equal(maskMemo('토론에서 성실함 보임, 정리를 잘함').text, '토론에서 성실함 보임, 정리를 잘함');
  assert.equal(maskMemo('주도적으로 이야기를 이끎').text, '주도적으로 이야기를 이끎');
  assert.equal(maskMemo('이름: 김솔 발표 잘함').text, '이름: ○○○ 발표 잘함');
  assert.equal(maskMemo('어머니 010-1234-5678 상담').text, '', '전화번호 줄은 뺌');
});

test('날짜 줄·덧붙이기·번호 글', () => {
  assert.equal(memoLine('토론에서 근거 들어 반론 잘함', '2026-11-06'), '[11. 6.] 토론에서 근거 들어 반론 잘함');
  assert.equal(memoLine('  두 줄\n메모 ', '2026-03-02'), '[3. 2.] 두 줄 메모');
  assert.equal(appendMemo('', '[11. 6.] 발표 잘함'), '[11. 6.] 발표 잘함');
  assert.equal(appendMemo('성실함, 책임감 강함\n\n', '[11. 6.] 발표 잘함'), '성실함, 책임감 강함\n[11. 6.] 발표 잘함');
  assert.equal(appendMemo('   ', 'x'), 'x');
  assert.equal(nosText([5, 3]), '3·5번'); assert.equal(nosText([1, 2, 3, 4, 7]), '1~4·7번');
});
