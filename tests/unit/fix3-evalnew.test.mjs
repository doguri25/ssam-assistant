// 3차 고침(단원평가·활동지): 단답 정답의 수 뜻 지키기
import test from 'node:test';
import assert from 'node:assert/strict';
import { normShort, shortAnswers, autoJudge, gradeCell } from '../../web/menus/evaluate/unit/unit-grade.js';
import { judgeCell } from '../../web/menus/evaluate/activity/activity-ai.js';

const short = (answer, points = 4) => ({ no: 1, type: 'short', answer, points });

test('[eval-num-1] 소수점 자리가 다르면 같은 답이 아님(12.6 ≠ 1.26 ≠ 126)', () => {
  assert.equal(autoJudge(short('12.6'), '12.6'), 4);
  assert.equal(autoJudge(short('12.6'), '1.26'), null);
  assert.equal(autoJudge(short('12.6'), '126'), null);
  assert.equal(autoJudge(short('2.5'), '25'), null);
  assert.equal(autoJudge(short('0.36'), '3.6'), null);
  assert.notEqual(normShort('12.6'), normShort('126'));
  // 문장 끝 마침표는 예전처럼 뺌
  assert.equal(autoJudge(short('12.6'), '12.6.'), 4);
  assert.equal(autoJudge(short('12.6'), ' 12.6 '), 4);
  // AI가 0점이라 해도 앱이 만점을 주지 않음: 노란 칸(similar)에 AI 점수
  const c = gradeCell(short('12.6'), { read: '1.26', points: 0, sure: true });
  assert.equal(c.pts, 0); assert.equal(c.flag, 'similar');
});

test('[eval-num-1] 분수 정답은 하나로 읽음(3/4에 3은 틀림, 3/4는 맞음)', () => {
  assert.deepEqual(shortAnswers('3/4'), ['3/4']);
  assert.deepEqual(shortAnswers('3 / 4'), ['3/4']);
  assert.equal(autoJudge(short('3/4'), '3/4'), 4);
  assert.equal(autoJudge(short('3/4'), '3 / 4'), 4);
  assert.equal(autoJudge(short('3/4'), '3'), null);
  assert.equal(autoJudge(short('3/4'), '4'), null);
  assert.equal(gradeCell(short('3/4'), { read: '3/4', points: 4, sure: true }).flag, '');
  // 대분수(1 3/4)와 가분수(13/4)는 다른 수
  assert.equal(autoJudge(short('1 3/4'), '13/4'), null);
  assert.equal(autoJudge(short('1 3/4'), '1 3/4'), 4);
  // 분수 또는 소수
  assert.deepEqual(shortAnswers('1/2 또는 0.5'), ['1/2', '0.5']);
});

test('[eval-num-1] 「/」를 「또는」으로 쓴 정답표는 그대로 나눔', () => {
  assert.deepEqual(shortAnswers('사과/apple'), ['사과', 'apple']);
  assert.deepEqual(shortAnswers('ㄱ/ㄴ'), ['ㄱ', 'ㄴ']);
  assert.deepEqual(shortAnswers('마을 도서관 / 도서관'), ['마을도서관', '도서관']);
  assert.deepEqual(shortAnswers('3개/세 개'), ['3개', '세개']);
  assert.deepEqual(shortAnswers('호진 또는 호진이'), ['호진', '호진이']);
  assert.equal(autoJudge(short('사과/apple'), 'Apple'), 4);
  assert.equal(autoJudge(short('ㄱ/ㄴ'), 'ㄴ'), 4);
});

test('[eval-num-1] 큰 수 쉼표는 빼고, 음수 부호와 수 사이 띄어쓰기는 지킴', () => {
  assert.equal(autoJudge(short('1,000'), '1000'), 4);
  assert.equal(autoJudge(short('1000'), '1,000'), 4);
  assert.equal(autoJudge(short('12,345,678'), '12345678'), 4);
  assert.equal(autoJudge(short('1,000'), '1'), null);
  assert.equal(autoJudge(short('-3'), '3'), null);
  assert.equal(autoJudge(short('-3'), '-3'), 4);
  assert.equal(autoJudge(short('-3'), '−3'), 4);
  assert.equal(autoJudge(short('3'), '-3'), null);
  // 수 둘을 이어 붙여 다른 수로 만들지 않음
  assert.equal(autoJudge(short('3, 5'), '35'), null);
  assert.equal(autoJudge(short('3, 5'), '3 5'), 4);
  assert.equal(autoJudge(short('3:30'), '330'), null);
});

test('[eval-num-1] 예전 표기 맞추기는 그대로(○×·⑴·문장부호·대소문자)', () => {
  const ox = short('(1) ○, (2) ×, (3) ○', 10);
  assert.equal(autoJudge(ox, '(1) O (2) X (3) O'), 10);
  assert.equal(autoJudge(ox, '1 ⭕ 2 ❌ 3 ⭕'), 10);
  assert.equal(autoJudge(ox, '⑴ ○ ⑵ × ⑶ ○'), 10);
  assert.equal(autoJudge(ox, '(1) ○ (2) ○ (3) ○'), null);
  assert.equal(normShort(' 바이올렛이 최고! '), '바이올렛이최고');
  assert.equal(normShort('“준호”.'), '준호');
  assert.equal(autoJudge(short('345'), '345'), 4);
  assert.equal(autoJudge(short('345'), '345.'), 4);
  assert.equal(autoJudge(short('12'), '(12)'), 4);
  // 수 단위가 붙은 답
  assert.equal(autoJudge(short('12.6 cm'), '12.6cm'), 4);
  assert.equal(autoJudge(short('12.6 cm'), '1.26cm'), null);
});

test('[eval-num-1] 활동지 빈칸도 같은 규칙(12.6에 1.26은 ○가 아님)', () => {
  const it = { type: 'short', answer: '12.6' };
  const a = judgeCell(it, { read: '1.26', mark: 'x', sure: true });
  assert.equal(a.mark, 'x'); assert.equal(a.chk, false);
  const b = judgeCell(it, { read: '1.26', mark: 'o', sure: true });
  assert.equal(b.mark, 'o'); // 앱이 정하지 못하면 AI 표시를 씀
  assert.equal(judgeCell({ type: 'short', answer: '2.5' }, { read: '25', mark: 'x', sure: true }).mark, 'x');
  assert.equal(judgeCell({ type: 'short', answer: '3/4' }, { read: '3', mark: 'x', sure: true }).mark, 'x');
  assert.equal(judgeCell({ type: 'short', answer: '3/4' }, { read: '3/4', mark: 'x', sure: true }).mark, 'o');
  assert.equal(judgeCell({ type: 'short', answer: '증발' }, { read: '증발', mark: 'o', sure: true }).mark, 'o');
});

/* 번호로 맞춘 평가에 다시 올린 스캔(걷은 차례) */
const stu = (no, extra = {}) => ({ no, skip: false, status: 'idle', items: {}, ...extra });
const freshOf = no => stu(no);
const hasRes = s => s.status === 'done' || Object.keys(s.items || {}).length > 0;
const order = nos => nos.map((n, i) => i).sort((a, b) => (nos[a] == null) - (nos[b] == null) || (nos[a] || 0) - (nos[b] || 0) || a - b);

test('[byno-reread-blank-3] 비운 줄(빈 답안지)은 「채점 안 함」 자리에 붙고, 그런 자리가 없으면 새 「채점 안 함」 학생', async () => {
  const { reattachByNo } = await import('../../web/menus/evaluate/unit/unit-model.js');
  const done = no => stu(no, { status: 'done', items: { 1: { pts: 1 } } });
  const blank = stu(4, { skip: true });
  const students = [done(1), done(2), done(3), blank];
  const nos = [3, null, 1, 2], o = order(nos);
  const head = reattachByNo(students, nos, o, freshOf, hasRes);
  assert.deepEqual(head.map(s => s.no), [1, 2, 3, 4]);
  assert.equal(head[3], blank); // 결석생 번호로 새 학생을 만들지 않음
  const head2 = reattachByNo([done(1), done(2), done(3)], [3, null, 1, 2], o, freshOf, hasRes);
  assert.equal(head2[3].skip, true); assert.equal(head2[3].status, 'idle');
});

test('[byno-skip-dup-4] 같은 번호면 「채점 안 함」이 아닌 학생을 앞세우고, 처음 보는 번호는 아직 채점하지 않은 「채점 안 함」 자리에 붙임', async () => {
  const { reattachByNo } = await import('../../web/menus/evaluate/unit/unit-model.js');
  const real2 = stu(2, { status: 'done', items: { 1: { pts: 1 } } }), skip2 = stu(2, { skip: true });
  const students = [stu(1, { status: 'done' }), real2, stu(3, { status: 'done' }), skip2];
  const nos = [3, 5, 1, 2];
  const head = reattachByNo(students, nos, order(nos), freshOf, hasRes);
  assert.equal(head[1], real2); // 진짜 2번 쪽은 진짜 2번에
  assert.equal(head[3], skip2); // 5번이 쓴 「채점 안 함」 답안지는 그대로 「채점 안 함」
  // 채점한 뒤 「채점 안 함」으로 둔 학생은 다른 번호로 바꾸지 않고, 그 번호를 읽으면 그대로 붙음
  const graded1 = stu(1, { skip: true, status: 'done', items: { 1: { pts: 1 } } });
  const h2 = reattachByNo([graded1, stu(2, { status: 'done' }), stu(3, { status: 'done' })], [3, 4, 2], order([3, 4, 2]), freshOf, hasRes);
  assert.deepEqual(h2.map(s => `${s.no}${s.skip ? 's' : ''}`), ['2', '3', '4']);
  assert.notEqual(h2[2], graded1);
  const h3 = reattachByNo([graded1, stu(2, { status: 'done' })], [1, 2], [0, 1], freshOf, hasRes);
  assert.equal(h3[0], graded1);
});

test('[byno-skip-dup-4] 「채점 안 함」 학생 번호가 겹치면 명단 뒤 번호로 바꿈(겹치지 않으면 그대로)', async () => {
  const { spreadSkipNos } = await import('../../web/menus/evaluate/unit/unit-model.js');
  const l = spreadSkipNos([stu(1), stu(2), stu(3), stu(2, { skip: true })], 5);
  assert.deepEqual(l.map(s => s.no), [1, 2, 3, 6]);
  assert.deepEqual(spreadSkipNos([stu(1), stu(2), stu(4, { skip: true })], 5).map(s => s.no), [1, 2, 4]);
  assert.deepEqual(spreadSkipNos([stu(1), stu(0, { skip: true }), stu(1, { skip: true })], 0).map(s => s.no), [1, 2, 3]);
});

test('[eval-num-1] 숫자 사이 가운뎃점(·)은 점(.)과 같게 봄(4·19 혁명 = 4.19 혁명), 정답표를 고쳐 다시 맞춰도 만점', async () => {
  const { rescoreItem } = await import('../../web/menus/evaluate/unit/unit-grade.js');
  for (const [a, r] of [['4·19 혁명', '4.19 혁명'], ['3·1 운동', '3.1 운동'], ['3·1 운동', '3.1운동'], ['5·18 민주화 운동', '5.18 민주화 운동'], ['6·25 전쟁', '6.25전쟁'], ['4.19 혁명', '4·19 혁명'],
    ['4·19 혁명', '4・19 혁명'], ['4·19 혁명', '4‧19 혁명'], ['4·19 혁명', '4･19 혁명'], ['3·1절', '3.1절']]) {
    assert.equal(autoJudge(short(a, 5), r), 5, `${a} · ${r}`);
    const c = gradeCell(short(a, 5), { read: r, points: 5, sure: true });
    assert.equal(c.pts, 5); assert.equal(c.flag, '', `${a} · ${r}`);
  }
  assert.equal(autoJudge(short('4·19 혁명', 5), '419 혁명'), null);
  assert.equal(autoJudge(short('4·19 혁명', 5), '4·9 혁명'), null);
  // 낱말 사이 가운뎃점은 예전처럼 뺌
  assert.equal(autoJudge(short('사과·배', 5), '사과배'), 5);
  const t = { key: { items: [{ no: 1, type: 'short', answer: '4·19', points: 5 }] }, students: [{ no: 1, items: { 1: gradeCell({ no: 1, type: 'short', answer: '4·19', points: 5 }, { read: '4.19 혁명', points: 5, sure: true }) } }] };
  t.key.items[0].answer = '4·19 혁명';
  rescoreItem(t, 1, 'answer');
  assert.equal(t.students[0].items[1].pts, 5); assert.equal(t.students[0].items[1].flag, '');
});

test('[eval-num-1] 세 자리 수를 쉼표로 이은 답은 띄어쓰기가 달라도 같음(큰 수로도 목록으로도 읽어 봄)', () => {
  assert.equal(autoJudge(short('300, 400, 500'), '300,400,500'), 4);
  assert.equal(autoJudge(short('300,400,500'), '300, 400, 500'), 4);
  assert.equal(autoJudge(short('100,200,300'), '100, 200, 300'), 4);
  assert.equal(autoJudge(short('300, 400'), '300,400'), 4);
  assert.equal(autoJudge(short('1,500'), '1, 500'), 4);
  assert.equal(autoJudge(short('1,500'), '1500'), 4);
  assert.equal(autoJudge(short('3,000원'), '3000 원'), 4);
  // 틀린 답은 그대로 만점이 아님
  assert.equal(autoJudge(short('300, 400, 500'), '300400500'), null);
  assert.equal(autoJudge(short('1, 500'), '1500'), null);
  assert.equal(autoJudge(short('3, 5'), '3,500'), null);
  assert.equal(autoJudge(short('1,000'), '1'), null);
  assert.equal(autoJudge(short('12,000'), '12,00'), null);
  assert.equal(autoJudge(short('3,000원'), '30,000원'), null);
  // 정답표 나누기는 그대로(큰 수로 읽음)
  assert.deepEqual(shortAnswers('1,000'), ['1000']);
});
