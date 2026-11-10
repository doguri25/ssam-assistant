// 단원평가 복습 문제 남은 고침(2026-11-10): M8 인쇄·한글·워드·PDF·복사가 같게(복사에도 「답: (   )」 줄, 정답은 학생 칸 끝 작은 글씨),
// M9 고치기 칸의 빈 보기는 결과지에서 빼고 번호를 다시 매기고(정답도 따라감) 알림, 정답 「2」「(2)」「2번」·보기 글은 ②로
import test from 'node:test';
import assert from 'node:assert/strict';
import { newTest, feedbackText } from '../../web/menus/evaluate/unit/unit-model.js';
import { feedbackDoc } from '../../web/menus/evaluate/unit/unit-docs.js';
import { redoBlocks, redoText, redoFor, choicesLine, answerLine, shownChoices, answerSlot, normAnswer, redoIssues, questionCost } from '../../web/menus/evaluate/unit/unit-redo.js';

const ITEMS = [
  { no: 1, content: '글의 내용 파악하기', domain: '이해', type: 'choice', answer: '③', points: 10, criteria: '', pages: '' },
  { no: 2, content: '소수의 덧셈', domain: '계산', type: 'short', answer: '12.6', points: 20, criteria: '', pages: '' }
];
const C = pts => ({ read: '답', pts, ai: pts, flag: '', why: '', ok: true, manual: false });
const META = { subject: '국어', grade: 3, term: 2, unitNo: 2, unitName: '중요한 내용', round: 1, date: '2026-10-20' };
const REDO = { on: true, items: { 1: { kind: 'choice', q: '알맞은 것은?', choices: ['가', '나', '다', '라'], answer: '②', explain: '' }, 2: { kind: 'short', q: '5.4 + 7.2는?', choices: [], answer: '12.6', explain: '' } } };
const T = redo => ({ ...newTest({ meta: META, key: { domains: [], items: ITEMS } }), id: 't', students: [{ no: 1, skip: false, status: 'done', items: { 1: C(0), 2: C(0) }, good: '', cheer: '힘내요' }], redo });

test('M8 복사 글(redoText)은 결과지 문서 블록과 같은 줄: 「답: (   )」 줄까지, 정답은 끝', () => {
  const t = T(REDO), list = redoFor(t, t.students[0], { one: true });
  assert.deepEqual(redoText(list), redoBlocks(list).map(b => b.text));
  assert.deepEqual(redoText(list), ['다시 풀어 보기', '1) 5.4 + 7.2는?', `    답: (${' '.repeat(30)})`, '2) 알맞은 것은?', '    ① 가   ② 나   ③ 다   ④ 라', '    답: (        )', '정답: 1) 12.6   2) ②']);
  const txt = feedbackText(t, t.students[0], redoText(list));
  assert.ok(txt.endsWith('한마디: 힘내요\n다시 풀어 보기\n1) 5.4 + 7.2는?\n    답: (                              )\n2) 알맞은 것은?\n    ① 가   ② 나   ③ 다   ④ 라\n    답: (        )\n정답: 1) 12.6   2) ②'), txt);
  // 문서: 정답(작은 글)은 그 학생 칸의 맨 끝(다음 학생·쪽 나눔 바로 앞)
  const b = feedbackDoc({ ...t, students: [t.students[0], { ...t.students[0], no: 2 }] }, [t.students[0], { ...t.students[0], no: 2 }], { one: false }).blocks;
  const k = b.findIndex(x => x.type === 'small');
  assert.equal(b[k - 1].text, '    답: (        )');
  assert.ok(b[k + 1].text.startsWith('✂'), b[k + 1].text);
});

test('M9 결과지 보기: 빈 칸은 빼고 차례대로 번호(두 개 안 되면 보기 없음), 정답은 그 보기의 새 번호', () => {
  assert.deepEqual(shownChoices({ choices: ['a', '', 'c', 'd'] }), { list: ['a', 'c', 'd'], map: { 0: 0, 2: 1, 3: 2 } });
  assert.deepEqual(shownChoices({ choices: [' ', 'b', '', ''] }), { list: [], map: {} });
  assert.deepEqual(shownChoices({}), { list: [], map: {} });
  const q = { kind: 'choice', q: '물음', choices: ['a', '', 'c', 'd'], answer: '③', explain: '' };
  assert.equal(choicesLine(q), '① a   ② c   ③ d');
  assert.equal(answerLine([q]), '정답: 1) ②');
  assert.deepEqual(redoBlocks([q]).map(x => x.text), ['다시 풀어 보기', '1) 물음', '    ① a   ② c   ③ d', '    답: (        )', '정답: 1) ②'], '빈 ②가 찍히지 않음');
  assert.equal(questionCost(q, 0), 3);
  // 보기가 하나뿐이면 답을 쓰는 문제처럼(보기 줄 없음, 긴 답 칸)
  const one = { kind: 'choice', q: '물음', choices: ['', 'b', '', ''], answer: '②', explain: '' };
  assert.equal(choicesLine(one), '');
  assert.equal(redoBlocks([one])[2].text, `    답: (${' '.repeat(30)})`);
});

test('M9 정답 읽기: 1~4·(2)·2)·2번·②·보기 글 → 칸 번호, 고쳐 넣을 때 ②로(보기가 없으면 그대로)', () => {
  const ch = ['가', '나', '다', '라'];
  assert.deepEqual(['1', '2', ' 3 ', '(4)', '2)', '2.', '2번', '②', '② 나', '다', '5', '', 'x'].map(a => answerSlot(a, ch)), [0, 1, 2, 3, 1, 1, 1, 1, 1, 2, -1, -1, -1]);
  assert.equal(normAnswer('2', ch), '②');
  assert.equal(normAnswer('(3)', ch), '③');
  assert.equal(normAnswer('라', ch), '④');
  assert.equal(normAnswer('5', ch), '5', '못 알아들으면 그대로(알림)');
  assert.equal(normAnswer('2', []), '2', '보기가 없는 문제');
  assert.equal(normAnswer(' 12.6 ', []), '12.6');
  // 「2」로 고친 정답도 결과지에는 ②
  assert.equal(answerLine([{ choices: ch, answer: '2', explain: '' }]), '정답: 1) ②');
});

test('M9 고치기 칸 알림: 가운데 빈 보기, 보기가 하나뿐, 정답이 ①~④가 아님, 정답의 보기가 빔, 정답이 빔', () => {
  const Q = o => ({ kind: 'choice', q: '물음', choices: ['가', '나', '다', '라'], answer: '②', explain: '', ...o });
  assert.deepEqual(redoIssues(Q({})), []);
  assert.deepEqual(redoIssues(Q({ choices: ['가', '나', '', ''] })), [], '끝의 빈 칸은 보기 수가 적을 뿐');
  assert.ok(redoIssues(Q({ choices: ['가', '', '다', '라'], answer: '①' })).some(m => m.includes('② 보기가 비어')), redoIssues(Q({ choices: ['가', '', '다', '라'], answer: '①' })).join());
  assert.ok(redoIssues(Q({ choices: ['', '나', '', ''] })).some(m => m.includes('두 개 이상')));
  assert.ok(redoIssues(Q({ answer: '5' })).some(m => m.includes('①~④')));
  assert.ok(redoIssues(Q({ choices: ['가', '', '다', '라'], answer: '②' })).some(m => m.includes('정답 ②의 보기가 비어')));
  assert.ok(redoIssues(Q({ answer: '' })).some(m => m.includes('정답이 비어')));
  assert.deepEqual(redoIssues(Q({ q: '' , answer: '' })), [], '물음이 없으면(결과지에 안 넣음) 알리지 않음');
  assert.deepEqual(redoIssues({ kind: 'short', q: '물음', choices: [], answer: '12.6' }), []);
});
