// 단원평가 채점 규칙: AI가 읽은 답을 앱이 정답과 맞춤 (스펙 3.1·3.2)
import test from 'node:test';
import assert from 'node:assert/strict';
import { choiceSet, symbolSet, matchMap, normShort, shortAnswers, autoJudge, gradeCell, mergeCells, needsCheck, studentTotal } from '../../web/menus/evaluate/unit/unit-grade.js';

const it = (type, answer, points = 10, extra = {}) => ({ no: 1, content: '내용', domain: '이해', type, answer, points, criteria: '', pages: '', ...extra });

test('고르기 표기는 모두 같은 답', () => {
  assert.deepEqual(choiceSet('③, ⑤'), ['3', '5']);
  assert.deepEqual(choiceSet('3,5번'), ['3', '5']);
  assert.deepEqual(choiceSet('(3)과 (5)'), ['3', '5']);
  assert.deepEqual(choiceSet('⑤ ③'), ['3', '5']);
  assert.deepEqual(choiceSet('(3) ○'), ['3']);
  assert.deepEqual(choiceSet('③번'), ['3']);
});

test('기호·선 잇기·단답 정리', () => {
  assert.deepEqual(symbolSet('㉯'), ['나']);
  assert.deepEqual(symbolSet('나'), ['나']);
  assert.deepEqual(symbolSet('(나)'), ['나']);
  assert.deepEqual(symbolSet('㉠, ㉢'), ['ㄱ', 'ㄷ']);
  assert.deepEqual(matchMap('(1) - ①  (2) - ②'), { 1: '1', 2: '2' });
  assert.deepEqual(matchMap('(1)-1, (2)-2'), { 1: '1', 2: '2' });
  assert.deepEqual(matchMap('(1)-㉠ (2)-㉡'), { 1: 'ㄱ', 2: 'ㄴ' });
  assert.equal(normShort(' 바이올렛이 최고! '), '바이올렛이최고');
  assert.equal(normShort('“준호”.'), '준호');
  assert.deepEqual(shortAnswers('마을 도서관 / 도서관'), ['마을도서관', '도서관']);
  assert.deepEqual(shortAnswers('호진 또는 호진이'), ['호진', '호진이']);
  assert.deepEqual(shortAnswers('(예) 바이올렛이 최고 등'), ['바이올렛이최고']);
});

test('앱이 맞추기: 고르기·기호·선 잇기는 만점 또는 0, 단답은 같을 때만', () => {
  assert.equal(autoJudge(it('choice', '③, ⑤'), '⑤ ③'), 10);
  assert.equal(autoJudge(it('choice', '③, ⑤'), '③'), 0); // 부분 점수 없음
  assert.equal(autoJudge(it('choice', '(2) ○', 5), '(2)'), 5);
  assert.equal(autoJudge(it('symbol', '㉯'), '나'), 10);
  assert.equal(autoJudge(it('match', '(1) - ②  (2) - ①'), '(1)-②, (2)-①'), 10);
  assert.equal(autoJudge(it('match', '(1) - ②  (2) - ①'), '(1)-②, (2)-②'), 0);
  assert.equal(autoJudge(it('short', '바이올렛이 최고'), '바이올렛이 최고.'), 10);
  assert.equal(autoJudge(it('short', '바이올렛이 최고'), '바이올렛'), null);
  assert.equal(autoJudge(it('essay', '(예) …'), '아무 글'), null);
});

test('칸 만들기: 앱 판단이 이기고, 다르면 노란 칸', () => {
  let c = gradeCell(it('choice', '③', 5), { read: '②', points: 5, sure: true, why: '' });
  assert.deepEqual(c, { read: '②', pts: 0, ai: 5, flag: 'differ', why: '', ok: false, manual: false });
  c = gradeCell(it('choice', '③', 5), { read: '③', points: 5, sure: true });
  assert.equal(c.pts, 5); assert.equal(c.flag, '');
  c = gradeCell(it('choice', '③', 5), { read: '③', points: 5, sure: false });
  assert.equal(c.flag, 'low');
  c = gradeCell(it('short', '마을 도서관', 4), { read: '동네 도서관', points: 4, sure: true, why: '같은 뜻' });
  assert.equal(c.pts, 4); assert.equal(c.flag, 'similar'); assert.equal(c.why, '같은 뜻');
  c = gradeCell(it('short', '마을 도서관', 4), { read: '학교', points: 0, sure: true });
  assert.equal(c.pts, 0); assert.equal(c.flag, '');
  c = gradeCell(it('essay', '(예) …', 8), { read: '친구와 이야기함', points: 12, sure: true });
  assert.equal(c.pts, 8); assert.equal(c.flag, 'essay');
  assert.equal(gradeCell(it('essay', '(예) …', 8), { read: '글', points: -1 }).pts, 0);
  assert.equal(gradeCell(it('essay', '(예) …', 8), { read: '글', points: 'abc' }).pts, 0);
  assert.equal(gradeCell(it('essay', '(예) …', 8), { read: '글', points: 5.6 }).pts, 6);
});

test('칸 만들기: 빈 답, AI가 빠뜨린 문항, 긴 글', () => {
  assert.deepEqual(gradeCell(it('choice', '③'), { read: '  ', points: 10, sure: true }), { read: '', pts: 0, ai: 10, flag: '', why: '', ok: false, manual: false });
  assert.deepEqual(gradeCell(it('choice', '③'), undefined), { read: '', pts: 0, ai: 0, flag: 'low', why: '', ok: false, manual: false });
  const c = gradeCell(it('essay', '(예)'), { read: '가'.repeat(300), points: 3, why: '나'.repeat(200) });
  assert.equal(c.read.length, 120); assert.equal(c.why.length, 80);
});

test('다시 채점: 선생님이 고친 칸은 그대로', () => {
  const old = { 1: { read: '③', pts: 5, ai: 0, flag: 'differ', why: '', ok: true, manual: true }, 2: { read: '', pts: 0, ai: 0, flag: '', why: '', ok: false, manual: false } };
  const fresh = { 1: { read: '②', pts: 0, ai: 0, flag: '', why: '', ok: false, manual: false }, 2: { read: '④', pts: 10, ai: 10, flag: '', why: '', ok: false, manual: false } };
  const m = mergeCells(old, fresh);
  assert.equal(m[1], old[1]); assert.equal(m[2], fresh[2]);
  assert.equal(needsCheck({ flag: 'essay', ok: false }), true);
  assert.equal(needsCheck({ flag: 'essay', ok: true }), false);
  assert.equal(needsCheck({ flag: '', ok: false }), false);
  assert.equal(needsCheck(undefined), false);
});

test('학생 점수: 문항 합·만점·100점 환산', () => {
  const t = { key: { items: [it('choice', '③', 4, { no: 1 }), it('essay', '(예)', 8, { no: 2 }), it('short', 'a', 3, { no: 3 })] } };
  const st = { no: 1, items: { 1: { pts: 4 }, 2: { pts: 3 } } };
  assert.deepEqual(studentTotal(t, st), { score: 7, total: 15, pct: 46.7 });
  assert.deepEqual(studentTotal({ key: { items: [] } }, { items: {} }), { score: 0, total: 0, pct: 0 });
});
