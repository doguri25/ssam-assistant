// 계획 버그 잡기(2026-11-14): 작년(기존) 계획서 목차로 쓴 연간계획 초안 — 목차에 없는 칸(화면·한글 파일에 안 나옴)으로
// 지침 문장이 들어가거나 「반영됨」으로 셈하던 것 (화면 쪽은 tests/e2e/hunt1114-plan.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
const { yearOutline, normDraft, planDoc, draftText, overlap, guideStatus, insertSentence, insertKey, textKeys } = await import('../../web/menus/plan/year-model.js');

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
store.useStorage(mem());

// 방침 칸이 없는 작년 계획서(목적 · 운영 개요 · 세부 운영 계획 · 추진 일정 · 평가)
const LAST = ['2026학년도 독서교육 운영 계획', '1. 목적', '책을 즐겨 읽는 습관을 기른다.', '2. 운영 개요', '가. 대상: 전교생', '3. 세부 운영 계획', '가. 아침 독서',
  '4. 추진 일정', '3월 계획 수립', '5. 평가', '독서량을 살핀다.'].join('\n');

test('[year-outline-hidden] 목차에 없는 글 칸은 글 칸·셈에서 빠짐(화면·한글 파일에 없는 글로 「반영됨」을 세지 않음)', () => {
  const o = yearOutline(LAST);
  assert.deepEqual(o.items.map(x => x.key), ['purpose', 'x1', 'details', 'schedule', 'evaluation']);
  const d = normDraft({ purpose: '목적 글', policy: '안전한 독서 환경을 만든다.', details: '세부 글', evaluation: '평가 글', x1: '개요 글', outline: o.items, roman: o.roman });
  assert.deepEqual(textKeys(d), ['purpose', 'details', 'evaluation', 'x1']);
  assert.ok(!draftText(d).includes('안전한 독서 환경'), '목차에 없는 방침 글이 셈에 들어감');
  const st = guideStatus([{ item: '독서 환경', keywords: ['안전한', '독서 환경'], sentence: '안전한 독서 환경을 만든다.', section: 'policy' }], d);
  assert.equal(st[0].included, false, '한글 파일에 없는 글로 「반영됨」');
  // 목차가 없는(기본 차례) 초안은 그대로 넷
  assert.deepEqual(textKeys(normDraft({ purpose: 'a' })), ['purpose', 'policy', 'details', 'evaluation']);
});

test('[year-outline-hidden] 지침 문장 [넣기]: 목차에 없는 칸이면 보이는 칸(세부 → 첫 글 칸)으로 들어가 한글 파일에도 나옴', () => {
  const o = yearOutline(LAST);
  const d = normDraft({ purpose: '목적 글', details: '세부 글', evaluation: '평가 글', x1: '개요 글', outline: o.items, roman: o.roman });
  assert.equal(insertKey(d, 'policy'), 'details');
  assert.equal(insertKey(d, 'evaluation'), 'evaluation');
  const n = insertSentence(d, 'policy', '학부모와 함께 읽는 날을 운영한다.');
  assert.ok(n.details.endsWith('학부모와 함께 읽는 날을 운영한다.'), n.details);
  assert.ok(!String(n.policy || '').includes('학부모'), '안 보이는 방침 칸에 들어감');
  const doc = planDoc({ year: 2027, name: '독서교육', draft: n });
  assert.ok(doc.blocks.some(b => String(b.text || '').includes('학부모와 함께 읽는 날')), '한글 파일에 넣은 문장이 없음');
  assert.ok(guideStatus([{ item: '함께 읽는 날', keywords: ['학부모', '함께 읽는 날'], section: 'policy' }], n)[0].included);
  // 세부 칸도 없으면 목차의 첫 글 칸
  const o2 = yearOutline('1. 추진 근거\n2. 목적\n3. 추진 일정\n4. 소요 예산');
  const d2 = normDraft({ purpose: '목적', x1: '근거', outline: o2.items });
  assert.equal(insertKey(d2, 'details'), 'purpose');
  // 기본 차례는 지금처럼(모르는 칸은 세부)
  assert.equal(insertKey(normDraft({ purpose: 'a' }), 'policy'), 'policy');
  assert.equal(insertKey(normDraft({ purpose: 'a' }), 'zz'), 'details');
  assert.ok(overlap('세부 글', n) !== null);
});
