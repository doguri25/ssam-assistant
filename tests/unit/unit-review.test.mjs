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
  REDO_MAX, PAGE_LINES, LINE_CHARS, SMALL_CHARS, SMALL_RATIO, budgetOf, redoKind, textLines, usedLines, questionCost, answerLine, fitCount, redoTargets, redoFor, redoBlocks, redoText, redoFit
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

test('잰 값(A4 결과지를 그려 잼): 가장 빠듯한 워드 첫 쪽 35줄, 한 쪽에 2명이면 17줄씩, 표 칸 한 줄 8자·빈칸은 좁게', () => {
  assert.equal(PAGE_LINES, 35, '워드 첫 쪽(빈 제목 문단 뒤) 35줄 · PDF 37.7 · 인쇄 틀 43.6 · 한글 39.5');
  assert.equal(budgetOf(false), 17);
  assert.equal(LINE_CHARS, 44); assert.equal(SMALL_CHARS, 54); assert.equal(SMALL_RATIO, 0.85);
  // 워드 표 칸(5칸): 한글 8자는 한 줄, 9자면 두 줄, 「중요한 내용 찾기」는 한 줄, 「문단의 중심 문장 찾기」는 두 줄
  assert.equal(textLines('가'.repeat(8), 8), 1); assert.equal(textLines('가'.repeat(9), 8), 2);
  assert.equal(textLines('중요한 내용 찾기', 8), 1); assert.equal(textLines('문단의 중심 문장 찾기', 8), 2);
  // 틀린 문항이 없는 학생: 제목 1.75 + 점수 1 + 「틀린 문항이 없어요」 1 (+ 잘한 점·한마디 한 줄씩)
  const t = T([stu(1, {}, { good: '잘했어요', cheer: '힘내요' })]);
  assert.equal(usedLines(t, t.students[0]), 5.75);
  // 표: 머리 줄 1.1 + 문항 줄(글 줄 수 + 0.1) + 표 아래 빈 문단 1 — 3번(한 줄 칸)만 틀리면 2.2 + 1
  const s1 = stu(1, { 3: C(0, '12.5') });
  assert.equal(+usedLines(T([s1]), s1).toFixed(2), 1.75 + 1 + 1.1 + 1.1 + 1);
});

test('남는 자리 맞추기: 「다시 풀어 보기」 머리 줄과 맨 아래 정답 줄까지 들어가는 만큼만', () => {
  const qs = [Q(1, '짧은 물음'), Q(2, '짧은 물음'), Q(3, '짧은 물음')];
  const one = questionCost(qs[0], 0);
  assert.equal(one, 3, '물음 1줄 + 보기 1줄 + 칸 1줄');
  assert.equal(questionCost({ q: '물음', choices: [] }, 0), 2, '보기 없으면 물음 + 칸');
  assert.equal(questionCost({ q: '가'.repeat(50), choices: [] }, 0), 3, '긴 물음은 2줄');
  const head = 1, ans = l => textLines(answerLine(l), SMALL_CHARS) * SMALL_RATIO;
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

/* 20문항 단원평가(문항마다 AI가 만든 길이의 복습 문제): 보통 학생은 틀린 문항 3개, 잘한 점·한마디는 한 줄쯤 */
const CONTENT20 = ['글의 내용 파악하기', '중요한 내용 찾기', '낱말의 뜻 알기', '문단의 중심 문장 찾기', '글과 그림 연결하기', '중요한 내용을 간추려 쓰기', '자신의 생각 쓰기', '소수의 덧셈', '분수의 크기 비교', '들이의 단위 알기'];
const ANS20 = ['③', '㉯', '마을 도서관', '②, ④', '(1) - ②  (2) - ①', '(예) 마을 도서관에서 책 읽기 잔치가 열린다.', '12.6', '⑤', '민수', '3/4'];
const ITEMS20 = Array.from({ length: 20 }, (_, i) => {
  const a = ANS20[i % 10], type = a.startsWith('(예)') ? 'essay' : /^[①-⑤㉮-㉱]$/.test(a) ? 'choice' : a.startsWith('(1)') ? 'match' : 'short';
  return { no: i + 1, content: CONTENT20[i % 10], domain: '이해', type, answer: a, points: 5, criteria: '', pages: `<국어> ${60 + i * 2}~${61 + i * 2}쪽` };
});
const REDO20 = { on: true, items: Object.fromEntries(ITEMS20.map(it => [it.no, redoKind(it.type) === 'choice'
  ? { kind: 'choice', q: `다음 글에서 가장 중요한 내용으로 알맞은 것은 무엇인가요? (${it.no})`, choices: ['날씨가 맑다.', '책 읽기 잔치가 열린다.', '도서관이 크다.', '친구가 많다.'], answer: '②', explain: '글 전체가 말하려는 것을 찾아요.' }
  : redoKind(it.type) === 'short' ? { kind: 'short', q: `잔치가 열리는 곳은 어디인지 글에서 찾아 쓰세요. (${it.no})`, choices: [], answer: '마을 도서관', explain: '첫 문장을 다시 읽어 봐요.' }
    : { kind: 'essay', q: `이 글을 읽고 가고 싶은 곳과 그 까닭을 한 문장으로 쓰세요. (${it.no})`, choices: [], answer: '(예) 도서관, 책을 많이 읽을 수 있어서', explain: '까닭을 함께 써요.' }])) };
const stu20 = (no, wrong, good = '중요한 내용을 정확히 찾고 낱말의 뜻을 잘 알고 있어요.', cheer = '틀린 문제를 한 번 더 천천히 읽어 보면 더 잘할 수 있을 거예요!') => ({
  no, skip: false, status: 'done', good, cheer,
  items: Object.fromEntries(ITEMS20.map(it => [it.no, C(wrong.includes(it.no) ? 0 : 5, wrong.includes(it.no) ? ['①', '도서관', '모르겠다', '(1)-①'][it.no % 4] : '정답')]))
});
const T20 = students => ({ ...newTest({ meta: META, key: { domains: [], items: ITEMS20 } }), id: 't20', students, redo: REDO20 });
/* 고른 복습 문제까지 그 학생 칸이 쓰는 줄(결과지 차례: 칸 → 「다시 풀어 보기」 → 문제 → 작은 정답 줄) */
const totalLines = (t, s, list) => usedLines(t, s) + (list.length ? 1 + list.reduce((a, q, i) => a + questionCost(q, i), 0) + textLines(answerLine(list), SMALL_CHARS) * SMALL_RATIO : 0);

test('보통 학생(20문항 중 3개 틀림, 잘한 점·한마디): 한 쪽에 2명이어도 복습 문제 2개, 번호별로 한 장씩이면 3개', () => {
  const s = stu20(1, [3, 7, 12]), t = T20([s]);
  assert.equal(redoFor(t, s, { one: false }).length, 2, `반 쪽 17줄에 칸 ${usedLines(t, s)}줄`);
  assert.equal(redoFor(t, s, { one: true }).length, 3);
  assert.ok(totalLines(t, s, redoFor(t, s, { one: false })) <= budgetOf(false));
  // 예전 셈(한 쪽 36줄·표 줄 +0.25·빈칸 0.55)으로는 1개뿐이던 학생
  assert.ok(usedLines(t, s) < 11, `칸 ${usedLines(t, s)}줄`);
});

test('넘치지 않음: 틀린 문항 수·글 길이가 달라도 고른 복습 문제까지 반 쪽(17줄)·한 쪽(35줄) 안', () => {
  const long = '글의 중요한 내용을 찾아 간추리는 힘이 좋아요. 자신의 생각을 까닭과 함께 또박또박 썼어요. 다음에도 이렇게 꼼꼼히 읽어 봐요.';
  const ss = [stu20(1, [3, 7, 12]), stu20(2, [2, 6, 11, 16]), stu20(3, [1, 5, 9, 14, 18]), stu20(4, [4]), stu20(5, [2, 6, 11, 16, 17, 19, 20], long, long), stu20(6, []),
    stu20(7, [6, 16], long, long), stu20(8, Array.from({ length: 12 }, (_, i) => i + 1))];
  const t = T20(ss);
  const got = {};
  for (const s of ss) for (const one of [false, true]) {
    const list = redoFor(t, s, { one }), used = usedLines(t, s);
    got[`${s.no}${one ? '한 장' : '반 쪽'}`] = list.length;
    // 칸이 이미 넘친 학생(틀린 문항이 아주 많음)은 넣지 않음, 넣었으면 고른 것까지 자리 안
    if (used > budgetOf(one)) assert.equal(list.length, 0, `${s.no}번 이미 넘친 칸`);
    else assert.ok(totalLines(t, s, list) <= budgetOf(one) + 1e-9, `${s.no}번 ${one ? '한 장' : '반 쪽'}: ${totalLines(t, s, list)}줄`);
  }
  // 틀린 문항이 적을수록 더 넣음(반 쪽): 1개 틀림 1개(넣을 것이 하나), 3개 틀림 2개, 많이 틀리고 글이 길면 없음
  assert.equal(got['4반 쪽'], 1); assert.equal(got['1반 쪽'], 2); assert.equal(got['5반 쪽'], 0); assert.equal(got['8반 쪽'], 0);
  assert.equal(got['1한 장'], 3); assert.ok(got['8한 장'] < 3, '12개 틀리면 한 장도 빠듯: ' + got['8한 장']);
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
