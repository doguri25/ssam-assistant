// 단원평가 새 화면(스펙 2026-11-14-eval-redesign §3·§4)의 화면 없는 셈: 결과 한 화면(점수 색·흐름 선·약한 영역 한 줄·평가 카드 이름),
// 평가 하나의 다섯 단계 줄, 학생 × 문항 지도 칸, 쌤비서가 찾은 것(같은 실수 묶음), 채점 확인 목록·점수 단추. 자료는 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { newTest } from '../../web/menus/evaluate/unit/unit-model.js';
import { flowSteps } from '../../web/menus/evaluate/unit/unit-flow.js';
import { sampleTests } from '../../web/menus/evaluate/unit/unit-sample.js';
import {
  scoreTone, dateLabel, cardTitle, colLabel, sparkPath, trendValues, weakAdvice, testSteps, heatTone, needsConfirm, confirmList,
  foundGroups, pointChoices, rateText
} from '../../web/menus/evaluate/unit/unit-view.js';

const C = (pts, read = 'x', more = {}) => ({ read, pts, ai: pts, flag: '', why: '', ok: true, manual: false, ...more });
const ITEMS = [
  { no: 1, content: '나눗셈 하기', domain: '수와 연산', type: 'choice', answer: '③', points: 50, criteria: '', pages: '' },
  { no: 2, content: '도형 이름 쓰기', domain: '도형', type: 'essay', answer: '삼각형', points: 50, criteria: '변 3개', pages: '' }
];
function T(rows, { done = false, extra = [], meta = {} } = {}) {
  const t = newTest({ meta: { subject: '수학', grade: 3, term: 2, unitNo: 2, unitName: '나눗셈', round: 1, date: '2026-10-14', ...meta }, key: { domains: ['수와 연산', '도형'], items: ITEMS.map(i => ({ ...i })) } });
  t.id = 'v1'; t.done = done;
  t.students = [...Object.entries(rows).map(([no, cells]) => ({ no: +no, skip: false, status: 'done', items: Object.fromEntries(cells.map((c, i) => [i + 1, c])) })), ...extra];
  return t;
}

test('점수 색: 90점 이상 hi, 60점 아래 lo, 그 사이·빈칸은 없음', () => {
  assert.equal(scoreTone(90), 'hi');
  assert.equal(scoreTone(100), 'hi');
  assert.equal(scoreTone(89.9), '');
  assert.equal(scoreTone(60), '');
  assert.equal(scoreTone(59.9), 'lo');
  assert.equal(scoreTone(0), 'lo');
  assert.equal(scoreTone(null), '');
});

test('날짜·평가 카드 이름·표 머리 이름', () => {
  assert.equal(dateLabel('2026-10-21'), '10월 21일');
  assert.equal(dateLabel('2026-03-02'), '3월 2일');
  assert.equal(dateLabel(''), '');
  assert.equal(cardTitle({ unitNo: 2, unitName: '나눗셈', round: 1 }), '「2. 나눗셈」');
  assert.equal(cardTitle({ unitNo: 2, unitName: '나눗셈', round: 2 }), '「2. 나눗셈」 2회');
  assert.equal(cardTitle({ unitNo: 3, unitName: '' }), '「3단원」');
  assert.equal(cardTitle({ unitName: '분수' }), '「분수」');
  assert.equal(cardTitle({}), '「단원평가」');
  assert.equal(cardTitle({ unitNo: 1, unitName: '곱셈', sample: true }), '「1. 곱셈」 (예시)');
  assert.equal(colLabel({ subject: '국어', unitNo: 1, round: 1 }), '국어 1단원');
  assert.equal(colLabel({ subject: '국어', unitNo: 2, round: 2 }), '국어 2단원 2회');
  assert.equal(colLabel({ subject: '수학' }), '수학');
  assert.equal(colLabel({}), '단원평가');
});

test('흐름 선: 값 차례대로(빈칸 뺌), 0~100점을 아래~위로, 마지막 점', () => {
  const p = sparkPath([100, 0, 50], { w: 64, h: 24, pad: 3 });
  assert.equal(p.d, 'M3 3L32 21L61 12');
  assert.deepEqual([p.x, p.y], [61, 12]);
  assert.equal(sparkPath([null, 80, null]).d, 'M32 6.6');
  assert.equal(sparkPath([]), null);
  assert.equal(sparkPath([null]), null);
  const one = sparkPath([80], { w: 64, h: 24, pad: 3 });
  assert.equal(one.x, 32);
});

test('흐름 선 값: 평가를 날짜 차례로(같으면 만든 차례), 학생 줄의 칸에서', () => {
  const tests = [{ id: 'b', meta: { date: '2026-10-20' }, createdAt: 2 }, { id: 'a', meta: { date: '2026-10-01' }, createdAt: 1 }, { id: 'c', meta: { date: '2026-10-20' }, createdAt: 1 }];
  assert.deepEqual(trendValues({ cells: { a: 50, b: 70, c: null } }, tests), [50, null, 70]);
});

test('반이 약한 영역 한 줄: 가장 낮은 영역, 70% 아래면 「어려워했어요」', () => {
  assert.equal(weakAdvice([]), null);
  const w = weakAdvice([{ name: '지식', rate: 0.84 }, { name: '적용', rate: 0.58 }, { name: '이해', rate: 0.76 }]);
  assert.equal(w.low, '적용');
  assert.match(w.line, /「적용」 영역은 반 전체가 어려워했어요/);
  const ok = weakAdvice([{ name: '지식', rate: 0.92 }, { name: '이해', rate: 0.81 }]);
  assert.equal(ok.low, '이해');
  assert.match(ok.line, /「이해」 영역이 가장 낮아요\(81%\)/);
  assert.equal(rateText(0.576), '58%');
});

test('다섯 단계 줄: 계획·문항 ✓ → 채점 n/m(지금) → 결과 확인(다음) → 보충 → 생활기록부', () => {
  // 2번의 서술형 부분 점수는 AI로 묶기 전이라 틀린 까닭(결과 확인)이 안 끝남
  const t = T({ 1: [C(50, '③'), C(50, '삼각형')], 2: [C(0, '①'), C(20, '세모')] }, { extra: [{ no: 3, skip: false, status: 'idle', items: {} }, { no: 4, skip: true, status: 'idle', items: {} }] });
  const s = testSteps(t, flowSteps(t, {}));
  assert.deepEqual(s.map(x => x.id), ['plan', 'grade', 'result', 'help', 'record']);
  assert.deepEqual(s.map(x => x.label), ['계획·문항', '채점', '결과 확인', '보충', '생활기록부']);
  assert.deepEqual(s.map(x => [x.done, x.now, x.next]), [[true, false, false], [false, true, false], [false, false, true], [false, false, false], [false, false, false]]);
  assert.equal(s[0].status, '2문항');
  assert.equal(s[1].status, '2 / 3');
  assert.deepEqual(s[0].go, { to: 'step', step: 1 });
  assert.deepEqual(s[1].go, { to: 'step', step: 3 });
  assert.deepEqual(s[2].go, { to: 'step', step: 4, card: 'miss' });
  assert.deepEqual(s[4].go, { to: 'record', subject: '수학' });
  assert.equal(s[4].status, '');
  // 다음 칸은 지금 칸 뒤의 안 끝난 첫 칸(끝난 칸은 건너뜀)
  const s2 = testSteps(t, flowSteps(t, {}).map(n => (n.id === 'miss' ? { ...n, done: true } : n)));
  assert.deepEqual(s2.map(x => x.next), [false, false, false, true, false]);
});

test('다섯 단계 줄: 마친 평가는 결과 확인·보충이 지금, 예시는 보충에서 결손·기초학력을 보지 않음, 평어를 다 쓰면 모두 ✓', () => {
  const [s1] = sampleTests();
  const nodes = flowSteps(s1, {});
  const a = testSteps(s1, nodes, { pyCount: 0 });
  assert.equal(a[1].done, true);
  assert.equal(a[1].status, '6 / 6');
  const now = a.find(x => x.now);
  assert.equal(now.id, 'result');
  // 틀린 까닭·복습 문제를 모두 했다고 치면: 예시라 보충 ✓(결손·기초학력·사전사후 칸은 보지 않음) → 생활기록부가 지금
  const done = nodes.map(n => (['miss', 'redo'].includes(n.id) ? { ...n, done: true } : n));
  const b = testSteps(s1, done, { pyCount: 3 });
  assert.equal(b[3].done, true);
  assert.equal(b.find(x => x.now).id, 'record');
  assert.equal(b[4].status, '평어 3/6명');
  const c = testSteps(s1, done, { pyDone: true, pyCount: 6 });
  assert.ok(c.every(x => x.done) && !c.some(x => x.now || x.next));
});

test('보충 칸: 안 끝난 첫 마디로 감(그 마디 이름·상태), 다 끝나면 복습 문제로', () => {
  const t = T({ 1: [C(50, '③'), C(50, '삼각형')] }, { done: true });
  const nodes = flowSteps(t, {}).map(n => (n.id === 'redo' ? { ...n, done: true, status: '틀린 문항 없음' } : n.id === 'gap' ? { ...n, done: false, status: '아직' } : n));
  const h = testSteps(t, nodes).find(x => x.id === 'help');
  assert.equal(h.status, '도달하지 못한 학생 · 아직');
  assert.deepEqual(h.go, nodes.find(n => n.id === 'gap').go);
  const all = flowSteps(t, {}).map(n => ({ ...n, done: true }));
  const h2 = testSteps(t, all).find(x => x.id === 'help');
  assert.equal(h2.done, true);
  assert.deepEqual(h2.go, all.find(n => n.id === 'redo').go);
});

test('답안이 없는 새 평가: 계획·문항이 지금', () => {
  const t = newTest();
  const s = testSteps(t, flowSteps(t, {}));
  assert.equal(s[0].done, false);
  assert.equal(s[0].now, true);
  assert.equal(s[0].status, '아직');
  assert.equal(s[1].next, true);
});

test('지도 칸: 맞음 · 틀림 · 부분 점수 · 아직', () => {
  const it = { points: 10 };
  assert.equal(heatTone(it, C(10)), 'ok');
  assert.equal(heatTone(it, C(0)), 'no');
  assert.equal(heatTone(it, C(0, '')), 'no');
  assert.equal(heatTone(it, C(4)), 'part');
  assert.equal(heatTone(it, null), 'wait');
  assert.equal(heatTone({ points: 0 }, C(0)), 'ok');
});

test('확인할 칸(선생님 차례): 미룬 칸(flag·확인 전)과 검토 의견이 남은 칸 — 한눈에의 셈과 같음', () => {
  assert.equal(needsConfirm(C(0, 'x', { flag: 'low', ok: false })), true);
  assert.equal(needsConfirm(C(0, 'x', { flag: 'low', ok: true })), false);
  assert.equal(needsConfirm(C(5, 'x', { rv: { agree: false } })), true);
  assert.equal(needsConfirm(C(5, 'x', { rv: { agree: false, done: 'main' } })), false);
  assert.equal(needsConfirm(C(5, 'x', { rv: { agree: true } })), false);
  assert.equal(needsConfirm(null), false);
  const t = T({
    2: [C(0, '①', { flag: 'differ', ok: false }), C(30, '삼각', { flag: 'essay', ok: false })],
    1: [C(50, '③'), C(20, '세모', { rv: { read: '세모', points: 50, agree: false } })]
  }, { extra: [{ no: 3, skip: false, status: 'idle', items: { 1: C(0, '', { flag: 'low', ok: false }) } }, { no: 4, skip: true, status: 'done', items: { 1: C(0, '', { flag: 'low', ok: false }) } }] });
  // 학생 차례(저장된 차례) → 문항 차례, 채점하지 않았거나 「채점 안 함」 학생은 뺌
  assert.deepEqual(t.students.map(s => s.no), [1, 2, 3, 4]);
  assert.deepEqual(confirmList(t), [{ no: 1, item: 2 }, { no: 2, item: 1 }, { no: 2, item: 2 }]);
});

test('쌤비서가 찾은 것: 같은 실수 묶음을 큰 것부터 n개(번호·까닭·활동, 그 문항의 몇 번째 묶음인지)', () => {
  const view = [
    { no: 4, it: { no: 4, content: '나머지 쓰기' }, groups: [{ why: '나머지를 몫에 더함', nos: [2, 8, 14, 21], act: '나머지 확인하기', src: 'ai' }, { key: 'blank', why: '답을 쓰지 않음', nos: [5], act: '', src: 'app' }], pending: [] },
    { no: 9, it: { no: 9, content: '' }, groups: [{ key: 'a:2', why: '②를 고름', nos: [3, 6], act: '', guess: '문제 끝을 놓침', src: 'ai' }], pending: [7] }
  ];
  const g = foundGroups(view, 2);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0], { no: 4, i: 0, why: '나머지를 몫에 더함', nos: [2, 8, 14, 21], line: '나머지 확인하기', name: '나머지 쓰기' });
  assert.deepEqual(g[1], { no: 9, i: 0, why: '②를 고름', nos: [3, 6], line: '짐작: 문제 끝을 놓침', name: '9번 문항' });
  assert.equal(foundGroups(view, 3).length, 3);
  assert.deepEqual(foundGroups([], 3), []);
  // 아직 까닭으로 묶지 않은 학생(단답·서술형, AI로 묶기 전)도 한 묶음으로(그 문항, i -1)
  const raw = [{ no: 2, it: { no: 2, content: '나머지 구하기' }, groups: [], pending: [2, 3, 5] }, ...view];
  const p = foundGroups(raw, 2);
  assert.deepEqual(p[1], { no: 2, i: -1, why: '까닭을 아직 묶지 않음', nos: [2, 3, 5], line: '', name: '나머지 구하기', pending: true });
});

test('점수 단추: 고르기·단답은 맞음·틀림, 서술형은 만점·쌤비서·검토·반·0점(겹치지 않게), 쌤비서 값 표시', () => {
  const ch = pointChoices({ type: 'choice', points: 10 }, C(0, '①', { flag: 'differ' }));
  assert.deepEqual(ch, [{ pts: 10, label: '맞음', ai: false, rv: false }, { pts: 0, label: '틀림', ai: true, rv: false }]);
  const es = pointChoices({ type: 'essay', points: 15 }, C(9, '삼각형', { flag: 'essay' }));
  assert.deepEqual(es.map(x => x.pts), [15, 9, 8, 0]);
  assert.deepEqual(es.map(x => x.label), ['맞음', '부분 점수', '부분 점수', '틀림']);
  assert.deepEqual(es.filter(x => x.ai).map(x => x.pts), [9]);
  const rv = pointChoices({ type: 'essay', points: 10 }, C(10, '세모', { rv: { read: '세모', points: 4, agree: false } }));
  assert.deepEqual(rv.map(x => [x.pts, x.ai, x.rv]), [[10, true, false], [5, false, false], [4, false, true], [0, false, false]]);
});
