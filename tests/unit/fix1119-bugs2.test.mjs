/* 0.37.0 뒤 두 번째 멀티에이전트 버그 찾기(2026-11-19)에서 확인된 25건 — 고친 뒤 다시 생기지 않게.
   예시 이름은 모두 지어낸 것(이규리·박해리·남다율·탁보결·김샛별·이대형·김한별·김지원·홍길동도 지어낸 이름) */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));

test('이름 가리기: 맡은 일 머리 뒤(-리·-형·-별 이름도)·진행자·쉼표로 이은 이름·다른 줄에서 배운 이름, 낱말은 그대로', async () => {
  const { makeRedactor } = await import('../../web/core/redact.js');
  const { maskStaff } = await import('../../web/core/privacy.js');
  const one = s => makeRedactor().lines([s])[0].text;
  for (const [s, names] of [['학급회의(사회: 이규리, 기록: 박해리)', ['이규리', '박해리']], ['진행자: 남다율', ['남다율']], ['학급회의(사회: 탁보결, 도우미: 남다율)', ['탁보결', '남다율']],
    ['촬영: 김샛별', ['김샛별']], ['기록: 이대형', ['이대형']], ['현장체험학습(이바다, 김한별 인솔)', ['이바다', '김한별']], ['(탁보결, 김한별 선생님 인솔)', ['탁보결', '김한별']]]) {
    const out = one(s);
    for (const n of names) assert.ok(!out.includes(n), `${s} → ${out}`);
  }
  // 앞 줄에서 배운 이름에 쉼표로 이어진 이름(후보 목록)
  const two = makeRedactor().lines(['월요일(11/23): 2교시 학급회의(사회: 탁보결)', '수요일(11/25): 전교 임원 선거(후보: 탁보결, 남다율, 이바다)']).map(x => x.text).join('\n');
  for (const n of ['탁보결', '남다율', '이바다']) assert.ok(!two.includes(n), two);
  for (const s of ['강낭콩 씨앗을 심고', '저출산·고령화 사회의 문제점', '반대편 발언을 듣고', '어린이 대표 선서', '안내장 양식에 맞추어', '육성회 회장 인사', '진행: 마무리 활동', '기록: 서술형 평가', '준비물(색연필, 도화지)'])
    assert.equal(one(s), s, s);
  for (const s of ['인솔: 전학년 담임', '수련회 인솔: 남교사 2명, 여교사 2명', '※ 인솔: 이동 시 담임 동행', '인솔: 우천시 실내', '인솔 남교사 2명']) assert.equal(maskStaff(s).text, s, s);
  assert.equal(maskStaff('인솔: 박솔빛').text, '인솔: ○○○');
});

const lessons = n => Array.from({ length: n }, (_, i) => ({ title: `차시 ${i + 1}` }));
const done = dates => Object.fromEntries(dates.map(d => [d, { 1: { subject: '국어', status: 'done' } }]));

test('학년말 마감 진도·시수: 남은 시수는 실시(진도표·시수 화면과 같은 수), 진도만 뒤처지면 그 말만', async () => {
  const Y = await import('../../web/menus/home/yearend-model.js');
  const row = progress => Y.yearendRows({ progress }).find(r => r.id === 'progress');
  // 진도 자리는 끝(진도표대로 맞추기)인데 실시 7/10
  const a = row([{ name: '국어', plan: 10, actual: 10, diff: 0, left: 3 }]);
  assert.equal(a.state, 'todo'); assert.equal(a.line, '남은 시수 3시간');
  // 실시 10/10, 진도 8(일부 진행)
  const b = row([{ name: '국어', plan: 10, actual: 8, diff: -2, left: 0 }]);
  assert.equal(b.state, 'todo'); assert.ok(!b.line.includes('남은 시수') && b.line.includes('국어(-2)'), b.line);
  assert.equal(row([{ name: '국어', plan: 10, actual: 10, diff: 0, left: 0 }]).state, 'done');
  // left가 없는 예전 자료는 진도 자리로
  assert.equal(row([{ name: '국어', plan: 10, actual: 7, diff: 0 }]).line, '남은 시수 3시간');
});

test('진도: 새 학년도로 가져간 교과·다시 넣은 교과는 시작일부터 이어 셈, 알림은 이어 센 날만', async () => {
  const { carryOver } = await import('../../web/core/years.js');
  const m = await import('../../web/menus/class/class-model.js');
  const out = carryOver({ 'class:timetable': JSON.stringify({ periods: 1, cells: [['국어'], ['국어'], ['국어'], ['국어'], ['국어']] }),
    'class:subjects': JSON.stringify([{ id: 's1', name: '국어', start: '2027-02-10', offset: 4, hours0: 2, posAt: '2027-02-10', posDone: 3, h0At: '2027-02-10', lessons: lessons(40) }]) }, 2027, { classSetup: true });
  const sub = JSON.parse(out['class:subjects'])[0];
  assert.equal(sub.posAt, '2027-03-01'); assert.equal(sub.posDone, undefined); assert.equal(sub.h0At, undefined);
  const tt = m.normTimetable(JSON.parse(out['class:timetable']));
  const ctx = { tt, subjects: [m.normSubject(sub)], log: done(['2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05']), breaks: [], events: [], extra: {}, today: '2027-03-12' };
  assert.equal(m.assumeFrom(ctx, ctx.subjects[0]), '2027-03-02');
  assert.equal(m.weekView({ ...ctx, assume: true }, '2027-03-15')[0].slots[0].index, 9, '체크한 4일 + 체크하지 않은 4일 + 오늘');
  assert.equal(m.assumedList(ctx, 20).length, 4);
  // 0.35 앞 자료(posAt 없음): 체크하지 않은 날은 있지만 이어 세지 않음 → 「이어 셌어요」 알림 없음
  const old = m.normSubject({ id: 's1', name: '국어', offset: 0, lessons: lessons(40) });
  const c2 = { ...ctx, subjects: [old] };
  assert.equal(m.missingList(c2, 20).length, 4); assert.equal(m.assumedList(c2, 20).length, 0);
});

test('진도: 「다음 차시」·진도표대로 맞추기 뒤 그 앞 체크하지 않은 날은 남고, 체크하면 시수만 늘고 진도는 그대로', async () => {
  const m = await import('../../web/menus/class/class-model.js');
  const tt = m.normTimetable({ periods: 1, cells: [['국어'], ['국어'], ['국어'], ['국어'], ['국어']] });
  const log = done(['2026-11-02', '2026-11-03']);
  let sub = m.normSubject({ id: 's', name: '국어', offset: 0, hours0: 0, start: '2026-11-02', lessons: lessons(60) });
  const c16 = { tt, subjects: [sub], log, breaks: [], events: [], extra: {}, today: '2026-11-16' };
  sub = m.normSubject(m.setNext(c16, sub, 10));
  assert.equal(sub.posDone, 2);
  const log19 = { ...log, ...done(['2026-11-16', '2026-11-17', '2026-11-18']) };
  const c19 = { ...c16, subjects: [sub], today: '2026-11-19', log: log19 };
  assert.deepEqual(m.missingList(c19, 20).map(x => x.date), ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
  const before = m.progressOf(c19, sub);
  const c19b = { ...c19, log: { ...log19, ...done(['2026-11-04']) } };
  const after = m.progressOf(c19b, sub);
  assert.equal(after.next, before.next, '진도는 그대로');
  assert.equal(after.done, before.done + 1, '실시는 하나 늘어남');
  // 같은 날(진도 자리를 정한 날) 뒤 체크는 진도에 셈
  assert.equal(before.actual, 9 + 3);
  // 가져올 때 계획 진도에 맞춘 교과(h0At)는 그날까지의 빈 칸을 체크 전 실시가 담음 → 「체크하지 않은 날」에 안 넣음
  const seated = m.normSubject({ id: 's', name: '국어', offset: 8, hours0: 8, start: '2026-11-02', posAt: '2026-11-16', posDone: 2, h0At: '2026-11-16', lessons: lessons(60) });
  assert.deepEqual(m.missingList({ ...c19, subjects: [seated] }, 20).map(x => x.date), []);
  // 예전 자료(posDone·h0At 없음)는 진도 자리를 정한 날까지 빼던 대로
  const legacy = m.normSubject({ id: 's', name: '국어', offset: 7, hours0: 0, start: '2026-11-02', posAt: '2026-11-16', lessons: lessons(60) });
  assert.deepEqual(m.missingList({ ...c19, subjects: [legacy] }, 20).map(x => x.date), []);
  // 진도표 없는 교과(음악)가 시간표에 있어도 멈추지 않음
  const tt2 = m.normTimetable({ periods: 2, cells: Array.from({ length: 5 }, () => ['국어', '음악']) });
  assert.equal(m.missingList({ ...c19, tt: tt2 }, 20).length, 8);
});

test('진도: 날짜 없는 다음 학기 진도표를 앞 학기 마지막 차시를 한 날 넣으면 기준일은 내일', async () => {
  const m = await import('../../web/menus/class/class-model.js');
  const tt = m.normTimetable({ periods: 1, cells: [['국어'], ['국어'], ['국어'], ['국어'], ['국어']] });
  const old = m.normSubject({ id: 's', name: '국어', offset: 0, hours0: 18, start: '2026-11-02', lessons: lessons(20) });
  const next = Array.from({ length: 30 }, (_, i) => ({ title: `2학기 ${i + 1}` }));
  const ctx = log => ({ tt, subjects: [old], log, breaks: [], events: [], extra: {}, today: '2026-11-19' });
  // 어제·오늘 체크로 20차시를 마침 → 오늘 기록은 앞 학기
  assert.equal(m.termStart(ctx(done(['2026-11-18', '2026-11-19'])), old, next), '2026-11-20');
  // 어제까지 이미 마침 → 오늘 기록은 새 학기 수업
  assert.equal(m.termStart(ctx(done(['2026-11-17', '2026-11-18', '2026-11-19'])), old, next), '2026-11-19');
  // 오늘 기록 없음 → 오늘
  assert.equal(m.termStart(ctx(done(['2026-11-17', '2026-11-18'])), old, next), '2026-11-19');
});

test('기초학력: 휴업일이라 적은 방학은 수업 날을 막지 않음, 날짜 넣기는 같은 시각이면 교시 수 그대로, 한 덩어리 시간은 시각으로', async () => {
  const { closedDays } = await import('../../web/core/calendar.js');
  store.set('school', { breaks: [{ from: '2027-01-04', to: '2027-02-26', label: '겨울방학(휴업일)' }, { from: '2027-02-12', to: '2027-02-28', label: '학년말 휴업일' },
    { from: '2026-12-24', to: '2027-02-28', label: '방학·재량휴업일' }, { from: '2026-11-19', to: '2026-11-20', label: '재량휴업일' }] });
  const shut = closedDays();
  assert.ok(shut.has('2026-11-19') && shut.has('2026-11-20'), '재량휴업일은 닫힘');
  assert.ok(!shut.has('2027-01-08') && !shut.has('2027-02-15'), '방학·긴 휴업 기간은 닫지 않음');
  const { normSchedule } = await import('../../web/menus/class/camp-ai.js');
  assert.equal(normSchedule({ periods: 1 }, { range: { from: '2027-01-08', to: '2027-01-22' }, weekdays: [1, 2, 3, 4, 5] }).dates.length, 11);
  const M = await import('../../web/menus/class/camp-model.js');
  const { applyDates } = await import('../../web/menus/class/camp-sched.js');
  const camp = { unit: 'session', students: [], att: {}, sessions: [M.newSession({ date: '2027-01-04', start: '09:00', end: '12:40', periods: 5 })] };
  assert.equal(applyDates(camp, [{ date: '2027-01-05', start: '09:00', end: '12:40' }]).camp.sessions[0].periods, 5, '시각이 같으면 그대로');
  assert.equal(applyDates(camp, [{ date: '2027-01-05', start: '14:00', end: '14:40' }]).camp.sessions[0].periods, null, '시각이 바뀌면 다시 셈');
  // 날마다 캠프를 「하루 n교시」 없는 계획서로: 09:00~12:40 한 덩어리는 시각으로 셈(하루 5)
  const P = await import('../../web/menus/class/camp-plan.js');
  const { buildSessions } = await import('../../web/menus/class/camp-ai.js');
  const plan = P.readPlan('2026학년도 겨울방학 기초학력 캠프 운영 계획\n가. 기간: 2027. 1. 4.(월) ~ 2027. 1. 8.(금) 평일\n나. 시간: 09:00~12:40\n다. 대상: 3학년\n라. 교과: 국어, 수학', { year: 2026, today: '2026-12-20' });
  const c = M.newCamp({ unit: 'day' }), { sessions } = buildSessions(P.planSchedule(plan, c, {}), c);
  assert.equal(sessions.length, 5); assert.ok(sessions.every(s => s.periods == null));
  assert.equal(M.hoursTotal({ ...c, sessions }), 25);
});

test('기초학력: 오늘 화면 출석 카드는 번호 이름, 다 체크한 학생은 덜 체크로 세지 않음, 합치면 1000자 넘는 날은 그대로 둠', async () => {
  const H = await import('../../web/menus/home/home-model.js');
  const M = await import('../../web/menus/class/camp-model.js');
  const s1 = M.newSession({ date: '2026-11-19', start: '14:00', end: '14:40' }), s2 = M.newSession({ date: '2026-11-19', start: '14:50', end: '15:30' });
  const camp = { id: 'c', name: '수학 교실', unit: 'session', sessions: [s1, s2], students: [{ id: 'a', name: '', grade: 3, cls: 2, no: 5 }, { id: 'b', name: '김하늘' }],
    att: { [s1.id]: { a: 'O', b: 'O' }, [s2.id]: { a: 'X' } } };
  const card = H.campCard(camp, '2026-11-19');
  assert.deepEqual(card.students.map(s => s.name), ['3-2 5번', '김하늘']);
  assert.equal(card.left, 1, '섞여도 다 체크한 학생(a)은 빼고, 빈 칸이 남은 b만');
  const long = 'ㄱ'.repeat(300);
  const day = { unit: 'session', students: [], att: {}, sessions: [1, 2, 3, 4].map(i => M.newSession({ date: '2026-11-04', subject: '국어', content: `${long}${i}` })) };
  assert.deepEqual(M.longMergeDates(day), ['2026-11-04']);
  assert.equal(M.mergeSameDate(day).sessions.length, 4, '자르지 않게 합치지 않음');
});

test('연수: 명단 머리 「성함」「성 명」, 띄어 쓴 명단(교감·체육은 사람 아님, 김지원은 이름), 1년 학습 기간 이수증, 강사 이름', async () => {
  const T = await import('../../web/menus/training/training-model.js');
  assert.deepEqual(T.parseStaff('연번\t성함\t부서\n1\t김하늘\t교무부'), [{ name: '김하늘', dept: '교무부' }]);
  assert.deepEqual(T.staffFromRows([['연번', '성함', '부서'], ['1', '김하늘', '교무부']]), [{ name: '김하늘', dept: '교무부' }]);
  assert.deepEqual(T.parseStaff('연번\t부서\t성 명\n1\t교무부\t이바다'), [{ name: '이바다', dept: '교무부' }]);
  assert.deepEqual(T.parseStaff('박솔빛 교감\n김하늘 체육\n한가람 보건'), [{ name: '박솔빛', dept: '교감' }, { name: '김하늘', dept: '체육' }, { name: '한가람', dept: '보건' }]);
  assert.deepEqual(T.parseStaff('김하늘 김지원 이바다').map(s => s.name), ['김하늘', '김지원', '이바다']);
  assert.equal(T.certDate('교육기간: 2026. 3. 1. ~ 2026. 12. 31.\n위 사람은 위 연수를 이수하였음을 증명합니다.\n2026년 11월 3일', '2026-11-19'), '2026-11-03');
  assert.equal(T.certDate('교육기간: 2026. 3. 1. ~ 2026. 12. 31.\n발급일 2026.11.03', '2026-11-19'), '2026-11-03');
  const lect = '새싹대학교 교수 탁보결';
  const v = T.maskForAI('□ 연수명: 탁보결 교수 초청 학교폭력 예방 연수\n□ 강사: 새싹대학교 교수 탁보결', [...T.lecturerNames(lect), '김하늘']);
  assert.ok(!v.includes('탁보결'), v);
  assert.deepEqual(T.lecturerNames('새싹경찰서 경위 홍길동'), ['새싹경찰서 경위 홍길동', '홍길동']);
});

test('연수: 현황판 합치기는 반려가 끼면 나중에 바꾼 쪽', async () => {
  const T = await import('../../web/menus/training/training-model.js');
  const base = T.normBoard({ staff: [{ id: 's1', name: '김하늘', dept: '' }], courses: [{ id: 'c1', title: '청렴교육' }], marks: {} });
  const mine = { ...base, marks: { c1: { s1: { s: 'back', note: '이수증이 흐려요', at: 2000 } } } };
  const theirsOld = { ...base, marks: { c1: { s1: { s: 'sent', at: 1000 } } } };
  const theirsNew = { ...base, marks: { c1: { s1: { s: 'sent', at: 3000 } } } };
  assert.equal(T.markOf(T.mergeBoards(mine, theirsOld), 'c1', 's1').s, 'back', '반려하기 전에 내보낸 파일');
  assert.equal(T.markOf(T.mergeBoards(mine, theirsNew), 'c1', 's1').s, 'sent', '반려 뒤 다시 낸 것');
  assert.equal(T.markOf(T.mergeBoards({ ...base, marks: { c1: { s1: { s: 'ok', at: 1 } } } }, theirsNew), 'c1', 's1').s, 'ok', '반려 없으면 더 나아간 상태');
});

test('메뉴 사이: 이수증 본문 말을 넓게, 사진 이수증도 물음, 붙여 넣은 글·다른 메뉴 명령은 화면 가기로 새지 않음, 쪽지 마감 줄 한 번', async () => {
  const { classify } = await import('../../web/core/inbox-classify.js');
  for (const [name, text] of [['청렴교육_이수증.pdf', '연수 이수증\n성명: 김하늘\n연수명: 2026 청렴교육\n위의 사람은 위 연수를 이수하였기에 이 증을 수여합니다.'],
    ['청렴교육_이수증.pdf', '[이수증]\n성명 : 김하늘\n과정명: 2026 청렴교육\n상기인은 위 과정을 수료하였으므로 이 증서를 수여함'],
    ['certificate.pdf', '직무연수 이수증\n성명: 김하늘\n과정명: 2026 장애인식개선 교육\n위의 사람은 위 연수를 이수하였기에 이 증을 수여합니다.']]) {
    const c = classify({ name, text });
    assert.equal(c.kind, 'cert', `${name} ${text.slice(0, 20)} → ${c.kind}`); assert.equal(c.ask, true);
  }
  const scan = classify({ name: '청렴교육 이수증.jpg', text: '' });
  assert.equal(scan.kind, 'cert'); assert.equal(scan.ask, true);
  const { routeText, WRITE_IDS } = await import('../../web/core/chat-route.js');
  assert.ok(WRITE_IDS.includes('purchase') && WRITE_IDS.includes('message'));
  for (const t of ['수신 각급학교장\n제목 2027학년도 교과전담 교사 희망 조사\n1. 관련: 새싹교육지원청-1234\n2. 전담 교과 희망서를 제출하여 주시기 바랍니다.',
    '제목 교원 출장 시 보강 수업 운영 안내\n1. 관련: 새싹교육지원청-1234\n2. 교원 출장 시 보강 수업 운영 계획을 알려 드립니다.',
    '수업 교체 안내\n3반 목요일 5교시 ↔ 금요일 2교시\n선생님들 확인 부탁드려요'])
    assert.ok(!['today', 'progress'].includes(routeText(t).intent), t.slice(0, 20));
  for (const [q, want] of [['인수인계서에 예산 집행 현황도 넣어 줘', 'handover'], ['인수인계서에 연수 현황 넣어 줘', 'handover'], ['주간학습안내에 보강 수업 넣어 줘', 'weekly'],
    ['연간계획에 필수연수 일정 넣어 줘', 'year'], ['생기부 마감 전에 기재 점검해 줘', 'check'], ['학년말 정리 교과 평어 써 줘', 'pyeongeo'], ['보강 수업 넣어 줘', 'today'], ['전담 시수 확인', 'progress'],
    ['남은 예산으로 색종이 20묶음 구입 품의 부탁해', 'purchase']])
    assert.equal(routeText(q).intent, want, q);
  const { deadlineLines } = await import('../../web/menus/etc/message-model.js');
  const m = { apply: { due: '2026-11-21' } };
  const lines = deadlineLines([{ title: '[다시 안내] 청렴교육 이수 안내', m }, { title: '[연수 안내] 청렴교육 이수 안내', m }], '2026-11-19');
  assert.equal(lines.length, 1); assert.equal(lines[0].when, 'D-2');
});
