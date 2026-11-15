// 2026-11-15 새 눈 검토 고침 — 문항·활동지 만들기: 소수·날짜 보기, 숫자 보기 정답, [이 문항 다시 만들기] 이름 가리기,
// 1단계에서 정답표 문항을 뺀 뒤 다시 내려받는 문제지·정답지, 만든 활동지 다시 내려받기. 이름은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { choiceAnswer, normMade, redoPrompt, testFrom, madeItems, paperDoc, keyItems } from '../../web/menus/evaluate/unit/unit-make.js';
import { redoTaskPrompt, activityFrom, madeTasks, sheetDoc } from '../../web/menus/evaluate/activity/activity-make.js';
import { newPick, pickEvent, pickValue } from '../../web/menus/evaluate/make-pick.js';
import { maskList, unmaskItem } from '../../web/menus/evaluate/make-scope.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; }
store.useStorage(mem());
const KINDS = [['choice', '객관식'], ['short', '단답'], ['essay', '서술형']];
const el = (mp, value) => ({ dataset: { mp }, value: String(value), checked: false, closest: () => null });
const docText = d => JSON.stringify(d.blocks);

test('[rv-mk-decimal] 소수·날짜로 시작하는 보기는 번호 표시로 보고 지우지 않음, 정답도 맞는 보기', () => {
  assert.equal(choiceAnswer('1.5', ['0.5', '1.5', '2.5', '3.5']), '②');
  const [a] = normMade({ items: [{ type: 'choice', question: '알맞은 들이는?', choices: ['1.2 L', '2.5 L', '10.3 L', '3 L'], answer: '10.3 L' }] });
  assert.deepEqual(a.choices, ['1.2 L', '2.5 L', '10.3 L', '3 L']);
  assert.equal(a.answer, '③');
  const [b] = normMade({ items: [{ type: 'choice', question: '민주화 운동은?', choices: ['3.1 운동', '4.19 혁명', '5.18 민주화 운동', '6.25 전쟁'], answer: '5.18 민주화 운동' }] });
  assert.deepEqual(b.choices, ['3.1 운동', '4.19 혁명', '5.18 민주화 운동', '6.25 전쟁']);
  assert.equal(b.answer, '③');
  // 번호 표시는 그대로 지움
  const [c] = normMade({ items: [{ type: 'choice', question: '과일은?', choices: ['1. 사과', '2) 배', '③ 감', '(4) 귤'], answer: '2' }] });
  assert.deepEqual(c.choices, ['사과', '배', '감', '귤']);
  assert.equal(c.answer, '②');
});

test('[rv-mk-numeric] 보기가 숫자일 때 맨 숫자 정답이 다른 자리의 보기 글과 같으면 정답을 비워 선생님이 고르게', () => {
  assert.equal(choiceAnswer('4', ['3', '4', '5', '6']), '');
  assert.equal(choiceAnswer('2', ['1', '2', '3', '4']), '②');
  assert.equal(choiceAnswer('③', ['3', '4', '5', '6']), '③');
  assert.equal(choiceAnswer('2', ['사과', '배', '감', '귤']), '②');
  assert.equal(choiceAnswer('2번', ['10', '20', '30', '40']), '②');
});

test('[rv-mk-redo-mask] [이 문항 다시 만들기]에 보내는 물음의 교직원·학생 이름은 가리고, 돌아온 문항에서 되돌림', () => {
  store.set('class:info', { grade: 4, room: 1 });
  const S = newPick({ kinds: KINDS });
  pickEvent(S, el('subject', '사회'), 'input');
  pickEvent(S, el('free', '2. 우리 지역의 기관\n한가람 교장 선생님 면담(문의 010-1234-5678)'), 'input');
  const v = pickValue(S);
  assert.equal(v.error, '');
  assert.equal(typeof v.scope.mask, 'function');
  // 처음 만든 문항이 이름을 되돌려 받아 들고 있음 + 선생님이 학생 이름을 넣어 고친 물음
  const items = [
    { no: 1, type: 'short', question: '한가람 교장 선생님이 하시는 일은?' },
    { no: 2, type: 'short', question: '김하늘이 모은 붙임딱지는 몇 장인가요?' },
    { no: 3, type: 'short', question: '우리 지역의 기관을 하나 쓰세요.' }
  ];
  const p = redoPrompt({ scope: v.scope, items: maskList(v.scope, items, ['question']), no: 1 });
  assert.ok(!/한가람|김하늘|010-1234/.test(p), p);
  assert.match(p, /우리 지역의 기관을 하나 쓰세요/);
  const tok = (p.match(/〔이름\d+〕/g) || [])[0];
  assert.ok(tok, p);
  assert.ok(/한가람|김하늘/.test(unmaskItem(v.scope.back, { question: `${tok} 질문` }).question));
  const tasks = [{ no: 1, kind: 'write', ask: '이바다 선생님께 여쭌 것을 쓰세요.' }, { no: 2, kind: 'write', ask: '김하늘이 그린 지도를 보고 쓰세요.' }];
  const q = redoTaskPrompt({ scope: v.scope, tasks: maskList(v.scope, tasks, ['ask']), no: 2 });
  assert.ok(!/이바다|김하늘/.test(q), q);
  // 진도표 범위(plan)에도 가리기가 붙음
  assert.equal(typeof maskList, 'function');
  assert.deepEqual(maskList(null, items, ['question']), items);
});

test('[rv-mk-made-del] 1단계에서 정답표 3번을 뺀 뒤 다시 내려받는 문제지·정답지: 뺀 문항은 없고, 번호·정답·합계가 정답표와 같음', () => {
  const items = [1, 2, 3, 4, 5].map(no => ({ no, type: 'choice', question: `${no}번 물음`, choices: ['가', '나', '다', '라'], answer: '①②③④①'[no - 1], points: 20 }));
  const t = testFrom({ meta: { subject: '수학' }, items });
  t.key.items = t.key.items.filter(k => k.no !== 3);  // 1단계 ✕ (번호는 다시 매기지 않음)
  const m = madeItems(t);
  assert.deepEqual(m.map(x => x.no), [1, 2, 4, 5]);
  assert.deepEqual(m.map(x => x.answer), ['①', '②', '④', '①']);
  const paper = docText(paperDoc(t.meta, m));
  assert.ok(!paper.includes('3번 물음'), paper);
  assert.ok(paper.includes('4문항 · 80점'), paper);
  assert.deepEqual(keyItems(m).map(k => k.no), [1, 2, 4, 5]);
  // 만든 그대로면 100점
  assert.ok(docText(paperDoc({}, items)).includes('5문항 · 100점'));
});

test('[rv-mk-act-sheet] [이대로 활동지 만들기] 뒤에도 학생 활동지를 다시 내려받음(2단계에서 고친 물음·더한 문항 그대로, 그리기는 큰 칸)', () => {
  const a = activityFrom({ meta: { subject: '과학', title: '동물 관찰' }, tasks: [{ kind: 'write', ask: '본 동물을 쓰세요.' }, { kind: 'draw', ask: '동물을 그리세요.' }, { kind: 'think', ask: '까닭을 정리하세요.' }] });
  a.items[0].ask = '관찰한 동물 이름을 쓰세요.';
  a.items.push({ no: 4, type: 'write', ask: '더 알고 싶은 것을 쓰세요.', answer: '', ok: '', part: '', src: 'teacher' });
  const ts = madeTasks(a);
  assert.deepEqual(ts.map(t => [t.no, t.kind]), [[1, 'write'], [2, 'draw'], [3, 'think'], [4, 'write']]);
  const d = docText(sheetDoc(a.meta, ts));
  assert.ok(d.includes('관찰한 동물 이름을 쓰세요.') && d.includes('더 알고 싶은 것을 쓰세요.'), d);
  assert.deepEqual(madeTasks({ items: [{ no: 1, ask: 'x' }] }), [], '만들지 않은 활동지는 없음');
});
