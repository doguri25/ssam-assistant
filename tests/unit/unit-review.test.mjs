// 단원평가 결과지 맞춤 복습 문제 (스펙 2026-11-06 A): AI 프롬프트·답 읽기, 학생마다 고르기(배점 큰 순·최대 3개·남는 자리만큼), 결과지·복사·작은 글 블록
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHwpx } from '../../web/core/hwpx.js';
import { makeDocx, docHtml } from '../../web/core/doc-export.js';
import { unzip } from '../../web/core/zip.js';
import { newTest, feedbackText } from '../../web/menus/evaluate/unit/unit-model.js';
import { feedbackDoc } from '../../web/menus/evaluate/unit/unit-docs.js';
import { redoPrompt, normRedo } from '../../web/menus/evaluate/unit/unit-ai.js';
import {
  REDO_MAX, PAGE_LINES, budgetOf, redoKind, textLines, usedLines, questionCost, answerLine, fitCount, redoTargets, redoFor, redoBlocks, redoText, redoFit
} from '../../web/menus/evaluate/unit/unit-redo.js';

const ITEMS = [
  { no: 1, content: '글의 내용 파악하기', domain: '이해', type: 'choice', answer: '③', points: 10, criteria: '', pages: '<국어> 36쪽' },
  { no: 2, content: '낱말의 뜻 알기', domain: '지식', type: 'symbol', answer: '㉯', points: 20, criteria: '', pages: '<국어> 40쪽' },
  { no: 3, content: '소수의 덧셈', domain: '계산', type: 'short', answer: '12.6', points: 20, criteria: '', pages: '<수학> 52쪽' },
  { no: 4, content: '생각 쓰기', domain: '이해', type: 'essay', answer: '(예) 도서관에 가고 싶다.', points: 20, criteria: '까닭을 들어 썼으면 정답', pages: '<국어> 44쪽' },
  { no: 5, content: '중심 문장 찾기', domain: '이해', type: 'match', answer: '(1)-②', points: 10, criteria: '', pages: '' },
  { no: 6, content: '모두 맞힌 문항', domain: '이해', type: 'choice', answer: '①', points: 20, criteria: '', pages: '' }
];
const C = (pts, read = '학생답') => ({ read, pts, ai: pts, flag: '', why: '', ok: true, manual: false });
const full = { 1: C(10), 2: C(20), 3: C(20), 4: C(20), 5: C(10), 6: C(20) };
const stu = (no, over = {}, extra = {}) => ({ no, skip: false, status: 'done', items: { ...full, ...over }, good: '', cheer: '', ...extra });
const Q = (no, q, extra = {}) => ({ kind: 'choice', q, choices: ['가', '나', '다', '라'], answer: '②', explain: '풀이', ...extra });
const META = { subject: '국어', grade: 3, term: 2, unitNo: 2, unitName: '중요한 내용', round: 1, date: '2026-10-20' };
const T = (students, redo) => ({ ...newTest({ meta: META, key: { domains: [], items: ITEMS } }), id: 't', students, ...(redo ? { redo } : {}) });
const REDO = { on: true, items: { 1: Q(1, '물음 하나'), 2: Q(2, '물음 둘'), 3: { kind: 'short', q: '5.4 + 7.2는?', choices: [], answer: '12.6', explain: '자리를 맞춰 더해요' }, 4: { kind: 'essay', q: '가고 싶은 곳과 까닭을 써요.', choices: [], answer: '(예) 도서관, 책이 많아서', explain: '' }, 5: Q(5, '물음 다섯') } };

test('복습 문제를 만들 문항: 틀리거나 부분 점수인 학생이 있는 문항만, 꼴은 고르기(고르기·기호·선 잇기)·단답·서술형', () => {
  const t = T([stu(1, { 1: C(0) }), stu(2, { 4: C(12) }), { no: 3, skip: true, status: 'idle', items: { 6: C(0) } }]);
  assert.deepEqual(redoTargets(t).map(i => i.no), [1, 4]);
  assert.deepEqual(['choice', 'symbol', 'match', 'short', 'essay'].map(redoKind), ['choice', 'choice', 'choice', 'short', 'essay']);
});

test('AI 프롬프트: 문항 번호·평가 내용·영역·유형·정답·교과서 쪽만, 학생 답·이름·잘한 점·채점 기준은 보내지 않음', () => {
  const t = T([stu(1, { 1: C(0, '홍길동답'), 4: C(5, '도서관 좋아') }, { good: '잘한 글', cheer: '격려 글' })]);
  const p = redoPrompt(t, redoTargets(t));
  assert.ok(p.startsWith('[단원평가 복습 문제]'), p.slice(0, 40));
  assert.ok(p.includes('- 1 | 글의 내용 파악하기 | 이해 | 고르기 | ③ | <국어> 36쪽 | 고르기(보기 4개)'), p);
  assert.ok(p.includes('- 4 | 생각 쓰기 | 이해 | 서술형 | (예) 도서관에 가고 싶다. | <국어> 44쪽 | 서술형'), p);
  for (const bad of ['홍길동답', '도서관 좋아', '잘한 글', '격려 글', '까닭을 들어 썼으면 정답', '1번 |', '점수']) assert.ok(!p.includes(bad), bad);
  assert.ok(!p.includes('- 2 |'), '모두 맞힌 문항');
  assert.ok(/40자/.test(p) && /JSON/.test(p));
});

test('AI 답 읽기: 고르기는 보기 4개(번호 떼고)·정답 ①~④, 단답·서술형은 보기 없음, 풀이 40자 안, 모르는 번호·빈 물음은 버림', () => {
  const items = [ITEMS[0], ITEMS[2], ITEMS[3]];
  const r = normRedo({ items: [
    { no: 1, q: ' 알맞은 것은? ', choices: ['① 가', '2) 나', '다', '라', '마'], answer: '2', explain: '가'.repeat(60) },
    { no: 3, q: '5.4 + 7.2', choices: ['x', 'y'], answer: '12.6', explain: '더해요' },
    { no: 4, q: '', answer: 'x' },
    { no: 9, q: '모르는 문항', answer: '1' },
    { no: 1, q: '두 번째', answer: '1' }
  ] }, items);
  assert.deepEqual(Object.keys(r), ['1', '3']);
  assert.deepEqual(r[1], { kind: 'choice', q: '알맞은 것은?', choices: ['가', '나', '다', '라'], answer: '②', explain: '가'.repeat(40) });
  assert.deepEqual(r[3], { kind: 'short', q: '5.4 + 7.2', choices: [], answer: '12.6', explain: '더해요' });
  assert.equal(normRedo({ items: [{ no: 1, q: 'q', choices: ['사과', '배', '감', '귤'], answer: '감' }] }, items)[1].answer, '③', '보기 글로 답해도 번호로');
  assert.deepEqual(normRedo([{ no: 1, q: 'q', answer: '③' }], items)[1].choices, [], '보기가 없으면 보기 없이');
});

test('줄 셈: 글 너비로 줄 수(줄바꿈마다 한 줄 이상), 한 쪽에 2명이면 반 쪽(자르는 줄 뺌)', () => {
  assert.equal(textLines(''), 1);
  assert.equal(textLines('가'.repeat(44)), 1);
  assert.equal(textLines('가'.repeat(45)), 2);
  assert.equal(textLines('a\nb'), 2);
  assert.equal(textLines('1'.repeat(80)), 1, '숫자·영문은 좁게');
  assert.equal(budgetOf(true), PAGE_LINES);
  assert.equal(budgetOf(false), (PAGE_LINES - 1) / 2);
});

test('남는 자리 맞추기: 「다시 풀어 보기」 머리 줄과 맨 아래 정답 줄까지 들어가는 만큼만', () => {
  const qs = [Q(1, '짧은 물음'), Q(2, '짧은 물음'), Q(3, '짧은 물음')];
  const one = questionCost(qs[0], 0);
  assert.equal(one, 3, '물음 1줄 + 보기 1줄 + 칸 1줄');
  assert.equal(questionCost({ q: '물음', choices: [] }, 0), 2, '보기 없으면 물음 + 칸');
  assert.equal(questionCost({ q: '가'.repeat(50), choices: [] }, 0), 3, '긴 물음은 2줄');
  const head = 1, ans = l => textLines(answerLine(l), 54) * 0.8;
  assert.equal(fitCount(100, 0, qs), 3);
  assert.equal(fitCount(head + one + ans(qs.slice(0, 1)), 0, qs), 1);
  assert.equal(fitCount(head + one + ans(qs.slice(0, 1)) - 0.1, 0, qs), 0);
  assert.equal(fitCount(20, 20 - (head + 2 * one + ans(qs.slice(0, 2))), qs), 2);
  assert.equal(fitCount(10, 12, qs), 0, '이미 넘친 칸');
  assert.equal(fitCount(100, 0, []), 0);
});

test('학생마다: 틀린·부분 점수 문항을 배점 큰 순(같으면 번호순), 복습 문제가 있는 것만 최대 3개, 다 맞힌 학생은 없음', () => {
  const t = T([stu(1, { 1: C(0), 2: C(10), 3: C(0), 4: C(0), 5: C(0) }), stu(2), stu(3, { 6: C(0), 5: C(0) })], REDO);
  assert.equal(REDO_MAX, 3);
  assert.deepEqual(redoFor(t, t.students[0], { one: true }).map(q => q.no), [2, 3, 4]);
  assert.deepEqual(redoFor(t, t.students[1], { one: true }), []);
  assert.deepEqual(redoFor(t, t.students[2], { one: true }).map(q => q.no), [5], '복습 문제가 없는 6번은 빼고');
  assert.deepEqual(redoFor({ ...t, redo: { ...REDO, on: false } }, t.students[0], { one: true }), [], '스위치를 끄면 넣지 않음');
  assert.deepEqual(redoFor(T(t.students), t.students[0], { one: true }), [], '만들기 전');
  const q = redoFor(t, t.students[0], { one: true })[0];
  assert.equal(q.q, '물음 둘'); assert.equal(q.answer, '②');
});

test('학생마다: 칸에 남는 자리만큼 — 틀린 문항이 많고 글이 길면 한 쪽에 2명일 때 줄고, 번호별로 한 장씩이면 더 들어감', () => {
  const long = '책을 끝까지 꼼꼼히 읽고 중요한 내용을 찾아 간추려 쓰는 연습을 해 봐요. 다음에는 더 잘할 수 있을 거예요.';
  const s = stu(1, { 1: C(0, '마을 도서관에서 토요일에 책 읽기 잔치가 열린다고 했어요'), 2: C(0), 3: C(0), 4: C(0, '가고 싶다. 친구와 함께 책을 고를 수 있기 때문이다. 동생에게도 읽어 주고 싶다.'), 5: C(0) }, { good: long, cheer: long });
  const t = T([s], REDO);
  const used = usedLines(t, s);
  assert.ok(used > budgetOf(false) - 3, `반 쪽에 거의 다 참: ${used}`);
  assert.deepEqual(redoFor(t, s, { one: false }), []);
  assert.equal(redoFor(t, s, { one: true }).length, 3);
  // 틀린 문항 하나뿐인 학생은 반 쪽에도 들어감
  const s2 = stu(2, { 3: C(0) });
  assert.deepEqual(redoFor(T([s2], REDO), s2, { one: false }).map(q => q.no), [3]);
  // 머리·점수·표(머리 줄 + 문항 줄, 긴 글은 줄 수로)·잘한 점·한마디
  assert.ok(usedLines(t, { ...s, good: '', cheer: '' }) < used);
  assert.ok(usedLines(T([s2]), s2) < used);
});

test('결과지 문서: 한마디 아래 「다시 풀어 보기」 1) 2) 3), 그 학생 칸 맨 아래 작은 글씨로 정답(풀이와 함께)', () => {
  const s = stu(1, { 1: C(0), 3: C(0) }, { good: '잘했어요', cheer: '힘내요' });
  const t = T([s, stu(2)], REDO);
  const b = feedbackDoc(t, t.students, { one: true }).blocks;
  const i = b.findIndex(x => x.text === '한마디: 힘내요');
  assert.deepEqual(b.slice(i + 1, i + 9).map(x => [x.type, x.text, !!x.bold]), [
    ['p', '다시 풀어 보기', true], ['p', '1) 5.4 + 7.2는?', false], ['p', '    답: (                              )', false],
    ['p', '2) 물음 하나', false], ['p', '    ① 가   ② 나   ③ 다   ④ 라', false], ['p', '    답: (        )', false],
    ['small', '정답: 1) 12.6 (자리를 맞춰 더해요)   2) ② (풀이)', false], ['break', undefined, false]
  ]);
  assert.ok(!b.slice(i + 9).some(x => x.text === '다시 풀어 보기'), '다 맞힌 학생');
  const txt = feedbackText(t, s, redoText(redoFor(t, s, { one: true })));
  // 복사 글도 결과지와 같은 줄(「답: (   )」 줄까지, 2026-11-10 M8)
  assert.ok(txt.endsWith('한마디: 힘내요\n다시 풀어 보기\n1) 5.4 + 7.2는?\n    답: (                              )\n2) 물음 하나\n    ① 가   ② 나   ③ 다   ④ 라\n    답: (        )\n정답: 1) 12.6 (자리를 맞춰 더해요)   2) ② (풀이)'), txt);
  assert.deepEqual(redoBlocks([]), []); assert.deepEqual(redoText([]), []);
  assert.equal(answerLine([{ answer: '②', explain: '' }, { answer: '12.6', explain: '' }]), '정답: 1) ②   2) 12.6');
});

test('넣은 학생 셈: 넣은 학생·자리가 모자라 덜 넣은 학생', () => {
  const long = '가'.repeat(200);
  const ss = [stu(1, { 3: C(0) }), stu(2), stu(3, { 1: C(0), 2: C(0), 3: C(0), 4: C(0) }, { good: long, cheer: long })];
  const f = redoFit(T(ss, REDO), ss, { one: false });
  assert.deepEqual(f, { put: 1, short: 1 });
  assert.deepEqual(redoFit(T(ss, REDO), ss, { one: true }), { put: 2, short: 0 });
});

test('작은 글 블록(small)·굵은 문단: 한글 8pt 글자 모양, 워드 8pt, PDF 작은 글', async () => {
  const doc = { title: 't', blocks: [{ type: 'p', text: '다시 풀어 보기', bold: true }, { type: 'small', text: '정답: 1) ②' }, { type: 'p', text: '보통' }] };
  const m = await unzip(makeHwpx(doc));
  const head = new TextDecoder().decode(m.get('Contents/header.xml')), sec = new TextDecoder().decode(m.get('Contents/section0.xml'));
  assert.ok(/<hh:charProperties itemCnt="5">/.test(head) && head.includes('<hh:charPr id="4" height="800"'), '8pt 글자 모양');
  assert.ok(sec.includes('<hp:run charPrIDRef="4"><hp:t>정답: 1) ②</hp:t></hp:run>'), sec);
  assert.ok(sec.includes('<hp:run charPrIDRef="1"><hp:t>다시 풀어 보기</hp:t></hp:run>'), '굵게');
  assert.ok(sec.includes('<hp:run charPrIDRef="0"><hp:t>보통</hp:t></hp:run>'));
  const w = new TextDecoder().decode((await unzip(makeDocx(doc))).get('word/document.xml'));
  assert.ok(/<w:r><w:rPr><w:sz w:val="16"\/><w:szCs w:val="16"\/><\/w:rPr><w:t xml:space="preserve">정답: 1\) ②<\/w:t>/.test(w), w);
  assert.ok(/<w:r><w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">다시 풀어 보기<\/w:t>/.test(w));
  const h = docHtml(doc);
  assert.ok(h.includes('<p class="sm">정답: 1) ②</p>') && h.includes('<p><b>다시 풀어 보기</b></p>'), h);
});
