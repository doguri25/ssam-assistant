// AI 답에서 JSON 꺼내기
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJSON } from '../../web/core/ai.js';

test('코드 울타리·설명이 섞여도 JSON을 꺼냄', () => {
  assert.deepEqual(parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJSON('설명입니다 {"title":"x"} 끝'), { title: 'x' });
  assert.deepEqual(parseJSON('[1,2]'), [1, 2]);
  assert.deepEqual(parseJSON('품목: [{"name":"비커"}] 입니다'), [{ name: '비커' }]);
  assert.equal(parseJSON('없음'), null);
  assert.equal(parseJSON(''), null);
  assert.equal(parseJSON(null), null);
});
