// 바탕화면 「쌤」 버튼 창 자리(물리 px): 지난 자리가 있는 모니터 안으로 당기고, 없으면 오른쪽 아래(작업 표시줄 위)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeBubble } from '../../web/bubble-place.js';

const M1 = { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 }, scaleFactor: 1.5 };
const M2 = { position: { x: 1920, y: 0 }, size: { width: 1280, height: 1024 }, scaleFactor: 1 };
const W = { width: 174, height: 174 }; // 116 × 1.5

test('처음: 오른쪽 아래, 창 전체가 화면 안(작업 표시줄 위)', () => {
  const p = placeBubble(null, [M1, M2], W, M1);
  assert.deepEqual(p, { x: 1920 - 174 - 36, y: 1080 - 174 - 144 });
  assert.ok(p.x + W.width <= 1920 && p.y + W.height <= 1080);
});

test('지난 자리가 모니터 안이면 그대로, 커진 창이 오른쪽·아래로 넘치면 안으로 당김', () => {
  assert.deepEqual(placeBubble({ x: 800, y: 500 }, [M1, M2], W, M1), { x: 800, y: 500 });
  // 72px 창일 때 오른쪽 끝에 둔 자리: 커진 창이 밖으로 나가지 않게
  assert.deepEqual(placeBubble({ x: 1900, y: 1000 }, [M1, M2], W, M1), { x: 1920 - 174, y: 1080 - 174 });
  // 두 번째 모니터의 자리는 그 모니터 안에서
  assert.deepEqual(placeBubble({ x: 3150, y: 980 }, [M1, M2], W, M1), { x: 1920 + 1280 - 174, y: 1024 - 174 });
});

test('모니터 밖(떼어 낸 모니터)이면 지금 모니터 오른쪽 아래, 모니터를 모르면 null', () => {
  assert.deepEqual(placeBubble({ x: -3000, y: 200 }, [M1], W, M1), placeBubble(null, [M1], W, M1));
  assert.equal(placeBubble(null, [], W, null), null);
  // 창 크기를 모르면 버튼 크기(116)에 배율을 곱해 셈
  assert.deepEqual(placeBubble(null, [M2], null, M2), { x: 1920 + 1280 - 116 - 24, y: 1024 - 116 - 96 });
});
