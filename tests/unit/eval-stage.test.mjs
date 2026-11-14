// 평가 한눈에(스펙 2026-11-14-eval-redesign §2): 평가마다 단계(준비·채점·결과 확인·보충·생활기록부·끝)와 선생님이 확인할 수
import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, unitStage, unitPending, activityStage, activityPending, grStage, grPending, boardStage } from '../../web/menus/evaluate/eval-stage.js';

const step = (id, done) => ({ id, done });
const STEPS = (...doneIds) => ['grade', 'miss', 'redo', 'gap', 'camp', 'post'].map(id => step(id, doneIds.includes(id)));
const unit = (students, extra = {}) => ({ id: 't1', meta: {}, key: { items: [{ no: 1 }, { no: 2 }] }, students, done: false, ...extra });

test('단계 이름 다섯 칸', () => {
  assert.deepEqual(STAGES.map(s => s[1]), ['준비', '채점', '결과 확인', '보충', '생활기록부']);
});

test('단원평가 단계: 채점 0명 → 준비, 그다음은 평가 한 바퀴의 첫 안 끝난 칸', () => {
  assert.equal(unitStage(unit([])), 'prep');
  assert.equal(unitStage(unit([{ status: 'idle' }, { status: 'done', skip: true }]), STEPS()), 'prep');
  const t = unit([{ status: 'done', items: {} }, { status: 'idle' }]);
  assert.equal(unitStage(t, STEPS()), 'grade');
  assert.equal(unitStage(t, STEPS('grade')), 'result');
  assert.equal(unitStage(t, STEPS('grade', 'miss')), 'help');
  assert.equal(unitStage(t, STEPS('grade', 'miss', 'redo', 'gap', 'camp')), 'help');
  assert.equal(unitStage(t, STEPS('grade', 'miss', 'redo', 'gap', 'camp', 'post')), 'record');
  assert.equal(unitStage(t, STEPS('grade', 'miss', 'redo', 'gap', 'camp', 'post'), { pyDone: true }), 'done');
});

test('예시 평가는 결손·기초학력·사전사후 칸을 보지 않음(늘 보충에 머물지 않게)', () => {
  const t = unit([{ status: 'done', items: {} }], { meta: { sample: true } });
  assert.equal(unitStage(t, STEPS('grade', 'miss', 'redo')), 'record');
});

test('단원평가 확인할 칸: 걸린 칸(확인 안 함) + 다시 보기에서 다른 칸(아직), 채점한 학생만·결석 빼고·한 칸은 한 번', () => {
  const t = unit([
    { status: 'done', items: { 1: { flag: 'low' }, 2: { flag: 'essay', ok: true } } },          // 1
    { status: 'done', items: { 1: { rv: { agree: false } }, 2: { flag: 'low', rv: { agree: false } } } }, // 2 (2번 칸은 한 번)
    { status: 'done', items: { 1: { rv: { agree: true } }, 2: { rv: { agree: false, done: 'main' } } } }, // 0
    { status: 'idle', items: { 1: { flag: 'low' } } },                                           // 채점 전 0
    { status: 'done', skip: true, items: { 1: { flag: 'low' } } }                                // 결석 0
  ]);
  assert.equal(unitPending(t), 3);
  assert.equal(unitPending(null), 0);
});

test('활동지 단계: 채점 0 → 준비, 채점 중 → 채점, 마침 → 결과 확인, 평어로 넘김 → 끝', () => {
  const a = (students, extra = {}) => ({ students, done: false, link: null, ...extra });
  assert.equal(activityStage(a([])), 'prep');
  assert.equal(activityStage(a([{ status: 'idle' }])), 'prep');
  assert.equal(activityStage(a([{ status: 'done' }, { status: 'idle' }])), 'grade');
  assert.equal(activityStage(a([{ status: 'done' }], { done: true })), 'result');
  assert.equal(activityStage(a([{ status: 'done' }], { done: true, link: { subject: '국어' } })), 'done');
});

test('활동지 확인할 칸: 노란 칸(chk) 수, 결석 빼고', () => {
  const a = { students: [{ marks: { 1: { chk: true }, 2: { chk: false } } }, { marks: { 1: { chk: true }, 3: { chk: 1 } } }, { skip: true, marks: { 1: { chk: true } } }] };
  assert.equal(activityPending(a), 3);
  assert.equal(activityPending(null), 0);
});

test('평가지 채점 단계: 점수 일부 → 채점, 모두 점수·글 없음 → 결과 확인, 글 일부 → 생활기록부, 글 모두 → 끝', () => {
  const b = students => ({ students });
  assert.equal(grStage(b([])), 'prep');
  assert.equal(grStage(b([{ score: null }, { score: null }])), 'prep');
  assert.equal(grStage(b([{ score: 80 }, { score: null }, { skip: 1, score: null }])), 'grade');
  assert.equal(grStage(b([{ score: 80 }, { score: 70 }])), 'result');
  assert.equal(grStage(b([{ score: 80, text: '가' }, { score: 70 }])), 'record');
  assert.equal(grStage(b([{ score: 80, text: '가' }, { score: 0, text: '나' }])), 'done');
});

test('평가지 채점 확인할 학생: 알아보기 어려움(선생님이 안 고침)·점수 검토 다름(아직)·글 검토 제안(아직 정하지 않음 — trvd는 검토를 돌렸다는 표시라 셈과 상관없음)', () => {
  const b = { students: [
    { unreadable: 1 }, { unreadable: 1, manual: 1 }, { rv: { score: 60 } }, { rv: { score: 60, done: 'main' } },
    { trv: { problem: 'x', fix: 'y' } }, { trv: { problem: 'x', fix: 'y' }, trvd: 1 }, { trv: { problem: 'x', done: 'review' }, trvd: 1 },
    { skip: 1, unreadable: 1 }, { unreadable: 1, rv: { score: 1 } }] };
  assert.equal(grPending(b), 5);
  assert.equal(grPending(null), 0);
});

test('한눈에 단계: 끝났어도 확인할 것이 남으면 접지 않고 생활기록부 칸(띠·가로 메뉴 수가 같게)', () => {
  assert.equal(boardStage('done', 2), 'record');
  assert.equal(boardStage('done', 0), 'done');
  assert.equal(boardStage('grade', 3), 'grade');
  assert.equal(boardStage('result', 0), 'result');
});
