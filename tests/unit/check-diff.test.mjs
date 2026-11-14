// 기재 점검 고친 글 견주기(스펙 2026-11-14-eval-redesign §7): 낱말(띄어쓰기) 단위로 지운 말·더한 말을 나란히.
// 지운 말 다음에 더한 말(한 덩어리씩), 같은 말은 그대로, 앞뒤 글은 빈칸을 하나로 본 지금 글·고친 글과 같음
import test from 'node:test';
import assert from 'node:assert/strict';
import { wordDiff } from '../../web/menus/evaluate/check/check-diff.js';

const side = (ops, keep) => ops.filter(o => o.op === 'eq' || o.op === keep).map(o => o.t).join(' ');
const norm = s => String(s).trim().split(/\s+/).filter(Boolean).join(' ');

test('목업 예: 바뀐 곳만 지운 말 → 더한 말, 나머지는 그대로', () => {
  const a = '방과 후 논술 학원에서 익힌 글쓰기 방법을 활용함.';
  const b = '수업에서 배운 글쓰기 방법을 다른 글을 쓸 때도 활용함.';
  assert.deepEqual(wordDiff(a, b), [
    { op: 'del', t: '방과 후 논술 학원에서 익힌' },
    { op: 'ins', t: '수업에서 배운' },
    { op: 'eq', t: '글쓰기 방법을' },
    { op: 'ins', t: '다른 글을 쓸 때도' },
    { op: 'eq', t: '활용함.' }
  ]);
});

test('같은 글·빈 글', () => {
  assert.deepEqual(wordDiff('맡은 일을 끝까지 해냄.', '맡은 일을  끝까지\n해냄.'), [{ op: 'eq', t: '맡은 일을 끝까지 해냄.' }]);
  assert.deepEqual(wordDiff('', '새 글.'), [{ op: 'ins', t: '새 글.' }]);
  assert.deepEqual(wordDiff('지울 글.', ''), [{ op: 'del', t: '지울 글.' }]);
  assert.deepEqual(wordDiff('', ''), []);
  assert.deepEqual(wordDiff(null, undefined), []);
});

test('한 덩어리 안에서는 지운 말을 모두 앞에, 더한 말을 뒤에', () => {
  const ops = wordDiff('가 나 다 라 마', '가 바 사 아 마');
  assert.deepEqual(ops, [{ op: 'eq', t: '가' }, { op: 'del', t: '나 다 라' }, { op: 'ins', t: '바 사 아' }, { op: 'eq', t: '마' }]);
});

test('끝에서 지운 말·앞에 더한 말', () => {
  assert.deepEqual(wordDiff('수업 시간에 산만함.', '수업 시간에'), [{ op: 'eq', t: '수업 시간에' }, { op: 'del', t: '산만함.' }]);
  assert.deepEqual(wordDiff('끝까지 해냄.', '맡은 일을 끝까지 해냄.'), [{ op: 'ins', t: '맡은 일을' }, { op: 'eq', t: '끝까지 해냄.' }]);
});

test('여러 글에서: 지운 쪽 + 같은 쪽 = 지금 글, 더한 쪽 + 같은 쪽 = 고친 글, 옆 칸은 종류가 다름', () => {
  const W = '학생 친구 수업 시간 발표 계산 정확 성실 노력 모둠 역할 책임 해냄 바르게 꾸준히'.split(' ');
  let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let k = 0; k < 200; k++) {
    const a = Array.from({ length: rnd(14) }, () => W[rnd(W.length)]).join(' ');
    const b = Array.from({ length: rnd(14) }, () => W[rnd(W.length)]).join(' ');
    const ops = wordDiff(a, b);
    assert.equal(side(ops, 'del'), norm(a), `지금 글: ${a} → ${b}`);
    assert.equal(side(ops, 'ins'), norm(b), `고친 글: ${a} → ${b}`);
    for (let i = 1; i < ops.length; i++) assert.notEqual(ops[i].op, ops[i - 1].op, '옆 칸 종류');
    // 지운 말 뒤에 바로 더한 말이 와도, 더한 말 뒤에 지운 말은 오지 않음
    for (let i = 1; i < ops.length; i++) assert.ok(!(ops[i - 1].op === 'ins' && ops[i].op === 'del'), JSON.stringify(ops));
    // 같은 말은 가장 길게(LCS) 남김
    if (a === b && a) assert.deepEqual(ops, [{ op: 'eq', t: norm(a) }]);
  }
});

test('아주 긴 글도 끊기지 않고 맞게', () => {
  const a = Array.from({ length: 1500 }, (_, i) => 'w' + (i % 97)).join(' ');
  const b = a.replace('w5 w6 w7', 'x5 x6').concat(' 끝.');
  const ops = wordDiff(a, b);
  assert.equal(side(ops, 'del'), a);
  assert.equal(side(ops, 'ins'), b);
});
