// AI 채점 정확도 (스펙 2026-11-06 C): 칸마다 AI 처음 값(ai0)을 기억하고, 지금 값과 견줘 맞힌 칸·고친 칸을 셈
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { tally, unitAccuracy, activityAccuracy, accuracyText, yearAccuracy, yearText } from '../../web/menus/evaluate/grade-accuracy.js';
import { gradeCell, mergeCells, rescoreItem } from '../../web/menus/evaluate/unit/unit-grade.js';
import { newTest, saveTest, listTests } from '../../web/menus/evaluate/unit/unit-model.js';
import { mergeMarks } from '../../web/menus/evaluate/activity/activity-ai.js';
import { newActivity, saveActivity, listActivities } from '../../web/menus/evaluate/activity/activity-model.js';
import { sampleTests } from '../../web/menus/evaluate/unit/unit-sample.js';
import { sampleActivity } from '../../web/menus/evaluate/activity/activity-sample.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const ITEMS = [
  { no: 1, content: '내용', domain: '이해', type: 'choice', answer: '③', points: 10, criteria: '', pages: '' },
  { no: 2, content: '기호', domain: '지식', type: 'symbol', answer: '㉯', points: 10, criteria: '', pages: '' },
  { no: 3, content: '낱말', domain: '지식', type: 'short', answer: '증발', points: 10, criteria: '', pages: '' },
  { no: 4, content: '생각', domain: '이해', type: 'essay', answer: '(예) …', points: 20, criteria: '', pages: '' }
];
const cell = (pts, ai0, extra = {}) => ({ read: 'x', pts, ai: pts, flag: '', why: '', ok: true, manual: false, ...(ai0 === undefined ? {} : { ai0 }), ...extra });
const unit = (students, done = true) => ({ ...newTest({ key: { domains: [], items: ITEMS } }), id: 'u1', done, students });
const stu = (no, items, extra = {}) => ({ no, skip: false, status: 'done', items, good: '', cheer: '', ...extra });

test('다시 채점: AI가 새로 매긴 칸은 그 점수를 AI 처음 값으로, 선생님이 고친 칸은 처음 값까지 그대로', () => {
  const fresh = { 1: gradeCell(ITEMS[0], { read: '③', points: 10, sure: true }), 2: gradeCell(ITEMS[1], { read: '㉮', points: 0, sure: true }) };
  const out = mergeCells({}, fresh);
  assert.equal(out[1].ai0, 10); assert.equal(out[2].ai0, 0);
  // 선생님이 고친 칸(0 → 10)은 다시 채점해도 그대로, 처음 값 0도 그대로
  const old = { 2: { ...out[2], pts: 10, manual: true } };
  const again = mergeCells(old, { 1: gradeCell(ITEMS[0], { read: '②', points: 0, sure: true }), 2: gradeCell(ITEMS[1], { read: '㉯', points: 10, sure: true }) });
  assert.equal(again[2].pts, 10); assert.equal(again[2].ai0, 0, '선생님이 고친 칸의 처음 값을 덮음');
  assert.equal(again[1].pts, 0); assert.equal(again[1].ai0, 0, '처음부터 다시 매긴 칸은 새 값');
});

test('정답표를 고쳐 앱이 다시 맞춘 칸: 선생님이 손대지 않은 칸은 처음 값이 새 점수를 따라감, 옛 칸은 기록 없음 그대로, 고친 칸은 배점 안으로', () => {
  const t = unit([stu(1, { 1: { ...gradeCell(ITEMS[0], { read: '②', points: 0, sure: true }), ai0: 0 }, 2: cell(10), 3: cell(10, 0, { manual: true }), 4: cell(20, 20) })]);
  t.key.items = ITEMS.map(i => ({ ...i }));
  t.key.items[0].answer = '②';
  rescoreItem(t, 1, 'answer');
  assert.equal(t.students[0].items[1].pts, 10); assert.equal(t.students[0].items[1].ai0, 10);
  rescoreItem(t, 2, 'answer');
  assert.ok(!('ai0' in t.students[0].items[2]), '옛 칸에 처음 값이 생김');
  t.key.items[3].points = 15;
  rescoreItem(t, 4, 'points');
  assert.equal(t.students[0].items[4].ai0, 15);
  t.key.items[2].points = 5;
  rescoreItem(t, 3, 'points');
  assert.equal(t.students[0].items[3].pts, 5); assert.equal(t.students[0].items[3].ai0, 0);
});

test('맞힌 칸: 지금 값 == 처음 값(노란 칸을 확인만 한 것도), 유형별(객관식=고르기·기호·선 잇기), 선생님이 고친 칸 수', () => {
  const t = unit([
    stu(1, { 1: cell(10, 10), 2: cell(10, 10, { flag: 'low', ok: true }), 3: cell(10, 10), 4: cell(15, 20, { manual: true }) }),
    stu(2, { 1: cell(0, 0), 2: cell(0, 0), 3: cell(10, 0, { manual: true }), 4: cell(20, 20) }),
    { no: 3, skip: true, status: 'idle', items: { 1: cell(0, 10) } },
    stu(4, { 1: cell(10) }) // 옛 칸(처음 값 없음)은 세지 않음
  ]);
  const a = unitAccuracy(t);
  assert.equal(a.n, 8); assert.equal(a.ok, 6); assert.equal(a.changed, 2); assert.equal(a.pct, 75);
  assert.deepEqual(a.groups.map(g => [g.g, g.n, g.ok, g.pct]), [['obj', 4, 4, 100], ['short', 2, 1, 50], ['essay', 2, 1, 50]]);
  assert.equal(accuracyText(a, { finished: true }), 'AI가 맞힌 칸 75% (객관식 100% · 단답 50% · 서술형 50%) · 선생님이 고친 칸 2개');
  assert.equal(accuracyText(a, { finished: false }), 'AI가 맞힌 칸: 확인 중');
  assert.equal(accuracyText(null, { finished: true, graded: true }), 'AI가 맞힌 칸: 기록 없음');
  assert.equal(accuracyText(null, { finished: false, graded: false }), '');
});

test('비율: 하나라도 고쳤으면 100%로 올려 적지 않음, 유형이 하나면 유형별은 뺌', () => {
  const cells = [...Array(300)].map((_, i) => ({ g: 'obj', same: i > 0 }));
  const a = tally(cells);
  assert.equal(a.pct, 99); assert.equal(a.changed, 1);
  assert.equal(accuracyText(a, { finished: true }), 'AI가 맞힌 칸 99% · 선생님이 고친 칸 1개');
  assert.equal(tally([]), null);
  assert.equal(unitAccuracy(unit([stu(1, { 1: cell(10) })])), null, '이 기능 전에 채점한 평가');
});

test('활동지: AI가 새로 매긴 표시를 처음 값으로, 선생님이 고친 칸은 그대로, 맞힌 칸 셈', () => {
  const items = [{ no: 1, type: 'choice', answer: '②' }, { no: 2, type: 'short', answer: '증발' }, { no: 3, type: 'write', answer: '' }];
  const m = mergeMarks(items, {}, { 1: { read: '②', mark: 'o', why: '', sure: true }, 2: { read: '증', mark: 'x', why: '', sure: true }, 3: { read: '글', mark: 't', why: '', sure: true } });
  assert.deepEqual([m[1].ai0, m[2].ai0, m[3].ai0], ['o', 'x', 't']);
  const again = mergeMarks(items, { ...m, 3: { ...m[3], mark: 'o', manual: true } }, { 1: { read: '①', mark: 'x', why: '', sure: true }, 2: { read: '증발', mark: 'o', why: '', sure: true }, 3: { read: '글', mark: 'x', why: '', sure: true } });
  assert.equal(again[3].mark, 'o'); assert.equal(again[3].ai0, 't');
  assert.equal(again[1].ai0, 'x');
  const a = { ...newActivity(), items, done: true, students: [{ no: 1, skip: false, status: 'done', marks: again }, { no: 2, skip: false, status: 'done', marks: { 1: { mark: 'o', ai0: 'o' }, 2: { mark: 'o', ai0: 'o', manual: true, chk: false } } }] };
  const acc = activityAccuracy(a);
  assert.equal(acc.n, 5); assert.equal(acc.changed, 1); assert.equal(acc.pct, 80);
  assert.deepEqual(acc.groups.map(g => g.g), ['obj', 'short', 'essay']);
  assert.equal(activityAccuracy({ ...a, students: [{ no: 1, skip: false, status: 'done', marks: { 1: { mark: 'o' } } }] }), null);
});

test('올해 모아: 마친 평가 중 기록이 있는 것만, 예시는 진짜 평가가 없을 때만', () => {
  const A = (pct, done = true, sample = false) => ({ done, sample, acc: { n: 10, ok: 0, changed: 0, pct, groups: [] } });
  assert.deepEqual(yearAccuracy([A(100), A(90), A(80, false), { done: true, acc: null }]), { n: 2, avg: 95 });
  assert.deepEqual(yearAccuracy([A(100), A(99)]), { n: 2, avg: 99 }, '하나라도 고쳤으면 100%로 올리지 않음');
  assert.deepEqual(yearAccuracy([A(100), A(60, true, true)]), { n: 1, avg: 100 });
  assert.deepEqual(yearAccuracy([A(60, true, true)]), { n: 1, avg: 60 });
  assert.equal(yearAccuracy([A(80, false)]), null);
  assert.equal(yearText({ n: 3, avg: 96 }), '올해 3개 평가 · AI가 맞힌 칸 평균 96%');
  assert.equal(yearText(null), '');
});

test('목록 요약에 정확도를 넣어 둠(평가를 열지 않고 목록·누적에 씀)', () => {
  store.useStorage(mem());
  const t = unit([stu(1, { 1: cell(10, 10), 2: cell(0, 10, { manual: true }) })]);
  saveTest(t);
  const s = listTests().find(x => x.id === 'u1');
  assert.equal(s.acc.n, 2); assert.equal(s.acc.changed, 1); assert.equal(s.done, true);
  const a = { ...newActivity({ title: '활동' }), done: true, items: [{ no: 1, type: 'choice' }], students: [{ no: 1, skip: false, status: 'done', marks: { 1: { mark: 'x', ai0: 'o', manual: true } } }] };
  saveActivity(a);
  const sa = listActivities().find(x => x.id === a.id);
  assert.equal(sa.acc.pct, 0); assert.equal(sa.done, true); assert.equal(sa.sample, false);
});

test('예시 자료에도 처음 값이 있어 정확도를 바로 볼 수 있음(선생님이 고친 칸 몇 개)', () => {
  for (const t of sampleTests()) { const a = unitAccuracy(t); assert.ok(a && a.n === 60 && a.changed >= 1 && a.pct < 100, JSON.stringify(a)); }
  const a = activityAccuracy(sampleActivity());
  assert.ok(a && a.n === 24 && a.changed >= 1, JSON.stringify(a));
});
