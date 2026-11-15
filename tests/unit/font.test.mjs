// 글꼴(설정 › 화면 › 글꼴): 8가지(한 줄 4칸 × 2)·기본 프리텐다드, 테마·글꼴에 따라 부를 글꼴 주소, index.html 첫 스크립트가 같은 규칙
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { FONTS, DEFAULT_FONT, fontLinks, knownFont } from '../../web/core/font.js';
import { THEMES } from '../../web/core/theme.js';

const G = fam => `https://fonts.googleapis.com/css2?family=${fam ? fam + '&family=' : ''}Roboto+Mono:wght@400;500&display=swap`;

test('글꼴 8가지, 기본은 프리텐다드', () => {
  assert.deepEqual(FONTS.map(f => f.id), ['pretendard', 'suit', 'noto', 'nanum', 'gowun', 'batang', 'malgun', 'theme']);
  assert.deepEqual(FONTS.map(f => f.label), ['프리텐다드', 'SUIT', '본고딕', '나눔고딕', '고운돋움', '고운바탕', '맑은 고딕', '테마 글꼴']);
  assert.equal(DEFAULT_FONT, 'pretendard');
  assert.equal(knownFont('suit'), true);
  assert.equal(knownFont('comic'), false);
});

test('부를 글꼴: 프리텐다드·SUIT는 앱 안 파일, 구글에는 숫자 글꼴(종이 문서는 명조 제목도)만', () => {
  assert.deepEqual(fontLinks('dark-nav', 'pretendard'), ['fonts/pretendard/pretendard.css', G('')]);
  assert.deepEqual(fontLinks('mono', 'suit'), ['fonts/suit/suit.css', G('')]);
  assert.deepEqual(fontLinks('paper', 'pretendard'), ['fonts/pretendard/pretendard.css', G('Noto+Serif+KR:wght@600;700')]);
});

test('부를 글꼴: 본고딕·나눔고딕·고운돋움·고운바탕은 구글, 맑은 고딕은 내려받지 않음, 테마 글꼴은 테마마다(지금과 같음)', () => {
  assert.deepEqual(fontLinks('dark-nav', 'nanum'), [G('Nanum+Gothic:wght@400;700;800')]);
  assert.deepEqual(fontLinks('soft', 'gowun'), [G('Gowun+Dodum')]);
  assert.deepEqual(fontLinks('rail', 'noto'), [G('Noto+Sans+KR:wght@400;500;700;800')]);
  assert.deepEqual(fontLinks('paper', 'batang'), [G('Gowun+Batang:wght@400;700&family=Noto+Serif+KR:wght@600;700')], '종이 문서는 명조 제목 글꼴도 함께(구글 주소 하나)');
  assert.deepEqual(fontLinks('paper', 'nanum'), [G('Nanum+Gothic:wght@400;700;800&family=Noto+Serif+KR:wght@600;700')]);
  assert.deepEqual(fontLinks('dark-nav', 'malgun'), [G('')]);
  assert.deepEqual(fontLinks('dark-nav', 'theme'), [G('Gothic+A1:wght@400;500;600;700;800')]);
  assert.deepEqual(fontLinks('paper', 'theme'), [G('Noto+Serif+KR:wght@600;700&family=Noto+Sans+KR:wght@400;500;700')]);
  assert.deepEqual(fontLinks('nope', 'nope'), fontLinks('dark-nav', 'pretendard'), '모르는 값은 기본');
});

/* index.html 첫 스크립트를 테마·글꼴마다 돌려 data-theme·data-font·부른 주소가 font.js와 같은지 */
function runInline(theme, font) {
  const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
  const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('ssam:theme'));
  const links = [], de = { dataset: {} };
  const store = { 'ssam:theme': theme && JSON.stringify(theme), 'ssam:font': font && JSON.stringify(font) };
  vm.runInNewContext(src, {
    localStorage: { getItem: k => (k in store ? store[k] : null) }, JSON,
    document: { documentElement: de, head: { appendChild: l => links.push(l.href) }, createElement: () => ({ dataset: {} }) }
  });
  return { theme: de.dataset.theme, font: de.dataset.font, links };
}
test('index.html 첫 스크립트: 테마·글꼴을 먼저 정하고 font.js와 같은 글꼴을 부름(깜빡임 없게)', () => {
  for (const { id: th } of THEMES) for (const { id: f } of FONTS) {
    const r = runInline(th, f);
    assert.equal(r.theme, th); assert.equal(r.font, f);
    assert.deepEqual(r.links, fontLinks(th, f), `${th} · ${f}`);
  }
  const d = runInline(null, null);
  assert.equal(d.theme, 'dark-nav'); assert.equal(d.font, 'pretendard', '처음 켜면 프리텐다드');
  assert.deepEqual(d.links, fontLinks('dark-nav', 'pretendard'));
  assert.equal(runInline('dark-nav', 'comic').font, 'pretendard', '모르는 글꼴은 기본');
});

/* 글꼴은 테마처럼 모든 학년도가 같이 씀: 학년도를 옮기거나 새 학년도를 시작해도 그대로, 백업 파일에 넣지 않음 */
test('글꼴(ssam:font)은 학년도 자료가 아님 — 학년도를 옮겨도 고른 글꼴이 그대로', async () => {
  const { isYearKey, GLOBAL, snapshot, moveTo } = await import('../../web/core/years.js');
  assert.ok(GLOBAL.includes('font'), '공통 키');
  assert.equal(isYearKey('font'), false);
  const m = new Map([['ssam:years', JSON.stringify({ current: 2026 })], ['ssam:font', JSON.stringify('nanum')], ['ssam:theme', JSON.stringify('paper')], ['ssam:hk', '{"x":1}']]);
  const ls = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
  assert.equal('font' in snapshot(ls), false, '백업·보관함에 넣지 않음');
  const store = new Map();
  const r = await moveTo(2027, { ls, archive: { get: async y => store.get(y) || null, put: async (y, s) => { store.set(y, s); } }, data: {} });
  assert.equal(r.ok, true);
  assert.equal(m.get('ssam:font'), JSON.stringify('nanum'), '새 학년도로 가도 고른 글꼴');
  assert.equal(m.get('ssam:theme'), JSON.stringify('paper'));
  assert.equal(m.has('ssam:hk'), false, '학년도 자료는 비움');
});

/* 설정의 「테마 글꼴」 칸 미리 보기: themeFamily가 theme.css의 테마마다 본문 글꼴(--f-body 첫 글꼴)과 같음 */
test('「테마 글꼴」 미리 보기 글꼴 = 테마마다 본문 글꼴(theme.css)', async () => {
  const { themeFamily } = await import('../../web/core/font.js');
  const css = readFileSync(new URL('../../web/core/theme.css', import.meta.url), 'utf8');
  for (const { id } of THEMES) {
    const block = new RegExp(`html\\[data-theme="${id}"\\]\\{([^}]*)\\}`).exec(css);
    assert.ok(block, id);
    const body = /--f-body:\s*([^,;]+)/.exec(block[1]);
    assert.equal(themeFamily(id), body[1].trim(), id);
  }
  assert.equal(themeFamily('nope'), themeFamily('dark-nav'));
});
