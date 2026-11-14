// 버그 사냥 11.14 — 생활기록부 글 쓰기 틀(record-model): 한 문장 근거 글을 여러 문장으로 고친 뒤의 문장 줄
import test from 'node:test';
import assert from 'node:assert/strict';
import { sentenceRows, removeSentence, replaceSentence } from '../../web/menus/evaluate/record/record-model.js';

const L = [{ id: 'e1', kind: 'unit', label: '곱셈하기 100%' }];
const S1 = '곱셈하기를 정확하게 해냄.';
const EV1 = { list: L, sentences: [{ t: S1, src: ['e1'] }] };

test('한 문장 근거 글을 손으로 여러 문장으로 고치면: 문장마다 나눠 보이고(근거는 모름), 문장 빼기는 그 문장만 뺌', () => {
  const t = `${S1} 방과 후 학원에서 배운 방법으로 설명함.`;
  const r = sentenceRows(t, EV1);
  assert.equal(r.rows.length, 2, JSON.stringify(r.rows.map(x => x.t)));
  assert.equal(r.edited, true);
  assert.equal(r.known, false);
  assert.deepEqual(r.rows.map(x => x.bad), [false, true]);
  const o = removeSentence(t, EV1, 1);
  assert.equal(o.t, S1, '빼면 앞 문장은 남음');
  const o2 = replaceSentence(t, EV1, 1, { t: '수업 시간에 배운 방법으로 설명함.', src: [] });
  assert.equal(o2.t, `${S1} 수업 시간에 배운 방법으로 설명함.`);
});

test('한 문장 근거 글을 한 문장으로 고치면(끝맺음·낱말) 그대로 그 근거에 맞춤', () => {
  const r = sentenceRows('곱셈하기를 빠르고 정확하게 해냄.', EV1);
  assert.equal(r.known, true);
  assert.equal(r.edited, true);
  assert.deepEqual(r.rows.map(x => x.src), [['e1']]);
});

test('AI가 한 칸에 두 문장을 담아 온 글(고치지 않음)은 그대로 한 줄', () => {
  const t = `${S1} 곱셈의 뜻을 그림으로 나타냄.`;
  const r = sentenceRows(t, { list: L, sentences: [{ t, src: ['e1'] }] });
  assert.equal(r.known, true);
  assert.equal(r.edited, false);
  assert.equal(r.rows.length, 1);
});
