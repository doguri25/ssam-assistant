// 학급 메뉴에 다른 선생님 변경분 옮겨 넣기(2026-11-21 「지금 올린 기능이 구현 가능하게 빌드해줘. 새 기능 포함해서」):
// ❶ 주간학습안내 칸에 단원, ❷ [완료]를 누를 때 같은 날 앞 교시의 같은 교과(체크 안 한 칸)도 함께 완료할지 묻기 — 묻기/묻지 않기 스위치,
// 함께 완료한 칸은 [완료]를 다시 누르면 같이 해제, ❸ 다음 차시를 학습 주제로. 이름은 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { isYearKey } from '../../web/core/years.js';
import * as M from '../../web/menus/class/class-model.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const empty = () => Array.from({ length: 5 }, () => Array(6).fill(''));
const L = n => Array.from({ length: n }, (_, i) => ({ week: null, period: '', from: '', unit: '3. 정확하게 글을 써요', title: `주제 ${i + 1}`, pages: '', memo: '' }));
const MON = '2026-11-16', TODAY = '2026-11-18'; // 월요일, 오늘은 수요일
const ctx = () => M.makeCtx(TODAY);
const log = () => store.get('class:log', {});

/* 월 1·2·3 국어, 4 수학, 5 음악(전담) — 국어·수학 진도표 */
function seed() {
  store.useStorage(mem());
  const c = empty(); c[0][0] = '국어'; c[0][1] = '국어'; c[0][2] = '국어'; c[0][3] = '수학'; c[0][4] = '음악';
  M.setTimetable({ periods: 6, cells: c });
  M.saveSubject({ id: 'ko', name: '국어', start: '2026-11-02', offset: 0, lessons: L(40) });
  M.saveSubject({ id: 'ma', name: '수학', start: '2026-11-02', offset: 0, lessons: L(40) });
  M.setExtra('음악', { staff: true });
}

test('❶ 주간학습안내 칸: 교과 · 단원 · 학습 주제 (쪽수) — 단원·쪽수가 없으면 뺌', () => {
  const lesson = { unit: '3. 정확하게 글을 써요', title: '글을 정확하게 쓰는 방법', pages: '118~123' };
  assert.equal(M.cellText({ subject: '국어', lesson }), '국어 · 3. 정확하게 글을 써요 · 글을 정확하게 쓰는 방법 (118~123쪽)');
  assert.equal(M.cellText({ subject: '국어', lesson: { ...lesson, unit: '' } }), '국어 · 글을 정확하게 쓰는 방법 (118~123쪽)');
  assert.equal(M.cellText({ subject: '국어', lesson: { ...lesson, pages: '' } }), '국어 · 3. 정확하게 글을 써요 · 글을 정확하게 쓰는 방법');
  assert.equal(M.cellText({ subject: '국어', lesson: { ...lesson, pages: '교과서 30쪽' } }), '국어 · 3. 정확하게 글을 써요 · 글을 정확하게 쓰는 방법 (교과서 30쪽)');
  assert.equal(M.cellText({ subject: '영어', lesson: null }), '영어');
});

test('❸ 다음 차시: 단원·학습 주제·단원 안 차시(진도표 차시 칸 또는 같은 단원 줄로 셈), 다 마치면 null', () => {
  const s = { id: 'x', name: '국어', lessons: [...L(2), { ...L(1)[0], unit: '4. 다른 단원', title: '새 단원 첫 시간', no: '1/5' }] };
  assert.deepEqual(M.nextLessonOf(s, 2), { unit: '3. 정확하게 글을 써요', title: '주제 2', n: 2, of: 2 });
  assert.deepEqual(M.nextLessonOf(s, 3), { unit: '4. 다른 단원', title: '새 단원 첫 시간', n: 1, of: 5 });
  assert.equal(M.nextLessonOf(s, 4), null);
  assert.equal(M.nextLessonOf(s, 0), null);
});

test('❷ 앞 교시 같은 교과: 같은 날, 체크하지 않은 칸만(완료·일부 진행·못 함은 뺌), 다른 교과·전담·앞날은 아님', () => {
  seed();
  assert.deepEqual(M.prevSame(ctx(), MON, 3), [1, 2]);
  assert.deepEqual(M.prevSame(ctx(), MON, 1), []);
  assert.deepEqual(M.prevSame(ctx(), MON, 4), [], '수학 앞에는 수학이 없음');
  assert.deepEqual(M.prevSame(ctx(), MON, 5), [], '전담');
  M.setMark(MON, 1, '국어', 'part');
  assert.deepEqual(M.prevSame(ctx(), MON, 3), [2]);
  M.setMark(MON, 1, '국어', null);
  // 교체: 2교시를 수학으로 바꾸면 국어 앞 교시는 1교시뿐, 수학 4교시 앞에는 2교시
  M.setSwap(MON, 2, '수학', '국어');
  assert.deepEqual(M.prevSame(ctx(), MON, 3), [1]);
  assert.deepEqual(M.prevSame(ctx(), MON, 4), [2]);
  // 앞날(다음 주 월요일)은 체크할 수 없으니 묻지 않음
  assert.deepEqual(M.prevSame(ctx(), '2026-11-23', 3), []);
});

test('❷ 함께 완료: 앞 교시는 「by: 누른 교시」로 남기고, 누른 칸을 다시 해제하면 함께 완료한 칸도 해제', () => {
  seed();
  assert.equal(M.markWith(ctx(), MON, 3, [1, 2]), true);
  const day = log()[MON];
  assert.deepEqual([day[1].status, day[2].status, day[3].status], ['done', 'done', 'done']);
  assert.equal(day[1].by, 3); assert.equal(day[2].by, 3); assert.equal(day[3].by, undefined);
  assert.deepEqual(M.groupOf(ctx(), MON, 3), [1, 2]);
  assert.deepEqual(M.groupOf(ctx(), MON, 1), []);
  // 시수·진도: 세 시간 모두 완료로 셈
  assert.equal(M.hours(ctx(), M.listSubjects().find(s => s.id === 'ko')).done, 3);
  assert.equal(M.unmarkWith(ctx(), MON, 3), true);
  assert.equal(log()[MON], undefined, '기록이 모두 지워짐');
});

test('❷ 함께 완료한 칸을 따로 고치면 묶음에서 빠짐(1교시만 다시 체크·교과 바꾸기·하루 한꺼번에)', () => {
  seed();
  M.markWith(ctx(), MON, 3, [1, 2]);
  M.setMark(MON, 1, '국어', 'part');
  assert.equal(log()[MON][1].by, undefined);
  M.setMark(MON, 1, '국어', 'done');
  assert.equal(log()[MON][1].by, undefined, '따로 다시 완료해도 묶음 아님');
  assert.deepEqual(M.groupOf(ctx(), MON, 3), [2]);
  M.setSwap(MON, 2, '수학', '국어');
  assert.deepEqual(M.groupOf(ctx(), MON, 3), [], '교체한 칸은 빠짐');
  // 메모를 적어도 묶음은 그대로
  seed();
  M.markWith(ctx(), MON, 3, [1, 2]);
  M.setMemo(MON, 2, '국어', '활동 3 못 함');
  assert.deepEqual(M.groupOf(ctx(), MON, 3), [1, 2]);
  assert.equal(M.unmarkWith(ctx(), MON, 3), true);
  assert.deepEqual(log()[MON], { 2: { subject: '국어', status: '', memo: '활동 3 못 함' } }, '메모는 남김');
});

test('❷ 누른 칸을 따로 고치면(일부 진행·교과 바꾸기) 묶음이 풀림 — 앞 교시 완료는 그대로', () => {
  seed();
  M.markWith(ctx(), MON, 3, [1, 2]);
  M.setMark(MON, 3, '국어', 'part');
  assert.deepEqual(M.groupOf(ctx(), MON, 3), []);
  assert.deepEqual([log()[MON][1].status, log()[MON][2].status], ['done', 'done']);
  M.setMark(MON, 3, '국어', 'done');
  assert.equal(M.unmarkWith(ctx(), MON, 3), true);
  assert.deepEqual([log()[MON][1].status, log()[MON][2].status, log()[MON][3]], ['done', 'done', undefined], '다시 따로 완료한 3교시만 해제');
  seed();
  M.markWith(ctx(), MON, 3, [1, 2]);
  M.setSwap(MON, 3, '수학', '국어');
  assert.deepEqual(M.groupOf(ctx(), MON, 3), []);
});

test('❷ by는 1~7교시 정수이고 완료일 때만 남김(잘못된 값은 버림)', () => {
  seed();
  store.set('class:log', { [MON]: { 1: { subject: '국어', status: 'done', by: 3 }, 2: { subject: '국어', status: 'part', by: 3 }, 3: { subject: '국어', status: 'done', by: 9 }, 4: { subject: '수학', status: 'done', by: 'x' } } });
  const d = M.getLog()[MON];
  assert.equal(d[1].by, 3); assert.equal(d[2].by, undefined); assert.equal(d[3].by, undefined); assert.equal(d[4].by, undefined);
});

test('❷ 묻기/묻지 않기 스위치: 처음은 묻기, 끄면 묻지 않음 — 학년도와 상관없이 이 기기에 기억(class:askPrev)', () => {
  store.useStorage(mem());
  assert.equal(M.getAskPrev(), true);
  M.setAskPrev(false);
  assert.equal(M.getAskPrev(), false);
  M.setAskPrev(true);
  assert.equal(M.getAskPrev(), true);
  assert.equal(isYearKey('class:askPrev'), false);
});
