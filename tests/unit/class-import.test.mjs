// 학급: 학교 진도표(교과·창체 연간지도계획)·기초시간표 글 읽기 — 시험 자료는 실제 파일과 같은 칸 모양, 내용은 지어냄
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normName, periodStart, schoolYearOf, parseJindo, parseTimetable } from '../../web/menus/class/class-import.js';

const J = readFileSync(new URL('../fixtures/jindo-sample.txt', import.meta.url), 'utf8');
const T = readFileSync(new URL('../fixtures/timetable-sample.txt', import.meta.url), 'utf8');

test('이름의 띄어쓰기 빼기', () => {
  assert.equal(normName(' 수 학 '), '수학');
  assert.equal(normName('창의적 체험활동'), '창의적체험활동');
});

test('기간의 첫날과 학년도', () => {
  assert.equal(periodStart('8.24~8.29', 2026), '2026-08-24');
  assert.equal(periodStart('12.28~1.2', 2026), '2026-12-28');
  assert.equal(periodStart('1.4~1.9', 2026), '2027-01-04');
  assert.equal(periodStart('기간', 2026), '');
  assert.equal(periodStart('', 2026), '');
  assert.equal(schoolYearOf('2027-02-10'), 2026);
  assert.equal(schoolYearOf('2026-03-02'), 2026);
  assert.equal(schoolYearOf('2026-10-29'), 2026);
});

test('진도표: 교과 나누기·이름·고를지·총 시수', () => {
  const r = parseJindo(J, { today: '2026-10-29' });
  assert.equal(r.year, 2026);
  assert.deepEqual(r.subjects.map(s => s.name), ['국어', '수학', '창체', '자율⋅자치활동']);
  assert.deepEqual(r.subjects.map(s => s.source), ['국어', '수학', '창의적 체험활동', '자율⋅자치활동']);
  assert.deepEqual(r.subjects.map(s => s.pick), [true, true, true, false]);
  assert.deepEqual(r.subjects.map(s => s.total), [12, 8, 3, 2]);
  assert.deepEqual(r.subjects.map(s => s.lessons.length), [12, 8, 3, 2]);
});

test('진도표: 7·6·5·4칸 줄과 위 줄 이어 쓰기', () => {
  const k = parseJindo(J, { today: '2026-10-29' }).subjects[0].lessons;
  assert.deepEqual(k[0], { week: 1, period: '8.24~8.29', from: '2026-08-24', unit: '1. 마음을 나누는 글', title: '단원 열기', pages: '10~13', memo: '' });
  // 4칸 줄: 주·기간·단원은 위 줄 것
  assert.equal(k[1].title, '글쓴이의 마음 짐작하기 -1-');
  assert.equal(k[1].week, 1); assert.equal(k[1].period, '8.24~8.29'); assert.equal(k[1].unit, '1. 마음을 나누는 글');
  // 6칸 줄: 새 주, 단원은 위 줄 것
  assert.equal(k[2].week, 2); assert.equal(k[2].from, '2026-08-31'); assert.equal(k[2].unit, '1. 마음을 나누는 글');
  // ◈ 행사 줄(5칸) → 단원과 비고, 다음 4칸 줄도 이어받음
  assert.equal(k[3].unit, '◈학예회 관람'); assert.equal(k[3].memo, '◈학예회 관람'); assert.equal(k[3].pages, ''); assert.equal(k[3].week, 2);
  assert.equal(k[4].unit, '◈학예회 관람');
  assert.equal(k[5].unit, '1. 마음을 나누는 글'); assert.equal(k[5].week, 2);
  // 해를 넘는 주
  assert.equal(k[8].from, '2026-12-28'); assert.equal(k[8].unit, '2. 낱말 탐험');
  assert.equal(k[10].from, '2027-01-04'); assert.equal(k[11].from, '2027-01-04'); assert.equal(k[11].week, 20);
});

test('진도표: 합친 칸이 빈 칸으로 나와도 이어 씀, 창체의 영역 칸', () => {
  const s = parseJindo(J, { today: '2026-10-29' }).subjects;
  const m = s[1].lessons;
  assert.equal(m[1].week, 1); assert.equal(m[1].unit, '1. 곱셈'); assert.equal(m[1].title, '몇십 곱하기 (1)');
  assert.equal(m[2].week, 2); assert.equal(m[2].unit, '1. 곱셈'); assert.equal(m[2].from, '2026-08-31');
  assert.equal(m[4].unit, '2. 나눗셈'); assert.equal(m[7].week, 4); assert.equal(m[7].pages, '22~23');
  const c = s[2].lessons;
  assert.equal(c[0].pages, '자율⋅자치'); assert.equal(c[0].memo, '◈개학식');
  assert.equal(c[2].unit, '꿈 동아리'); assert.equal(c[2].pages, '동아리'); assert.equal(c[2].week, 2);
});

test('진도표: 학년도가 없으면 오늘이 든 학년도, 표가 없으면 빈 목록', () => {
  const r = parseJindo('국어 교육과정 연간지도계획\n1 | 1.4~1.9 | 1. 시 | 시 읽기 | 1/1 | 5 |', { today: '2027-01-05' });
  assert.equal(r.year, 2026);
  assert.equal(r.subjects[0].lessons[0].from, '2027-01-04');
  assert.equal(r.subjects[0].total, null);
  assert.deepEqual(parseJindo('안녕\n주 | 기간', { today: '2026-10-29' }).subjects, []);
});

test('시간표: 두 반이 나란한 표에서 우리 반 칸 읽기', () => {
  const b = parseTimetable(T, { grade: 3, room: 2 });
  assert.equal(b.periods, 6);
  assert.deepEqual(b.cells[0], ['수학', '국어', '사회', '과학', '체육', '']);
  assert.deepEqual(b.cells[1], ['국어', '수학', '과학', '체육', '창체', '']);
  assert.deepEqual(b.cells[3], ['수학', '국어', '사회', '미술', '미술', '미술']);
  assert.equal(b.cells[4][0], '국어(자)');
  const a = parseTimetable(T, { grade: 3, room: 1 });
  assert.equal(a.periods, 6);
  assert.deepEqual(a.cells[0], ['국어', '수학', '사회', '과학', '체육', '']);
  assert.equal(a.cells[1][4], '창체(동)');
  assert.equal(a.cells[3][5], '창체');
  assert.equal(parseTimetable(T, { grade: 4, room: 9 }), null);
  assert.equal(parseTimetable('3-3 | 월 | 화 | 수 | 목 | 금\n1 |  |  |  |  | ', { grade: 3, room: 3 }), null);
});

test('시간표: 끝의 빈 교시는 버리되 4교시보다 줄이지 않음', () => {
  const t = '2-1 | 월 | 화 | 수 | 목 | 금\n1 | 국어 | 국어 | 국어 | 국어 | 국어\n2 | 수학 |  |  |  | \n3 |  |  |  |  | \n4 |  |  |  |  | \n5 |  |  |  |  | ';
  const r = parseTimetable(t, { grade: 2, room: 1 });
  assert.equal(r.periods, 4);
  assert.deepEqual(r.cells[0], ['국어', '수학', '', '']);
});
