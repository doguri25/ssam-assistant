// 설문 CSV 집계: 구글 폼 모양, 척도 숫자·말, 빈 답, 따옴표 안 줄바꿈, 응답 수
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCALE, scaleValue, summarize, formText } from '../../web/core/survey.js';
import { readCsv } from '../../web/core/sheet.js';

test('척도 읽기', () => {
  assert.equal(scaleValue('5'), 5); assert.equal(scaleValue(' 3 '), 3); assert.equal(scaleValue('6'), null);
  assert.equal(scaleValue('매우 그렇다'), 5); assert.equal(scaleValue('전혀 그렇지 않다'), 1); assert.equal(scaleValue('보통'), 3);
  assert.equal(scaleValue('매우 불만족'), 1); assert.equal(scaleValue('만족'), 4); assert.equal(scaleValue('좋아요'), null);
  assert.deepEqual(SCALE, ['전혀 그렇지 않다', '그렇지 않다', '보통이다', '그렇다', '매우 그렇다']);
});

const CSV4 = '타임스탬프,행사가 즐거웠나요?,안전했나요?,좋았던 점은?\n'
  + '2027/05/07 10:00:00,4,매우 그렇다,"줄다리기가\n재밌었어요"\n'
  + '2027/05/07 10:01:00,5,그렇다,\n'
  + '2027/05/07 10:02:00,3,보통이다,응원\n'
  + '2027/05/07 10:03:00,,보통,계주\n';

test('응답 4명: 척도 평균·분포, 서술형, 적은 응답', () => {
  const r = summarize(readCsv(CSV4));
  assert.equal(r.n, 4);
  assert.equal(r.questions.length, 3);
  const [a, b, c] = r.questions;
  assert.equal(a.type, 'scale'); assert.deepEqual(a.counts, [0, 0, 1, 1, 1]); assert.equal(a.mean, 4);
  assert.equal(b.type, 'scale'); assert.deepEqual(b.counts, [0, 0, 2, 1, 1]); assert.equal(b.mean, 3.75);
  assert.equal(c.type, 'text'); assert.deepEqual(c.answers, ['줄다리기가\n재밌었어요', '응원', '계주']);
  assert.equal(r.few, true);
});

test('응답 12명이면 적지 않음, 빈 줄은 응답이 아님', () => {
  const rows = [['Timestamp', '즐거웠나요?'], ...Array.from({ length: 12 }, (_, i) => ['t', String((i % 5) + 1)]), ['', '']];
  const r = summarize(rows);
  assert.equal(r.n, 12); assert.equal(r.few, false); assert.equal(r.questions[0].mean, 2.75);
});

test('빈 표', () => {
  assert.deepEqual(summarize([]), { n: 0, questions: [], few: true });
});

test('구글 폼용 글', () => {
  const t = formText([{ type: 'scale', q: '즐거웠나요?' }, { type: 'text', q: '좋았던 점은?' }]);
  assert.ok(t.startsWith('1. 즐거웠나요? (5점 척도: 전혀 그렇지 않다 ~ 매우 그렇다)'));
  assert.ok(t.includes('2. 좋았던 점은? (서술형)'));
});
