// 문항·활동지 만들기의 범위 (스펙 2026-11-15 §3): 진도표 단원 묶기·기본 차시·범위 줄·평가 정보, 유형 나누기, 문항 수 범위
import test from 'node:test';
import assert from 'node:assert/strict';
import { unitsOf, defaultPick, parseUnit, lessonNo, scopeOf, freeScope, spread, clampInt, LEVELS, levelLine } from '../../web/menus/evaluate/make-scope.js';

const L = (unit, title, no = '', pages = '') => ({ unit, title, no, pages, week: null, period: '', from: '', memo: '' });
const SCI = { id: 's1', name: '과학', lessons: [
  L('1. 과학자처럼 탐구해 볼까요', '탐구 문제 정하기', '1/2', '8~9'), L('1. 과학자처럼 탐구해 볼까요', '실험하기', '2/2', '10~11'),
  L('2. 동물의 생활', '동물 분류하기', '', '30~31쪽'), L('2. 동물의 생활', '땅에 사는 동물', '', '32~33쪽'), L('2. 동물의 생활', '물에 사는 동물', '', '34~35쪽')
] };

test('단원 묶기: 단원 이름이 같은 차시를 처음 나온 차례로', () => {
  assert.deepEqual(unitsOf(SCI), [{ name: '1. 과학자처럼 탐구해 볼까요', idx: [0, 1] }, { name: '2. 동물의 생활', idx: [2, 3, 4] }]);
  assert.deepEqual(unitsOf({ lessons: [] }), []);
});

test('기본 차시: 진도표의 다음 차시, 다 했으면 마지막 단원 첫 차시, 모르면 지금(예상) 차시의 단원 첫 차시', () => {
  assert.deepEqual(defaultPick(SCI, { next: 3 }), [3]);
  assert.deepEqual(defaultPick(SCI, { next: 5 }), [2]);
  assert.deepEqual(defaultPick(SCI, { next: null, expected: 4 }), [2]);
  assert.deepEqual(defaultPick(SCI, {}), [0]);
  assert.deepEqual(defaultPick({ lessons: [] }, { next: 0 }), []);
});

test('단원 이름 읽기: 「3. 동물의 생활」·「3단원 …」·번호 없음', () => {
  assert.deepEqual(parseUnit('3. 동물의 생활'), { unitNo: 3, unitName: '동물의 생활' });
  assert.deepEqual(parseUnit('4단원 각도'), { unitNo: 4, unitName: '각도' });
  assert.deepEqual(parseUnit('(2) 소리의 성질'), { unitNo: 2, unitName: '소리의 성질' });
  assert.deepEqual(parseUnit('우리 고장'), { unitNo: null, unitName: '우리 고장' });
  assert.deepEqual(parseUnit(''), { unitNo: null, unitName: '' });
});

test('차시 번호: 진도표의 「5/14」, 없으면 단원 안 차례', () => {
  assert.equal(lessonNo(SCI, 1), '2/2');
  assert.equal(lessonNo(SCI, 3), '2/3');
});

test('범위: 고른 차시 줄·단원·차시 이름·쪽, 단원을 다 고르면 「단원 전체」', () => {
  const s = scopeOf(SCI, [3, 2]);
  assert.equal(s.subject, '과학');
  assert.deepEqual([s.unitNo, s.unitName, s.unit], [2, '동물의 생활', '2. 동물의 생활']);
  assert.equal(s.lesson, '1/3, 2/3');
  assert.equal(s.pages, '30~31쪽, 32~33쪽');
  assert.deepEqual(s.lines, ['2. 동물의 생활 · 1/3차시 동물 분류하기 (교과서 30~31쪽)', '2. 동물의 생활 · 2/3차시 땅에 사는 동물 (교과서 32~33쪽)']);
  assert.equal(scopeOf(SCI, [2, 3, 4]).lesson, '단원 전체');
  assert.equal(scopeOf(SCI, [0]).lines[0], '1. 과학자처럼 탐구해 볼까요 · 1/2차시 탐구 문제 정하기 (교과서 8~9쪽)');
  // 두 단원에 걸치면 단원 번호 없이 이름을 이음
  const two = scopeOf(SCI, [1, 2]);
  assert.deepEqual([two.unitNo, two.unitName], [null, '과학자처럼 탐구해 볼까요 · 동물의 생활']);
});

test('직접 쓴 범위: 줄마다, 첫 줄이 「3. 단원」 꼴이면 단원 번호·이름', () => {
  const f = freeScope('사회', '2. 우리 고장의 모습\n- 고장의 위치 알기\n\n');
  assert.deepEqual([f.subject, f.unitNo, f.unitName], ['사회', 2, '우리 고장의 모습']);
  assert.deepEqual(f.lines, ['2. 우리 고장의 모습', '- 고장의 위치 알기']);
  assert.deepEqual([freeScope('국어', '감각적 표현을 살려 시 쓰기').unitNo, freeScope('국어', '감각적 표현을 살려 시 쓰기').unitName], [null, '']);
});

test('나누기: 비율대로, 고른 유형은 적어도 하나, 합은 문항 수', () => {
  const w = { choice: 3, short: 1, essay: 1 };
  assert.deepEqual(spread(5, ['choice', 'short', 'essay'], w), { choice: 3, short: 1, essay: 1 });
  assert.deepEqual(spread(3, ['choice', 'short', 'essay'], w), { choice: 1, short: 1, essay: 1 });
  assert.deepEqual(spread(10, ['choice', 'short', 'essay'], w), { choice: 6, short: 2, essay: 2 });
  assert.deepEqual(spread(4, ['choice', 'essay'], w), { choice: 3, essay: 1 });
  assert.deepEqual(spread(5, ['essay'], w), { essay: 5 });
  const s = spread(20, ['choice', 'short', 'essay'], w);
  assert.equal(s.choice + s.short + s.essay, 20);
});

test('문항 수 범위·수준 글', () => {
  assert.equal(clampInt('30', 3, 20, 5), 20);
  assert.equal(clampInt('1', 3, 20, 5), 3);
  assert.equal(clampInt('', 3, 20, 5), 5);
  assert.equal(clampInt('7.6', 3, 20, 5), 8);
  assert.deepEqual(LEVELS.map(l => l[1]), ['기본', '보통', '도전']);
  assert.ok(levelLine('hard').startsWith('도전'));
  assert.ok(levelLine('zzz').startsWith('보통'));
});
