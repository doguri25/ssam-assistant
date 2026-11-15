// 문항·활동지 만들기 고르기 칸 상태 (스펙 2026-11-15 §3): 진도표 교과·다음 차시 기본, 단원·차시·단원 전체 고르기, 직접 쓰기(교직원 이름·전화번호는 가려 보냄), 값 확인
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { newPick, pickEvent, pickValue, pickHTML, syncSubjects } from '../../web/menus/evaluate/make-pick.js';
import { unmaskItem } from '../../web/menus/evaluate/make-scope.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; }
store.useStorage(mem());
const KINDS = [['choice', '객관식'], ['short', '단답'], ['essay', '서술형']];
const L = (unit, title, no, pages) => ({ week: null, period: '', from: '', unit, title, no, pages, memo: '' });
const el = (mp, value, checked) => ({ dataset: { mp }, value: String(value), checked: !!checked, closest: () => null });

test('진도표가 없으면 직접 쓰기: 범위가 비면 알림, 쓴 범위의 교직원 이름·전화번호는 가려 보내고 되돌림', () => {
  store.set('class:info', { grade: 4, room: 1 });
  const S = newPick({ kinds: KINDS });
  assert.equal(S.mode, 'free');
  assert.equal(S.grade, 4);
  assert.ok(pickHTML(S).includes('진도표·시수에 진도표를 넣으면'));
  assert.equal(pickValue(S).error, '단원·성취기준·범위를 써 주세요.');
  pickEvent(S, el('subject', '과학'), 'input');
  pickEvent(S, el('free', '3. 물질의 성질\n이바다 선생님 반과 같은 범위(문의 010-1234-5678)'), 'input');
  const v = pickValue(S);
  assert.equal(v.error, '');
  assert.deepEqual([v.scope.subject, v.scope.unitNo, v.scope.unitName], ['과학', 3, '물질의 성질']);
  assert.ok(!v.scope.lines.join('\n').includes('이바다') && !v.scope.lines.join('\n').includes('010-1234'), v.scope.lines.join('|'));
  const it = unmaskItem(v.scope.back, { question: `${v.scope.lines[1].slice(0, 6)} 질문`, choices: ['〔이름1〕', '보기'], points: 20 });
  assert.equal(it.choices[0], '이바다');
  assert.equal(it.points, 20);
  assert.deepEqual(unmaskItem(null, { a: 'x' }), { a: 'x' });
  pickEvent(S, el('kind', 'choice', false), 'change');
  pickEvent(S, el('kind', 'short', false), 'change');
  pickEvent(S, el('kind', 'essay', false), 'change');
  assert.equal(pickValue(S).error, '유형을 하나 넘게 골라 주세요.');
});

test('진도표 교과: 다음 차시가 기본, 단원을 바꾸면 그 단원 전체(단원평가)·첫 차시(활동지), 단원 전체 끄면 알림, 직접 쓰기는 그대로', () => {
  store.set('class:subjects', [{ id: 'm1', name: '수학', start: '', offset: 1, total: null, lessons: [
    L('1. 덧셈과 뺄셈', '세 자리 수의 덧셈', '1/2', '8~9'), L('1. 덧셈과 뺄셈', '세 자리 수의 뺄셈', '2/2', '10~11'), L('2. 평면도형', '선의 종류', '1/2', '30~31'), L('2. 평면도형', '각 알아보기', '2/2', '32~33')] }]);
  const S = newPick({ kinds: KINDS, unitAll: true });
  assert.deepEqual([S.mode, S.subId, S.picked, S.next], ['plan', 'm1', [1], 1]);
  assert.ok(pickHTML(S).includes('다음 차시'));
  assert.equal(pickEvent(S, el('unit', 1), 'change'), true);
  assert.deepEqual(S.picked, [2, 3]);
  assert.equal(pickValue(S).scope.lesson, '단원 전체');
  pickEvent(S, el('all', '', false), 'change');
  assert.equal(pickValue(S).error, '차시를 하나 넘게 골라 주세요.');
  pickEvent(S, el('lesson', 3, true), 'change');
  const v = pickValue(S);
  assert.deepEqual([v.scope.unitNo, v.scope.lesson, v.scope.titles], [2, '2/2', ['각 알아보기']]);
  assert.equal(v.count, 5);
  pickEvent(S, el('count', '40'), 'input');
  assert.equal(pickValue(S).count, 20);
  const A = newPick({ kinds: KINDS, count: { min: 1, max: 10, d: 3 } });
  pickEvent(A, el('unit', 1), 'change');
  assert.deepEqual(A.picked, [2]);
  // 직접 쓰기를 고르면 다시 그려도(진도표를 다시 읽어도) 그대로
  pickEvent(A, el('sub', '__free'), 'change');
  syncSubjects(A);
  assert.equal(A.mode, 'free');
  assert.equal(A.subject, '수학');
});
