// 학급 › 오늘 수업 · 진도표·시수 손보기(2026-11-18, 스펙 docs/superpowers/specs/2026-11-18-class-fix-design.md A).
// 시간표 판(지난날은 그때 시간표), 처음 실시 시수와 진도 자리 나누기, 공문 띠 차례, 앞날 체크, 반만 체크한 날, 가져오기 이름·두 시간 줄,
// 재량휴업일, 진도표 없는 교과의 시수·전담, 하루 한꺼번에·교체, 수업 메모, 창체 영역·연간 실시
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { addDays } from '../../web/core/calendar.js';
import * as M from '../../web/menus/class/class-model.js';
import { parseJindo } from '../../web/menus/class/class-import.js';
import { sampleData } from '../../web/menus/class/class-sample.js';
import { dueBand } from '../../web/menus/home/home-model.js';
import { carryOver } from '../../web/core/years.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const fresh = () => store.useStorage(mem());
const empty = () => Array.from({ length: 5 }, () => Array(6).fill(''));
const L = n => Array.from({ length: n }, (_, i) => ({ week: null, period: '', from: '', unit: '1. 단원', title: `차시 ${i + 1}`, pages: '', memo: '' }));
const TODAY = '2026-11-18'; // 수요일
const ctx = () => M.makeCtx(TODAY);
const sub = id => M.listSubjects().find(s => s.id === id);

/* 월1 국어·월2 수학·화1 국어·수1 국어, 국어·수학 진도표 40차시 */
function seed() {
  fresh();
  const c = empty(); c[0][0] = '국어'; c[0][1] = '수학'; c[1][0] = '국어'; c[2][0] = '국어';
  M.setTimetable({ periods: 6, cells: c });
  M.saveSubject({ id: 'ko', name: '국어', start: '2026-11-02', offset: 0, lessons: L(40) });
  M.saveSubject({ id: 'ma', name: '수학', start: '2026-11-02', offset: 0, lessons: L(40) });
  return c;
}

test('[1] 시간표를 「오늘부터」 바꾸면 지난날은 그때 시간표, 체크한 교과·시수 그대로', () => {
  seed();
  M.setMark('2026-11-16', 1, '국어', 'done');
  const before = M.hours(ctx(), sub('ko')).done;
  M.setTimetable(M.editCell(M.getTimetable(), 0, 0, '수학', TODAY));
  const t = M.getTimetable();
  assert.equal(t.cells[0][0], '수학', '지금 시간표');
  assert.equal(t.versions.length, 2, '판 둘');
  assert.equal(M.cellsOn(t, '2026-11-16')[0][0], '국어', '지난 월요일은 국어');
  assert.equal(M.cellsOn(t, '2026-11-23')[0][0], '수학', '다음 월요일은 수학');
  const s1 = M.dayView(ctx(), '2026-11-16').slots.find(s => s.period === 1);
  assert.deepEqual([s1.subject, s1.status], ['국어', 'done']);
  assert.equal(M.hours(ctx(), sub('ko')).done, before, '국어 실시가 줄어듦');
  assert.equal(M.dayView(ctx(), '2026-11-23').slots[0].subject, '수학');
  // 같은 날 다시 고치면 판이 늘지 않고, 처음과 같아지면 판을 합침
  M.setTimetable(M.editCell(M.getTimetable(), 0, 0, '국어', TODAY));
  assert.equal(M.getTimetable().versions, undefined, '같아진 판이 남음');
});

test('[1] 「처음부터 고치기」도 체크한 칸은 기록된 교과로 보이고, 다른 교과 기록을 덮어쓰지 않음', () => {
  seed();
  M.setMark('2026-11-16', 1, '국어', 'done');
  M.setTimetable(M.editCell(M.getTimetable(), 0, 0, '수학', ''));
  assert.equal(M.getTimetable().versions, undefined);
  assert.equal(M.cellsOn(M.getTimetable(), '2026-11-16')[0][0], '수학');
  const s1 = M.dayView(ctx(), '2026-11-16').slots.find(s => s.period === 1);
  assert.deepEqual([s1.subject, s1.status, s1.planned], ['국어', 'done', '수학'], '기록된 교과');
  // 화면은 slot.subject로 체크 → 국어 기록이 그대로 「일부 진행」
  M.setMark('2026-11-16', 1, s1.subject, 'part');
  assert.deepEqual(M.getLog()['2026-11-16'][1], { subject: '국어', status: 'part' });
  assert.equal(M.hours(ctx(), sub('ko')).done, 1, '국어 실시');
  assert.equal(M.hours(ctx(), sub('ma')).done, 0, '수학으로 셈');
});

test('[1] 시간표 기준(slot) 교과에 칸을 더해도 지난 진도 차이·체크하지 않은 날이 바뀌지 않음', () => {
  fresh();
  const c = empty(); c[0][0] = '과학'; c[2][0] = '과학';
  M.setTimetable({ periods: 6, cells: c });
  M.saveSubject({ id: 'sc', name: '과학', start: '2026-09-07', offset: 0, lessons: L(80) });
  let x = M.makeCtx('2026-11-16');
  for (let d = '2026-09-07'; d < '2026-11-16'; d = addDays(d, 1)) for (const s of M.slotsOn(x, d)) M.setMark(d, s.period, s.subject, 'done');
  x = M.makeCtx('2026-11-16');
  const p0 = M.progressOf(x, sub('sc'));
  M.setTimetable(M.editCell(M.getTimetable(), 4, 2, '과학', '2026-11-16'));
  x = M.makeCtx('2026-11-16');
  const p1 = M.progressOf(x, sub('sc'));
  assert.equal(p1.diff, p0.diff, `진도 차이 ${p0.diff} → ${p1.diff}`);
  assert.deepEqual(M.missingDays(x), [], '지난 금요일이 체크하지 않은 날로');
});

test('[1] 시간표 통째로 바꾸기(파일): 그 날부터 / 처음부터, 지난 기록이 있는지', () => {
  seed();
  const next = empty(); next[0][0] = '사회';
  const t = M.replaceTimetable(M.getTimetable(), { periods: 5, cells: next }, TODAY);
  assert.equal(t.periods, 5); assert.equal(t.cells[0][0], '사회');
  assert.equal(M.cellsOn(t, '2026-11-16')[0][0], '국어');
  assert.equal(M.replaceTimetable(M.getTimetable(), { periods: 5, cells: next }, '').versions, undefined);
  assert.equal(M.hasPastRecords(M.getLog(), TODAY), false);
  M.setMark(TODAY, 1, '국어', 'done');
  assert.equal(M.hasPastRecords(M.getLog(), TODAY), false, '오늘 기록은 지난 기록이 아님');
  M.setMark('2026-11-17', 1, '국어', 'done');
  assert.equal(M.hasPastRecords(M.getLog(), TODAY), true);
  // 망가진 판·같은 날 판은 다듬음, 판이 하나면 두지 않음
  const n = M.normTimetable({ periods: 6, cells: next, versions: [{ from: 'x', cells: [] }, { from: '2026-11-02', cells: empty() }, 3] });
  assert.equal(n.versions, undefined);
  const n2 = M.normTimetable({ periods: 6, cells: next, versions: [{ from: '2026-09-01', cells: empty() }, { from: '2026-11-02', cells: next }] });
  assert.equal(n2.versions.length, 2); assert.equal(n2.versions[0].from, '', '첫 판은 처음부터');
});

test('[2] 「다음 차시」를 바꿔도 실시 시수는 그대로 — 처음 실시(hours0)와 진도 자리(offset)', () => {
  fresh();
  const c = empty(); c[0][0] = '국어'; c[1][0] = '국어'; c[2][0] = '국어';
  M.setTimetable({ periods: 6, cells: c });
  M.saveSubject({ id: 'ko', name: '국어', start: '2026-11-09', offset: 0, lessons: L(40) });
  M.setMark('2026-11-09', 1, '국어', 'done'); M.setMark('2026-11-10', 1, '국어', 'done'); M.setMark('2026-11-11', 1, '국어', 'part'); M.setMark('2026-11-16', 1, '국어', 'done');
  assert.deepEqual(M.hours(ctx(), sub('ko')), { plan: 40, done: 4, left: 36 });
  M.saveSubject(M.setNext(ctx(), sub('ko'), 6));
  assert.equal(M.hours(ctx(), sub('ko')).done, 4, '다음 차시 6');
  assert.equal(M.progressOf(ctx(), sub('ko')).next, 6);
  M.saveSubject(M.setNext(ctx(), sub('ko'), 2));
  assert.equal(M.hours(ctx(), sub('ko')).done, 4, '다음 차시 2');
  // 예전 자료: hours0가 없으면 offset을 처음 실시로
  store.set('class:subjects', [{ id: 'old', name: '수학', offset: 7, lessons: L(10) }]);
  assert.equal(M.listSubjects()[0].hours0, 7);
  assert.equal(M.hours(ctx(), M.listSubjects()[0]).done, 7);
  store.set('class:subjects', [{ id: 'old', name: '수학', offset: -2, lessons: L(10) }]);
  assert.equal(M.listSubjects()[0].hours0, 0);
  // 처음 실시는 따로 고칠 수 있음
  assert.equal(M.normSubject({ id: 'a', name: '국어', offset: 3, hours0: 5, lessons: [] }).hours0, 5);
});

test('[2] 진도표를 새로 넣으면 계획 진도에 맞춘 자리가 처음 실시, 예시·새 학년도도', () => {
  fresh();
  const c = empty(); c[0][0] = '국어';
  M.setTimetable({ periods: 6, cells: c });
  const lessons = L(30).map((l, i) => ({ ...l, week: 1 + i, period: '', from: addDays('2026-09-07', 7 * i) }));
  const s = M.addSubject({ name: '국어', lessons });
  assert.ok(s.offset > 0);
  assert.equal(s.hours0, s.offset, '처음 실시');
  const smp = sampleData(TODAY);
  for (const x of smp.subjects) assert.equal(x.hours0, x.offset, x.name);
  const snap = { 'class:subjects': JSON.stringify([{ id: 'a', name: '국어', offset: 9, hours0: 12, lessons: [] }]), 'class:timetable': JSON.stringify({ periods: 6, cells: c, versions: [{ from: '', cells: empty() }, { from: '2026-11-02', cells: c }] }) };
  const out = carryOver(snap, 2027, { classSetup: true });
  const a = JSON.parse(out['class:subjects'])[0];
  assert.deepEqual([a.offset, a.hours0], [0, 0]);
  assert.equal(JSON.parse(out['class:timetable']).versions, undefined, '지난 학년도 판');
  assert.equal(JSON.parse(out['class:timetable']).cells[0][0], '국어');
});

test('[3] 공문 띠: 「오늘」 카드와 같은 차례(오늘·가까운 것 먼저, 지난 것은 뒤), 3개 + 외 n건', () => {
  const docs = [
    { id: 'a', title: '9월 안전교육 결과 제출', due: '2026-09-30', done: false, at: 1 },
    { id: 'b', title: '10월 급식 만족도', due: '2026-10-20', done: false, at: 2 },
    { id: 'c', title: '독서 실적 보고', due: '2026-11-02', done: false, at: 3 },
    { id: 'd', title: '학부모 상담 결과', due: TODAY, done: false, at: 4 },
    { id: 'e', title: '방과후 수요조사', due: '2026-11-19', done: false, at: 5 },
    { id: 'f', title: '다 한 공문', due: '2026-11-19', done: true, at: 6 }];
  const b = dueBand(docs, TODAY);
  assert.deepEqual(b.items.map(d => d.id), ['d', 'e', 'c']);
  assert.equal(b.more, 2);
  assert.deepEqual(dueBand([], TODAY), { items: [], more: 0 });
});

test('[4] 앞날 기록은 시수·진도에 세지 않음(예전에 넣은 것), 체크할 수 없음', () => {
  seed();
  store.set('class:log', { '2026-11-23': { 1: { subject: '국어', status: 'done' } } });
  assert.equal(M.hours(ctx(), sub('ko')).done, 0);
  assert.equal(M.progressOf(ctx(), sub('ko')).actual, M.progressOf({ ...ctx(), log: {} }, sub('ko')).actual);
  assert.equal(M.dayView(ctx(), '2026-11-23').slots[0].status, null, '앞날 체크');
  assert.equal(M.markDay(ctx(), '2026-11-23', 'done'), 0, '앞날 한꺼번에');
  assert.equal(M.canMark(ctx(), '2026-11-23'), false);
  assert.equal(M.canMark(ctx(), TODAY), true);
});

test('[5] 반만 체크한 날도 「체크하지 않은 날」, 남은 교시', () => {
  seed();
  M.setMark('2026-11-09', 1, '국어', 'done');
  M.setMark('2026-11-16', 1, '국어', 'done'); // 월2 수학은 안 함
  M.setMark('2026-11-17', 1, '국어', 'done');
  const x = ctx();
  assert.ok(M.missingDays(x).includes('2026-11-16'));
  assert.deepEqual(M.leftPeriods(x, '2026-11-16'), [2]);
  const m = M.missingList(x).find(d => d.date === '2026-11-16');
  assert.deepEqual(m, { date: '2026-11-16', periods: [2], part: true });
  assert.equal(M.missingList(x).find(d => d.date === '2026-11-10').part, false);
  assert.ok(!M.missingDays(x).includes('2026-11-17'));
});

test('[6] 가져오기: 학년도·학년·「과」가 붙은 이름, 띄어 쓴 「연간 지도 계획」, 교육과정 없는 제목, 두 시간 줄', () => {
  const rows = ['주 | 기간 | 단원명 | 학습 주제 | 차시 | 쪽수 | 비고', '1 | 8.24~8.29 | 1. 단원 | 주제 가 | 1/3 | 10~11 |', ' |  |  | 주제 나 | 2/3 | 12 |', '2 | 8.31~9.5 |  | 주제 다 | 3/3 | 13 |', '▶ 2학기 총 시수: 3시간'].join('\n');
  const of = h => parseJindo(h + '\n2026학년도 2학기 | 3학년 2반\n' + rows, { today: TODAY, year: 2026 }).subjects.map(s => [s.name, s.lessons.length]);
  assert.deepEqual(of('국어 교육과정 연간지도계획'), [['국어', 3]]);
  assert.deepEqual(of('2026학년도 3학년 국어 교육과정 연간지도계획'), [['국어', 3]]);
  assert.deepEqual(of('국어과 교육과정 연간지도계획'), [['국어', 3]]);
  assert.deepEqual(of('과학과 교육과정 연간지도계획'), [['과학', 3]]);
  assert.deepEqual(of('실과 교육과정 연간지도계획'), [['실과', 3]]);
  assert.deepEqual(of('국어 교육과정 연간 지도 계획'), [['국어', 3]]);
  assert.deepEqual(of('3학년 국어 연간지도계획'), [['국어', 3]]);
  assert.deepEqual(of('2026학년도 2학기 수학과 연간 지도계획'), [['수학', 3]]);
  // 두 시간 줄 「2~3/4」은 한 시간씩
  const r = parseJindo('국어 교육과정 연간지도계획\n' + rows.replace('2/3 | 12', '2~3/4 | 12').replace('3/3 | 13', '4/4 | 13'), { today: TODAY, year: 2026 });
  const ls = r.subjects[0].lessons;
  assert.deepEqual(ls.map(l => [l.title, l.no]), [['주제 가', '1/3'], ['주제 나', '2/4'], ['주제 나', '3/4'], ['주제 다', '4/4']]);
  assert.equal(ls[2].pages, '12');
  // 표 머리·안내 글은 교과가 아님
  const z = parseJindo('※ 각 교과 연간지도계획에 따라 운영함\n국어 교육과정 연간지도계획\n' + rows, { today: TODAY, year: 2026 });
  assert.deepEqual(z.subjects.map(s => s.name), ['국어']);
});

test('[7] 학사일정 「재량휴업일」「개교기념일」「휴업일」은 수업 없는 날, 방학식·개학식·공문 일정은 아님', () => {
  seed();
  store.set('calendar', [
    { date: '2026-11-16', title: '재량휴업일', source: 'year:a' },
    { date: '2026-11-17', title: '개교기념일', source: 'year:a' },
    { date: '2026-11-18', title: '방학식', source: 'year:a' },
    { date: '2026-11-23', title: '재량휴업일 운영 계획 제출', source: 'year:a' },
    { date: '2026-11-24', title: '[제출] 재량휴업일 조사', source: 'gongmun' },
    { date: '2026-11-25', title: '휴업일', source: 'event:b' }]);
  const x = ctx();
  assert.equal(M.dayView(x, '2026-11-16').off, '재량휴업일');
  assert.deepEqual(M.slotsOn(x, '2026-11-16'), []);
  assert.equal(M.dayView(x, '2026-11-17').off, '개교기념일');
  assert.equal(M.dayView(x, '2026-11-18').off, '');
  assert.equal(M.dayView(x, '2026-11-23').off, '');
  assert.equal(M.dayView({ ...x, today: '2026-11-20' }, '2026-11-24').off, '');
  assert.equal(M.dayView(x, '2026-11-25').off, '휴업일');
  // 주간학습안내도 같은 셈(weekView → dayView)
  assert.equal(M.weekView(x, '2026-11-16')[0].off, '재량휴업일');
});

test('[8] 진도표 없는 교과도 체크·시수(시수만), 전담은 체크하지 않음', () => {
  seed();
  const c = M.getTimetable(); c.cells[0][2] = '영어'; c.cells[0][3] = '창체(동)'; c.cells[1][2] = '체육';
  M.setTimetable(c);
  let x = ctx();
  const en = M.dayView(x, '2026-11-16').slots.find(s => s.period === 3);
  assert.deepEqual([en.subject, en.sub, en.kind], ['영어', null, 'hours']);
  assert.equal(M.dayView(x, '2026-11-16').slots[0].kind, 'plan');
  M.setMark('2026-11-16', 3, '영어', 'done'); M.setMark('2026-11-09', 3, '영어', 'part'); M.setMark('2026-11-02', 3, '영어', 'skip');
  M.setMark('2026-11-16', 4, '창체(동)', 'done');
  M.setExtra('영어', { plan: 68 });
  x = ctx();
  assert.deepEqual(M.extraNames(x), ['영어', '체육', '창체']);
  const e = M.extraSummary(x);
  assert.deepEqual(e.map(r => [r.name, r.plan, r.done, r.left, r.staff]), [['영어', 68, 2, 66, false], ['체육', null, 0, null, false], ['창체', null, 1, null, false]]);
  M.setExtra('체육', { staff: true });
  x = ctx();
  assert.equal(M.dayView(x, '2026-11-17').slots.find(s => s.period === 3).kind, 'staff');
  assert.equal(M.extraSummary(x).find(r => r.name === '체육').staff, true);
  assert.deepEqual(M.getExtra(), { 영어: { plan: 68, staff: false }, 체육: { plan: null, staff: true } });
  M.setExtra('체육', { staff: false, plan: null });
  assert.deepEqual(Object.keys(M.getExtra()), ['영어'], '빈 설정은 지움');
  store.set('class:extra', { 음악: { plan: 'x', staff: 1 }, '': {}, 미술: 3 });
  assert.deepEqual(M.getExtra(), { 음악: { plan: null, staff: true } });
});

test('[9] 남은 칸 모두 완료·이 날 모두 못 함(전담 빼고), 교체·보강은 그날 기록에만', () => {
  seed();
  const c = M.getTimetable(); c.cells[0][2] = '체육'; M.setTimetable(c);
  M.setExtra('체육', { staff: true });
  M.setMark('2026-11-16', 1, '국어', 'part');
  assert.equal(M.markDay(ctx(), '2026-11-16', 'done'), 1, '남은 칸(수학)만');
  assert.deepEqual(M.getLog()['2026-11-16'], { 1: { subject: '국어', status: 'part' }, 2: { subject: '수학', status: 'done' } });
  assert.equal(M.markDay(ctx(), '2026-11-16', 'skip', 'all'), 2);
  assert.deepEqual(Object.values(M.getLog()['2026-11-16']).map(r => r.status), ['skip', 'skip']);
  assert.deepEqual(M.dayMarks(ctx(), '2026-11-16'), { left: 0, marked: 2, kept: 0 });
  // 교체: 화1 국어 → 수학(그날만), 체크는 지움, 시간표는 그대로
  M.setMark('2026-11-17', 1, '국어', 'done');
  assert.ok(M.setSwap('2026-11-17', 1, '수학', '국어'));
  const s = M.dayView(ctx(), '2026-11-17').slots[0];
  assert.deepEqual([s.subject, s.planned, s.status, s.swap], ['수학', '국어', null, true]);
  assert.equal(M.getTimetable().cells[1][0], '국어');
  M.setMark('2026-11-17', 1, '수학', 'done');
  assert.equal(M.hours(ctx(), sub('ma')).done, 1, '수학 실시(11/16 못 함은 빼고 11/17 교체)');
  assert.equal(M.hours(ctx(), sub('ko')).done, 0, '국어 실시(11/16 못 함, 11/17은 수학으로 바꿈)');
  M.setMark('2026-11-17', 1, '수학', null);
  assert.equal(M.dayView(ctx(), '2026-11-17').slots[0].subject, '수학', '체크를 지워도 교체는 남음');
  M.setSwap('2026-11-17', 1, '국어', '국어');
  assert.equal(M.getLog()['2026-11-17'], undefined, '시간표대로 되돌림');
  // 앞날 교체는 미리 넣을 수 있고 차시 예상에도 셈
  M.setSwap('2026-11-23', 1, '수학', '국어');
  assert.equal(M.dayView(ctx(), '2026-11-23').slots[0].subject, '수학');
  // 시간표에 없는 교시(보강)
  M.setSwap('2026-11-17', 5, '국어', '');
  assert.deepEqual(M.slotsOn(ctx(), '2026-11-17').map(x => [x.period, x.subject]), [[1, '국어'], [5, '국어']]);
});

test('[11] 수업 메모: 교시 기록에, 그 교과 다음 시간 줄에 「지난 시간」', () => {
  seed();
  assert.ok(M.setMemo('2026-11-16', 1, '국어', ' 활동 3 못 함, 다음 시간에 '));
  assert.deepEqual(M.getLog()['2026-11-16'][1], { subject: '국어', status: '', memo: '활동 3 못 함, 다음 시간에' });
  const v = M.dayView(ctx(), '2026-11-16').slots[0];
  assert.deepEqual([v.memo, v.status], ['활동 3 못 함, 다음 시간에', null]);
  assert.equal(M.dayView(ctx(), '2026-11-17').slots[0].last, '활동 3 못 함, 다음 시간에');
  assert.equal(M.dayView(ctx(), '2026-11-16').slots[1].last, '', '다른 교과');
  M.setMark('2026-11-16', 1, '국어', 'done');
  assert.equal(M.getLog()['2026-11-16'][1].memo, '활동 3 못 함, 다음 시간에', '체크해도 메모 그대로');
  M.setMark('2026-11-17', 1, '국어', 'done');
  assert.equal(M.dayView(ctx(), '2026-11-18').slots[0].last, '', '그 뒤 시간이 있으면 그 시간의 메모');
  M.setMemo('2026-11-16', 1, '국어', '');
  assert.deepEqual(M.getLog()['2026-11-16'][1], { subject: '국어', status: 'done' });
  M.setMark('2026-11-16', 1, '국어', null);
  assert.equal(M.getLog()['2026-11-16'], undefined);
  // 기록이 있는 칸의 메모는 기록된 교과에(다른 교과로 덮어쓰지 않음)
  M.setSwap('2026-11-17', 1, '수학', '국어');
  M.setMemo('2026-11-17', 1, '국어', '메모');
  assert.equal(M.getLog()['2026-11-17'][1].subject, '수학');
});

test('[12] 창체 영역(자·동·봉·진) 시수, 2학기 진도표로 바꿔도 연간 실시', () => {
  seed();
  const c = M.getTimetable(); c.cells[0][2] = '창체(자)'; c.cells[0][3] = '창체(동)'; c.cells[1][2] = '창체(봉)'; M.setTimetable(c);
  M.setMark('2026-11-16', 3, '창체(자)', 'done'); M.setMark('2026-11-16', 4, '창체(동)', 'done'); M.setMark('2026-11-09', 4, '창체(동)', 'part'); M.setMark('2026-11-17', 3, '창체(봉)', 'skip');
  assert.deepEqual(M.areaHours(ctx(), '창체'), [['자율·자치', 1], ['동아리', 2]]);
  assert.deepEqual(M.areaHours(ctx(), '영어'), []);
  // 2학기 진도표(since) 앞 1학기 기록도 연간 실시에
  store.set('class:log', { '2026-06-01': { 1: { subject: '국어', status: 'done' } }, '2026-06-02': { 1: { subject: '국어', status: 'skip' } }, '2026-09-07': { 1: { subject: '국어', status: 'done' } } });
  const ko = { id: 'k', name: '국어', start: '2026-08-24', since: '2026-08-24', offset: 0, hours0: 2, lessons: L(98) };
  const x = { ...ctx(), subjects: [ko] };
  assert.equal(M.hours(x, ko).done, 3);
  assert.equal(M.yearHours(x, ko), 4);
  assert.equal(M.yearHours(x, { ...ko, since: undefined }), M.hours(x, { ...ko, since: undefined }).done);
});
