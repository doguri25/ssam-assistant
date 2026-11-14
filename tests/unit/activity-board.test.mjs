// 활동지 한눈에(스펙 2026-11-14-eval-redesign §5)·채점 확인(§4)의 셈: 학생 카드·숫자 타일·거르기·반 전체로 보면·확인할 칸 차례
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { galleryCards, tileCounts, filterCards, topMissed, levelSplit, statsOrder, reviewQueue, needsLook, nextOpen, cardLine, FILTERS } from '../../web/menus/evaluate/activity/activity-board.js';
import { sampleActivity } from '../../web/menus/evaluate/activity/activity-sample.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; }
store.useStorage(mem());

const ITEMS = [1, 2, 3].map(no => ({ no, type: 'write', ask: `${no}번 묻는 말`, answer: '', ok: '', part: '', src: 'ai' }));
const cell = (mark, o = {}) => ({ read: '답', mark, why: '', sure: true, chk: false, ai0: mark, ...o });
const stu = (no, marks, o = {}) => ({ no, skip: false, status: 'done', level: 'ok', levelWhy: '', good: `${no}번 잘한 점`, next: `${no}번 더 해 볼 점`,
  marks: Object.fromEntries(marks.map((m, i) => [i + 1, typeof m === 'string' ? cell(m) : m])), ...o });
const act = students => ({ id: 'acX', meta: { title: '시험' }, items: ITEMS.map(it => ({ ...it })), students, confirmed: true, done: false, link: null });

test('거르기 다섯 칸: 전체 · 잘함 · 보통 · 더 도와줄 · 선생님 차례', () => {
  assert.deepEqual(FILTERS.map(f => f[1]), ['전체', '잘함', '보통', '더 도와줄', '선생님 차례']);
  assert.deepEqual(FILTERS.map(f => f[0]), ['all', 'good', 'ok', 'try', 'turn']);
});

test('학생 카드: 채점한 학생만(채점 안 함·아직 채점 전은 빼요), 번호·수준·칸 표시·확인할 칸', () => {
  const a = act([
    stu(1, ['o', 'o', 'o'], { level: 'good' }),
    stu(2, ['o', cell('x', { chk: true, why: '글씨가 흐려요' }), 'n'], { level: 'try' }),
    stu(3, ['o', 'o', 'o'], { skip: true }),
    stu(4, [], { status: 'idle', marks: {} }),
    stu(5, ['t', 'o', cell('o', { rv: { mark: 't', why: '다시 봄' } })], { level: '' })
  ]);
  const cards = galleryCards(a);
  assert.deepEqual(cards.map(c => c.no), [1, 2, 5]);
  assert.deepEqual(cards.map(c => c.level), ['good', 'try', '']);
  assert.deepEqual(cards.map(c => c.turn), [[], [2], [3]]);
  assert.deepEqual(cards[1].marks, [{ no: 1, mark: 'o', look: false }, { no: 2, mark: 'x', look: true }, { no: 3, mark: 'n', look: false }]);
});

test('카드 한 줄: 더 도와줄 학생은 더 해 볼 점, 다른 학생은 잘한 점(비었으면 서로 채움)', () => {
  assert.equal(cardLine({ level: 'good', good: '잘했어요', next: '더 해요' }), '잘했어요');
  assert.equal(cardLine({ level: 'ok', good: '', next: '더 해요' }), '더 해요');
  assert.equal(cardLine({ level: 'try', good: '잘했어요', next: '더 해요' }), '더 해요');
  assert.equal(cardLine({ level: 'try', good: '잘했어요', next: '' }), '잘했어요');
  assert.equal(cardLine({ level: '', good: '', next: '' }), '');
});

test('숫자 타일과 거르기: 수준별 수, 선생님 차례는 확인할 칸이 남은 학생 수(더 도와줄과 겹칠 수 있음)', () => {
  const a = act([
    stu(1, ['o', 'o', 'o'], { level: 'good' }),
    stu(2, ['o', cell('x', { chk: true }), 'n'], { level: 'try' }),
    stu(3, ['o', 't', 'o'], { level: 'ok' }),
    stu(4, ['x', 'x', 'x'], { level: 'try' }),
    stu(5, ['o', 'o', cell('o', { chk: true })], { level: 'good' })
  ]);
  const cards = galleryCards(a);
  assert.deepEqual(tileCounts(cards), { all: 5, good: 2, ok: 1, try: 2, turn: 2 });
  assert.deepEqual(filterCards(cards, 'all').map(c => c.no), [1, 2, 3, 4, 5]);
  assert.deepEqual(filterCards(cards, 'good').map(c => c.no), [1, 5]);
  assert.deepEqual(filterCards(cards, 'ok').map(c => c.no), [3]);
  assert.deepEqual(filterCards(cards, 'try').map(c => c.no), [2, 4]);
  assert.deepEqual(filterCards(cards, 'turn').map(c => c.no), [2, 5]);
  assert.deepEqual(filterCards(cards, '모름').map(c => c.no), [1, 2, 3, 4, 5]);
});

test('반 전체로 보면: ×·안 함이 많은 문항 먼저 2~3개(모두 ○인 문항은 빼요), 수준 나눔', () => {
  const a = sampleActivity();
  assert.deepEqual(statsOrder(a).map(r => r.it.no), [2, 4, 1, 3]);
  const top = topMissed(a);
  assert.deepEqual(top.map(r => r.it.no), [2, 4, 1]);
  assert.deepEqual([top[0].x, top[0].n, top[0].t, top[0].o], [1, 1, 0, 4]);
  assert.deepEqual(topMissed(a, 2).map(r => r.it.no), [2, 4]);
  assert.deepEqual(levelSplit(a), { good: 3, ok: 2, try: 1, none: 0 });
  const clean = act([stu(1, ['o', 'o', 'o'], { level: 'good' }), stu(2, ['o', 'o', 'o'], { level: '' })]);
  assert.deepEqual(topMissed(clean), []);
  assert.deepEqual(levelSplit(clean), { good: 1, ok: 0, try: 0, none: 1 });
});

test('확인할 칸 차례: 채점 안 함 학생 빼고 학생·문항 차례, 노란 칸(chk)과 검토 AI 의견(rv)이 남은 칸', () => {
  const a = act([
    stu(3, ['o', cell('x', { chk: true }), cell('t', { chk: true, rv: { mark: 'o', why: '' } })]),
    stu(1, [cell('o', { chk: true }), 'o', 'o'], { skip: true }),
    stu(7, [cell('', { chk: true, mark: '' }), 'o', cell('o', { rv: { mark: 'x', why: '' } })]),
    stu(9, [cell('o', { chk: false, manual: true }), 'o', 'o'])
  ]);
  assert.deepEqual(reviewQueue(a), [{ no: 3, item: 2 }, { no: 3, item: 3 }, { no: 7, item: 1 }, { no: 7, item: 3 }]);
  assert.ok(needsLook({ chk: true }) && needsLook({ rv: { mark: 'o' } }) && !needsLook({ chk: false }) && !needsLook(null));
  assert.deepEqual(reviewQueue(act([])), []);
  // 옛 활동지(marks 없음·문항 번호에 칸 없음)도 깨지지 않음
  assert.deepEqual(reviewQueue({ items: ITEMS, students: [{ no: 1, status: 'done' }] }), []);
});

test('다음 칸: 지금 칸 뒤의 아직 안 정한 칸(끝이면 앞으로 돌아감), 모두 정했으면 -1', () => {
  assert.equal(nextOpen([true, true, true], 0), 1);
  assert.equal(nextOpen([true, false, true], 0), 2);
  assert.equal(nextOpen([true, false, false], 2), 0);
  assert.equal(nextOpen([false, true, false], 1), 1);
  assert.equal(nextOpen([false, false, false], 1), -1);
  assert.equal(nextOpen([], 0), -1);
});
