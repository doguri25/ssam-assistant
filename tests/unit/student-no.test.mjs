// 적힌 번호로 학생 맞추기: AI가 읽은 번호 정리, 노란 줄(못 읽음·겹침·명단 밖), 번호 차례, 명단 번호
import test from 'node:test';
import assert from 'node:assert/strict';
import { noPrompt, normNos, noProblems, byNoOrder, allowedNos, NO_ROWS } from '../../web/core/student-no.js';

test('프롬프트: [번호 읽기]로 시작하고 차례 딱지 수와 출력 꼴을 알려 줌, 이름은 읽지 않음', () => {
  const p = noPrompt(23);
  assert.ok(p.startsWith('[번호 읽기]'));
  assert.match(p, /1\)부터 23\)까지/);
  assert.match(p, /"nos"/);
  assert.match(p, /이름/);
  assert.equal(NO_ROWS, 20);
});

test('읽은 번호 정리: 딱지 차례대로, 「12번」·문자열도 숫자로, 1~99 밖·빈 것·없는 딱지는 못 읽음(null)', () => {
  const v = { nos: [{ i: 2, no: '12번', sure: true }, { i: 1, no: 3 }, { i: 3, no: 0 }, { i: 4, no: null, sure: false }, { i: 9, no: 5 }] };
  assert.deepEqual(normNos(v, 5), [{ no: 3, sure: true }, { no: 12, sure: true }, { no: null, sure: false }, { no: null, sure: false }, { no: null, sure: false }]);
  assert.deepEqual(normNos([{ i: 1, no: 7, sure: false }], 1), [{ no: 7, sure: false }]);
  assert.deepEqual(normNos(null, 2), [{ no: null, sure: false }, { no: null, sure: false }]);
});

test('노란 줄: 못 읽음, 같은 번호는 둘 다, 명단에 없는 번호(예외 번호 포함)', () => {
  assert.deepEqual(noProblems([3, 1, 2], new Set([1, 2, 3])), ['', '', '']);
  assert.deepEqual(noProblems([3, null, 3, 9], new Set([1, 2, 3, 4])), ['dup', 'unread', 'dup', 'outside']);
  assert.deepEqual(noProblems([30, 31], null), ['', '']);
});

test('번호 차례: 작은 번호부터, 같으면 스캔 차례, 못 읽은 것은 끝', () => {
  assert.deepEqual(byNoOrder([3, 1, null, 2, 1]), [1, 4, 3, 0, 2]);
});

test('명단 번호: 학생 수에서 예외 번호를 뺌, 학생 수를 모르면 null(명단 점검 안 함)', () => {
  assert.deepEqual([...allowedNos(5, [2, 4])], [1, 3, 5]);
  assert.equal(allowedNos(0, []), null);
  assert.equal(allowedNos(undefined), null);
});
