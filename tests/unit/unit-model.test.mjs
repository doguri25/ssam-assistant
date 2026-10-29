// 단원평가 저장·통계·결과 문서 (스펙 2.3·4)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { makeHwpx } from '../../web/core/hwpx.js';
import { unzip } from '../../web/core/zip.js';
import {
  makeTitle, newTest, listTests, getTest, saveTest, removeTest, getSet, saveSet, getPyeongeo, savePyeongeo,
  numbersFor, termOf, filterTests, summaryTable, studentHistory, itemStats, domainStats, reteach, levelOf, LEVEL_NAME, feedbackOf, feedbackText
} from '../../web/menus/evaluate/unit/unit-model.js';
import { feedbackDoc, tableDoc, tableCsv } from '../../web/menus/evaluate/unit/unit-docs.js';

function mem(fail = false) {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { if (fail) throw new Error('quota'); m.set(k, String(v)); }, removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const ITEMS = [
  { no: 1, content: '글의 내용 파악하기', domain: '이해', type: 'choice', answer: '③', points: 4, criteria: '', pages: '<국어> 36쪽' },
  { no: 2, content: '낱말의 뜻 알기', domain: '지식', type: 'symbol', answer: '㉯', points: 4, criteria: '', pages: '<국어> 40쪽' },
  { no: 3, content: '생각 쓰기', domain: '이해', type: 'essay', answer: '(예) …', points: 8, criteria: '비슷하면 정답', pages: '<국어> 44쪽' }
];
const C = (pts, read = 'x') => ({ read, pts, ai: pts, flag: '', why: '', ok: true, manual: false });
const st = (no, a, b, c, extra = {}) => ({ no, skip: false, status: 'done', items: { 1: C(a, a ? '③' : '②'), 2: C(b, b ? '나' : '가'), 3: C(c) }, good: '', cheer: '', ...extra });
const META = { subject: '국어', grade: 3, term: 2, unitNo: 1, unitName: '경험과 관련지으며 이해해요', round: 1, date: '2026-10-20' };
const T = (id, extra = {}) => ({ ...newTest({ meta: { ...META, ...(extra.meta || {}) }, key: { domains: ['지식', '이해'], items: ITEMS }, paper: { text: '' } }), id, students: extra.students || [st(1, 4, 4, 8), st(2, 0, 4, 4), st(3, 4, 0, 0), { no: 4, skip: true, status: 'idle', items: {} }] });

test('제목: 학년·교과·단원·단원 이름·회차, 빈 값은 뺌', () => {
  assert.equal(makeTitle(META), '3학년 국어 1단원 경험과 관련지으며 이해해요 (1회)');
  assert.equal(makeTitle({ subject: '수학' }), '수학');
  assert.equal(makeTitle({}), '단원평가');
});

test('저장 → 목록 요약(채점한 학생 수·반 평균·만점), 지우기', () => {
  store.useStorage(mem());
  const t = T('a');
  assert.equal(t.meta.date, '2026-10-20'); assert.equal(t.done, false);
  assert.equal(saveTest(t), true);
  const s = listTests();
  assert.equal(s.length, 1);
  assert.equal(s[0].title, '3학년 국어 1단원 경험과 관련지으며 이해해요 (1회)');
  assert.equal(s[0].n, 3); assert.equal(s[0].total, 16); assert.equal(s[0].avg, 58.3);
  assert.equal(getTest('a').students.length, 4);
  saveTest(T('b', { meta: { date: '2026-10-27' } }));
  assert.deepEqual(listTests().map(x => x.id), ['b', 'a']);
  removeTest('a');
  assert.deepEqual(listTests().map(x => x.id), ['b']); assert.equal(getTest('a'), null);
});

test('저장 공간이 모자라면 false, 긴 글은 잘라서 저장', () => {
  store.useStorage(mem(true));
  assert.equal(saveTest(T('a')), false);
  store.useStorage(mem());
  const t = T('a');
  t.students[0].items[3].read = '가'.repeat(200); t.students[0].items[3].why = '나'.repeat(200); t.paper.text = '다'.repeat(20000);
  saveTest(t);
  const g = getTest('a');
  assert.equal(g.students[0].items[3].read.length, 120); assert.equal(g.students[0].items[3].why.length, 80); assert.equal(g.paper.text.length, 12000);
});

test('나누기·가리기 설정, 평어 초안 저장', () => {
  store.useStorage(mem());
  assert.deepEqual(getSet(), { pagesPer: 2, mask: [], maskAll: false, maskOn: true });
  saveSet({ pagesPer: 4, mask: [{ x: 0.7, y: 0, w: 0.3, h: 0.1 }], maskAll: true, maskOn: true });
  assert.equal(getSet().pagesPer, 4);
  assert.deepEqual(getPyeongeo('국어').cuts, { top: 95, high: 80, mid: 60 });
  assert.deepEqual(getPyeongeo('국어').off, []);
  assert.equal(makeTitle({ ...META, sample: true }), '3학년 국어 1단원 경험과 관련지으며 이해해요 (1회) (예시)');
  savePyeongeo('국어', { tests: ['a'], cuts: { top: 90, high: 80, mid: 60 }, students: { 1: { level: 'top', text: '잘함.', manual: false } } });
  assert.equal(getPyeongeo('국어').students[1].text, '잘함.');
});

test('번호 매기기·학기', () => {
  assert.deepEqual(numbersFor(4, [2]), [1, 3, 4, 5]);
  assert.deepEqual(numbersFor(3, [], 5), [5, 6, 7]);
  assert.equal(termOf('2026-09-01'), 2); assert.equal(termOf('2026-03-02'), 1); assert.equal(termOf('2027-02-10'), 2); assert.equal(termOf('2026-08-31'), 1);
  const list = [{ id: 'a', subject: '국어', date: '2026-04-01' }, { id: 'b', subject: '수학', date: '2026-10-01' }, { id: 'c', subject: '국어', date: '2026-10-02' }];
  assert.deepEqual(filterTests(list, { subject: '국어', term: 0 }).map(x => x.id), ['a', 'c']);
  assert.deepEqual(filterTests(list, { subject: '', term: 2 }).map(x => x.id), ['b', 'c']);
});

test('성적 일람표: 평가마다 100점 환산, 빈 칸 null, 평균', () => {
  const a = T('a'), b = T('b', { meta: { round: 2, date: '2026-10-27' }, students: [st(1, 4, 4, 0), st(2, 4, 4, 8)] });
  const tb = summaryTable([b, a]);
  assert.deepEqual(tb.cols.map(c => c.id), ['a', 'b']);
  assert.deepEqual(tb.rows.map(r => r.no), [1, 2, 3]);
  assert.deepEqual(tb.rows[0].cells, { a: 100, b: 50 }); assert.equal(tb.rows[0].avg, 75);
  assert.deepEqual(tb.rows[2].cells, { a: 25, b: null }); assert.equal(tb.rows[2].avg, 25);
  assert.equal(tb.colAvg.a, 58.3); assert.equal(tb.colAvg.b, 75);
});

test('학생별 누적: 평가 줄, 영역 정답률, 자주 틀린 평가 내용', () => {
  const a = T('a'), b = T('b', { meta: { round: 2, date: '2026-10-27' }, students: [st(3, 4, 0, 4)] });
  const h = studentHistory([b, a], 3);
  assert.deepEqual(h.rows.map(r => [r.id, r.score, r.total, r.pct]), [['a', 4, 16, 25], ['b', 8, 16, 50]]);
  assert.equal(h.rows[0].classAvg, 58.3);
  assert.deepEqual(h.domains, [{ name: '지식', rate: 0 }, { name: '이해', rate: 0.5 }]);
  assert.deepEqual(h.weak.map(w => [w.content, w.lost]), [['생각 쓰기', 12], ['낱말의 뜻 알기', 8]]);
});

test('반 약한 부분: 문항 정답률, 많이 쓴 오답, 다시 가르칠 것, 영역', () => {
  const a = T('a');
  const s = itemStats(a);
  assert.deepEqual(s.map(x => [x.no, Math.round(x.rate * 100)]), [[1, 67], [2, 67], [3, 50]]);
  assert.deepEqual(s[0].wrong, [{ answer: '②', count: 1 }]);
  assert.deepEqual(s[2].wrong, []);
  assert.deepEqual(reteach(a).map(x => x.no), [3]);
  assert.deepEqual(domainStats([a]).map(d => [d.name, Math.round(d.rate * 100)]), [['지식', 67], ['이해', 56]]);
});

test('수준: 기준 이상이면 그 수준', () => {
  assert.equal(levelOf(95), 'top'); assert.equal(levelOf(94.9), 'high'); assert.equal(levelOf(79.9), 'mid'); assert.equal(levelOf(59), 'low');
  assert.equal(levelOf(85, { top: 90, high: 85, mid: 70 }), 'high');
  assert.equal(LEVEL_NAME.top, '최상');
});

test('학생 피드백: 틀린 문항·부분 점수·글', () => {
  const t = T('a');
  const s = { ...st(2, 0, 4, 4), good: '낱말의 뜻을 잘 알아요.', cheer: '글을 다시 읽어 봐요.' };
  const f = feedbackOf(t, s);
  assert.equal(f.score, 8); assert.equal(f.total, 16);
  assert.deepEqual(f.wrong, [{ no: 1, content: '글의 내용 파악하기', read: '②', answer: '③', pages: '<국어> 36쪽' }]);
  assert.deepEqual(f.partial, [{ no: 3, content: '생각 쓰기', pts: 4, points: 8 }]);
  const txt = feedbackText(t, s);
  assert.ok(txt.startsWith('[3학년 국어 1단원 경험과 관련지으며 이해해요 (1회)] 2번 · 점수 8/16'), txt);
  assert.ok(txt.includes('1번 글의 내용 파악하기 (<국어> 36쪽)'));
  assert.ok(txt.includes('3번 생각 쓰기 (부분 점수 4/8, <국어> 44쪽)'));
  assert.ok(txt.includes('잘한 점: 낱말의 뜻을 잘 알아요.') && txt.includes('한마디: 글을 다시 읽어 봐요.'));
  assert.ok(feedbackText(t, st(1, 4, 4, 8)).includes('모두 맞혔어요'));
});

test('결과지: 학생마다 표, 2명마다 쪽 나누기', async () => {
  const t = T('a');
  const doc = feedbackDoc(t, t.students.slice(0, 3));
  assert.equal(doc.blocks.filter(b => b.type === 'break').length, 1);
  const sec = new TextDecoder().decode((await unzip(makeHwpx(doc))).get('Contents/section0.xml'));
  assert.ok(sec.includes('2번') && sec.includes('글의 내용 파악하기') && sec.includes('&lt;국어&gt; 36쪽'));
  assert.equal((sec.match(/pageBreak="1"/g) || []).length, 1);
});

test('일람표 문서·CSV', () => {
  const tb = summaryTable([T('a')]);
  const csv = tableCsv(tb);
  assert.ok(csv.startsWith('\uFEFF번호,3학년 국어 1단원 경험과 관련지으며 이해해요 (1회),평균'), csv.slice(0, 60));
  assert.ok(csv.includes('\n1,100,100'));
  assert.ok(csv.includes('반 평균,58.3'));
  const d = tableDoc('성적 일람표', tb);
  assert.equal(d.blocks[0].type, 'table'); assert.equal(d.blocks[0].rows[0][0], '번호');
});
