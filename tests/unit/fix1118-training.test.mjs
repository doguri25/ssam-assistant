/* 연수 메뉴 규칙(스펙 2026-11-18-training-design). 예시 이름은 지어낸 것 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../web/menus/training/training-model.js';

test('내 필수연수 줄: 정리·차례·요약·학사일정 일정', () => {
  const l = [
    { title: '성희롱·성폭력 예방교육', due: '2026-11-30', status: 'todo' },
    { title: '청렴교육', status: 'ok', hours: 2 },
    { title: '개인정보보호 교육', due: '2026-11-20', status: 'back', note: '이수증이 흐려요' },
    { title: '장애인식개선 교육', status: 'done', hours: 1.5, due: '2026-11-10' },
    { title: '' }, null
  ].map(T.normItem).filter(Boolean);
  assert.equal(l.length, 4);
  assert.deepEqual(T.sortMine(l).map(x => x.title), ['개인정보보호 교육', '성희롱·성폭력 예방교육', '장애인식개선 교육', '청렴교육']);
  assert.deepEqual(T.mineSummary(l, '2026-11-25'), { total: 4, done: 2, hours: 3.5, late: 1, back: 1 });
  assert.deepEqual(T.mineEvents(l), [{ date: '2026-11-30', title: '[연수] 성희롱·성폭력 예방교육 이수 기한' }, { date: '2026-11-20', title: '[연수] 개인정보보호 교육 이수 기한' }]);
  const { list, added } = T.withDefaults(l);
  assert.equal(added, T.DEFAULTS.length - 3, '이미 있는 이름(띄어쓰기·가운뎃점만 다른 것도)은 빼고');
  assert.ok(list.some(x => x.title === '학교폭력 예방교육'));
});

test('이수증 읽기: 연수 맞추기·이수일·시간(AI 없이)', () => {
  const items = ['성희롱·성폭력 예방교육', '가정폭력 예방교육', '아동학대 예방 및 신고의무자 교육', '청렴교육(부패방지)'].map((title, i) => T.normItem({ id: 'i' + i, title }));
  assert.equal(T.bestCourse(items, '성희롱 예방교육 이수증(김하늘).pdf').id, 'i0');
  assert.equal(T.bestCourse(items, '아동학대예방교육_이수증.pdf').id, 'i2');
  assert.equal(T.bestCourse(items, '가정폭력 예방 이수증').id, 'i1');
  assert.equal(T.bestCourse(items, '청렴 이수증.jpg').id, 'i3');
  assert.equal(T.bestCourse(items, '이수증.pdf'), null, '어느 연수인지 모르면 null');
  const text = '이 수 증\n성 명: 김하늘\n과정명: 2026년 아동학대 예방 및 신고의무자 교육\n교육기간: 2026. 10. 1. ~ 2026. 10. 31.\n이수시간: 2시간\n발급일 2026년 11월 2일';
  assert.deepEqual(T.readCert({ name: 'scan01.pdf', text }, items), { id: 'i2', doneDate: '2026-10-31', hours: 2 });
  assert.equal(T.certDate('수료일자 2026-09-03'), '2026-09-03');
  assert.equal(T.certDate('발급 2026.11.05'), '2026-11-05');
  assert.equal(T.certHours('총 3차시'), 3);
  const it = T.applyCert(items[0], { name: '성희롱.pdf', doneDate: '', hours: null }, '2026-11-18');
  assert.equal(it.status, 'done'); assert.equal(it.doneDate, '2026-11-18'); assert.equal(it.cert, '성희롱.pdf');
  assert.equal(T.applyCert({ ...items[0], status: 'sent' }, { name: 'a.pdf' }, '2026-11-18').status, 'sent', '제출함은 그대로');
});

test('공문에서: 연수 공문 알아보기·연수 이름·기한', () => {
  const doc = { id: 'g1', title: '2026학년도 교직원 성희롱·성폭력 예방교육 실시 안내', summary: '11월 30일까지 온라인으로 이수하고 이수증을 제출', due: '', tasks: [{ text: '이수증 제출', due: '2026-11-30' }] };
  assert.ok(T.trainingLike(doc));
  assert.ok(!T.trainingLike({ title: '과학의 날 행사 참가 신청', summary: '참가 학생 조사' }));
  assert.ok(!T.trainingLike({ title: '교육과정 설명회', summary: '학부모 참석' }), '이수·수료 말이 없으면 아님');
  assert.deepEqual(T.fromGongmun(doc), { title: '성희롱·성폭력 예방교육', due: '2026-11-30', from: 'gongmun:g1' });
  assert.equal(T.courseTitle('[필수] 2026년 청렴교육 이수 협조 요청'), '청렴교육');
  assert.equal(T.courseTitle('장애인식개선 교육 이수증 제출 안내(11.20.까지)'), '장애인식개선 교육');
  assert.equal(T.courseTitle('정보보안 연수에 대한 안내'), '정보보안 연수');
});

test('현황판: 명단 읽기·더하기·칸 바꾸기·이수율', () => {
  assert.deepEqual(T.parseStaff('이름\t부서\n김하늘\t교무부\n이바다 선생님\t3학년\n\n1. 한가람'), [{ name: '김하늘', dept: '교무부' }, { name: '이바다', dept: '3학년' }, { name: '한가람', dept: '' }]);
  assert.deepEqual(T.parseStaff('김하늘 이바다 한가람').map(x => x.name), ['김하늘', '이바다', '한가람']);
  assert.deepEqual(T.staffFromRows([['연번', '성명', '소속'], ['1', '박솔빛', '행정실'], ['2', '김하늘', '교무부']]), [{ name: '박솔빛', dept: '행정실' }, { name: '김하늘', dept: '교무부' }]);
  const m = T.mergeStaff([{ id: 's0', name: '김하늘', dept: '교무부' }], [{ name: '김하늘', dept: '교무부' }, { name: '이바다', dept: '' }]);
  assert.equal(m.added, 1); assert.equal(m.staff.length, 2);
  let b = T.normBoard({ staff: [{ id: 's1', name: '김하늘' }, { id: 's2', name: '이바다' }, { id: 's3', name: '한가람' }, { id: 's4', name: '박솔빛' }],
    courses: [{ id: 'c1', title: '성희롱·성폭력 예방교육', due: '2026-11-30' }], marks: { c1: { s1: { s: 'ok' }, s9: { s: 'sent' }, s2: { s: 'zz' } }, cX: { s1: { s: 'ok' } } } });
  assert.deepEqual(b.marks, { c1: { s1: { s: 'ok', file: '', note: '', at: 0, date: '', hours: null, link: '', kept: false } } }, '없는 사람·연수·상태는 버림');
  b = T.setMark(b, 'c1', 's2', 'sent', { file: '이바다.pdf' });
  b = T.setMark(b, 'c1', 's3', 'back', { note: '다른 연수 이수증' });
  assert.deepEqual(T.courseStats(b, 'c1'), { total: 4, sent: 1, ok: 1, back: 1, none: 1, done: 2, rate: 50 });
  assert.deepEqual(T.missingStaff(b, 'c1').map(s => s.name), ['한가람', '박솔빛']);
  assert.deepEqual(['', 'sent', 'ok', 'back'].map(T.nextMark), ['sent', 'ok', '', '']);
  b = T.setMark(b, 'c1', 's2', '');
  assert.equal(T.markOf(b, 'c1', 's2'), null);
});

test('현황판: 이수증 파일을 사람·연수에 맞추기', () => {
  const b = T.normBoard({ staff: [{ id: 's1', name: '김하늘', dept: '교무부' }, { id: 's2', name: '이바다' }, { id: 's3', name: '김하늘', dept: '6학년' }, { id: 's4', name: '한가람' }],
    courses: [{ id: 'c1', title: '성희롱·성폭력 예방교육' }, { id: 'c2', title: '아동학대 예방 및 신고의무자 교육' }] });
  assert.deepEqual(T.matchFile({ name: '이바다_아동학대예방 이수증.pdf' }, b), { sid: 's2', cid: 'c2', many: false });
  assert.deepEqual(T.matchFile({ name: 'scan.pdf', text: '성명: 한 가 람\n과정: 성희롱 예방교육' }, b), { sid: 's4', cid: 'c1', many: false }, '띄어 쓴 이름도');
  assert.equal(T.matchFile({ name: 'scan.pdf', text: '성명: 한가람\n과정: 성희롱 예방교육' }, b).sid, 's4');
  assert.equal(T.matchFile({ name: '김하늘 성희롱.pdf' }, b).sid, null, '같은 이름이 둘(부서로 못 가름)');
  assert.equal(T.matchFile({ name: '김하늘(6학년) 성희롱.pdf' }, b).sid, 's3', '부서로 가름');
  assert.equal(T.matchFile({ name: '이바다 한가람 성희롱.pdf' }, b).many, true);
  const one = T.normBoard({ ...b, courses: [{ id: 'c1', title: '청렴교육' }] });
  assert.equal(T.matchFile({ name: '이바다.pdf' }, one).cid, 'c1', '연수가 하나뿐이면 그것');
});

test('현황판: 엑셀·독려 쪽지·오늘 할 일·인수인계서·채팅 답·새 학년도', () => {
  let b = T.normBoard({ staff: [{ id: 's1', name: '김하늘', dept: '교무부' }, { id: 's2', name: '이바다' }], courses: [{ id: 'c1', title: '청렴교육, 부패방지', due: '2026-11-20' }] });
  b = T.setMark(b, 'c1', 's1', 'back', { note: '흐림' });
  const csv = T.boardCsv(b);
  assert.ok(csv.startsWith('\uFEFF이름,구분,부서,"청렴교육, 부패방지(기한 2026-11-20)"'), csv);
  assert.ok(csv.includes('김하늘,교원,교무부,반려(흐림)') && csv.includes('이수율,,,0%') && csv.includes('[구분별 실적]'), csv);
  const n = T.nudgeText(b.courses[0]);
  assert.ok(n.startsWith('[제출 안내] 청렴교육, 부패방지 이수증 제출 안내') && n.includes('□ 기한: 2026. 11. 20.(금)까지') && !n.includes('김하늘'), n);
  const mine = [T.normItem({ title: '개인정보보호 교육', due: '2026-11-25' }), T.normItem({ title: '먼 연수', due: '2026-12-31' }), T.normItem({ title: '끝난 연수', due: '2026-11-19', status: 'done' })];
  assert.deepEqual(T.briefLines({ mine, board: b, today: '2026-11-18' }), [
    { text: '연수 현황 「청렴교육, 부패방지」 미제출 2명', when: 'D-2', hot: false, route: { to: 'training', tab: 'board' } },
    { text: '필수연수 「개인정보보호 교육」 이수', when: 'D-7', hot: false, route: { to: 'training', tab: 'mine' } }]);
  assert.deepEqual(T.handoverRows(b), [['청렴교육, 부패방지', '2026-11-20', '0/2명(0%)']]);
  assert.ok(T.chatAnswer(mine, '2026-11-18').includes('2개') && T.chatAnswer(mine, '2026-11-18').includes('개인정보보호 교육'));
  const c = T.carry(mine, b);
  assert.deepEqual(c['training:mine'].map(x => [x.title, x.status, x.due]), [['개인정보보호 교육', 'todo', undefined], ['먼 연수', 'todo', undefined], ['끝난 연수', 'todo', undefined]]);
  assert.deepEqual(c['training:board'].marks, {}); assert.equal(c['training:board'].staff.length, 2);
});

test('다른 메뉴와 잇기: 오늘 할 일·학사일정·학부모 안내·채팅·인수인계서·새 학년도', async () => {
  const { briefing } = await import('../../web/core/briefing.js');
  const lines = briefing({ today: '2026-11-18', trainings: [{ text: '필수연수 「청렴교육」 이수', when: 'D-2', hot: true, route: { to: 'training', tab: 'mine' } }],
    events: [{ date: '2026-11-20', title: '[연수] 청렴교육 이수 기한', source: 'training' }, { date: '2026-11-20', title: '가을 운동회', source: 'event:e1' }] });
  assert.deepEqual(lines.filter(l => /청렴|운동회/.test(l.text)).map(l => [l.kind, l.text]), [['training', '필수연수 「청렴교육」 이수'], ['schedule', '가을 운동회']], '학사일정 줄에 연수 일정이 두 번 나오지 않음');
  const { forParents } = await import('../../web/menus/class/weekly-ai.js');
  assert.ok(!forParents({ source: 'training' }) && forParents({ source: 'event:e1' }) && forParents({ source: '' }));
  const { routeText: route } = await import('../../web/core/chat-route.js');
  for (const q of ['필수연수 챙겨줘', '이수증 정리', '연수 현황판 열어줘']) assert.equal(route(q).intent, 'training', q);
  assert.equal(route('연수 안내 쪽지 써줘').intent, 'message');
  const { dataQuestion } = await import('../../web/core/chat-data.js');
  assert.equal(dataQuestion('연수 몇 개 남았어?').kind, 'training');
  assert.equal(dataQuestion('연수 안내 쪽지 뭐라고 써?'), null);
  const { buildHandover } = await import('../../web/menus/etc/handover-model.js');
  const doc = buildHandover({ year: 2026, duties: [], events: [], purchases: [], docs: [], reports: [], trainings: [['청렴교육', '2026-11-20', '1/2명(50%)']] });
  const ti = doc.blocks.findIndex(b => b.part === 'training' && b.type === 'table');
  assert.ok(ti > 0 && doc.blocks[ti].rows[1].join('|') === '청렴교육|2026. 11. 20.|1/2명(50%)', JSON.stringify(doc.blocks[ti]));
  const { carryOver } = await import('../../web/core/years.js');
  const out = carryOver({ 'training:mine': JSON.stringify([{ id: 'a', title: '청렴교육', status: 'ok', due: '2026-11-20' }]),
    'training:board': JSON.stringify({ staff: [{ id: 's1', name: '김하늘' }], courses: [{ id: 'c1', title: '청렴교육', due: '2026-11-20' }], marks: { c1: { s1: { s: 'ok' } } } }) }, 2027);
  assert.deepEqual(JSON.parse(out['training:mine']), [{ id: 'a', title: '청렴교육', where: '', status: 'todo' }]);
  assert.deepEqual(JSON.parse(out['training:board']), { staff: [{ id: 's1', name: '김하늘', dept: '', kind: '' }], courses: [{ id: 'c1', title: '청렴교육', target: [] }], marks: {} });
});

/* ---------- 연수 수합(2026-11-19) ---------- */
const sample = () => T.normBoard({
  staff: [{ id: 's1', name: '김하늘', dept: '3학년 담임' }, { id: 's2', name: '이바다', dept: '보건교사' }, { id: 's3', name: '한가람', dept: '행정실 주무관' },
    { id: 's4', name: '박솔빛', dept: '교무실무사' }, { id: 's5', name: '김하늘', dept: '돌봄전담사' }],
  courses: [{ id: 'c1', title: '성희롱·성폭력 예방교육', due: '2026-11-20', from: 'gongmun:g1' }, { id: 'c2', title: '학교폭력 예방교육', target: ['교원'] }]
});

test('수합: 구분 짐작·연수 대상·구분별 실적', () => {
  assert.deepEqual(['3학년 담임', '보건교사', '영양교사', '행정실 주무관', '교무실무사', '돌봄전담사', '조리실무원', '교감', '6-2', '사서', ''].map(T.guessKind),
    ['교원', '교원', '교원', '직원', '공무직', '공무직', '공무직', '교원', '교원', '공무직', '']);
  let b = sample();
  assert.deepEqual(b.staff.map(s => s.kind), ['교원', '교원', '직원', '공무직', '공무직']);
  assert.equal(T.normBoard({ staff: [{ id: 'x', name: '김하늘', dept: '3학년', kind: '' }] }).staff[0].kind, '', '「구분 없음」으로 고른 것은 그대로');
  const c2 = b.courses[1];
  assert.ok(T.inTarget(c2, b.staff[0]) && !T.inTarget(c2, b.staff[2]));
  b = T.setMark(b, 'c2', 's1', 'ok', { date: '2026-11-02' });
  assert.deepEqual(T.courseStats(b, 'c2'), { total: 2, sent: 0, ok: 1, back: 0, none: 1, done: 1, rate: 50 }, '대상(교원)만 셈');
  assert.deepEqual(T.missingStaff(b, 'c2').map(s => s.id), ['s2']);
  b = T.setMark(b, 'c1', 's1', 'sent'); b = T.setMark(b, 'c1', 's3', 'ok'); b = T.setMark(b, 'c1', 's4', 'back', { note: '흐림' });
  assert.deepEqual(T.kindRows(b, 'c1'), [{ kind: '교원', total: 2, done: 1, rate: 50 }, { kind: '직원', total: 1, done: 1, rate: 100 }, { kind: '공무직', total: 2, done: 0, rate: 0 }, { kind: '계', total: 5, done: 2, rate: 40 }]);
  assert.equal(T.statsTsv(b, ['c2']), '연수\t구분\t대상\t이수\t미이수\t이수율\n학교폭력 예방교육\t교원\t2\t1\t1\t50%\n학교폭력 예방교육\t계\t2\t1\t1\t50%');
  assert.equal(T.cellText(b, c2, b.staff[2]), '—');
  assert.equal(T.cellText(b, c2, b.staff[0], { report: true }), '이수(11. 2.)');
  assert.equal(T.cellText(b, b.courses[0], b.staff[3], { report: true }), '반려(흐림)');
  assert.equal(T.cellText(b, b.courses[0], b.staff[4], { report: true }), '미이수');
});

test('수합: 구글 폼 응답 넣기(이름·연수·파일 주소·날짜)', () => {
  const b = sample();
  const rows = [['타임스탬프', '성함', '부서', '연수 이름', '이수증 파일 올리기'],
    ['2026. 11. 2 오후 3:15:00', '이바다', '보건교사', '성희롱 예방교육', 'https://drive.google.com/open?id=abc'],
    ['2026/11/03 09:00:00', '김하늘', '돌봄전담사', '성희롱·성폭력', 'https://drive.google.com/open?id=def'],
    ['2026/11/03 10:00:00', '김하늘', '', '학교폭력', ''],
    ['2026/11/04 10:00:00', '최누리', '3학년', '학교폭력', ''],
    ['', '', '', '', '']];
  const r = T.formResponses(rows, b);
  assert.deepEqual(r.hits, [{ sid: 's2', cid: 'c1', link: 'https://drive.google.com/open?id=abc', date: '2026-11-02' }, { sid: 's5', cid: 'c1', link: 'https://drive.google.com/open?id=def', date: '2026-11-03' }]);
  assert.deepEqual(r.miss.map(x => [x.name, x.course, x.sid]), [['김하늘', 'c2', ''], ['최누리', 'c2', '']], '같은 이름(부서 없음)·명단에 없는 사람은 고르기');
  // 연수 열이 없으면 고른 연수
  const r2 = T.formResponses([['성명', '파일'], ['한가람', 'https://drive.google.com/x']], b, { cid: 'c1' });
  assert.deepEqual(r2.hits, [{ sid: 's3', cid: 'c1', link: 'https://drive.google.com/x', date: '' }]);
  assert.equal(T.formResponses([['a', 'b']], b).noName, true);
  assert.ok(r.courseCol && !r2.courseCol, '연수 열이 있는지(없으면 화면이 어느 연수인지 물음)');
});

test('수합: 이수증 묶음(ZIP 항목)·결과 보고 문서', () => {
  let b = sample();
  b = T.setMark(b, 'c1', 's1', 'ok', { date: '2026-11-02' }); b = T.setMark(b, 'c1', 's2', 'sent'); b = T.setMark(b, 'c1', 's3', 'sent');
  const files = new Map([[T.fileKey(2026, 'c1', 's1'), { name: 'scan01.PDF', bytes: new Uint8Array([1, 2]) }], [T.fileKey(2026, 'c1', 's2'), { name: '이바다.jpg', bytes: new Uint8Array([3]) }]]);
  const e = T.bundleEntries(b, files, { year: 2026, cids: ['c1'] });
  assert.deepEqual(e.slice(0, 2).map(x => x.name), ['성희롱·성폭력 예방교육/성희롱·성폭력 예방교육_김하늘(3학년 담임).pdf', '성희롱·성폭력 예방교육/성희롱·성폭력 예방교육_이바다(보건교사).jpg']);
  const csv = e[2].data;
  assert.equal(e[2].name, '이수 현황.csv');
  assert.ok(csv.includes('성희롱·성폭력 예방교육,한가람,직원,행정실 주무관,제출,,종이·링크') && csv.includes(',박솔빛,공무직,교무실무사,미제출,,'), csv);
  assert.equal(T.relatedOf({ from: '○○교육지원청', no: '교육지원과-1234', date: '2026-11-02', title: '2026년 법정의무교육 이수 안내' }), '○○교육지원청 교육지원과-1234(2026. 11. 2.) 「2026년 법정의무교육 이수 안내」');
  const doc = T.reportDoc(b, { cids: ['c1', 'c2'], related: 'A-1(2026. 11. 2.) 「안내」', year: 2026, school: '새싹초등학교' });
  assert.equal(doc.title, '2026학년도 성희롱·성폭력 예방교육 등 법정의무교육 이수 결과 보고');
  const txt = doc.blocks.filter(x => x.type === 'p').map(x => x.text);
  assert.deepEqual(txt.slice(0, 4), ['1. 관련: A-1(2026. 11. 2.) 「안내」', '2. 위 호와 관련하여 새싹초등학교 교직원의 법정의무교육 이수 결과를 다음과 같이 보고합니다.',
    '  가. 연수명: 성희롱·성폭력 예방교육, 학교폭력 예방교육', '  나. 대상: 교직원 5명(교원 2명, 직원 1명, 공무직 2명)']);
  assert.ok(txt.includes('  마. 미이수: 성희롱·성폭력 예방교육 2명, 학교폭력 예방교육 2명 — 개별 안내 후 이수하도록 함'), txt.join('\n'));
  assert.ok(txt.includes('      2. 이수증 3부.  끝.'), txt.join('\n'));
  const tbl = doc.blocks.filter(x => x.type === 'table');
  assert.deepEqual(tbl[0].rows[1], ['성희롱·성폭력 예방교육', '5명', '3명', '2명', '60%']);
  assert.deepEqual(tbl[2].rows[1], ['1', '김하늘', '교원', '3학년 담임', '이수(11. 2.)', '미이수']);
  assert.deepEqual(tbl[2].rows[3], ['3', '한가람', '직원', '행정실 주무관', '이수', '대상 아님']);
  // 연수 하나·관련 없음
  const one = T.reportDoc(b, { cids: ['c2'], year: 2026 });
  assert.equal(one.title, '2026학년도 학교폭력 예방교육 이수 결과 보고');
  assert.ok(one.blocks[0].text.startsWith('1. 본교 교직원의 학교폭력 예방교육 이수 결과') && one.blocks.some(x => x.text === '  나. 대상: 교원 2명'), JSON.stringify(one.blocks.slice(0, 3)));
  assert.ok(one.blocks.some(x => x.text === '붙임  1. 연수별 이수 현황 명단 1부.  끝.'), '이수증이 없으면 붙임 2 없음');
});
