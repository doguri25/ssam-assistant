// 화면 정리 공통 부품(스펙 2026-11-14-ui-tidy): 머리말 설명 접기 · 「AI로 가는 것」 · 설정 접기
import test from 'node:test';
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const { introHTML, aiNoteHTML, foldHTML, INTRO_SHOW, _reset } = await import('../../web/core/ui-parts.js');
const { GLOBAL } = await import('../../web/core/years.js');

test('머리말 설명: 처음 3번(켤 때마다 한 번 셈)은 펼쳐 보이고, 그 뒤엔 접힌 「화면 설명」', () => {
  _reset(); mem.clear();
  assert.equal(INTRO_SHOW, 3);
  const a = introHTML('unit', '학생 문제지와 답안을 넣으면 채점해요.');
  assert.ok(a.includes('<details class="intro"') && a.includes(' open') && a.includes('학생 문제지와 답안을 넣으면 채점해요.'), a);
  assert.ok(introHTML('unit', 'x').includes(' open'), '같은 실행에서 다시 그려도 한 번만 셈');
  assert.equal(JSON.parse(mem.get('ssam:ui:intro')).unit, 1);
  for (let i = 0; i < 2; i++) { _reset(); introHTML('unit', 'x'); }
  _reset();
  const d = introHTML('unit', '학생 문제지와 답안을 넣으면 채점해요.');
  assert.ok(!d.includes(' open') && d.includes('화면 설명'), d);
  assert.ok(GLOBAL.includes('ui:intro'), '학년도 자료가 아님(백업·학년도 옮기기에 들지 않음)');
});

test('머리말 설명: 글을 이스케이프, 빈 글이면 아무것도 그리지 않음, 저장소가 막혀도 펼쳐 보임', () => {
  _reset(); mem.clear();
  assert.ok(introHTML('k', '<b>굵게</b>').includes('&lt;b&gt;굵게&lt;/b&gt;'));
  assert.equal(introHTML('k2', ''), '');
  const keep = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  _reset();
  assert.ok(introHTML('k3', '글').includes(' open'));
  globalThis.localStorage = keep;
});

test('「AI로 가는 것」: 접힌 상자, 자물쇠 그림(글자 함께), 무엇을 보내는지, [AI로 보낸 글 보기]', () => {
  const h = aiNoteHTML('번호·점수·평가 내용만 보내요. 이름은 보내지 않아요.');
  assert.ok(h.startsWith('<details class="ai-note"') && !h.includes(' open'), h);
  assert.ok(h.includes('<svg') && h.includes('aria-hidden="true"') && h.includes('AI로 가는 것'), '그림만으로 뜻을 나르지 않음');
  assert.ok(h.includes('번호·점수·평가 내용만 보내요. 이름은 보내지 않아요.'));
  assert.ok(h.includes('data-go-ailog') && h.includes('AI로 보낸 글 보기'));
  assert.ok(aiNoteHTML('<i>x</i>').includes('&lt;i&gt;x&lt;/i&gt;'));
});

test('설정 접기: 요약 한 줄 + [바꾸기], 기본은 접힘, open이면 펼침', () => {
  const h = foldHTML({ key: 'hk-set', summary: '300~500자 · 후보 2개 · ~함.', body: '<label>분량</label>' });
  assert.ok(h.startsWith('<details class="fold" data-fold="hk-set"') && !h.includes(' open'), h);
  assert.ok(h.includes('300~500자 · 후보 2개 · ~함.') && h.includes('바꾸기') && h.includes('<label>분량</label>'));
  assert.ok(foldHTML({ key: 'k', summary: 's', body: 'b', open: true }).includes(' open'));
  assert.ok(foldHTML({ key: 'k', summary: '<s>', body: 'b' }).includes('&lt;s&gt;'), '요약은 이스케이프(본문은 HTML 그대로)');
});

test('「AI로 가는 것」: 글마다 같은 이름으로 펼침을 기억(다시 그려도 펼친 채) — 다른 글은 다른 이름', () => {
  const k = h => (h.match(/data-ui-open="([^"]+)"/) || [])[1];
  const a = aiNoteHTML('번호·점수만 보내요.'), b = aiNoteHTML('번호·점수만 보내요.'), c = aiNoteHTML('글만 보내요.');
  assert.ok(k(a) && k(a).startsWith('ai:'), a);
  assert.equal(k(a), k(b));
  assert.notEqual(k(a), k(c));
});
