/* 다섯 번째 버그 찾기(문서·소통 — 쪽지·인수인계서·공문 처리) — 다시 생기지 않게. 예시 이름은 지어낸 것 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));
const src = p => readFileSync(new URL(`../../web/${p}`, import.meta.url), 'utf8');
const base = n => String(n || '').replace(/\.[^.]+$/, '').trim() || '붙임';

test('쪽지: 새로 고친 뒤 이름만 남은 붙임에 파일을 다시 넣으면 그 자리에 넣고(filled), 새 파일은 붙임을 더함(added)', async () => {
  const M = await import('../../web/menus/etc/message-model.js');
  const attach = [{ name: '연수 공문', on: true }, { name: '참가 신청서', on: true }];
  const r = M.placeFiles(attach, () => false, [{ name: '참가 신청서.txt' }], base);
  assert.deepEqual([r.filled, r.added, r.slots.map(s => s[0])], [1, 0, [1]]);
  assert.equal(attach.length, 2);
  // 같은 이름 파일 둘: 한 자리에 둘을 넣지 않고 둘째는 새 붙임
  const a2 = [{ name: '참가 신청서', on: true }];
  const r2 = M.placeFiles(a2, () => false, [{ name: '참가 신청서.txt' }, { name: '참가 신청서.hwp' }], base);
  assert.deepEqual([r2.filled, r2.added, r2.slots.map(s => s[0]), a2.length], [1, 1, [0, 1], 2]);
  // 파일이 있는 붙임은 건드리지 않음
  const a3 = [{ name: '계획', on: true }];
  const r3 = M.placeFiles(a3, k => k === 0, [{ name: '계획.txt' }], base);
  assert.deepEqual([r3.filled, r3.added, a3.length], [0, 1, 2]);
});

test('쪽지: AI가 채운 쪽지인데 쓴 파일·글이 화면에 없으면(새로 고침·[열기] 뒤) 파일을 넣어도 바로 읽지 않음 — 넣은 파일만 읽어 칸·본문을 덮지 않게', async () => {
  const M = await import('../../web/menus/etc/message-model.js');
  const m = { kind: 'training', title: 'AI 활용 수업 연수', when: [{ date: '2026-12-03', time: '15:00~16:30' }], place: '시청각실', target: '전 교직원', apply: { due: '2026-11-27', how: '' } };
  assert.equal(M.aiFilled(m, []), true);
  // 선생님이 다 고친 칸뿐이면(다시 읽어도 그대로) AI가 채운 칸 아님
  assert.equal(M.aiFilled({ title: '학부모 공개수업', when: [], place: '각 교실' }, ['title', 'place']), false);
  assert.equal(M.aiFilled({ title: '', when: [] }, []), false);
  // 다시 넣기만(filled) — 화면에 원본이 없음: 읽지 않음
  assert.equal(M.readsAfterAdd({ filled: 1, added: 0 }, { filled: true, held: false }), false);
  // [열기] 뒤 새 파일을 더 넣음 — 원본(이름만 남은 붙임)이 없음: 읽지 않음
  assert.equal(M.readsAfterAdd({ filled: 0, added: 1 }, { filled: true, held: false }), false);
  // 같은 화면에서 새 파일을 더 넣음(원본이 다 있음): 다시 읽음(고친 칸은 그대로 — minor-14)
  assert.equal(M.readsAfterAdd({ filled: 0, added: 1 }, { filled: true, held: true }), true);
  // 빈 새 쪽지·고친 칸뿐인 쪽지: 바로 읽음
  assert.equal(M.readsAfterAdd({ filled: 1, added: 0 }, { filled: false, held: false }), true);
  assert.equal(M.readsAfterAdd({ filled: 0, added: 2 }, { filled: false, held: false }), true);
});

test('쪽지: 최근 쪽지에 고친 칸(touched)을 남겨 [열기] 뒤 다시 읽어도 고친 칸은 그대로', async () => {
  const M = await import('../../web/menus/etc/message-model.js');
  M.pushMessage({ id: 'msgA', title: '[연수 안내] AI 활용 수업 연수', kind: 'training', m: { kind: 'training', title: 'AI 활용 수업 연수', place: '본관 3층 시청각실' }, len: 'base', attach: [], body: '', touched: ['place', 'bogus'] });
  assert.deepEqual(M.listMessages()[0].touched, ['place']);
  M.pushMessage({ id: 'msgB', title: '[행사 안내] 학부모 공개수업', kind: 'event', m: { kind: 'event', title: '학부모 공개수업' }, len: 'base', attach: [] });
  assert.deepEqual(M.listMessages().find(x => x.id === 'msgB').touched, []);
  const s = src('menus/etc/message.js');
  // [열기]·[다시 안내]: 고친 칸을 넘기고 넣기 칸의 앞 쪽지 글은 비움
  assert.match(s, /M\.files = \[\]; M\.paste = '';[^\n]*\n\s*switchDraft\(\{[^\n]*touched: \[\.\.\.\(r\.touched \|\| \[\]\)\]/);
  assert.match(s, /pushMessage\(\{[^\n]*touched: x\.touched \|\| \[\]/);
  // 파일 고르기·끌어 놓기는 putFiles(readsAfterAdd)로만 읽음
  assert.ok(!/addFiles\(fs\); render\(\); readAll\(\);/.test(s), '파일을 넣자마자 늘 다시 읽음');
  assert.equal((s.match(/putFiles\(fs\);/g) || []).length, 2);
});

test('인수인계서: [AI로 정리]는 써 둔 「다음 담당자에게」가 있으면 먼저 묻고, 「아래에 더하기」면 쓴 글 아래에 AI 줄', async () => {
  const H = await import('../../web/menus/etc/handover-model.js');
  const mine = '- 과학실 열쇠는 행정실 금고에 있어요.\n- 과학의 날 물품은 창고 2번 칸에 있어요.\n';
  const lines = ['3월 첫 주에 업무 계획부터 챙겨요.', '끝나지 않은 공문을 확인해요.'];
  assert.equal(H.joinNote(mine, lines, 'add'), '- 과학실 열쇠는 행정실 금고에 있어요.\n- 과학의 날 물품은 창고 2번 칸에 있어요.\n- 3월 첫 주에 업무 계획부터 챙겨요.\n- 끝나지 않은 공문을 확인해요.');
  assert.equal(H.joinNote(mine, lines, 'replace'), '- 3월 첫 주에 업무 계획부터 챙겨요.\n- 끝나지 않은 공문을 확인해요.');
  assert.equal(H.joinNote('  \n', lines, 'add'), '- 3월 첫 주에 업무 계획부터 챙겨요.\n- 끝나지 않은 공문을 확인해요.');
  const s = src('menus/etc/handover.js');
  assert.match(s, /if \(a === 'ai'\) askAi\(\);/);
  assert.match(s, /function askAi\(\) \{[\s\S]*?if \(!String\(st\.note \|\| ''\)\.trim\(\)\) \{ runAi\('replace'\); return; \}[\s\S]*?openSheet/);
});

test('공문 처리: 붙여 넣은 글의 첫 줄을 제목으로 쓸 때 마지막 점에서 자르지 않음(파일 이름만 확장자를 뺌)', async () => {
  const G = await import('../../web/menus/etc/gongmun-ai.js');
  assert.equal(G.firstTitle(null, '2026. 12. 4.(금) 수업 공개의 날 운영 안내'), '2026. 12. 4.(금) 수업 공개의 날 운영 안내');
  assert.equal(G.firstTitle(null, '학교 안전교육 실시 안내(초.중.고)'), '학교 안전교육 실시 안내(초.중.고)');
  assert.equal(G.firstTitle(null, ''), '붙여 넣은 공문');
  assert.equal(G.firstTitle('2026 과학의 날 운영 안내.hwpx', '2026 과학의 날 운영 안내.hwpx'), '2026 과학의 날 운영 안내');
  assert.equal(G.firstTitle('.hwp', '.hwp'), '공문');
  assert.match(src('menus/etc/gongmun.js'), /title: firstTitle\(name, nm\)/);
});
