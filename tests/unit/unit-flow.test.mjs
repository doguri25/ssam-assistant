// 평가 한 바퀴 띠(스펙 2026-11-13-crop-log-flow §3): 평가·기초학력 자료 → 여섯 마디(채점 → 틀린 까닭 → 복습 문제 → 도달하지 못한 학생 → 기초학력 → 사전·사후)의
// 상태 글·✓·지금 할 차례·누르면 갈 곳. 이름·학교는 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { newTest } from '../../web/menus/evaluate/unit/unit-model.js';
import { sampleTests } from '../../web/menus/evaluate/unit/unit-sample.js';
import { mergeItem, missTargets } from '../../web/menus/evaluate/unit/unit-miss.js';
import { gapStudents } from '../../web/menus/evaluate/unit/unit-gap.js';
import { newCamp, newStudent, newSession } from '../../web/menus/class/camp-model.js';
import { addGapStudents } from '../../web/menus/class/camp-growth.js';
import { flowSteps, flowAria, FLOW } from '../../web/menus/evaluate/unit/unit-flow.js';

const C = (pts, read = 'x') => ({ read, pts, ai: pts, flag: '', why: '', ok: true, manual: false });
const ITEMS = [
  { no: 1, content: '나눗셈 하기', domain: '수와 연산', type: 'choice', answer: '③', points: 50, criteria: '', pages: '' },
  { no: 2, content: '도형 이름 쓰기', domain: '도형', type: 'short', answer: '삼각형', points: 50, criteria: '', pages: '' }
];
/* rows: { 번호: [칸마다 C(...)] } */
function T(id, meta, rows, { items = ITEMS, done = true, extra = [] } = {}) {
  const t = newTest({ meta: { subject: '수학', grade: 3, term: 2, unitNo: 3, unitName: '나눗셈', round: 1, date: '2026-10-14', ...meta }, key: { domains: [...new Set(items.map(i => i.domain))], items: items.map(i => ({ ...i })) } });
  t.id = id; t.done = done; t.createdAt = Date.parse(t.meta.date);
  t.students = [...Object.entries(rows).map(([no, cells]) => ({ no: +no, skip: false, status: 'done', items: Object.fromEntries(cells.map((c, i) => [i + 1, c])) })), ...extra];
  return t;
}
// 1번 만점, 2번 수와 연산 0점(①을 고름), 3번 둘 다 0점(①·「사각형」), 4번 빈 답
const ROWS = () => ({ 1: [C(50, '③'), C(50, '삼각형')], 2: [C(0, '①'), C(50, '삼각형')], 3: [C(0, '①'), C(0, '사각형')], 4: [C(0, ''), C(0, '')] });
const f1 = (o = {}) => T('f1', {}, ROWS(), o);
const perfect = () => T('ok', {}, { 1: [C(50, '③'), C(50, '삼각형')], 2: [C(50, '③'), C(50, '삼각형')] });
const byId = list => Object.fromEntries(list.map(n => [n.id, n]));
const st = n => [n.status, n.done];
function campWith(gaps, name = '3-2 수학 기초학력 교실') {
  let c = newCamp({ name, teacher: '한가람', subjects: ['수학'] });
  c.sessions = ['2026-10-26', '2026-10-28'].map(d => newSession({ date: d, start: '14:00', end: '14:40', subject: '수학', content: '나눗셈 다시 보기' }));
  c = addGapStudents(c, gaps, { grade: 3, cls: 2, date: '2026-10-21', titles: { f1: '3학년 수학 3단원 나눗셈 (1회)' } }).camp;
  return c;
}

test('마디 여섯 개가 차례대로, 빈 평가는 모두 「아직」이고 지금 할 차례는 채점', () => {
  assert.deepEqual(FLOW.map(([id]) => id), ['grade', 'miss', 'redo', 'gap', 'camp', 'post']);
  const f = flowSteps(newTest());
  assert.deepEqual(f.map(n => n.id), ['grade', 'miss', 'redo', 'gap', 'camp', 'post']);
  assert.deepEqual(f.map(n => n.label), ['채점', '틀린 까닭', '복습 문제', '도달하지 못한 학생', '기초학력', '사전·사후']);
  assert.ok(f.every(n => n.status === '아직' && n.done === false), JSON.stringify(f.map(st)));
  assert.deepEqual(f.filter(n => n.now).map(n => n.id), ['grade']);
  const g = byId(f);
  assert.deepEqual(g.grade.go, { to: 'step', step: 3 });
  assert.deepEqual(g.miss.go, { to: 'step', step: 4, card: 'miss' });
  assert.deepEqual(g.redo.go, { to: 'step', step: 4, card: 'redo' });
  assert.equal(g.gap.go.to, 'results'); assert.equal(g.gap.go.rv, 'gap');
  assert.equal(flowSteps(null).length, 6, '평가가 없어도 여섯 마디');
});

test('채점: 채점한 학생/채점할 학생(결석 뺌), 다 채점해도 [채점 마치기] 전이면 ✓ 없음', () => {
  const t = f1({ done: false, extra: [{ no: 5, skip: false, status: 'idle', items: {} }, { no: 6, skip: true, status: 'done', items: {} }] });
  let g = byId(flowSteps(t)).grade;
  assert.deepEqual(st(g), ['채점 4/5명', false]); assert.equal(g.now, true);
  t.students[4].status = 'done'; t.students[4].items = { 1: C(50, '③'), 2: C(50, '삼각형') };
  g = byId(flowSteps(t)).grade;
  assert.deepEqual(st(g), ['채점 5/5명 · 마치기 전', false]);
  t.done = true;
  g = byId(flowSteps(t)).grade;
  assert.deepEqual(st(g), ['채점 5/5명', true]); assert.equal(g.now, false);
  assert.equal(byId(flowSteps(t)).miss.now, true, '다음 할 차례는 틀린 까닭');
});

test('틀린 까닭: 묶음 수(앱이 묶은 것도), 묶지 않은 학생이 남으면 ✓ 없음, 다 묶으면 ✓, 다시 채점하면 「채점 바뀜」', () => {
  const t = f1();
  // 1번 문항: ①을 고름(2·3번)·답을 쓰지 않음(4번) / 2번 문항: 답을 쓰지 않음(4번) + 아직 묶지 않음(3번 「사각형」)
  assert.deepEqual(st(byId(flowSteps(t)).miss), ['묶음 3개 · 1명 남음', false]);
  const items = {};
  for (const it of missTargets(t)) items[it.no] = mergeItem(t, it, null, it.no === 2 ? { got: true, app: {}, groups: [{ why: '도형 이름을 헷갈림', nos: [3], act: '' }], rest: [] } : null);
  t.miss = { at: 1, items };
  assert.deepEqual(st(byId(flowSteps(t)).miss), ['묶음 4개', true]);
  t.students[3].items[1] = C(50, '③'); // 4번이 1번 문항을 맞힘 → 그 문항 묶음은 낡음
  assert.deepEqual(st(byId(flowSteps(t)).miss), ['묶음 4개 · 채점 바뀜', false]);
  assert.deepEqual(st(byId(flowSteps(perfect())).miss), ['틀린 학생 없음', true]);
  // 짧은 답만 틀렸으면 앱 묶음이 없어 「아직」
  const s = T('s', {}, { 1: [C(50, '③'), C(0, '사각형')] });
  assert.deepEqual(st(byId(flowSteps(s)).miss), ['아직', false]);
});

test('복습 문제: 만든 문제/틀린 학생이 있는 문항, 모두 만들면 ✓, 결과지에 넣지 않으면 「안 넣음」, 빈 물음은 셈하지 않음', () => {
  const t = f1();
  assert.deepEqual(st(byId(flowSteps(t)).redo), ['아직', false]);
  t.redo = { on: true, items: { 1: { kind: 'choice', q: '12÷3은 얼마인가요?', choices: ['2', '3', '4', '5'], answer: '③', explain: '' } } };
  assert.deepEqual(st(byId(flowSteps(t)).redo), ['복습 1/2개', false]);
  t.redo.items[2] = { kind: 'short', q: '변이 3개인 도형의 이름은?', choices: [], answer: '삼각형', explain: '' };
  assert.deepEqual(st(byId(flowSteps(t)).redo), ['복습 2개', true]);
  t.redo.on = false;
  assert.deepEqual(st(byId(flowSteps(t)).redo), ['복습 2개 · 안 넣음', true]);
  t.redo.on = true; t.redo.items[2].q = '   ';
  assert.deepEqual(st(byId(flowSteps(t)).redo), ['복습 1/2개', false]);
  assert.deepEqual(st(byId(flowSteps(perfect())).redo), ['틀린 문항 없음', true]);
  const idle = T('idle', {}, {}, { done: false, extra: [{ no: 1, skip: false, status: 'idle', items: {} }] });
  assert.deepEqual(st(byId(flowSteps(idle)).redo), ['아직', false], '채점 전');
});

test('도달하지 못한 학생: 결과 모아 보기처럼 이 평가의 교과·학기 마친 평가를 모아 셈, 기준 아래 영역에 이 평가가 든 학생만', () => {
  const t = f1();
  // 같은 교과·학기(학기는 날짜로): 8번은 측정만 낮음(이 평가와 상관없는 영역) → 이 평가의 띠에서는 셈하지 않음
  const f0 = T('f0', { term: null, date: '2026-10-07', unitNo: 2 }, { 1: [C(100)], 8: [C(20)] }, { items: [{ no: 1, content: '길이 재기', domain: '측정', type: 'short', answer: '1', points: 100, criteria: '', pages: '' }] });
  const k1 = T('k1', { subject: '국어' }, { 9: [C(0), C(0)] });          // 다른 교과
  const s1 = T('s1', { term: 1, date: '2026-04-10', unitNo: 1 }, { 10: [C(0)], 2: [C(100)] }, { items: [{ ...ITEMS[0], points: 100 }] }); // 다른 학기
  const nd = T('nd', {}, { 11: [C(0), C(0)] }, { done: false });          // 채점을 마치지 않음
  const tests = [f0, k1, s1, nd, { ...t, done: false }];                  // 저장한 옛 모습(마치기 전)보다 지금 평가가 앞섬
  assert.deepEqual(gapStudents([t, f0]).map(g => g.no), [2, 3, 4, 8], '결과 모아 보기 목록');
  const g = byId(flowSteps(t, { tests })).gap;
  assert.deepEqual(st(g), ['3명', true]);
  assert.deepEqual(g.go, { to: 'results', rv: 'gap', subject: '수학', term: 2, nos: [2, 3, 4] });
  // 채점을 마치기 전에는 결과 모아 보기에 없으므로 「아직」
  assert.deepEqual(st(byId(flowSteps(f1({ done: false }), { tests })).gap), ['아직', false]);
  // 기준(단원평가 설정의 gapCut): 5번 도형 50%는 60% 아래, 40%면 아님
  const t5 = T('f1', {}, { ...ROWS(), 5: [C(50, '③'), C(25, '삼각')] });
  assert.equal(byId(flowSteps(t5, { tests })).gap.status, '4명');
  assert.equal(byId(flowSteps(t5, { tests, cut: 40 })).gap.status, '3명');
  // 학기를 모르면 날짜로(방학을 모르면 3~8월 1학기)
  const spring = T('sp', { term: null, date: '2026-05-12' }, ROWS());
  assert.equal(byId(flowSteps(spring, { tests: [s1] })).gap.go.term, 1);
  // 1학기 s1과 모아 셈: 2번은 수와 연산 (0+100)/150로 기준을 넘고, s1에서만 낮은 10번은 이 평가의 띠에서 셈하지 않음
  assert.equal(byId(flowSteps(spring, { tests: [s1] })).gap.status, '2명');
  assert.deepEqual(st(byId(flowSteps(perfect(), { tests })).gap), ['없어요', true]);
});

test('기초학력·사전·사후: 사전 점수에 이 평가가 든 학생 수, 그중 사후가 있는 학생(뒤 평가로 자동 — 저장한 자료는 그대로), 많이 든 프로그램으로', () => {
  const t = f1();
  const camp = campWith(gapStudents([t]).filter(g => [2, 3].includes(g.no)));
  const other = newCamp({ name: '다른 프로그램' });
  other.students = [newStudent({ grade: 3, cls: 2, no: 4, name: '김하늘' })]; // 사전 점수 없음 — 셈하지 않음
  let f = byId(flowSteps(t, { tests: [t], camps: [other, camp] }));
  assert.deepEqual(st(f.camp), ['2명 넣음', true]);
  assert.deepEqual(f.camp.go, { to: 'camp', section: 'info', camp: camp.id });
  assert.deepEqual(st(f.post), ['사후 0/2명', false]);
  assert.deepEqual(f.post.go, { to: 'camp', section: 'report', camp: camp.id, card: 'growth' });
  // 첫 수업 날(10/26) 뒤 같은 교과 평가 → 2번 사후 자동(3번은 그 평가에 없음)
  const q1 = T('q1', { unitNo: 4, date: '2026-11-02' }, { 2: [C(40), C(50)] });
  f = byId(flowSteps(t, { tests: [t, q1], camps: [other, camp] }));
  assert.deepEqual(st(f.post), ['사후 1/2명', false]);
  assert.ok(Object.values(camp.growth).every(e => e.post === null), '저장한 자료는 바꾸지 않음');
  // 직접 넣은 사후
  const s3 = camp.students.find(s => s.no === 3);
  camp.growth[s3.id].post = { pct: 70, source: 'manual', tests: [], date: '2026-11-03' };
  f = byId(flowSteps(t, { tests: [t, q1], camps: [other, camp] }));
  assert.deepEqual(st(f.post), ['사후 2/2명', true]);
  // 두 프로그램에 든 같은 번호는 한 번, 갈 곳은 더 많이 든 프로그램(같으면 지금 프로그램)
  const two = campWith(gapStudents([t]).filter(g => g.no === 2), '2학기 방과후 교실');
  f = byId(flowSteps(t, { tests: [t], camps: [two, camp] }));
  assert.equal(f.camp.status, '2명 넣음'); assert.equal(f.camp.go.camp, camp.id);
  const solo = campWith(gapStudents([t]).filter(g => g.no === 3), '3번 교실');
  assert.equal(byId(flowSteps(t, { tests: [t], camps: [two, solo] })).camp.go.camp, two.id, '같으면 앞 프로그램');
  assert.equal(byId(flowSteps(t, { tests: [t], camps: [two, solo], current: solo.id })).camp.go.camp, solo.id, '같으면 지금 프로그램');
});

test('기초학력에 아무도 넣지 않았으면: 넣을 학생이 있으면 「아직」(누르면 도달하지 못한 학생 목록), 없으면 ✓', () => {
  const t = f1();
  const f = byId(flowSteps(t, { tests: [t], camps: [] }));
  assert.deepEqual(st(f.camp), ['아직', false]); assert.deepEqual(st(f.post), ['아직', false]);
  assert.deepEqual(f.camp.go, f.gap.go, '기초학력에 넣는 곳(결과 모아 보기 「도달하지 못한 학생」)으로');
  assert.deepEqual(f.post.go, f.gap.go);
  const all = flowSteps(perfect(), { tests: [], camps: [] }), p = byId(all);
  assert.deepEqual(st(p.camp), ['넣을 학생 없음', true]); assert.deepEqual(st(p.post), ['없어요', true]);
  assert.deepEqual(p.camp.go, { to: 'camp', section: 'info', camp: '' });
  assert.ok(all.every(n => n.done) && !all.some(n => n.now), '모두 다 되면 지금 할 차례 없음');
});

test('예시 평가: 채점·틀린 까닭·복습 문제는 그대로, 결손·사전·사후 셈에서는 빼요(결과 모아 보기와 같이)', () => {
  const [s] = sampleTests();
  const camp = campWith(gapStudents([{ ...s, meta: { ...s.meta, sample: false } }]));
  const f = byId(flowSteps(s, { tests: sampleTests(), camps: [camp] }));
  assert.deepEqual(st(f.grade), ['채점 6/6명', true]);
  assert.ok(/^묶음 \d+개/.test(f.miss.status), f.miss.status);
  assert.equal(f.redo.status, '아직');
  for (const k of ['gap', 'camp', 'post']) assert.deepEqual(st(f[k]), ['예시는 빼요', false], k);
  assert.equal(f.gap.go.subject, '국어'); assert.equal(f.gap.go.term, 2);
});

test('읽어 주는 글: 마디 이름·상태·다 됨·지금 할 차례(색이 아니라 글로)', () => {
  assert.equal(flowAria({ label: '채점', status: '채점 4/5명', done: false, now: true }), '채점, 채점 4/5명, 지금 할 차례');
  assert.equal(flowAria({ label: '틀린 까닭', status: '묶음 4개', done: true, now: false }), '틀린 까닭, 묶음 4개, 다 됨');
  assert.equal(flowAria({ label: '기초학력', status: '아직', done: false, now: false }), '기초학력, 아직');
});
