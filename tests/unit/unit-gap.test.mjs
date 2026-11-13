// 학습 결손 찾기(스펙 2026-11-13 §2-1): 학생 번호마다 영역(문항 domain)별 점수율, 기준(기본 60%) 아래 영역이 있는 학생만,
// 영역이 없는 평가는 평가 이름(회차 뺌) 한 영역, 결석·채점 안 한 학생은 뺌, 기준 칸 40~90, 영역 하나 점수율(사후 점수에 씀)
import test from 'node:test';
import assert from 'node:assert/strict';
import { newTest } from '../../web/menus/evaluate/unit/unit-model.js';
import { gapStudents, areaPct, areaTitle, normCut, GAP_CUT } from '../../web/menus/evaluate/unit/unit-gap.js';

const C = pts => ({ read: 'x', pts, ai: pts, flag: '', why: '', ok: true, manual: false });
/* pts: { 번호: [문항마다 점수] }, extra: 결석·채점 안 한 학생 */
function T(id, meta, items, pts, extra = []) {
  const t = newTest({ meta: { grade: 3, term: 2, round: 1, ...meta }, key: { domains: [], items: items.map(([no, domain, points]) => ({ no, content: `${no}번 내용`, domain, type: 'short', answer: '1', points, criteria: '', pages: '' })) } });
  t.id = id; t.done = true;
  t.students = [...Object.entries(pts).map(([no, a]) => ({ no: +no, skip: false, status: 'done', items: Object.fromEntries(a.map((p, i) => [i + 1, C(p)])) })), ...extra];
  return t;
}
const MATH = [[1, '수와 연산', 25], [2, '수와 연산', 25], [3, '도형', 25], [4, '도형', 25]];
const t1 = () => T('t1', { subject: '수학', unitNo: 3, unitName: '나눗셈', date: '2026-09-10' }, MATH,
  { 1: [25, 25, 25, 25], 2: [25, 0, 25, 0], 3: [0, 0, 25, 25] },
  [{ no: 4, skip: true, status: 'done', items: { 1: C(0) } }, { no: 5, skip: false, status: 'idle', items: { 1: C(0) } }]);
const t2 = () => T('t2', { subject: '수학', unitNo: 4, unitName: '곱셈', date: '2026-09-24' }, MATH, { 2: [25, 25, 0, 0], 3: [25, 0, 25, 25] });
// 영역이 없는 평가: 평가 총점이 한 영역
const t3 = () => T('t3', { subject: '수학', unitNo: 5, unitName: '분수', date: '2026-10-01' }, [[1, '', 50], [2, '', 50]], { 1: [50, 0], 2: [50, 50] });

test('기준 칸: 기본 60, 40~90 안으로, 숫자가 아니면 60', () => {
  assert.equal(GAP_CUT, 60);
  assert.equal(normCut(), 60); assert.equal(normCut(''), 60); assert.equal(normCut('x'), 60);
  assert.equal(normCut('70'), 70); assert.equal(normCut(72.4), 72);
  assert.equal(normCut(95), 90); assert.equal(normCut(10), 40);
});

test('영역별 점수율은 평가를 모아 셈: 기준 아래 영역만 낮은 차례로, 평가 수, 다 넘은 학생은 없음', () => {
  const g = gapStudents([t1(), t2()], { cut: 60 });
  assert.deepEqual(g.map(x => x.no), [2, 3], '1번은 모두 100%');
  const [s2, s3] = g;
  // 2번: 수와 연산 (25+50)/100=75% · 도형 (25+0)/100=25%
  assert.deepEqual(s2.areas, [{ name: '도형', subject: '수학', pct: 25, tests: ['t1', 't2'] }]);
  assert.equal(s2.worst, 25); assert.equal(s2.n, 2);
  // 3번: 수와 연산 (0+25)/100=25%
  assert.deepEqual(s3.areas.map(a => [a.name, a.pct]), [['수와 연산', 25]]);
  assert.equal(s3.n, 2);
});

test('결석(채점 안 함)·아직 채점 안 한 학생은 뺌', () => {
  const g = gapStudents([t1()], { cut: 90 });
  assert.deepEqual(g.map(x => x.no), [2, 3]);
  assert.ok(!g.some(x => x.no === 4 || x.no === 5));
});

test('기준을 바꾸면 그 아래만: 40이면 25%만, 90이면 낮은 차례로 여러 영역', () => {
  assert.deepEqual(gapStudents([t1(), t2()], { cut: 40 }).map(x => [x.no, x.areas.map(a => a.pct)]), [[2, [25]], [3, [25]]]);
  const hi = gapStudents([t1(), t2()], { cut: 90 });
  assert.deepEqual(hi.find(x => x.no === 2).areas.map(a => [a.name, a.pct]), [['도형', 25], ['수와 연산', 75]]);
  assert.equal(gapStudents([t1(), t2()]).length, 2, '기준이 없으면 60');
  assert.equal(gapStudents([t1(), t2()], { cut: 'x' }).length, 2);
});

test('영역이 없는 평가는 평가 이름(회차 뺌) 한 영역으로 셈', () => {
  assert.equal(areaTitle({ subject: '수학', grade: 3, unitNo: 5, unitName: '분수', round: 2, sample: true }), '3학년 수학 5단원 분수');
  const g = gapStudents([t3()], { cut: 60 });
  assert.deepEqual(g, [{ no: 1, areas: [{ name: '3학년 수학 5단원 분수', subject: '수학', pct: 50, tests: ['t3'], byTitle: true }], worst: 50, n: 1 }]);
  // 같은 단원 다른 회차는 한 영역으로 모임
  const r2 = T('t3b', { subject: '수학', unitNo: 5, unitName: '분수', round: 2, date: '2026-10-08' }, [[1, '', 50], [2, '', 50]], { 1: [50, 50] });
  const g2 = gapStudents([t3(), r2], { cut: 80 });
  assert.deepEqual(g2[0].areas.map(a => [a.name, a.pct, a.tests]), [['3학년 수학 5단원 분수', 75, ['t3', 't3b']]]);
});

test('교과가 다르면 같은 이름 영역도 따로, 줄은 번호 차례', () => {
  const ko = T('k1', { subject: '국어', unitNo: 1, unitName: '읽기', date: '2026-09-12' }, [[1, '이해', 50], [2, '지식', 50]], { 2: [20, 50], 1: [50, 50] });
  const ma = T('m1', { subject: '수학', unitNo: 1, unitName: '덧셈', date: '2026-09-13' }, [[1, '이해', 50], [2, '계산', 50]], { 2: [50, 50] });
  const g = gapStudents([ma, ko], { cut: 60 });
  assert.deepEqual(g.map(x => x.no), [2]);
  assert.deepEqual(g[0].areas, [{ name: '이해', subject: '국어', pct: 40, tests: ['k1'] }]);
  assert.equal(g[0].n, 2);
});

test('빈 목록·망가진 평가는 건너뜀', () => {
  assert.deepEqual(gapStudents([], { cut: 60 }), []);
  assert.deepEqual(gapStudents([null, { id: 'x' }, { id: 'y', key: { items: [] }, students: [] }]), []);
});

test('영역 하나 점수율(사후 점수): 영역·여러 영역(·)·평가 이름, 없으면 null', () => {
  const t = t2();
  assert.equal(areaPct(t, 2, '도형'), 0);
  assert.equal(areaPct(t, 3, '수와 연산'), 50);
  assert.equal(areaPct(t, 3, ' 수와연산 '), 50, '띄어쓰기는 보지 않음');
  assert.equal(areaPct(t, 2, '수와 연산·도형'), 50, '두 영역을 합쳐 셈');
  assert.equal(areaPct(t, 2, '측정'), null, '그 영역 문항이 없음');
  assert.equal(areaPct(t, 9, '도형'), null, '그 번호 학생이 없음');
  assert.equal(areaPct(t, 2, ''), null);
  assert.equal(areaPct(t3(), 1, '3학년 수학 5단원 분수'), 50, '영역이 없는 평가는 평가 이름으로');
  assert.equal(areaPct(t3(), 1, '도형'), null);
  assert.equal(areaPct(t1(), 4, '도형'), null, '채점 안 함 학생');
});

test('검토 고침: 기준은 반올림 전 점수율로 — 119/200(59.5%)은 60% 아래로 찾음(60%로 보이지 않게 소수 한 자리)', () => {
  const t = T('r1', { subject: '수학', unitNo: 3, unitName: '나눗셈', date: '2026-09-10' }, [[1, '수와 연산', 100], [2, '수와 연산', 100]], { 1: [100, 19] });
  const g = gapStudents([t], { cut: 60 });
  assert.equal(g.length, 1, '59.5%는 60% 아래');
  assert.ok(g[0].areas[0].pct < 60, '보이는 점수율도 60 아래: ' + g[0].areas[0].pct);
});

test('검토 고침: 예시(「예시로 채우기」) 평가는 셈에서 뺌', () => {
  const s = T('s1', { subject: '국어', unitNo: 1, unitName: '시', date: '2026-10-20', sample: true }, [[1, '이해', 100]], { 1: [10] });
  assert.equal(gapStudents([s], { cut: 60 }).length, 0);
  assert.equal(areaPct(s, 1, '이해'), null, '사후 점수로도 쓰지 않음');
});

test('검토 고침: 영역 이름에 「/」「,」가 있어도 그 영역 하나로 맞춤(나누는 것은 「·」만)', () => {
  const t = T('d1', { subject: '수학', unitNo: 3, unitName: '자료', date: '2026-09-10' }, [[1, '자료/가능성', 50], [2, '도형', 50]], { 1: [10, 50] });
  assert.equal(areaPct(t, 1, '자료/가능성'), 20);
  assert.equal(areaPct(t, 1, '자료/가능성·도형'), 60);
});
