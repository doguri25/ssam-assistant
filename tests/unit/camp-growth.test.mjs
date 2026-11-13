// 기초학력 사전·사후 점수(스펙 2026-11-13 §2-2): 저장 모양 정리(옛 자료는 growth 없음), 결손 찾기에서 학생 넣기(학년·반·번호, 이름 빈칸, 겹치지 않음, 사전 점수),
// 사후 자동(첫 수업 날 — 없으면 넣은 날 — 뒤 같은 교과 단원평가의 같은 영역, 가장 최근), 직접 입력이 앞섬(비우면 자동으로), 보고서 AI 줄(학생A, 이름 없음), 결과 보고서 표
import test from 'node:test';
import assert from 'node:assert/strict';
import { newTest, makeTitle } from '../../web/menus/evaluate/unit/unit-model.js';
import { gapStudents } from '../../web/menus/evaluate/unit/unit-gap.js';
import { newCamp, normCamp, normGrowth } from '../../web/menus/class/camp-model.js';
import {
  preFromGap, addGapStudents, growthSince, autoPost, applyAutoPost, setGrowth, growthChange, fmtPct, changeText, growthLines, growthRows
} from '../../web/menus/class/camp-growth.js';
import { reportPrompt } from '../../web/menus/class/camp-ai.js';
import { reportDoc } from '../../web/menus/class/camp-docs.js';

const NAMES = ['김하늘', '이바다', '한가람'];
const noNames = (s, what) => { for (const n of NAMES) assert.ok(!s.includes(n), `${what}에 「${n}」: ${s.slice(0, 300)}`); };
const C = pts => ({ read: 'x', pts, ai: pts, flag: '', why: '', ok: true, manual: false });
/* 수와 연산 100점 · 도형 100점: 점수가 곧 점수율 */
function T(id, subject, date, pts, unitNo = 3) {
  const t = newTest({ meta: { subject, grade: 3, term: 2, unitNo, unitName: '나눗셈', round: 1, date }, key: { domains: ['수와 연산', '도형'], items: [{ no: 1, content: '나눗셈하기', domain: '수와 연산', type: 'short', answer: '3', points: 100 }, { no: 2, content: '도형 찾기', domain: '도형', type: 'short', answer: '2', points: 100 }] } });
  t.id = id; t.done = true;
  t.students = Object.entries(pts).map(([no, [a, b]]) => ({ no: +no, skip: false, status: 'done', items: { 1: C(a), 2: C(b) } }));
  return t;
}
const p1 = () => T('p1', '수학', '2026-10-20', { 5: [45, 90], 11: [80, 50] });
const q0 = () => T('q0', '수학', '2026-10-30', { 5: [60, 90] }, 4); // 첫 수업 날(11/2) 앞
const q1 = () => T('q1', '수학', '2026-11-10', { 5: [70, 90], 11: [80, 55] }, 4);
const q2 = () => T('q2', '수학', '2026-11-20', { 5: [78, 90] }, 5);
const k1 = () => T('k1', '국어', '2026-11-25', { 5: [10, 10] }); // 다른 교과(영역 이름이 같아도 안 씀)
const ALL = () => [p1(), q0(), q1(), q2(), k1()];
const INFO = { grade: 3, room: 2 };
const SESS = [{ id: 's1', date: '2026-11-02', start: '14:00', end: '14:40', subject: '수학', content: '나눗셈' }, { id: 's2', date: '2026-11-04', start: '14:00', end: '14:40', subject: '수학', content: '도형' }];
/* 이바다(3-2 11번)가 먼저 있는 프로그램에 결손 찾기 5번·11번을 넣음 */
function added(f = {}) {
  const c0 = newCamp({ name: '3-2 수학 기초학력', teacher: '한가람', students: [{ id: 'b', grade: 3, cls: 2, no: 11, name: '이바다' }], sessions: SESS, ...f });
  const tests = [p1()], titles = Object.fromEntries(tests.map(t => [t.id, makeTitle(t.meta)]));
  return addGapStudents(c0, gapStudents(tests, { cut: 60 }), { grade: 3, cls: 2, date: '2026-10-21', titles });
}
const sidOf = (c, no) => c.students.find(s => s.no === no).id;

test('저장 모양: 옛 자료(growth 없음)는 {}, 모르는 학생·망가진 값은 버리고 고침', () => {
  assert.deepEqual(newCamp().growth, {});
  assert.deepEqual(normCamp({ id: 'cp1' }).growth, {});
  const c = normCamp({
    id: 'cp1', students: [{ id: 'a', no: 5 }, { id: 'b', no: 6 }, { id: 'c', no: 7 }],
    growth: {
      a: { subject: ' 수학 ', area: '수와 연산', pre: { pct: '45', tests: [{ id: 'p1', title: '평가' }, 'x'], date: '2026-10-21', source: 'auto' }, post: { pct: 78.04, source: 'manual', tests: [], date: 'x' } },
      b: { subject: '', area: '', pre: { pct: 'abc' }, post: { pct: 120 } }, // 빈 줄 → 버림
      c: 'bad', gone: { subject: '수학', pre: { pct: 50 } }
    }
  });
  assert.deepEqual(Object.keys(c.growth), ['a']);
  assert.deepEqual(c.growth.a, { subject: '수학', area: '수와 연산', pre: { pct: 45, tests: [{ id: 'p1', title: '평가' }], date: '2026-10-21', source: 'auto' }, post: { pct: 78, source: 'manual', tests: [], date: '' } });
  assert.deepEqual(normGrowth({ a: { area: '도형', post: { pct: 'x' } } }, new Set(['a'])), { a: { subject: '', area: '도형', pre: { pct: null, tests: [], date: '', source: 'manual' }, post: null } });
});

test('결손 찾기 → 학생 넣기: 학급 학년·반·번호, 이름 빈칸, 같은 학년·반·번호는 그 학생(겹치지 않음), 사전 점수(가장 낮은 영역·평가·날짜)', () => {
  const r = added();
  assert.equal(r.added, 1); assert.equal(r.existed, 1);
  const c = r.camp;
  assert.equal(c.students.length, 2);
  assert.equal(c.students[0].name, '이바다', '있던 학생 그대로');
  const s5 = c.students[1];
  assert.deepEqual({ grade: s5.grade, cls: s5.cls, no: s5.no, name: s5.name }, { grade: 3, cls: 2, no: 5, name: '' });
  assert.deepEqual(c.growth[s5.id], { subject: '수학', area: '수와 연산', pre: { pct: 45, tests: [{ id: 'p1', title: '3학년 수학 3단원 나눗셈 (1회)' }], date: '2026-10-21', source: 'auto' }, post: null });
  assert.equal(c.growth.b.area, '도형'); assert.equal(c.growth.b.pre.pct, 50);
  // 한 번 더 넣어도 학생이 늘지 않고, 이미 적은 사전 점수는 그대로
  const again = addGapStudents(c, [{ no: 5, areas: [{ name: '도형', subject: '수학', pct: 10, tests: ['q9'] }], worst: 10, n: 1 }], { grade: 3, cls: 2, date: '2026-11-01' });
  assert.equal(again.camp.students.length, 2); assert.equal(again.added, 0); assert.equal(again.existed, 1);
  assert.equal(again.camp.growth[s5.id].pre.pct, 45);
  // 저장해도(정리해도) 같은 모양
  assert.deepEqual(normCamp(c).growth, c.growth);
});

test('사전 점수: 가장 낮은 영역이 같은 점수로 여럿이면 함께(같은 교과만)', () => {
  const g = { no: 3, areas: [{ name: '도형', subject: '수학', pct: 40, tests: ['a'] }, { name: '측정', subject: '수학', pct: 40, tests: ['b'] }, { name: '읽기', subject: '국어', pct: 40, tests: ['c'] }, { name: '수와 연산', subject: '수학', pct: 55, tests: ['a'] }], worst: 40, n: 2 };
  assert.deepEqual(preFromGap(g, { titles: { a: '가 평가', b: '나 평가' }, date: '2026-10-21' }), { subject: '수학', area: '도형·측정', pre: { pct: 40, tests: [{ id: 'a', title: '가 평가' }, { id: 'b', title: '나 평가' }], date: '2026-10-21', source: 'auto' }, post: null });
});

test('사후 자동: 첫 수업 날 뒤 같은 교과·같은 영역(그 번호), 여러 개면 가장 최근 것, 다른 교과·사전 평가는 안 씀', () => {
  const c = added().camp, s5 = sidOf(c, 5);
  assert.equal(growthSince(c, c.growth[s5]), '2026-11-02');
  const r = applyAutoPost(c, ALL(), { info: INFO });
  assert.equal(r.changed, true);
  assert.deepEqual(r.camp.growth[s5].post, { pct: 78, source: 'auto', tests: [{ id: 'q2', title: '3학년 수학 5단원 나눗셈 (1회)' }], date: '2026-11-20' });
  assert.deepEqual(r.camp.growth.b.post, { pct: 55, source: 'auto', tests: [{ id: 'q1', title: '3학년 수학 4단원 나눗셈 (1회)' }], date: '2026-11-10' });
  assert.equal(applyAutoPost(r.camp, ALL(), { info: INFO }).changed, false, '다시 해도 그대로');
  // 첫 수업 날 앞 평가만 있으면 없음
  assert.equal(applyAutoPost(c, [p1(), q0()], { info: INFO }).camp.growth[s5].post, null);
  // 사후가 있던 평가를 지우면 자동 사후도 빠짐
  assert.equal(applyAutoPost(r.camp, [p1()], { info: INFO }).camp.growth[s5].post, null);
});

test('수업 날이 없으면 학생을 넣은 날 뒤부터', () => {
  const c = added({ sessions: [] }).camp, s5 = sidOf(c, 5);
  assert.equal(growthSince(c, c.growth[s5]), '2026-10-21');
  assert.deepEqual(autoPost(c.growth[s5], c.students[1], [p1(), q0()], '2026-10-21'), { pct: 60, source: 'auto', tests: [{ id: 'q0', title: '3학년 수학 4단원 나눗셈 (1회)' }], date: '2026-10-30' });
  assert.equal(autoPost(c.growth[s5], c.students[1], [p1(), q0()], ''), null, '기준 날이 없으면 없음');
});

test('직접 입력이 앞섬: 사후·사전 숫자(% 붙여도), 자동이 덮지 않음, 사후를 비우면 다시 자동', () => {
  let c = added().camp;
  const s5 = sidOf(c, 5);
  c = setGrowth(c, s5, 'post', '85', { date: '2026-11-21' });
  assert.deepEqual(c.growth[s5].post, { pct: 85, source: 'manual', tests: [], date: '2026-11-21' });
  assert.equal(applyAutoPost(c, ALL(), { info: INFO }).camp.growth[s5].post.pct, 85, '자동이 덮지 않음');
  c = setGrowth(c, s5, 'pre', '50%', { date: '2026-11-21' });
  assert.equal(c.growth[s5].pre.pct, 50); assert.equal(c.growth[s5].pre.source, 'manual');
  assert.deepEqual(c.growth[s5].pre.tests.map(t => t.id), ['p1'], '어느 평가에서 왔는지는 남김');
  assert.equal(setGrowth(c, s5, 'pre', 'abc').growth[s5].pre.pct, 50, '숫자가 아니면 그대로');
  assert.equal(setGrowth(c, s5, 'post', '120').growth[s5].post.pct, 85, '100보다 크면 그대로');
  c = setGrowth(c, s5, 'post', ' ');
  assert.equal(c.growth[s5].post, null);
  assert.equal(applyAutoPost(c, ALL(), { info: INFO }).camp.growth[s5].post.pct, 78, '비우면 다시 자동');
  // 교과·영역 글 고치기
  c = setGrowth(c, s5, 'area', '도형');
  assert.equal(applyAutoPost(c, ALL(), { info: INFO }).camp.growth[s5].post.pct, 90);
  assert.equal(setGrowth(c, s5, 'nope', 'x'), c, '모르는 칸');
});

test('직접 넣은 학생은 빈 줄에서 시작, 학급 학년·반이 같을 때만 사후 자동(다른 반 번호와 헷갈리지 않게)', () => {
  let c = newCamp({ students: [{ id: 'x', grade: 4, cls: 1, no: 5, name: '한가람' }], sessions: SESS });
  assert.deepEqual(c.growth, {});
  c = setGrowth(c, 'x', 'subject', '수학');
  c = setGrowth(c, 'x', 'area', '수와 연산');
  c = setGrowth(c, 'x', 'pre', '40', { date: '2026-11-01' });
  assert.deepEqual(c.growth.x.pre, { pct: 40, tests: [], date: '2026-11-01', source: 'manual' });
  assert.equal(applyAutoPost(c, ALL(), { info: INFO }).camp.growth.x.post, null, '다른 반');
  assert.equal(applyAutoPost(c, ALL(), { info: { grade: 4, room: 1 } }).camp.growth.x.post.pct, 78, '우리 반');
  assert.equal(setGrowth(c, 'nobody', 'pre', '40'), c, '없는 학생');
});

test('변화·글: +n점 ▲ · -n점 ▼ · 0점, 점수율 글', () => {
  assert.equal(fmtPct(45), '45%'); assert.equal(fmtPct(82.5), '82.5%'); assert.equal(fmtPct(null), '');
  assert.equal(growthChange({ pre: { pct: 45 }, post: { pct: 78 } }), 33);
  assert.equal(growthChange({ pre: { pct: 45 }, post: null }), null);
  assert.equal(growthChange({ pre: { pct: null }, post: { pct: 70 } }), null);
  assert.equal(changeText(33), '▲ +33점'); assert.equal(changeText(-5), '▼ -5점'); assert.equal(changeText(0), '0점'); assert.equal(changeText(null), '');
  assert.equal(changeText(2.5), '▲ +2.5점');
});

test('결과 보고서 AI: [사전·사후 점수] 줄(학생A, 숫자 그대로)과 지어내지 말 것 — 이름은 보내지 않음, 자료가 없으면 줄도 없음', () => {
  const c = applyAutoPost(added().camp, ALL(), { info: INFO }).camp;
  c.students[1].name = '김하늘';
  assert.deepEqual(growthLines(c), ['학생A · 수학 도형 50% → 55%(+5)', '학생B · 수학 수와 연산 45% → 78%(+33)']);
  const p = reportPrompt(c);
  noNames(p, '보고서 프롬프트');
  assert.ok(p.includes('[사전·사후 점수]\n- 학생A · 수학 도형 50% → 55%(+5)\n- 학생B · 수학 수와 연산 45% → 78%(+33)'), p);
  assert.ok(/운영 성과.*그대로/.test(p) && p.includes('지어내지'), '숫자 규칙');
  assert.ok(reportPrompt({ ...c, report: { ...c.report, kind: 'lead' } }).includes('「결과 및 결론」에'), '이끎교사는 결과 및 결론');
  // 사후가 없으면 「사후 점수 없음」
  const d = setGrowth(c, c.students[1].id, 'post', '');
  d.growth[d.students[1].id].post = null;
  assert.ok(growthLines(applyAutoPost(d, [], { info: INFO }).camp).includes('학생B · 수학 수와 연산 45% → 사후 점수 없음'));
  const plain = reportPrompt(newCamp({ students: [{ id: 'a', name: '김하늘' }] }));
  assert.ok(!plain.includes('[사전·사후 점수]') && !plain.includes('이 숫자'), '자료가 없으면 줄이 없음');
});

test('결과 보고서 문서: 끝에 「사전·사후 성취」 표(학생 | 교과·영역 | 사전 | 사후 | 변화, 이름 그대로), 자료가 없으면 없음', () => {
  let c = applyAutoPost(added().camp, ALL(), { info: INFO }).camp;
  c.report.sections = [{ head: '운영 목적', text: '- 목적' }];
  c = setGrowth(c, 'b', 'post', '40', { date: '2026-11-21' });
  const g = growthRows(c);
  assert.deepEqual(g.head, ['학생', '교과·영역', '사전', '사후', '변화']);
  assert.deepEqual(g.rows, [['이바다', '수학 도형', '50%', '40%', '▼ -10점'], ['3-2 5번', '수학 수와 연산', '45%', '78%', '▲ +33점']]);
  const d = reportDoc(c);
  const i = d.blocks.findIndex(b => b.type === 'h' && b.text === '사전·사후 성취');
  assert.ok(i > 0 && i === d.blocks.length - 2, JSON.stringify(d.blocks.map(b => b.type)));
  assert.deepEqual(d.blocks[i + 1].rows[0], g.head);
  assert.equal(d.blocks[i + 1].rows.length, 3);
  assert.equal(growthRows(newCamp()), null);
  assert.ok(!reportDoc(newCamp()).blocks.some(b => b.type === 'table'));
});
