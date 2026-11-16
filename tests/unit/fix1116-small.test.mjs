/* 2026-11-16 미뤄 둔 작은 문제: 이름 가리기가 흔한 외래어(「인터뷰」 등)를 이름으로 잘못 가림 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { maskJosaNames } from '../../web/core/privacy.js';
import { redactText } from '../../web/core/redact.js';

test('[fix1116-loanword] 성씨 글자로 시작하는 흔한 외래어 + 조사는 이름으로 가리지 않음', () => {
  for (const w of ['인터뷰', '유튜브', '마라톤', '오디션', '유니폼', '하모니', '마스크']) {
    for (const j of ['를', '가', '는', '와', '에']) {
      assert.equal(maskJosaNames(`진로 ${w}${j} 했음`).masked, 0, `${w}${j}`);
    }
  }
  const r = redactText('학부모 인터뷰를 진행함\n진로 인터뷰가 있었음');
  assert.equal(r.text, '학부모 인터뷰를 진행함\n진로 인터뷰가 있었음');
});

test('[fix1116-loanword-names] 진짜 이름 + 조사는 그대로 가림', () => {
  assert.equal(maskJosaNames('인서연과 함께').masked, 1);
  assert.equal(maskJosaNames('유하늘이 발표함').masked, 1);
  assert.equal(maskJosaNames('마민준에게 전달').masked, 1);
});

/* 2026-11-16 미뤄 둔 작은 문제: 회의록을 다시 정리할 때 AI가 할 일 문장을 바꿔 쓰면 「끝냄」 체크가 풀림 */
import { keepFields } from '../../web/menus/etc/minutes-ai.js';
const todo = (task, extra = {}) => ({ task, who: '', due: '', done: false, ...extra });

test('[fix1116-done-reworded] 문장을 조금 바꿔 쓴 같은 할 일은 끝냄 체크를 이어 감', () => {
  const prev = { todos: [todo('체육대회 계획서 작성', { who: '부장', due: '2026-11-20', done: true }), todo('학부모 안내장 발송')] };
  const next = { todos: [todo('체육대회 계획서를 작성함', { who: '부장', due: '2026-11-20' }), todo('학부모 안내장을 발송함')] };
  const k = keepFields(next, prev, []);
  assert.deepEqual(k.todos.map(t => t.done), [true, false]);
});

test('[fix1116-done-strict] 다른 할 일·숫자가 다른 할 일은 끝냄으로 잇지 않고, 끝낸 할 일 하나는 한 곳에만', () => {
  const prev = { todos: [todo('1학기 평가 결과 입력', { done: true })] };
  assert.deepEqual(keepFields({ todos: [todo('2학기 평가 결과 입력')] }, prev, []).todos.map(t => t.done), [false]);
  assert.deepEqual(keepFields({ todos: [todo('체험학습 동의서 걷기')] }, prev, []).todos.map(t => t.done), [false]);
  const plan = { todos: [todo('체육대회 계획서 작성', { who: '부장', due: '2026-11-20', done: true })] };
  assert.deepEqual(keepFields({ todos: [todo('체육대회 결과 보고서 작성', { who: '부장', due: '2026-11-20' })] }, plan, []).todos.map(t => t.done), [false]);
  const two = keepFields({ todos: [todo('1학기 평가 결과를 입력함'), todo('1학기 평가 결과 입력')] }, prev, []);
  assert.deepEqual(two.todos.map(t => t.done), [false, true]);
});
