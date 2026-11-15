// 단원평가 문항 만들기 (스펙 2026-11-15 §3): 요청 글(학생 자료 없음), AI 답 다듬기(객관식 정답은 보기 번호 안), 배점 합 100(서술형 두 배),
// 정답표(단원평가 정답지 모양 그대로)·문제지 글·문제지·정답지 문서, 새 단원평가 만들기 → 채점 규칙이 그대로 돎
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { makePrompt, redoPrompt, normMade, normOne, choiceAnswer, fixPoints, warnOf, problems, keyItems, paperText, paperDoc, answerDoc, testFrom, paperTitle } from '../../web/menus/evaluate/unit/unit-make.js';
import { parsePaper, keyTotal } from '../../web/menus/evaluate/unit/unit-key.js';
import { autoJudge } from '../../web/menus/evaluate/unit/unit-grade.js';
import { saveTest, getTest, makeTitle } from '../../web/menus/evaluate/unit/unit-model.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; }
store.useStorage(mem());

const scope = { subject: '과학', unit: '2. 동물의 생활', unitNo: 2, unitName: '동물의 생활', lesson: '1/3', pages: '30~31쪽', lines: ['2. 동물의 생활 · 1/3차시 동물 분류하기 (교과서 30~31쪽)'] };

test('요청 글: 교과·학년·범위·문항 수와 유형(차례)·수준, JSON 꼴, 학생 이름·번호 없음', () => {
  const p = makePrompt({ scope, grade: 3, count: 5, types: ['choice', 'short', 'essay'], level: 'hard' });
  assert.ok(p.startsWith('[문항 만들기]'), p.slice(0, 20));
  assert.ok(p.includes('과학') && p.includes('3학년') && p.includes('동물 분류하기') && p.includes('30~31쪽'));
  assert.ok(p.includes('모두 5문항') && p.includes('객관식 3문항') && p.includes('단답 1문항') && p.includes('서술형 1문항'));
  assert.ok(p.includes('도전'));
  assert.ok(p.includes('"items"') && p.includes('"choices"'));
  assert.ok(!/학생 \d+번|김하늘/.test(p));
  // 서술형만
  const e = makePrompt({ scope, grade: 3, count: 3, types: ['essay'], level: 'basic' });
  assert.ok(e.includes('서술형 3문항') && !e.includes('객관식 '));
});

test('한 문항 다시 만들기 요청: 그 번호·유형, 다른 문항은 겹치지 않게', () => {
  const items = normMade({ items: [{ type: 'choice', question: '곤충의 다리는 몇 개인가요?', choices: ['2개', '4개', '6개', '8개'], answer: '③' }, { type: 'short', question: '거미의 다리 수는?', answer: '8개' }] });
  const p = redoPrompt({ scope, grade: 3, level: 'normal', items, no: 2 });
  assert.ok(p.startsWith('[문항 다시 만들기]'));
  assert.ok(p.includes('2번') && p.includes('단답') && p.includes('곤충의 다리는 몇 개인가요?') && p.includes('"item"'));
  assert.deepEqual(normOne({ item: { type: 'short', question: '새 문항', answer: '답' } }).question, '새 문항');
  assert.equal(normOne({ items: [{ type: 'essay', question: '까닭을 쓰세요', answer: '…', criteria: '두 가지' }] }).type, 'essay');
  assert.equal(normOne({}), null);
});

test('객관식 정답: ③·3·「3번」·보기 글 → 보기 번호, 보기 밖이면 비움', () => {
  const ch = ['개구리', '붕어', '고양이', '참새'];
  assert.deepEqual(choiceAnswer('③', ch), '③');
  assert.deepEqual(choiceAnswer('3', ch), '③');
  assert.deepEqual(choiceAnswer('3번', ch), '③');
  assert.deepEqual(choiceAnswer('(3)', ch), '③');
  assert.deepEqual(choiceAnswer('고양이', ch), '③');
  assert.deepEqual(choiceAnswer('③ 고양이', ch), '③');
  assert.deepEqual(choiceAnswer('⑤', ch), '');
  assert.deepEqual(choiceAnswer('7', ch), '');
  assert.deepEqual(choiceAnswer('', ch), '');
});

test('AI 답 다듬기: 유형·물음·보기(번호 표시 뺌)·정답·평가 내용, 빈 물음은 버림, 문항 수까지, 번호 다시', () => {
  const v = { title: '동물의 생활', items: [
    { no: 4, type: 'choice', question: ' 다리가 여섯 개인 동물은? ', choices: ['① 거미', '② 개미', '③ 지렁이', '④ 달팽이'], answer: '2', content: '곤충의 특징', domain: '지식', pages: '30쪽', points: 50 },
    { type: '단답', question: '물에 사는 동물 하나를 쓰세요.', answer: '붕어 / 송사리' },
    { type: 'essay', question: '동물을 분류한 기준을 쓰세요.', answer: '다리가 있는지로 나눴어요.', criteria: '기준과 결과를 모두 쓰면 상' },
    { type: 'choice', question: '', choices: ['a', 'b'], answer: '①' },
    { type: 'choice', question: '보기가 이상한 문항', choices: ['하나'], answer: '①' },
    { question: '남는 문항', answer: 'x' }
  ] };
  const items = normMade(v, { count: 4 });
  assert.equal(items.length, 4);
  assert.deepEqual(items.map(i => i.no), [1, 2, 3, 4]);
  assert.deepEqual(items[0], { no: 1, type: 'choice', question: '다리가 여섯 개인 동물은?', choices: ['거미', '개미', '지렁이', '달팽이'], answer: '②', content: '곤충의 특징', domain: '지식', criteria: '', pages: '30쪽', points: 0 });
  assert.equal(items[1].type, 'short');
  assert.equal(items[1].content, '물에 사는 동물 하나를 쓰세요.'.slice(0, 30));
  assert.equal(items[2].type, 'essay');
  assert.equal(items[2].criteria, '기준과 결과를 모두 쓰면 상');
  // 보기가 모자란 객관식: 보기 칸을 넷으로 채워 두고 정답은 확인할 것
  assert.equal(items[3].type, 'choice');
  assert.equal(items[3].choices.length, 4);
  assert.ok(warnOf(items[3]).includes('보기'), warnOf(items[3]));
  assert.deepEqual(normMade(null), []);
  assert.deepEqual(normMade([{ type: 'short', question: '배열도 됨', answer: '네' }]).length, 1);
});

test('배점: 합 100, 서술형은 두 배 비율, 남는 점수는 뒤 문항부터', () => {
  const mk = types => types.map((type, i) => ({ no: i + 1, type, question: 'q', choices: [], answer: 'a', points: 0 }));
  const five = fixPoints(mk(['choice', 'choice', 'choice', 'short', 'short']));
  assert.deepEqual(five.map(i => i.points), [20, 20, 20, 20, 20]);
  const withEssay = fixPoints(mk(['choice', 'choice', 'choice', 'short', 'essay']));
  assert.equal(keyTotal(withEssay), 100);
  assert.deepEqual(withEssay.map(i => i.points), [16, 17, 17, 17, 33]);
  const three = fixPoints(mk(['choice', 'choice', 'essay']));
  assert.deepEqual(three.map(i => i.points), [25, 25, 50]);
  assert.deepEqual(fixPoints([]), []);
});

test('확인할 것: 물음 없음·객관식 정답 없음·보기 빈칸 정답·단답 정답 없음·서술형 답·기준 없음, 문항 번호로', () => {
  const ok = { no: 1, type: 'choice', question: 'q', choices: ['a', 'b', 'c', 'd'], answer: '②', points: 25 };
  assert.equal(warnOf(ok), '');
  assert.ok(warnOf({ ...ok, answer: '' }).includes('정답'));
  assert.ok(warnOf({ ...ok, choices: ['a', '', 'c', 'd'] }).includes('정답'));
  assert.ok(warnOf({ ...ok, question: ' ' }).includes('물음'));
  assert.ok(warnOf({ no: 2, type: 'short', question: 'q', answer: '' }).includes('정답'));
  assert.ok(warnOf({ no: 3, type: 'essay', question: 'q', answer: '', criteria: '' }).includes('예시 답안'));
  assert.equal(warnOf({ no: 3, type: 'essay', question: 'q', answer: '', criteria: '두 가지를 쓰면 상' }), '');
  assert.deepEqual(problems([ok, { ...ok, no: 2, answer: '' }]).map(p => p.no), [2]);
});

test('정답표: 단원평가 정답지 모양(번호·평가 내용·영역·유형·정답·배점·채점 기준·쪽), 서술형 답은 「(예)」', () => {
  const items = fixPoints(normMade({ items: [
    { type: 'choice', question: '다리가 여섯 개인 동물은?', choices: ['거미', '개미', '지렁이', '달팽이'], answer: '②', content: '곤충의 특징', domain: '지식', pages: '30쪽' },
    { type: 'short', question: '물에 사는 동물 하나를 쓰세요.', answer: '붕어 / 송사리', content: '물에 사는 동물', domain: '이해' },
    { type: 'essay', question: '분류 기준을 쓰세요.', answer: '다리가 있는지로 나눴어요.', criteria: '기준과 결과를 모두 쓰면 상', content: '분류 기준', domain: '적용' }
  ] }));
  const key = keyItems(items);
  assert.deepEqual(Object.keys(key[0]), ['no', 'content', 'domain', 'type', 'answer', 'points', 'criteria', 'pages']);
  assert.deepEqual(key[0], { no: 1, content: '곤충의 특징', domain: '지식', type: 'choice', answer: '②', points: 25, criteria: '', pages: '30쪽' });
  assert.equal(key[2].answer, '(예) 다리가 있는지로 나눴어요.');
  assert.equal(keyItems([{ ...items[2], answer: '(예) 이미 붙음' }])[0].answer, '(예) 이미 붙음');
  // 지금 채점 규칙이 그대로 맞춤
  assert.equal(autoJudge(key[0], '②'), 25);
  assert.equal(autoJudge(key[0], '③'), 0);
  assert.equal(autoJudge(key[1], '송사리'), 25);
});

test('문제지 글: 제목·번호 붙은 물음·①~⑤ 보기 — 단원평가가 문항으로 읽음', () => {
  const meta = { subject: '과학', grade: 3, unitNo: 2, unitName: '동물의 생활' };
  const items = fixPoints(normMade({ items: [
    { type: 'choice', question: '다리가 여섯 개인 동물은?', choices: ['거미', '개미', '지렁이', '달팽이'], answer: '②' },
    { type: 'short', question: '물에 사는 동물 하나를 쓰세요.', answer: '붕어' },
    { type: 'essay', question: '분류 기준을 쓰세요.', answer: '…', criteria: '…' }
  ] }));
  assert.equal(paperTitle(meta), '3학년 과학 2단원 동물의 생활 단원평가');
  const text = paperText(meta, items);
  assert.ok(text.startsWith('3학년 과학 2단원 동물의 생활 단원평가'));
  assert.ok(text.includes('1. 다리가 여섯 개인 동물은? (25점)') && text.includes('② 개미') && text.includes('3. 분류 기준을 쓰세요. (서술형, 50점)'));
  assert.deepEqual(Object.keys(parsePaper(text).questions).map(Number), [1, 2, 3]);
  assert.ok(!text.includes('정답'));
});

test('학생 문제지 문서: 맨 위 「학년 반 번호 이름」 칸(늘 같은 자리), 제목, 물음·보기, 단답·서술형 답 칸 / 정답지: 표', () => {
  const meta = { subject: '과학', grade: 3, unitNo: 2, unitName: '동물의 생활' };
  const items = fixPoints(normMade({ items: [
    { type: 'choice', question: '다리가 여섯 개인 동물은?', choices: ['거미', '개미', '지렁이', '달팽이'], answer: '②', content: '곤충의 특징' },
    { type: 'short', question: '물에 사는 동물 하나를 쓰세요.', answer: '붕어' },
    { type: 'essay', question: '분류 기준을 쓰세요.', answer: '다리로 나눔', criteria: '기준과 결과' }
  ] }));
  const d = paperDoc(meta, items);
  assert.equal(d.title, '');
  assert.equal(d.blocks[0].type, 'table');
  assert.deepEqual(d.blocks[0].rows, [['학년', '', '반', '', '번호', '', '이름', '']]);
  assert.deepEqual(paperDoc({ ...meta, unitName: '아주 긴 단원 이름이 들어가도 번호 칸은 맨 위 그대로' }, items).blocks[0], d.blocks[0]);
  assert.deepEqual(d.blocks[1], { type: 'c', text: '3학년 과학 2단원 동물의 생활 단원평가', bold: true });
  const texts = d.blocks.map(b => b.text || '').join('\n');
  assert.ok(texts.includes('1. 다리가 여섯 개인 동물은? (25점)') && texts.includes('① 거미\n② 개미\n③ 지렁이\n④ 달팽이'));
  const boxes = d.blocks.filter(b => b.type === 'table').slice(1);
  assert.equal(boxes.length, 2); // 단답·서술형 답 칸
  assert.deepEqual(boxes[0].rows[0][0], '답');
  assert.ok(boxes[1].rows[0][0].split('\n').length >= 4);
  assert.ok(!JSON.stringify(d).includes('붕어') && !JSON.stringify(d).includes('기준과 결과'));
  const a = answerDoc(meta, items);
  assert.equal(a.title, '3학년 과학 2단원 동물의 생활 단원평가 정답');
  const tb = a.blocks.find(b => b.type === 'table');
  assert.deepEqual(tb.rows[0], ['번호', '유형', '정답', '배점', '평가 내용', '채점 기준']);
  assert.deepEqual(tb.rows[1], ['1', '객관식', '②', '25', '곤충의 특징', '']);
  assert.deepEqual(tb.rows[3].slice(0, 4), ['3', '서술형', '(예) 다리로 나눔', '50']);
});

test('새 단원평가 만들기: 평가 정보(교과·학년·단원·차시)·정답표·문제지 글, 저장하면 그대로', () => {
  const items = fixPoints(normMade({ items: [
    { type: 'choice', question: '다리가 여섯 개인 동물은?', choices: ['거미', '개미', '지렁이', '달팽이'], answer: '②', content: '곤충의 특징', domain: '지식' },
    { type: 'short', question: '물에 사는 동물 하나를 쓰세요.', answer: '붕어', content: '물에 사는 동물', domain: '이해' }
  ] }));
  const t = testFrom({ meta: { subject: '과학', grade: 3, unitNo: 2, unitName: '동물의 생활', lesson: '1/3' }, items });
  assert.deepEqual([t.meta.subject, t.meta.grade, t.meta.unitNo, t.meta.unitName, t.meta.lesson], ['과학', 3, 2, '동물의 생활', '1/3']);
  assert.equal(makeTitle(t.meta), '3학년 과학 2단원 동물의 생활');
  assert.deepEqual(t.key.domains, ['지식', '이해']);
  assert.equal(t.key.items.length, 2);
  assert.equal(keyTotal(t.key.items), 100);
  assert.ok(t.paper.text.includes('1. 다리가 여섯 개인 동물은?'));
  assert.deepEqual(t.students, []);
  assert.equal(t.made.items[0].choices.length, 4);
  assert.ok(saveTest(t));
  assert.deepEqual(getTest(t.id).key.items, t.key.items);
  assert.equal(getTest(t.id).made.items[1].question, '물에 사는 동물 하나를 쓰세요.');
});
