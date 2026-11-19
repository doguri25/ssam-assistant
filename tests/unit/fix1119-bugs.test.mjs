/* 0.36.0 뒤 멀티에이전트 버그 찾기(2026-11-19)에서 확인된 25건 — 고친 뒤 다시 생기지 않게. 예시 이름은 지어낸 것(남다율·탁보결도 지어낸 이름) */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));

test('이름 가리기: 맡은 일 머리 뒤·괄호 안 목록·쉼표로 이은 이름, 낱말은 그대로', async () => {
  const { makeRedactor } = await import('../../web/core/redact.js');
  const { maskStaff } = await import('../../web/core/privacy.js');
  const one = s => makeRedactor().lines([s])[0].text;
  for (const [s, names] of [['학급회의(사회: 탁보결, 기록: 남다율)', ['탁보결', '남다율']], ['독서 골든벨(진행: 탁보결)', ['탁보결']], ['줄넘기 대회(도우미: 남다율)', ['남다율']],
    ['도서관 수업(사서 탁보결)', ['탁보결']], ['현장체험학습(인솔: 박솔빛, 이바다)', ['박솔빛', '이바다']], ['현장체험학습(이바다, 남다율 인솔)', ['이바다', '남다율']], ['이바다, 남다율 기록 담당', ['이바다', '남다율']]]) {
    const out = one(s);
    for (const n of names) assert.ok(!out.includes(n), `${s} → ${out}`);
  }
  for (const s of ['연설문 발표 준비', '모둠별 발표', '소감문 발표', '설명문 발표 내용', '원어민 선생님과', '방송부 촬영', '정보부 기록', '발표: 연설문', '인솔 방법은 학급별 이동', '인솔 경로 사전 답사', '인솔자 유의 사항 안내', '준비물(색연필, 도화지)', '수학(덧셈, 뺄셈)'])
    assert.equal(one(s), s, s);
  assert.equal(maskStaff('인솔 박솔빛').text, '인솔 ○○○');
  assert.equal(maskStaff('인솔 방법은 학급별 이동').text, '인솔 방법은 학급별 이동');
});

test('주간학습안내: 자리 표시를 옮긴 AI 답은 버림(실명이 검토 AI로 가지 않게)', async () => {
  const { notesToFill } = await import('../../web/menus/class/weekly-ai.js');
  const days = [0, 1, 2, 3, 4].map(i => ({ date: `2026-11-1${6 + i}`, off: '', slots: [] }));
  assert.deepEqual(notesToFill(days, [{}, {}, {}, {}, {}], [{ notice: '〔이름1〕 생일 잔치 안내장', prep: '색연필' }, {}, {}, {}, {}], { back: t => t.replace('〔이름1〕', '한가람') }), [[0, 'prep', '색연필']]);
});

test('진도: 진도 자리를 정한 날 없는 교과는 주간학습안내가 두 번 세지 않음, 체크하지 않은 날·메모·판 교시 수·다음 학기', async () => {
  const m = await import('../../web/menus/class/class-model.js');
  const lessons = n => Array.from({ length: n }, (_, i) => ({ title: `차시 ${i + 1}` }));
  const tt = m.normTimetable({ periods: 1, cells: [['국어'], ['국어'], ['국어'], ['국어'], ['국어']] });
  const ctx = (sub, log = {}, extra = {}) => ({ tt, subjects: [sub], breaks: [], events: [], extra: {}, log, today: '2026-11-19', ...extra });
  // 0.35 앞 자료(posAt 없음, offset이 이미 앞 칸을 담음): 주간학습안내도 오늘 수업과 같은 차시
  const old = m.normSubject({ id: 's', name: '국어', offset: 10, lessons: lessons(40) });
  const log = { '2026-11-02': { 1: { subject: '국어', status: 'done' } } };
  assert.equal(m.dayView({ ...ctx(old, log), assume: true }, '2026-11-23').slots[0].index, m.dayView(ctx(old, log), '2026-11-23').slots[0].index);
  // 체크하지 않은 날: 진도 자리를 정한 날까지·교과를 넣기 전 날은 세지 않음
  const a = m.normSubject({ id: 's', name: '국어', offset: 0, start: '2026-11-10', posAt: '2026-11-16', lessons: lessons(40) });
  const miss = m.missingList(ctx(a, { '2026-11-03': { 1: { subject: '국어', status: 'done' } } }), 20).map(x => x.date);
  assert.deepEqual(miss, ['2026-11-17', '2026-11-18']);
  // 메모만 적은 칸은 시간표를 바꾼 뒤 「교체」가 아님
  const tt2 = m.editCell(tt, 0, 0, '수학', '');
  const v = m.dayView({ ...ctx(a), tt: tt2, log: { '2026-11-16': { 1: { subject: '국어', status: '', memo: '활동 3 못 함' } } } }, '2026-11-16').slots[0];
  assert.equal(v.subject, '수학'); assert.equal(v.swap, false);
  // 「오늘부터」 교시 수가 적은 시간표: 지난날은 그때 교시 수
  const six = m.normTimetable({ periods: 6, cells: Array.from({ length: 5 }, () => ['국어', '수학', '사회', '과학', '체육', '음악']) });
  const five = m.replaceTimetable(six, m.normTimetable({ periods: 5, cells: Array.from({ length: 5 }, () => ['국어', '수학', '사회', '과학', '체육']) }), '2026-11-19');
  assert.equal(m.periodsOn(five, '2026-11-16'), 6); assert.equal(m.periodsOn(five, '2026-11-20'), 5);
  assert.equal(m.slotsOn({ ...ctx(a), tt: five, log: {} }, '2026-11-16').length, 6);
  assert.equal(m.slotsOn({ ...ctx(a), tt: five, log: {} }, '2026-11-20').length, 5);
  // 날짜 없는 다음 학기 진도표: 「다음 차시 = 끝」(진도 자리 끝)이어도 알아봄
  const end = m.normSubject({ id: 's', name: '국어', offset: 30, hours0: 3, lessons: lessons(30) });
  assert.equal(m.termStart(ctx(end), end, lessons(32).map((l, i) => ({ title: `2학기 ${i}` }))), '2026-11-19');
  // 연간 실시: 앞 학기 「체크 전 실시」(prevHours0)를 더함
  const two = m.normSubject({ id: 's', name: '국어', offset: 0, hours0: 26, prevHours0: 20, since: '2026-09-01', lessons: lessons(40) });
  assert.equal(m.normSubject({ ...two, prevHours0: -3 }).prevHours0, undefined);
  assert.equal(m.yearHours(ctx(two, {}), two), 46);
});

test('기초학력: AI 일정도 재량휴업일 빼기, 날짜 넣기는 예전 교시 수를 지움, 같은 날 합치기는 지도 내용을 자르지 않음', async () => {
  store.set('school', { breaks: [{ from: '2026-11-13', to: '2026-11-13', label: '재량휴업일' }] });
  const { normSchedule } = await import('../../web/menus/class/camp-ai.js');
  const s = normSchedule({ periods: 1 }, { range: { from: '2026-11-09', to: '2026-11-20' }, weekdays: [1, 2, 3, 4, 5] });
  assert.ok(!s.dates.includes('2026-11-13') && s.dates.length === 9, JSON.stringify(s.dates));
  const { applyDates } = await import('../../web/menus/class/camp-sched.js');
  const M = await import('../../web/menus/class/camp-model.js');
  const camp = { ...M.newCamp ? M.newCamp({ name: 'x' }) : {}, unit: 'session', students: [], att: {}, sessions: [M.newSession({ date: '2026-11-02', start: '09:00', end: '12:40', periods: 5 })] };
  const r = applyDates(camp, [{ date: '2026-11-03', start: '14:00', end: '14:40' }]);
  assert.equal(r.camp.sessions[0].periods, null);
  const long = 'ㄱ'.repeat(200);
  const day = { ...camp, unit: 'day', sessions: [M.newSession({ date: '2026-11-04', subject: '국어', content: long }), M.newSession({ date: '2026-11-04', subject: '수학', content: long + '끝' })] };
  const merged = M.mergeSameDate(day);
  assert.equal(merged.sessions.length, 1); assert.ok(merged.sessions[0].content.endsWith('끝'), merged.sessions[0].content.length);
});

test('연수: 쪽지 작성으로 가는 글은 강사·교직원 이름을 가림, 이수일·시간, 띄어 쓴 명단·직위 칸·구분 칸, 한글 Windows ZIP 이름', async () => {
  const T = await import('../../web/menus/training/training-model.js');
  const notice = T.inhouseNotice({ title: '학교폭력 사안 처리 연수', target: [], inhouse: { date: '2026-12-16', lecturer: '탁보결 장학사', place: '시청각실' } });
  const v = T.maskForAI(notice, ['탁보결 장학사', '김하늘', '이바다']);
  assert.ok(!v.includes('탁보결') && v.includes('□ 강사: ○○○'), v);
  assert.equal(T.certDate('교육기간: 2026. 3. 1.~12. 31.\n이수일자 2026. 11. 3.', '2026-11-19'), '2026-11-03');
  assert.equal(T.certDate('학 습 기 간 : 2026.10.01 ~ 2026.12.31\n이 수 일 : 2026.11.03', '2026-11-19'), '2026-11-03');
  assert.equal(T.certDate('수 료 일 2026. 11. 3.\n발급일 2026. 11. 19.', '2026-11-19'), '2026-11-03');
  assert.equal(T.certDate('교육 기간 2026. 11. 1. ~ 2026. 12. 31.', '2026-11-19'), '2026-11-01', '앞날은 이수일이 아님');
  assert.equal(T.certHours('이수시간: 1시간 30분'), 1.5); assert.equal(T.certHours('학습시간 90분'), 1.5);
  assert.deepEqual(T.parseStaff('김하늘 교무부 부장\n한가람 행정실 주무관\n이바다 박솔빛'), [{ name: '김하늘', dept: '교무부 부장' }, { name: '한가람', dept: '행정실 주무관' }, { name: '이바다', dept: '' }, { name: '박솔빛', dept: '' }]);
  const rows = T.staffFromRows([['연번', '구분', '부서', '직위', '성명'], ['1', '', '교무부', '교무실무사', '이바다'], ['2', '교육공무직', '방과후', '돌봄', '박솔빛'], ['3', '교원', '3학년', '담임', '김하늘']]);
  assert.deepEqual(rows.map(s => [s.name, s.dept, s.kind || T.guessKind(s.dept)]), [['이바다', '교무부 교무실무사', '공무직'], ['박솔빛', '방과후 돌봄', '공무직'], ['김하늘', '3학년 담임', '교원']]);
  assert.deepEqual(T.parseStaff('연번\t부서\t성명\n1\t교무부\t이바다'), [{ name: '이바다', dept: '교무부' }]);
  const { zipStore, unzip } = await import('../../web/core/zip.js');
  const z = zipStore([{ name: 'x', data: new Uint8Array([1]) }]);
  // 이름을 CP949 바이트(김하늘_.pdf)로 바꾸고 UTF-8 표시는 끔
  const cp = new Uint8Array([0xB1, 0xE8, 0xC7, 0xCF, 0xB4, 0xC3, 0x2E, 0x70, 0x64, 0x66]);
  const buf = rebuildZipName(z, cp);
  const names = [...(await unzip(buf)).keys()];
  assert.equal(names[0], '김하늘.pdf');
});
/* zipStore가 만든 한 항목 zip의 이름을 다른 바이트로(길이가 달라 다시 짬) */
function rebuildZipName(z, name) {
  const dv = new DataView(z.buffer), dataLen = dv.getUint32(18, true), oldLen = dv.getUint16(26, true), data = z.subarray(30 + oldLen, 30 + oldLen + dataLen);
  const crc = dv.getUint32(14, true), out = new Uint8Array(30 + name.length + data.length + 46 + name.length + 22), o = new DataView(out.buffer);
  out.set(z.subarray(0, 30), 0); o.setUint16(6, 0, true); o.setUint16(26, name.length, true); out.set(name, 30); out.set(data, 30 + name.length);
  const cen = 30 + name.length + data.length, oldCen = 30 + oldLen + dataLen;
  out.set(z.subarray(oldCen, oldCen + 46), cen); o.setUint16(cen + 8, 0, true); o.setUint16(cen + 28, name.length, true); o.setUint32(cen + 42, 0, true); o.setUint32(cen + 16, crc, true); out.set(name, cen + 46);
  const end = cen + 46 + name.length;
  out.set(z.subarray(oldCen + 46 + oldLen, oldCen + 46 + oldLen + 22), end); o.setUint32(end + 12, 46 + name.length, true); o.setUint32(end + 16, cen, true);
  return out;
}

test('메뉴 사이: 연수 공문·계획은 이수증이 아님(이수증도 물음), 채팅 쓰기 명령은 화면 가기에 밀리지 않음, 학년말 예산·연수 줄', async () => {
  const { classify } = await import('../../web/core/inbox-classify.js');
  const gm = classify({ name: '청렴교육 안내.hwpx', text: '수신  각급학교장\n(경유)\n제목  2026년 청렴교육 이수 및 이수증 제출 안내\n1. 관련: …\n2. 교직원은 12. 5.까지 이수 후 이수증을 제출하여 주시기 바랍니다.\n붙임  안내문 1부.  끝.' });
  assert.notEqual(gm.kind, 'cert');
  assert.notEqual(classify({ name: '교원 연수 운영 계획.hwpx', text: '2026학년도 교원 연수 운영 계획\n1. 목적\n2. 방침\n3. 세부 추진 계획\n - 법정 의무연수 이수증 수합\n - 연수 이수 현황 관리' }).kind, 'cert');
  const c = classify({ name: 'scan01.pdf', text: '이 수 증\n성 명: 김하늘\n과정명: 2026년 청렴교육\n이수일: 2026. 11. 2.\n위 사람은 위 연수를 이수하였음을 증명합니다.' });
  assert.equal(c.kind, 'cert'); assert.equal(c.ask, true);
  const { routeText } = await import('../../web/core/chat-route.js');
  for (const [q, want] of [['불용품 매각 공문 처리해줘', 'gongmun'], ['학교폭력 전담기구 안내 쪽지 써줘', 'message'], ['이수증 제출 안내 쪽지 써줘', 'message'], ['보강 넣어줘', 'today'], ['전담 시간 체크', 'progress'], ['사업별 예산', 'budget']])
    assert.equal(routeText(q).intent, want, q);
  assert.notEqual(routeText('공문\n2026년 법정의무교육 이수 안내\n수신: 각급학교장\n이수증 제출 기한 12/5').intent, 'training', '붙여 넣은 공문은 화면 가기로 보내지 않음');
  const Y = await import('../../web/menus/home/yearend-model.js');
  const rows = Y.yearendRows({ budget: [{ project: { name: '사진전' }, left: 0, planned: 400000 }], training: { mineTotal: 0, boardCourses: 3, boardLeft: [], noStaff: true } });
  const b = rows.find(r => r.id === 'budget'), t = rows.find(r => r.id === 'training');
  assert.equal(b.state, 'todo'); assert.ok(b.line.includes('예정 400,000원 에듀파인에 올리기 전'), b.line);
  assert.equal(t.state, 'todo'); assert.ok(t.line.includes('교직원 명단이 없어요'), t.line); assert.deepEqual(t.go, { to: 'training', tab: 'board' });
});
