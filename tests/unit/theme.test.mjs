// 테마 글꼴: 화면을 막는 글꼴 링크가 없음(글꼴 주소 규칙은 font.test.mjs — index.html 첫 스크립트와 core/font.js가 같음)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('index.html에 화면을 막는 글꼴 링크가 없음', () => {
  const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
  assert.ok(!/<link rel="stylesheet" href="https:\/\/fonts/.test(html), '화면을 막는 글꼴 링크가 남음');
  assert.ok(!/<link rel="stylesheet" href="fonts\//.test(html), '화면을 막는 글꼴 링크가 남음');
});
