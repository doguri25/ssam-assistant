// 「쌤」 채팅의 「오늘 할 일」(스펙 2026-11-06 E): AI 없이 앱이 셈 — 공문 기한, 학사일정 7일, 확정 전 행사계획 14일, 덜 끝난 채점·피드백, 금요일 주간학습안내
import test from 'node:test';
import assert from 'node:assert/strict';
import { briefing, EMPTY } from '../../web/core/briefing.js';

const FRI = '2026-11-06', THU = '2026-11-05'; // 2026-11-06은 금요일
const texts = l => l.map(x => x.text);

test('공문 제출 기한: 지난 것·7일 안만, 가까운 차례, 다 한 공문·기한 없는 공문 빼고', () => {
  const docs = [
    { id: 'a', title: '과학의 날 참가 신청', due: '2026-11-09', done: false },
    { id: 'b', title: '안전 점검 결과 보고', due: '2026-11-04', done: false },
    { id: 'c', title: '먼 공문', due: '2026-11-20', done: false },
    { id: 'd', title: '끝난 공문', due: '2026-11-06', done: true },
    { id: 'e', title: '기한 없음', due: '', done: false },
    { id: 'f', title: '오늘 마감', due: FRI, done: false }];
  const l = briefing({ today: THU, docs }).filter(x => x.kind === 'gongmun');
  assert.deepEqual(texts(l), ['공문 「안전 점검 결과 보고」 제출', '공문 「오늘 마감」 제출', '공문 「과학의 날 참가 신청」 제출']);
  assert.deepEqual(l.map(x => x.when), ['1일 지남', 'D-1', 'D-4']);
  assert.deepEqual(l.map(x => x.hot), [true, true, false]);
  assert.deepEqual(l[0].route, { to: 'gongmun', id: 'b' });
});

test('학사일정: 오늘~7일(공문 일정 빼고, 같은 날 같은 일정은 한 번), 출처대로 가는 곳', () => {
  const events = [
    { date: FRI, title: '학부모 공개수업', source: 'year:y1' },
    { date: '2026-11-12', title: '가을 운동회', source: 'event:ev1' },
    { date: '2026-11-13', title: '이레 뒤', source: 'event:ev2' },
    { date: '2026-11-14', title: '너무 먼 날', source: 'event:ev3' },
    { date: '2026-11-05', title: '어제 일', source: 'year:y1' },
    { date: '2026-11-09', title: '[제출] 공문', source: 'gongmun' },
    { date: '2026-11-10', title: '교직원 회의', source: 'manual' },
    { date: '2026-11-10', title: '교직원 회의', source: 'manual' }];
  const l = briefing({ today: FRI, events }).filter(x => x.kind === 'schedule');
  assert.deepEqual(texts(l), ['학부모 공개수업', '교직원 회의', '가을 운동회', '이레 뒤']);
  assert.deepEqual(l.map(x => x.when), ['오늘', '11/10(화)', '11/12(목)', '11/13(금)']);
  assert.deepEqual(l.map(x => x.route), [{ to: 'year' }, { to: 'today' }, { to: 'event', id: 'ev1' }, { to: 'event', id: 'ev2' }]);
});

test('행사계획: 날짜가 14일 안인데 확정 전인 것만', () => {
  const plans = [
    { id: 'p1', name: '가을 운동회', date: '2026-11-12', status: 'draft' },
    { id: 'p2', name: '학예회', date: '2026-11-20', status: 'draft' },
    { id: 'p3', name: '현장체험학습', date: '2026-11-21', status: 'draft' },
    { id: 'p4', name: '확정한 행사', date: '2026-11-10', status: 'final' },
    { id: 'p5', name: '지난 행사', date: '2026-11-01', status: 'draft' },
    { id: 'p6', name: '날짜 없음', date: '', status: 'draft' }];
  const l = briefing({ today: FRI, plans }).filter(x => x.kind === 'plan');
  assert.deepEqual(texts(l), ['행사계획 「가을 운동회」 확정 전', '행사계획 「학예회」 확정 전']);
  assert.deepEqual(l.map(x => x.when), ['D-6', 'D-14']);
  assert.deepEqual(l[0].route, { to: 'event', id: 'p1' });
});

test('단원평가·활동지·평가지 채점: 채점이 덜 끝남(남은 수)·채점 마치기·피드백 남음, 예시·오래된 것·시작 안 한 것 빼고', () => {
  const st = (status, extra = {}) => ({ status, ...extra });
  const units = [
    { id: 'u1', title: '수학 2단원', date: '2026-11-03', done: false, students: [st('done'), st('idle'), st('idle'), st('idle', { skip: true })] },
    { id: 'u2', title: '국어 3단원', date: '2026-11-02', done: false, students: [st('done')] },
    { id: 'u3', title: '과학 1단원', date: '2026-11-01', done: true, students: [st('done', { good: '잘함' }), st('done'), st('done', { cheer: '힘내요' })] },
    { id: 'u4', title: '다 쓴 평가', date: '2026-11-01', done: true, students: [st('done', { good: '잘함' })] },
    { id: 'u5', title: '예시', date: FRI, done: false, sample: true, students: [st('idle')] },
    { id: 'u6', title: '오래된 평가', date: '2026-09-01', done: false, students: [st('idle')] },
    { id: 'u7', title: '시작 안 함', date: FRI, done: false, students: [] }];
  const activities = [
    { id: 'a1', title: '분수 활동지', date: '2026-11-04', done: false, students: [st('done'), st('idle')] },
    { id: 'a2', title: '확정한 활동지', date: '2026-11-04', done: true, students: [st('done')] },
    { id: 'a3', title: '채점 다 함', date: '2026-11-04', done: false, students: [st('done')] }];
  const grs = [
    { id: 'g1', title: '과학 수행평가', students: [{ text: '평어' }, { text: '' }, { text: '', skip: 1 }] },
    { id: 'g2', title: '다 쓴 채점', students: [{ text: '평어' }] }];
  const l = briefing({ today: FRI, units, activities, grs });
  assert.deepEqual(texts(l.filter(x => x.kind === 'unit')), ['단원평가 「수학 2단원」 채점 2명 남음', '단원평가 「국어 3단원」 채점 마치기', '단원평가 「과학 1단원」 피드백 1명 남음']);
  assert.deepEqual(l.find(x => x.text.includes('과학 1단원')).route, { to: 'unit', id: 'u3', step: 4 });
  assert.deepEqual(texts(l.filter(x => x.kind === 'activity')), ['활동지 「분수 활동지」 채점 1명 남음', '활동지 「채점 다 함」 채점 확정 전']);
  assert.deepEqual(texts(l.filter(x => x.kind === 'gr')), ['평가지 채점 「과학 수행평가」 평어 1명 남음']);
  assert.deepEqual(l.find(x => x.kind === 'gr').route, { to: 'gr', id: 'g1' });
});

test('금요일이면 다음 주 주간학습안내(쓰기 시작했으면 확인), 다른 날은 없음', () => {
  const f = briefing({ today: FRI }).filter(x => x.kind === 'weekly');
  assert.deepEqual(f.map(x => [x.text, x.when]), [['다음 주 주간학습안내 만들기', '11/9~']]);
  assert.equal(briefing({ today: FRI, weekly: { started: true } }).find(x => x.kind === 'weekly').text, '다음 주 주간학습안내 확인');
  assert.deepEqual(briefing({ today: THU }), [], '할 일이 없으면 빈 목록');
  assert.equal(EMPTY, '오늘은 급한 일이 없어요');
});

test('차례: 공문 → 학사일정 → 행사계획 → 채점 → 주간학습안내, 날짜가 이상하면 빈 목록', () => {
  const l = briefing({ today: FRI, docs: [{ id: 'd', title: '공문', due: '2026-11-07' }], events: [{ date: FRI, title: '일정', source: 'x' }],
    plans: [{ id: 'p', name: '행사', date: '2026-11-08', status: 'draft' }], units: [{ id: 'u', title: '단원', date: FRI, done: false, students: [{ status: 'idle' }] }] });
  assert.deepEqual(l.map(x => x.kind), ['gongmun', 'schedule', 'plan', 'unit', 'weekly']);
  assert.deepEqual(briefing({ today: '2026-13-01', docs: [{ id: 'd', title: '공문', due: '2026-11-07' }] }), []);
  assert.deepEqual(briefing(), []);
});
