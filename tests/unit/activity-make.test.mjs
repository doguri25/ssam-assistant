// 활동지 만들기 (스펙 2026-11-15 §3): 열린 문항(쓰기·그리기·생각 정리) 요청 글, AI 답 다듬기(○·△ 기준), 활동지 글·문서,
// 새 활동지(문항·기준 확정, sheet.student = 활동지 글) → 지금 채점 화면이 쓰는 모양 그대로
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { actPrompt, redoTaskPrompt, normTasks, normTask, taskWarn, sheetText, sheetDoc, activityFrom, KINDS } from '../../web/menus/evaluate/activity/activity-make.js';
import { saveActivity, getActivity } from '../../web/menus/evaluate/activity/activity-model.js';
import { gradePrompt } from '../../web/menus/evaluate/activity/activity-ai.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; }
store.useStorage(mem());
const scope = { subject: '사회', unit: '1. 우리 고장의 모습', unitNo: 1, unitName: '우리 고장의 모습', lesson: '3/8', pages: '20~21쪽', lines: ['1. 우리 고장의 모습 · 3/8차시 고장의 자랑거리 (교과서 20~21쪽)'] };

test('요청 글: 교과·학년·범위·문항 수·종류(쓰기·그리기·생각 정리)·수준, ○·△ 기준, JSON 꼴', () => {
  assert.deepEqual(KINDS.map(k => k[1]), ['쓰기', '그리기', '생각 정리']);
  const p = actPrompt({ scope, grade: 3, count: 3, kinds: ['write', 'draw', 'think'], level: 'normal' });
  assert.ok(p.startsWith('[활동지 만들기]'));
  assert.ok(p.includes('사회') && p.includes('3학년') && p.includes('고장의 자랑거리') && p.includes('모두 3문항'));
  assert.ok(p.includes('쓰기 1문항') && p.includes('그리기 1문항') && p.includes('생각 정리 1문항'));
  assert.ok(p.includes('"ok"') && p.includes('"part"') && p.includes('"kind"'));
  const r = redoTaskPrompt({ scope, grade: 3, level: 'normal', tasks: normTasks({ items: [{ kind: 'write', ask: '고장의 자랑거리를 쓰세요.', ok: '두 가지', part: '한 가지' }, { kind: 'draw', ask: '고장 지도를 그리세요.', ok: '세 곳', part: '한 곳' }] }), no: 2 });
  assert.ok(r.startsWith('[활동지 문항 다시 만들기]') && r.includes('2번') && r.includes('그리기') && r.includes('고장의 자랑거리를 쓰세요.'));
});

test('AI 답 다듬기: 종류(모르면 묻는 말로 짐작)·묻는 말·예시 답안·○·△ 기준, 빈 묻는 말은 버림, 채점 종류(쓰기·그림)', () => {
  const t = normTasks({ title: '고장 자랑', items: [
    { kind: 'write', ask: ' 고장의 자랑거리를 두 가지 쓰세요. ', answer: '시장, 공원', ok: '자랑거리 두 가지와 까닭', part: '한 가지만' },
    { ask: '고장의 모습을 그려 보세요.', ok: '건물·길이 있음', part: '' },
    { kind: 'think', ask: '고장을 더 살기 좋게 할 방법을 정리해 보세요.', answer: '', ok: '방법과 까닭', part: '방법만' },
    { kind: 'write', ask: '' }
  ] }, { count: 5 });
  assert.equal(t.length, 3);
  assert.deepEqual(t[0], { no: 1, kind: 'write', type: 'write', ask: '고장의 자랑거리를 두 가지 쓰세요.', answer: '시장, 공원', ok: '자랑거리 두 가지와 까닭', part: '한 가지만' });
  assert.deepEqual([t[1].kind, t[1].type], ['draw', 'draw']);
  assert.deepEqual([t[2].kind, t[2].type], ['think', 'write']);
  assert.ok(taskWarn(t[1]).includes('△'), taskWarn(t[1]));
  assert.equal(taskWarn(t[0]), '');
  assert.ok(taskWarn({ ...t[0], ask: '' }).includes('묻는 말'));
  assert.equal(normTasks({ items: [{ ask: 'a' }, { ask: 'b' }, { ask: 'c' }] }, { count: 2 }).length, 2);
  assert.equal(normTask({ item: { kind: 'draw', ask: '그려요', ok: 'o', part: 'p' } }).kind, 'draw');
  assert.equal(normTask({}), null);
});

test('활동지 글·학생 활동지 문서: 맨 위 「학년 반 번호 이름」 칸, 제목, 문항마다 쓸 칸(그리기는 더 큼), 기준·예시 답안은 빼고', () => {
  const tasks = normTasks({ items: [{ kind: 'write', ask: '자랑거리를 쓰세요.', answer: '시장', ok: '두 가지', part: '한 가지' }, { kind: 'draw', ask: '지도를 그리세요.', ok: '세 곳', part: '한 곳' }] });
  const meta = { subject: '사회', unit: '1. 우리 고장의 모습', lesson: '3/8', pages: '20~21쪽', title: '고장 자랑' };
  const text = sheetText(meta, tasks);
  assert.ok(text.startsWith('고장 자랑'));
  assert.ok(text.includes('사회 · 1. 우리 고장의 모습 · 3/8차시 · 20~21쪽'));
  assert.ok(text.includes('1. 자랑거리를 쓰세요.') && text.includes('2. 지도를 그리세요.'));
  assert.ok(!text.includes('두 가지') && !text.includes('시장'));
  const d = sheetDoc(meta, tasks);
  assert.equal(d.title, '');
  assert.deepEqual(d.blocks[0].rows, [['학년', '', '반', '', '번호', '', '이름', '']]);
  assert.deepEqual(d.blocks[1], { type: 'c', text: '고장 자랑', bold: true });
  const boxes = d.blocks.filter(b => b.type === 'table').slice(1);
  assert.equal(boxes.length, 2);
  assert.ok(boxes[1].rows[0][0].split('\n').length > boxes[0].rows[0][0].split('\n').length);
  assert.ok(!JSON.stringify(d).includes('세 곳'));
});

test('새 활동지: 정보·문항(쓰기·그림, 출처 AI)·기준 확정·활동지 글 → 저장 → 채점 요청에 기준이 그대로', () => {
  const tasks = normTasks({ items: [{ kind: 'write', ask: '자랑거리를 쓰세요.', answer: '시장', ok: '두 가지', part: '한 가지' }, { kind: 'think', ask: '방법을 정리하세요.', ok: '방법과 까닭', part: '방법만' }] });
  const a = activityFrom({ meta: { subject: '사회', unit: '1. 우리 고장의 모습', lesson: '3/8', pages: '20~21쪽', title: '고장 자랑', date: '2026-11-16', term: 2 }, tasks });
  assert.equal(a.confirmed, true);
  assert.deepEqual(a.items, [
    { no: 1, type: 'write', ask: '자랑거리를 쓰세요.', answer: '시장', ok: '두 가지', part: '한 가지', src: 'ai' },
    { no: 2, type: 'write', ask: '방법을 정리하세요.', answer: '', ok: '방법과 까닭', part: '방법만', src: 'ai' }
  ]);
  assert.ok(a.sheet.student.includes('1. 자랑거리를 쓰세요.'));
  assert.deepEqual([a.meta.subject, a.meta.title, a.meta.term, a.meta.date], ['사회', '고장 자랑', 2, '2026-11-16']);
  assert.ok(saveActivity(a));
  const b = getActivity(a.id);
  assert.equal(b.items.length, 2);
  assert.equal(b.confirmed, true);
  const g = gradePrompt(b, 1);
  assert.ok(g.includes('○ 기준: 두 가지') && g.includes('△ 기준: 방법만'));
});
