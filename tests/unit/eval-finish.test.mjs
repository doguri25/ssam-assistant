// 2026-11-16 바로 마치기·한눈에 [마치기]: 확인하지 않은 칸은 쌤비서가 매긴 대로 두고 마침(점수·표시는 그대로, 선생님 차례에서 빠짐),
// 한눈에 결과 확인 칸의 [마치기]는 그 평가를 끝난 평가로(학년도 자료 eval:closed, [다시 열기]로 되돌림)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { acceptUnit, acceptActivity, unitPending, activityPending, closedView } from '../../web/menus/evaluate/eval-stage.js';
import { isClosed, setClosed } from '../../web/menus/evaluate/eval-close.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; }
store.useStorage(mem());

test('[fin-unit] 단원평가 바로 마치기: 판단을 미룬 칸·검토 의견 칸을 쌤비서 점수 그대로 정함(빠진 학생은 그대로)', () => {
  const t = { key: { items: [{ no: 1, points: 5 }, { no: 2, points: 5 }] }, students: [
    { no: 1, status: 'done', items: { 1: { pts: 3, flag: true }, 2: { pts: 5, rv: { agree: false, pts: 0 } } } },
    { no: 2, status: 'done', items: { 1: { pts: 5, flag: true, ok: true }, 2: { pts: 0 } } },
    { no: 3, status: 'done', skip: true, items: { 1: { pts: 0, flag: true } } },
    { no: 4, status: 'todo', items: {} }
  ] };
  assert.equal(unitPending(t), 2);
  assert.equal(acceptUnit(t), 2);
  assert.equal(unitPending(t), 0);
  assert.equal(t.students[0].items[1].pts, 3);
  assert.equal(t.students[0].items[1].ok, true);
  assert.equal(t.students[0].items[2].pts, 5);
  assert.equal(t.students[0].items[2].rv.done, 'main');
  assert.equal(t.students[2].items[1].ok, undefined, '빠진 학생은 건드리지 않음');
  assert.equal(acceptUnit(t), 0, '두 번째는 할 것이 없음');
  assert.equal(acceptUnit(null), 0);
});

test('[fin-act] 활동지 바로 마치기: 노란 칸(확인할 칸)을 쌤비서 표시 그대로 정함', () => {
  const a = { students: [
    { no: 1, status: 'done', marks: { 1: { mark: 'p', chk: true }, 2: { mark: 'x', rv: { mark: 'o' } }, 3: { mark: 'o' } } },
    { no: 2, status: 'done', marks: { 1: { mark: '', chk: true } } },
    { no: 3, skip: true, status: 'done', marks: { 1: { mark: 'o', chk: true } } }
  ] };
  assert.equal(activityPending(a), 2);
  assert.equal(acceptActivity(a), 3, '노란 칸 2 + 다시 보기 AI 의견 1');
  assert.equal(activityPending(a), 0);
  assert.equal(a.students[0].marks[1].mark, 'p');
  assert.equal(a.students[0].marks[2].mark, 'x');
  assert.equal(a.students[0].marks[2].rv, undefined, '다시 보기 의견은 쌤비서(메인) 표시로 정함');
  assert.equal(a.students[2].marks[1].chk, true, '빠진 학생은 그대로');
});

test('[fin-closed] 마친 평가는 끝(접음)·선생님 차례 0, 마치지 않은 평가는 지금 규칙 그대로', () => {
  assert.deepEqual(closedView('result', 3, true), { stage: 'done', pending: 0 });
  assert.deepEqual(closedView('help', 0, true), { stage: 'done', pending: 0 });
  assert.deepEqual(closedView('result', 2, false), { stage: 'result', pending: 2 });
  assert.deepEqual(closedView('done', 2, false), { stage: 'record', pending: 2 }); // 확인할 것이 남은 끝난 평가는 생활기록부 칸(boardStage)
  assert.equal(isClosed('unit', 't1'), false);
  assert.equal(setClosed('unit', 't1', true), true);
  assert.equal(isClosed('unit', 't1'), true);
  assert.equal(isClosed('activity', 't1'), false, '종류마다 따로');
  setClosed('unit', 't1', false);
  assert.equal(isClosed('unit', 't1'), false);
});
