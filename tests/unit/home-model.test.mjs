// 「오늘」 화면 모델(스펙 2026-11-11 §2): 머리 날짜 줄·할 일 수, 지금 교시, 오늘 수업 카드, 공문 기한 카드,
// 오늘 캠프 수업(지금 고른 캠프 먼저)·학생마다 그날 수업 모두 ○ → / → 빈칸, 이어서 하기(5줄까지), 처음 쓰는 선생님 안내
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BELL, dateLine, periodNow, lessonCard, gongmunCard, campsToday, dayMarks, cycleDay, campCard,
  multiLine, continueRows, todoCount, headline, isBlank, starter
} from '../../web/menus/home/home-model.js';
import { newCamp, markAll } from '../../web/menus/class/camp-model.js';
import { defaultQuant, allItems } from '../../web/menus/etc/multi-quant.js';

const WED = '2026-11-11'; // 수요일

test('머리: 「11월 11일 수요일 · 2026학년도」', () => {
  assert.equal(dateLine(WED, 2026), '11월 11일 수요일 · 2026학년도');
  assert.equal(dateLine('2027-01-03', 2026), '1월 3일 일요일 · 2026학년도');
  assert.equal(dateLine('망가짐', 2026), '2026학년도');
});

test('지금 교시: 수업 시간 안이면 지금, 쉬는 시간·아침이면 다음 교시, 끝나면 없음(그날 있는 교시만)', () => {
  assert.equal(BELL.length, 7);
  const ps = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(periodNow('08:30', ps), { period: 1, kind: 'next' });
  assert.deepEqual(periodNow('09:00', ps), { period: 1, kind: 'now' });
  assert.deepEqual(periodNow('09:39', ps), { period: 1, kind: 'now' });
  assert.deepEqual(periodNow('09:45', ps), { period: 2, kind: 'next' });
  assert.deepEqual(periodNow('10:00', ps), { period: 2, kind: 'now' });
  assert.deepEqual(periodNow('12:30', ps), { period: 5, kind: 'next' }, '점심시간이면 5교시가 다음');
  assert.equal(periodNow('15:00', ps), null, '6교시가 끝나면 없음');
  assert.deepEqual(periodNow('10:00', [1, 3]), { period: 3, kind: 'next' }, '그 시간에 수업이 없으면 다음 수업');
  assert.equal(periodNow('10:00', []), null);
  assert.equal(periodNow('망가짐', ps), null);
});

const sub = {
  id: 'kor', name: '국어', offset: 0, lessons: [
    { unit: '1. 마음을 나누어요', title: '시 낭송하기', no: '3/14' },
    { unit: '1. 마음을 나누어요', title: '느낌 말하기', no: '' }
  ]
};
const view = {
  date: WED, off: '', slots: [
    { period: 1, subject: '국어', sub, index: 0, lesson: sub.lessons[0], finished: false, status: 'done' },
    { period: 2, subject: '국어', sub, index: 1, lesson: sub.lessons[1], finished: false, status: null },
    { period: 3, subject: '체육', sub: null, index: null, lesson: null, finished: false, status: null },
    { period: 4, subject: '국어', sub, index: 2, lesson: null, finished: true, status: 'part' },
    { period: 5, subject: '국어', sub, index: 2, lesson: null, finished: true, status: 'skip' }
  ]
};

test('오늘 수업 카드: 교시마다 교과·차시·상태(완료·일부·못 함·남음), 지금 교시 강조, 남은 수', () => {
  const c = lessonCard(view, '10:05', { hasTimetable: true });
  assert.equal(c.state, 'list');
  assert.deepEqual(c.rows.map(r => r.period), [1, 2, 3, 4, 5]);
  assert.deepEqual(c.rows.map(r => r.subject), ['국어', '국어', '체육', '국어', '국어']);
  assert.equal(c.rows[0].text, '3/14차시 · 시 낭송하기');
  assert.equal(c.rows[1].text, '2/2차시 · 느낌 말하기');
  assert.equal(c.rows[2].text, '진도표 없음');
  assert.equal(c.rows[3].text, '진도표를 다 마쳤어요');
  assert.deepEqual(c.rows.map(r => r.status), ['done', 'left', 'none', 'part', 'skip'], '진도표 없는 교과는 체크하지 않아 상태 없음');
  assert.deepEqual(c.rows.map(r => r.label), ['완료', '남음', '', '일부', '못 함']);
  assert.ok(c.rows.filter(r => r.status !== 'none').every(r => r.sym && r.sym.length), '기호도 함께');
  assert.deepEqual(c.rows.map(r => r.now), ['', 'now', '', '', '']);
  assert.equal(c.left, 1, '체크할 수 있는(진도표 있는) 교시 가운데 남은 것만');
  assert.deepEqual(lessonCard(view, '09:45', { hasTimetable: true }).rows.map(r => r.now), ['', 'next', '', '', '']);
});

test('오늘 수업 카드: 시간표가 없으면 안내, 쉬는 날·수업 없는 요일은 그 까닭', () => {
  assert.deepEqual(lessonCard({ date: WED, off: '', slots: [] }, '10:00', { hasTimetable: false }), { state: 'none', rows: [], left: 0, off: '' });
  assert.deepEqual(lessonCard({ date: WED, off: '공휴일(개천절)', slots: [] }, '10:00', { hasTimetable: true }), { state: 'off', rows: [], left: 0, off: '공휴일(개천절)' });
  assert.equal(lessonCard({ date: WED, off: '', slots: [] }, '10:00', { hasTimetable: true }).state, 'empty');
});

test('공문 기한 카드: 지남·오늘·D-n(7일 안, 다 한 것 빼고) 3개까지, 배지 글·기호·색', () => {
  const docs = [
    { id: 'a', title: '안전 점검 결과 보고', due: '2026-11-09', done: false, at: 1 },
    { id: 'b', title: '과학의 날 참가 신청', due: '2026-11-13', done: false, at: 2 },
    { id: 'c', title: '오늘 마감', due: WED, done: false, at: 3 },
    { id: 'd', title: '먼 공문', due: '2026-11-30', done: false, at: 4 },
    { id: 'e', title: '끝난 공문', due: '2026-11-12', done: true, at: 5 },
    { id: 'f', name: '이름만 있는 공문.hwp', title: '', due: '2026-11-16', done: false, at: 6 },
    { id: 'g', title: '네 번째', due: '2026-11-17', done: false, at: 7 }];
  const r = gongmunCard(docs, WED);
  assert.deepEqual(r.map(x => x.id), ['a', 'c', 'b']);
  assert.deepEqual(r.map(x => x.badge), ['지남', '오늘', 'D-2']);
  assert.deepEqual(r.map(x => x.tone), ['err', 'err', 'warn']);
  assert.equal(r[0].note, '2일 지났어요');
  assert.ok(r[0].sym && r[1].sym, '급한 것은 기호');
  assert.equal(gongmunCard([docs[5]], WED)[0].title, '이름만 있는 공문.hwp');
  assert.equal(gongmunCard([docs[5]], WED)[0].badge, 'D-5');
  assert.equal(gongmunCard([docs[5]], WED)[0].tone, 'info');
  assert.deepEqual(gongmunCard([], WED), []);
});

const NAMES = ['김하늘', '이바다', '박구름'];
function camp(f = {}) {
  return newCamp({
    name: '수학 교과캠프', students: NAMES.map((name, i) => ({ id: 'st' + i, grade: 3, cls: 1, no: i + 1, name })),
    sessions: [
      { id: 's1', date: WED, start: '14:00', end: '14:40', subject: '수학' },
      { id: 's2', date: WED, start: '14:50', end: '15:30', subject: '수학' },
      { id: 's3', date: '2026-11-12', start: '14:00', end: '14:40', subject: '수학' }],
    ...f
  });
}

test('오늘 캠프 수업: 오늘 수업이 있는 캠프만, 지금 고른 캠프 먼저', () => {
  const a = { ...camp({ name: '국어 캠프' }), id: 'A' }, b = { ...camp(), id: 'B' }, c = { ...camp({ sessions: [{ id: 'x', date: '2026-11-20' }] }), id: 'C' };
  assert.deepEqual(campsToday([a, b, c], 'B', WED).map(x => x.camp.id), ['B', 'A']);
  assert.deepEqual(campsToday([a, b, c], 'C', WED).map(x => x.camp.id), ['A', 'B']);
  assert.deepEqual(campsToday([a, b, c], '', WED)[0].sessions.map(s => s.id), ['s1', 's2']);
  assert.deepEqual(campsToday([c], 'C', WED), []);
  assert.deepEqual(campsToday([], '', WED), []);
});

test('학생마다 그날 수업 모두: ○ 출석 → / 결석 → 빈칸 → ○, 섞여 있으면 「일부」에서 ○로', () => {
  let c = camp();
  const st = c => dayMarks(c, WED).map(s => s.mark);
  assert.deepEqual(st(c), ['', '', '']);
  assert.deepEqual(dayMarks(c, WED).map(s => s.name), NAMES);
  c = cycleDay(c, WED, 'st0');
  assert.deepEqual(st(c), ['O', '', '']);
  assert.deepEqual(c.att.s1, { st0: 'O' }); assert.deepEqual(c.att.s2, { st0: 'O' });
  assert.equal(c.att.s3, undefined, '다른 날은 그대로');
  c = cycleDay(c, WED, 'st0');
  assert.deepEqual(st(c), ['X', '', '']);
  c = cycleDay(c, WED, 'st0');
  assert.deepEqual(st(c), ['', '', '']);
  assert.equal(c.att.s1, undefined, '빈칸이면 지움');
  c = { ...c, att: { s1: { st1: 'O' }, s2: { st1: 'X' } } };
  assert.equal(dayMarks(c, WED)[1].mark, 'mixed');
  c = cycleDay(c, WED, 'st1');
  assert.deepEqual(st(c), ['', 'O', '']);
  assert.deepEqual(cycleDay(c, WED, '없는 학생'), c, '없는 학생은 그대로');
});

test('캠프 카드: 이름·오늘 수업 수·시간, 학생, 덜 체크한 학생 수, [모두 출석] 뒤 다 됨', () => {
  const c = camp();
  const k = campCard(c, WED);
  assert.equal(k.name, '수학 교과캠프');
  assert.equal(k.count, 2);
  assert.equal(k.time, '14:00~15:30');
  assert.equal(k.students.length, 3);
  assert.equal(k.left, 3);
  const done = campCard(markAll(c, WED), WED);
  assert.equal(done.left, 0);
  assert.ok(done.students.every(s => s.mark === 'O'));
  assert.equal(campCard(newCamp({ name: '', students: [], sessions: [{ id: 'q', date: WED }] }), WED).name, '이름 없는 캠프');
  assert.equal(campCard(newCamp({ students: [], sessions: [{ id: 'q', date: WED }] }), WED).time, '');
});

function multi({ values = {}, report = null, short = false } = {}) {
  return { info: { short }, quant: { criteria: defaultQuant(), values }, qual: { report } };
}
test('다면평가 줄: 시작한 경우만 정량 총점 n/100 · 입력 필요 n곳', () => {
  assert.equal(multiLine(multi()), null, '시작 전');
  assert.equal(multiLine(null), null);
  const items = allItems(defaultQuant());
  const first = items[0];
  const v = { [first.id]: { v: first.kind === 'choice' ? '0' : '1', count: '', deduct: '' } };
  const m = multiLine(multi({ values: v }));
  assert.equal(m.max, 100);
  assert.ok(Number.isFinite(m.total) && m.total >= 0, String(m.total));
  assert.equal(m.missing, 0);
  assert.equal(m.text, `다면평가 정량 ${m.total}/100점`);
  assert.deepEqual(m.route, { to: 'multi' });
  const q = multiLine(multi({ report: { missing: [{ path: 'basics.a' }, { path: 'self.b' }] } }));
  assert.equal(q.missing, 2);
  assert.equal(q.text, '다면평가 정량 0/100점 · 입력 필요 2곳');
  assert.equal(multiLine(multi({ values: { [first.id]: { v: '', count: '', deduct: '' } } })), null, '빈 값만 있으면 시작 전');
});

test('이어서 하기: 브리핑 줄(공문은 카드에 있어 뺌) + 품의 최근 초안 + 다면평가, 5줄까지', () => {
  const now = Date.UTC(2026, 10, 11, 1);
  const brief = [
    { kind: 'gongmun', text: '공문 「x」 제출', when: 'D-1', route: { to: 'gongmun' } },
    ...Array.from({ length: 6 }, (_, i) => ({ kind: 'schedule', text: '일정 ' + i, when: '오늘', route: { to: 'today' } }))];
  const recent = [
    { id: 'p0', at: now - 86400000, form: { project: '과학실 물품' }, draft: null },
    { id: 'p1', at: now - 2 * 86400000, form: { project: '알코올램프' }, draft: { title: '과학 실험 물품 구입' } },
    { id: 'p2', at: now - 3 * 86400000, form: {}, draft: { title: '오래된 것 아님' } }];
  const ml = { text: '다면평가 정량 40/100점', route: { to: 'multi' } };
  const rows = continueRows({ brief, recent, multi: ml, now });
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(r => r.text), ['일정 0', '일정 1', '일정 2', '품의 「과학 실험 물품 구입」 초안 이어서 쓰기', '다면평가 정량 40/100점']);
  assert.deepEqual(rows[3].route, { to: 'purchase', id: 'p1' });
  assert.equal(rows[3].kind, 'purchase');
  assert.ok(!rows.some(r => r.kind === 'gongmun'), '공문 줄은 뺌');
  const few = continueRows({ brief: brief.slice(0, 2), recent: [], multi: null, now });
  assert.deepEqual(few.map(r => r.text), ['일정 0']);
  const old = continueRows({ brief: [], recent: [{ id: 'z', at: now - 20 * 86400000, form: {}, draft: { title: '보름 넘은 초안' } }], multi: null, now });
  assert.deepEqual(old, [], '14일보다 오래된 초안은 뺌');
  assert.equal(continueRows({ brief: [], recent: [{ id: 'y', at: now, form: { project: '' }, draft: { title: '' } }], now })[0].text, '품의 「제목 없는 품의」 초안 이어서 쓰기');
});

test('할 일 수·머리 글: 공문 기한 + 오늘 남은 수업 + 캠프 출석(덜 했으면 1)', () => {
  assert.equal(todoCount({ gongmun: [{}, {}], lessons: { left: 3 }, camp: { left: 2 } }), 6);
  assert.equal(todoCount({ gongmun: [], lessons: { left: 0 }, camp: { left: 0 } }), 0);
  assert.equal(todoCount({ gongmun: [{}], lessons: null, camp: null }), 1);
  assert.equal(headline(3), '오늘 챙길 일 3가지');
  assert.equal(headline(0), '오늘은 급한 일이 없어요');
});

test('처음 쓰는 선생님: 다 비었으면 시작 안내 3단계(AI 정하기 · 학급 명단 넣기 · 파일 놓기)', () => {
  assert.equal(isBlank({ docs: [], hasTimetable: false, camps: [], rows: [] }), true);
  assert.equal(isBlank({ docs: [{}], hasTimetable: false, camps: [], rows: [] }), false);
  assert.equal(isBlank({ docs: [], hasTimetable: true, camps: [], rows: [] }), false);
  assert.equal(isBlank({ docs: [], hasTimetable: false, camps: [{}], rows: [] }), false);
  assert.equal(isBlank({ docs: [], hasTimetable: false, camps: [], rows: [{}] }), false);
  const s = starter({ aiReady: true, roster: false });
  assert.deepEqual(s.map(x => x.id), ['ai', 'roster', 'drop']);
  assert.deepEqual(s.map(x => x.text), ['AI 정하기', '학급 명단 넣기', '파일 놓기']);
  assert.deepEqual(s.map(x => x.done), [true, false, false]);
});
