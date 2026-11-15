// 2026-11-15 검토 고침 — 「오늘」의 공문 기한·회의 할 일, 새 학년도의 회의록.
// 채팅 「오늘 할 일」: 공문 기한과 회의 할 일을 섞어 남은 날 차례(공문이 쓰던 규칙 그대로, 같은 날이면 공문 먼저).
// 기한 카드(3개까지): 오늘·남은 것(D-0~D-7) 먼저 가까운 차례, 지난 것은 그 뒤에 덜 지난 것 먼저 — 오래 잊은 할 일이 오늘·D-2를 가리지 않게(공문 카드도 같게).
// 새 학년도: 끝내지 않은 할 일이 있는 회의록은 가져감(끝나지 않은 공문처럼, 모델이 받는 칸만), 다 끝낸 회의록은 지난 학년도에.
// 이름은 모두 지어낸 것(김하늘·이바다·한가람·새싹초등학교)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { briefing } from '../../web/core/briefing.js';
import * as H from '../../web/menus/home/home-model.js';
import { listMinutes } from '../../web/menus/etc/minutes-model.js';
import { carryOver } from '../../web/core/years.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }
const ls = mem();
store.useStorage(ls);
const J = v => JSON.stringify(v);

const TODAY = '2026-11-15';
const SEP = { id: 'mSep', title: '9월 학년 협의회', todos: [{ task: '체험학습 결과 보고서 내기', who: '김하늘', due: '2026-09-20', done: false }] }; // 56일 지남(잊은 할 일)
const NOV = { id: 'mNov', title: '3학년 학년 협의회', todos: [
  { task: '버스 예약', who: '이바다', due: '2026-11-17', done: false }, // D-2
  { task: '안전 교육 자료 만들기', who: '한가람', due: TODAY, done: false }, // 오늘
  { task: '학부모 상담 안내', due: '2026-11-14', done: false }, // 1일 지남
  { task: '끝낸 일', due: '2026-11-16', done: true },
  { task: '먼 일', due: '2026-11-30', done: false },
  { task: '사전 교육 준비', due: '2026-11-22', done: false }] }; // D-7
const FEW = { id: 'mFew', title: '교무부 부서 협의회', todos: [{ task: '안전 교육 자료 만들기', due: TODAY, done: false }, { task: '학부모 상담 안내', due: '2026-11-14', done: false }] };
const DOCS = [
  { id: 'g1', title: '1학기 방과후 만족도 조사 회신', due: '2026-09-20', done: false, at: 1 }, // 56일 지남
  { id: 'g2', title: '안전 점검 결과 보고', due: '2026-11-13', done: false, at: 2 }, // 2일 지남
  { id: 'g3', title: '과학의 날 참가 신청', due: '2026-11-17', done: false, at: 3 }, // D-2
  { id: 'g4', title: '새싹초등학교 연수 이수 현황 제출', due: TODAY, done: false, at: 4 }, // 오늘
  { id: 'g5', title: '다 한 공문', due: '2026-11-16', done: true, at: 5 },
  { id: 'g6', title: '먼 공문', due: '2026-11-30', done: false, at: 6 }];

test('[today-brief-merge] 채팅 「오늘 할 일」: 공문 기한과 회의 할 일을 섞어 남은 날 차례(같은 날이면 공문 먼저), 그 뒤에 학사일정', () => {
  const l = briefing({ today: TODAY, docs: DOCS, meetings: [SEP, NOV], events: [{ date: '2026-11-16', title: '학예회 연습', source: 'year:p' }] });
  const due = l.filter(x => x.kind === 'gongmun' || x.kind === 'minutes');
  assert.deepEqual(due.map(x => x.kind), ['gongmun', 'minutes', 'gongmun', 'minutes', 'gongmun', 'minutes', 'gongmun', 'minutes', 'minutes']);
  assert.deepEqual(due.map(x => x.text), ['공문 「1학기 방과후 만족도 조사 회신」 제출', '회의 할 일 「체험학습 결과 보고서 내기」', '공문 「안전 점검 결과 보고」 제출', '회의 할 일 「학부모 상담 안내」',
    '공문 「새싹초등학교 연수 이수 현황 제출」 제출', '회의 할 일 「안전 교육 자료 만들기」', '공문 「과학의 날 참가 신청」 제출', '회의 할 일 「버스 예약」', '회의 할 일 「사전 교육 준비」']);
  assert.deepEqual(due.map(x => x.when), ['56일 지남', '56일 지남', '2일 지남', '1일 지남', '오늘', '오늘', 'D-2', 'D-2', 'D-7']);
  assert.deepEqual(due.map(x => x.hot), [true, true, true, true, true, true, false, false, false]);
  assert.deepEqual([due[0].route, due[1].route], [{ to: 'gongmun', id: 'g1' }, { to: 'minutes', id: 'mSep' }]);
  // 기한 줄이 맨 앞, 학사일정은 그 뒤
  assert.deepEqual(l.slice(0, 10).map(x => x.kind), [...due.map(x => x.kind), 'schedule']);
});

test('[today-card-minutes] 기한 카드의 회의 할 일(3개까지): 오늘·D-n 먼저 가까운 차례, 지난 것은 그 뒤에 덜 지난 것 먼저 — 「지남」 배지 그대로, 할 일 수에 셈', () => {
  const c = H.minutesCard([SEP, NOV], TODAY);
  // 56일 지난 할 일·1일 지난 할 일이 오늘·D-2·D-7을 가리지 않음
  assert.deepEqual(c.map(x => [x.id, x.title, x.badge]), [['mNov', '안전 교육 자료 만들기', '오늘'], ['mNov', '버스 예약', 'D-2'], ['mNov', '사전 교육 준비', 'D-7']]);
  assert.equal(H.todoCount({ minutes: c }), 3);
  // 남은 것이 3개보다 적으면 지난 것이 그 뒤(덜 지난 것 먼저)
  const f = H.minutesCard([SEP, FEW], TODAY);
  assert.deepEqual(f.map(x => [x.id, x.title, x.badge, x.note]), [['mFew', '안전 교육 자료 만들기', '오늘', '오늘까지예요'], ['mFew', '학부모 상담 안내', '지남', '1일 지났어요'],
    ['mSep', '체험학습 결과 보고서 내기', '지남', '56일 지났어요']]);
  assert.deepEqual(f.map(x => [x.tone, x.sym]), [['err', '!'], ['err', '!'], ['err', '!']]);
  assert.equal(H.todoCount({ minutes: f }), 3, '지난 할 일도 할 일 수에');
  assert.deepEqual(H.minutesCard([SEP], TODAY).map(x => x.badge), ['지남']);
});

test('[today-card-gongmun] 공문 기한 카드도 같은 차례: 오늘·D-2 먼저, 지난 공문은 그 뒤(덜 지난 것 먼저), 다 한·먼 공문은 빼고', () => {
  const g = H.gongmunCard(DOCS, TODAY);
  assert.deepEqual(g.map(x => [x.id, x.badge]), [['g4', '오늘'], ['g3', 'D-2'], ['g2', '지남']]);
  assert.equal(g[2].note, '2일 지났어요');
  assert.deepEqual(H.gongmunCard([DOCS[0], DOCS[1]], TODAY).map(x => x.note), ['2일 지났어요', '56일 지났어요']);
});

test('[today-card-merge] 카드 안 공문·회의 할 일을 섞어도 같은 차례(H.dueOrder — 같은 날이면 공문 먼저)', () => {
  assert.equal(typeof H.dueOrder, 'function');
  const lines = [...H.gongmunCard(DOCS, TODAY), ...H.minutesCard([SEP, FEW], TODAY)].sort(H.dueOrder);
  assert.deepEqual(lines.map(x => [x.title, x.badge]), [['새싹초등학교 연수 이수 현황 제출', '오늘'], ['안전 교육 자료 만들기', '오늘'], ['과학의 날 참가 신청', 'D-2'],
    ['학부모 상담 안내', '지남'], ['안전 점검 결과 보고', '지남'], ['체험학습 결과 보고서 내기', '지남']]);
});

const FEB = {
  id: 'mFeb', at: 3, kind: 'grade', title: '새 학년 준비 협의회', date: '2027-02-20', time: '15:00', place: '새싹초등학교 3학년 연구실', attendees: '김하늘 외 4명',
  agenda: [{ title: '새 학년 준비', discussion: ['교실 배정을 협의함'], decisions: ['3월 2일 전에 교실 정리'] }],
  todos: [{ task: '교실 게시판 꾸미기', who: '이바다', due: '2027-03-02', done: false }, { task: '명단 확인', who: '한가람', due: '2027-02-25', done: true }],
  next: { date: '2027-03-05', topic: '학급 규칙' }, touched: ['title', 'todos'], read: true,
  memo: '넣은 메모 글(저장하지 않는 칸)', extra: { x: 1 }
};

test('[today-carry-minutes] 새 학년도: 끝내지 않은 할 일이 있는 회의록은 가져감(칸 그대로, 모델이 받는 칸만), 다 끝낸·할 일 없는 회의록은 두고 감', () => {
  const snap = {
    'minutes:list': J([FEB,
      { id: 'mDone', at: 2, title: '1월 협의회', todos: [{ task: '끝낸 일', due: '2027-01-20', done: true }] },
      { id: 'mNone', at: 1, title: '할 일 없는 회의', todos: [] },
      { id: 'mNoDue', at: 0, title: '기한 없는 할 일', todos: [{ task: '자료 정리', due: '', done: false }] },
      { id: 'mBlank', title: '빈 할 일만', todos: [{ task: '  ', done: false }] },
      null, { title: 'id 없음', todos: [{ task: '할 일', done: false }] }])
  };
  const c = carryOver(snap, 2027);
  const list = JSON.parse(c['minutes:list'] || '[]');
  assert.deepEqual(list.map(m => m.id), ['mFeb', 'mNoDue']);
  const { memo, extra, ...kept } = FEB;
  assert.deepEqual(list[0], kept, '칸 그대로(끝낸 할 일도), 모델이 받지 않는 칸은 뺌');
  // 새 학년도 「오늘」: 가져간 3월 할 일이 그대로 보임
  ls.setItem('ssam:minutes:list', c['minutes:list']);
  assert.deepEqual(H.minutesCard(listMinutes(), '2027-03-02').map(x => [x.id, x.title, x.badge]), [['mFeb', '교실 게시판 꾸미기', '오늘']]);
  assert.deepEqual(briefing({ today: '2027-02-27', meetings: listMinutes() }).map(x => [x.text, x.when]), [['회의 할 일 「교실 게시판 꾸미기」', 'D-3']]);
  // 가져갈 것이 없으면 키를 만들지 않음(다른 것은 그대로)
  assert.ok(!('minutes:list' in carryOver({ 'minutes:list': J([{ id: 'mDone', title: '끝', todos: [{ task: '끝낸 일', done: true }] }]) }, 2027)));
  assert.ok(!('minutes:list' in carryOver({ 'minutes:list': '깨진 글' }, 2027)));
  assert.ok(!('minutes:list' in carryOver({}, 2027)));
  // 끝나지 않은 공문과 같이 가져감
  const both = carryOver({ ...snap, 'gongmun:list': J([{ id: 'a', title: 'B', due: '2027-03-03', done: false, tasks: [] }]) }, 2027);
  assert.deepEqual([JSON.parse(both['gongmun:list']).map(d => d.id), JSON.parse(both['minutes:list']).map(m => m.id)], [['a'], ['mFeb', 'mNoDue']]);
});
