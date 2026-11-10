// 학급 고침(2026-11-10): 점심시간 줄·「1교시」 칸이 있는 시간표, 2학기 진도표로 바꾼 교과의 1학기 「체크하지 않은 날」, 1·2학기 표가 따로 있는 진도표
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { parseTimetable, parseJindo } from '../../web/menus/class/class-import.js';
import { missingDays, importSubjects, listSubjects } from '../../web/menus/class/class-model.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

test('시간표: 4교시와 5교시 사이 점심시간 줄이 있어도 6교시까지 읽음 (앞에서 끊겨 4교시로 줄지 않음)', () => {
  const t = ['3-2 | 월 | 화 | 수 | 목 | 금', '1 | 국어 | 수학 | 국어 | 수학 | 국어', '2 | 수학 | 국어 | 수학 | 국어 | 수학', '3 | 사회 | 과학 | 사회 | 과학 | 사회',
    '4 | 과학 | 체육 | 음악 | 미술 | 체육', '점심 시간', '5 | 체육 | 창체 | 영어 | 미술 | 도덕', '6 | 음악 | 창체 |  | 창체 | '].join('\n');
  const r = parseTimetable(t, { grade: 3, room: 2 });
  assert.equal(r.periods, 6);
  assert.deepEqual(r.cells[0], ['국어', '수학', '사회', '과학', '체육', '음악']);
  assert.deepEqual(r.cells[2], ['국어', '수학', '사회', '음악', '영어', '']);
  // 엑셀·CSV(탭): 옆 반과 나란한 표, 점심 줄은 우리 반 자리가 비어 있음
  const x = ['3-1\t월\t화\t수\t목\t금\t3-2\t월\t화\t수\t목\t금', '1\t국어\t국어\t국어\t국어\t국어\t1\t수학\t수학\t수학\t수학\t수학', '2\t\t\t\t\t\t2\t국어\t국어\t국어\t국어\t국어',
    '3\t\t\t\t\t\t3\t사회\t사회\t사회\t사회\t사회', '4\t\t\t\t\t\t4\t과학\t과학\t과학\t과학\t과학', '점심', '5\t\t\t\t\t\t5\t체육\t체육\t체육\t체육\t체육'].join('\n');
  const b = parseTimetable(x, { grade: 3, room: 2 });
  assert.equal(b.periods, 5); assert.equal(b.cells[4][4], '체육');
});

test('시간표: 교시 칸이 「1교시」처럼 적혀 있어도 우리 반 칸을 읽음', () => {
  const t = ['4-1 | 월 | 화 | 수 | 목 | 금', '1교시 | 국어 | 수학 | 국어 | 수학 | 국어', '2교시 | 수학 | 국어 | 수학 | 국어 | 수학', '3 교시 | 사회 | 과학 | 사회 | 과학 | 사회', '4교시 | 체육 | 체육 | 음악 | 미술 | 체육'].join('\n');
  const r = parseTimetable(t, { grade: 4, room: 1 });
  assert.equal(r.periods, 4);
  assert.deepEqual(r.cells[1], ['수학', '국어', '과학', '체육']);
});

test('시간표: 우리 반 머리 바로 아래 「아침활동」 줄은 건너뛰고 1교시부터 (0교시를 1교시로 밀어 읽지 않음)', () => {
  const t = ['3-2 | 월 | 화 | 수 | 목 | 금', '0 | 아침활동 | 아침활동 | 아침활동 | 아침활동 | 아침활동', '1 | 국어 | 수학 | 국어 | 수학 | 국어', '2 | 수학 | 국어 | 수학 | 국어 | 수학',
    '3 | 사회 | 과학 | 사회 | 과학 | 사회', '4 | 과학 | 체육 | 음악 | 미술 | 체육'].join('\n');
  const r = parseTimetable(t, { grade: 3, room: 2 });
  assert.equal(r.periods, 4);
  assert.deepEqual(r.cells[0], ['국어', '수학', '사회', '과학']);
});

test('시간표: 우리 반 표 아래 다른 반 표가 이어지면 그 반 칸은 읽지 않음', () => {
  const t = ['3-2 | 월 | 화 | 수 | 목 | 금', '1 | 국어 | 국어 | 국어 | 국어 | 국어', '2 | 수학 | 수학 | 수학 | 수학 | 수학', '3 | 사회 | 사회 | 사회 | 사회 | 사회', '4 | 과학 | 과학 | 과학 | 과학 | 과학',
    '', '3-3 | 월 | 화 | 수 | 목 | 금', '1 | 영어 | 영어 | 영어 | 영어 | 영어', '2 | 음악 | 음악 | 음악 | 음악 | 음악'].join('\n');
  const r = parseTimetable(t, { grade: 3, room: 2 });
  assert.equal(r.periods, 4);
  assert.deepEqual(r.cells[0], ['국어', '수학', '사회', '과학']);
});

test('체크하지 않은 날: 2학기 진도표로 바꾼 교과(기준일)의 1학기 날은 보이지 않음 — 눌러 체크해도 세지 않는 날', () => {
  const cells = Array.from({ length: 5 }, () => Array(7).fill(''));
  for (let d = 0; d < 5; d++) cells[d][0] = '국어';
  const ko = { id: 'ko', name: '국어', start: '2026-08-24', since: '2026-08-24', offset: 0, total: null,
    lessons: [{ week: 1, period: '8.24~8.29', from: '2026-08-24', unit: '', title: 'a', no: '', pages: '', memo: '' }] };
  const log = { '2026-07-20': { 1: { subject: '국어', status: 'done' } }, '2026-08-24': { 1: { subject: '국어', status: 'done' } } };
  const ctx = { tt: { periods: 6, cells }, subjects: [ko], log, breaks: [{ from: '2026-07-24', to: '2026-08-23', label: '여름방학' }], today: '2026-08-26' };
  assert.deepEqual(missingDays(ctx), ['2026-08-25']);
  // 기준일이 없는 교과(1학기부터 그 진도표)는 그대로 1학기 날도 보임
  const { since, ...plain } = ko;
  assert.deepEqual(missingDays({ ...ctx, subjects: [{ ...plain, start: '2026-03-02' }] }), ['2026-07-21', '2026-07-22', '2026-07-23', '2026-08-25']);
});

/* 1·2학기 표가 한 파일에 따로 있는 진도표: 같은 교과 머리줄이 다시 나옴 */
const BOTH = [
  '국어 교육과정 연간지도계획', '2026학년도 1학기 | 3학년 2반', '주 | 기간 | 단원명 | 학습 주제 | 차시 | 쪽수 | 비고',
  '1 | 3.2~3.7 | 1. 시 | 시 읽기 | 1/2 | 10 | ', '시 쓰기 | 2/2 | 11 |', '▶ 1학기 총 시수: 2시간',
  '수학 교육과정 연간지도계획', '2026학년도 1학기 | 3학년 2반', '1 | 3.2~3.7 | 1. 덧셈 | 덧셈 | 1/1 | 8 | ', '▶ 1학기 총 시수: 1시간',
  '국어 교육과정 연간지도계획', '2026학년도 2학기 | 3학년 2반', '주 | 기간 | 단원명 | 학습 주제 | 차시 | 쪽수 | 비고',
  '1 | 8.24~8.29 | 1. 글 | 글 읽기 | 1/3 | 10 | ', '글 쓰기 | 2/3 | 11 |', '글 고치기 | 3/3 | 12 |', '▶ 2학기 총 시수: 3시간 ◆ 연간 총 시수: 5시간'
].join('\n');

test('진도표: 1·2학기 표가 따로 있으면 한 교과로 이어 붙임(둘 다 넣으면 2학기 표가 1학기 표를 지우던 것), 총 시수는 더함', () => {
  const r = parseJindo(BOTH, { today: '2026-03-03', year: 2026 });
  assert.deepEqual(r.subjects.map(s => s.name), ['국어', '수학']);
  const ko = r.subjects[0];
  assert.equal(ko.lessons.length, 5); assert.equal(ko.total, 5);
  assert.deepEqual(ko.lessons.map(l => l.from), ['2026-03-02', '2026-03-02', '2026-08-24', '2026-08-24', '2026-08-24']);
  assert.deepEqual(Object.keys(ko).sort(), ['lessons', 'name', 'pick', 'source', 'total']);
  // 2학기 표의 첫 줄은 1학기 표의 주·기간·단원을 이어 쓰지 않음
  assert.equal(ko.lessons[2].week, 1); assert.equal(ko.lessons[2].unit, '1. 글');
  // 한 학기 표에 총 시수가 없으면 합계를 모름(null — 「파일에는 N시간인데」 잘못 알리지 않게)
  assert.equal(parseJindo(BOTH.replace('▶ 1학기 총 시수: 2시간', ''), { today: '2026-03-03', year: 2026 }).subjects[0].total, null);
  // 넣기: 1학기·2학기 차시가 모두 남음
  store.useStorage(mem());
  assert.ok(importSubjects(r.subjects));
  assert.equal(listSubjects().find(s => s.name === '국어').lessons.length, 5);
});
