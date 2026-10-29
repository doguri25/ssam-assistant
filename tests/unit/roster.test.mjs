// 학급 명단 엑셀·CSV: 번호만 가져옴(학생 수·예외 번호), 이름은 결과에 남지 않음
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readCsv } from '../../web/core/sheet.js';
import { parseRoster } from '../../web/core/roster.js';

const rows = readCsv(readFileSync(new URL('../fixtures/roster-sample.csv', import.meta.url), 'utf8'));

test('명렬표: 위 제목 줄·띄어 쓴 「번 호」·빈 줄·비고의 전출', () => {
  const r = parseRoster(rows);
  assert.deepEqual({ count: r.count, except: r.except }, { count: 25, except: [7, 20] });
  assert.equal(r.nos.length, 24);
  for (const name of ['김하나', '양아름', '홍라희']) assert.ok(!JSON.stringify(r).includes(name), name);
});

test('머리가 2행, 번호가 셋째 칸, 학적 칸 없음', () => {
  const r = parseRoster([['명렬표'], ['성명', '성별', '번호'], ['가', '남', '1'], ['나', '여', '2'], ['다', '남', '4']]);
  assert.deepEqual({ count: r.count, except: r.except }, { count: 4, except: [3] });
});

test('상태 칸의 자퇴·유예, 61번 이상과 글은 무시', () => {
  const r = parseRoster([['번호', '이름', '상태'], ['1', 'a', ''], ['2', 'b', '취학유예'], ['3', 'c', '자퇴'], ['61', 'd', ''], ['합계', '', '']]);
  assert.deepEqual({ count: r.count, except: r.except }, { count: 3, except: [2, 3] });
});

test('번호 머리가 없거나 번호가 없으면 null', () => {
  assert.equal(parseRoster([['이름', '성별'], ['가', '남']]), null);
  assert.equal(parseRoster([['번호', '이름'], ['', '가']]), null);
  assert.equal(parseRoster(null), null);
});

test('검토 고침: 상태 칸이 여럿이면 모두 봄(비고의 전출)', () => {
  const r = parseRoster([['번호', '성명', '학적상태', '비고'], ['1', '가', '', ''], ['2', '나', '', '전출'], ['3', '다', '재학', '']]);
  assert.deepEqual(r.except, [2]);
});
