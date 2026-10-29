// 테마 글꼴: index.html 첫 스크립트의 글꼴 표가 core/theme.js와 같음
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEMES, fontUrl } from '../../web/core/theme.js';

test('테마마다 index.html이 처음 부르는 글꼴 주소가 theme.js와 같음', () => {
  const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
  const F = JSON.parse(html.match(/var F=(\{[^}]*\})/)[1].replace(/'/g, '"'));
  for (const { id } of THEMES) {
    const inline = 'https://fonts.googleapis.com/css2?family=' + F[id] + '&family=Roboto+Mono:wght@400;500&display=swap';
    assert.equal(inline, fontUrl(id), id);
  }
  assert.ok(!/<link rel="stylesheet" href="https:\/\/fonts/.test(html), '화면을 막는 글꼴 링크가 남음');
});
