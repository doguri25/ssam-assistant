// 업무 인수인계서(스펙 2026-11-06 L): 모으기(읽기만)·이름·전화번호 빼기·월별 할 일(3월~2월)·문서 조각·AI 글·저장
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { setEvents } from '../../web/core/calendar.js';
import { newPlan, savePlan, normDraft, listPlans } from '../../web/menus/plan/year-model.js';
import { newEvent, saveEvent, listEventPlans } from '../../web/menus/plan/event-model.js';
import { pushRecent } from '../../web/menus/purchase/library.js';
import { putDoc } from '../../web/menus/etc/gongmun-model.js';
import { pushReport } from '../../web/menus/plan/report-model.js';
import { GROUPS, MONTHS, cleanText, nameTokens, monthRows, monthEntries, collectHandover, pickData, isOn, buildHandover, handoverText, handoverPrompt, normNote, getSaved, saveHandover, dutyRows, budgetRows, docRows, inSchoolYear } from '../../web/menus/settings/handover-model.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const NAMES = ['김가람', '이나래', '박하늘', '최하은'];
const PHONE = /0\d{1,2}-\d{3,4}-\d{4}/;
const noPersonal = (s, what) => {
  for (const n of NAMES) assert.ok(!s.includes(n), `${what}에 이름 「${n}」: ${s.slice(0, 200)}`);
  assert.ok(!PHONE.test(s), `${what}에 전화번호: ${s.match(PHONE)}`);
  assert.ok(!s.includes('@'), `${what}에 전자 우편`);
};

/* 2026학년도 자료: 연간계획 2개(+작년 계획 1개), 행사 2개(+작년 행사), 품의 2개, 공문 2개, 결과 보고 1개, 학사일정 */
function seed() {
  store.useStorage(mem());
  store.set('years', { current: 2026 });
  savePlan({ ...newPlan(), year: 2025, name: '작년 과학 교육', goal: '작년 목표' });
  savePlan({ ...newPlan(), year: 2026, name: '과학 교육', owner: '교무부 박하늘', goal: '탐구하는 즐거움을 느끼게 해요. 문의 박하늘 010-2222-3333',
    draft: normDraft({ schedule: [{ title: '과학의 날 행사', date: '2026-04-21' }, { title: '발명 대회 신청', month: 6 }, { title: '탐구 보고서 제출(최하은 선생님께)', date: '2027-02-05' }] }) });
  savePlan({ ...newPlan(), year: 2026, name: '독서 교육', goal: '책 읽는 학교', draft: normDraft({ schedule: [{ title: '독서 골든벨', date: '2026-10-08' }] }) });
  saveEvent({ ...newEvent(), name: '작년 운동회', date: '2025-10-10' });
  saveEvent({ ...newEvent(), name: '가을 운동회', date: '2026-10-15', status: 'final',
    staff: [{ name: '김가람', duty: '진행' }, { name: '이나래', duty: '방송' }],
    docs: { plan: '', safety: '', letter: '', rain: '', roles: [{ name: '이나래', roles: ['방송'] }], done: false },
    survey: { target: 'student', items: [], formUrl: '', result: null, textSummary: '', report: '', nextMemo: '김가람 선생님과 상의해 점심시간을 늘려요. 이나래 방송 장비 미리 점검. 문의 010-1234-5678' } });
  saveEvent({ ...newEvent(), name: '학예회' });
  pushRecent({ id: 'pc1', at: new Date(2026, 10, 2).getTime(), form: { type: 'goods', project: '과학 실험 재료 구입', items: [{ name: '비커', qty: 8, price: 4500 }, { name: '유리 막대', qty: 8, price: 1200 }] }, draft: { title: '5학년 과학 실험 재료 구입' } });
  pushRecent({ id: 'pc2', at: new Date(2026, 3, 10).getTime(), form: { type: 'lecturer', project: '진로 특강 (강사 김가람)', items: [{ name: '강사 수당', qty: 2, price: 100000 }] }, draft: null });
  putDoc({ id: 'gm1', title: '2026 과학의 날 운영 안내', due: '2026-11-20', dueNote: '참가 신청서 회신', at: 2,
    tasks: [{ text: '참가 학생 조사', due: '2026-11-13' }, { text: '신청서 제출 (담당 010-9999-8888)', due: '2026-11-20', done: true }], text: '담당 김가람 010-9999-8888', done: false });
  putDoc({ id: 'gm2', title: '독서 주간 결과 제출', due: '2026-05-30', at: 1, tasks: [], done: true });
  pushReport({ id: 'rp1', title: '2026 과학의 날 행사 운영 결과 보고서', r: { name: '2026 과학의 날 행사', period: { start: '2026-04-21' }, summary: '학년별 탐구 실험(이나래 부장님 진행)', sections: [] } });
  setEvents('school', [{ date: '2026-12-24', title: '겨울방학식' }, { date: '2027-03-02', title: '다음 학년도 입학식' }]);
}

test('달 차례·묶음 이름', () => {
  assert.deepEqual(MONTHS, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2]);
  assert.deepEqual(GROUPS.map(g => g[0]), ['duties', 'events', 'purchases', 'docs', 'reports']);
  assert.ok(inSchoolYear('2027-02-28', 2026) && inSchoolYear('2026-03-01', 2026));
  assert.ok(!inSchoolYear('2026-02-28', 2026) && !inSchoolYear('2027-03-01', 2026) && !inSchoolYear('', 2026));
});

test('이름·전화번호 빼기: 아는 이름, 직함 앞뒤 이름, 전화번호·전자 우편(앞의 「문의」와 함께)', () => {
  assert.equal(cleanText('김가람 선생님과 상의해요. 문의 010-1234-5678'), '○○○ 선생님과 상의해요.');
  assert.equal(cleanText('이나래 부장님께 전달'), '○○○ 부장님께 전달');
  assert.equal(cleanText('강사 김가람 섭외'), '강사 ○○○ 섭외');
  assert.equal(cleanText('담당: 박하늘'), '담당: ○○○');
  assert.equal(cleanText('방송은 솔이 맡음', ['솔이']), '방송은 ○○○ 맡음');
  assert.equal(cleanText('독서 홍보 (문의 02-123-4567, a@b.kr)'), '독서 홍보');
  assert.equal(cleanText('연락처: 010-1111-2222, 교무실'), '교무실');
  // 부서·과목·흔한 낱말은 그대로
  for (const s of ['원어민 교사와 수업', '전담 교사 협의', '정보부 업무 정리', '도서관 이용 시간 늘리기', '과학의 날 행사 운영 계획']) assert.equal(cleanText(s), s);
  assert.equal(cleanText(null), '');
  assert.deepEqual(nameTokens('교무부 김가람'), ['김가람']);
  assert.deepEqual(nameTokens('김솔'), ['김솔']);
  assert.deepEqual(nameTokens(''), []);
});

test('월별 할 일: 3월~2월 12줄, 1·2월은 다음 해 날짜, 학년도 밖 날짜는 연도를 붙임, 달만 있는 것은 그달 끝', () => {
  const rows = monthRows([
    { date: '2027-02-03', text: '졸업식 준비' }, { date: '2026-03-05', text: '계획 확정' }, { month: 2, text: '내년 계획 세우기' },
    { date: '2026-12-24', text: '방학식' }, { date: '2027-01-10', text: '겨울 캠프' }, { date: '2026-03-02', text: '입학식' },
    { date: '2026-02-10', text: '지난 학년도 일' }, { month: 13, text: '틀린 달' }, { date: '', text: '' }, { date: 'x', month: null, text: '날짜 없음' }
  ], 2026);
  assert.deepEqual(rows.map(r => r.month), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2]);
  assert.deepEqual(rows[0].items, ['2일 입학식', '5일 계획 확정']);
  assert.deepEqual(rows[9].items, ['24일 방학식']);
  assert.deepEqual(rows[10].items, ['10일 겨울 캠프']);
  assert.deepEqual(rows[11].items, ['3일 졸업식 준비', '2026. 2. 10. 지난 학년도 일', '내년 계획 세우기']);
  assert.equal(rows.reduce((n, r) => n + r.items.length, 0), 7);
});

test('모으기: 지금 학년도 것을 처음에 고르고, 담당자·행사 교직원·역할 분담 이름과 전화번호는 빼고, 모델은 그대로', () => {
  seed();
  const before = JSON.stringify([listPlans(), listEventPlans()]);
  const d = collectHandover({ year: 2026, school: '한빛초등학교' });
  assert.equal(JSON.stringify([listPlans(), listEventPlans()]), before, '모델을 고침');
  assert.equal(d.year, 2026); assert.equal(d.school, '한빛초등학교');
  assert.deepEqual(d.duties.map(x => [x.name, x.on]), [['독서 교육', true], ['과학 교육', true], ['작년 과학 교육', false]]);
  const sci = d.duties.find(x => x.name === '과학 교육');
  assert.equal(sci.goal, '탐구하는 즐거움을 느끼게 해요. 문의 ○○○');
  assert.equal(sci.schedule.length, 3);
  assert.ok(!('owner' in sci), '담당자 칸이 들어감');
  assert.deepEqual(d.events.map(x => [x.name, x.on, x.status]), [['학예회', true, '준비 중'], ['가을 운동회', true, '확정'], ['작년 운동회', false, '준비 중']]);
  assert.equal(d.events.find(x => x.name === '가을 운동회').memo, '○○○ 선생님과 상의해 점심시간을 늘려요. ○○○ 방송 장비 미리 점검.');
  assert.deepEqual(d.purchases.map(p => [p.title, p.kind, p.amount, p.date]), [['진로 특강 (강사 ○○○)', '강사 수당', 200000, '2026-04-10'], ['5학년 과학 실험 재료 구입', '물품 구입', 45600, '2026-11-02']]);
  assert.deepEqual(d.docs.map(x => x.title), ['독서 주간 결과 제출', '2026 과학의 날 운영 안내']);
  assert.deepEqual(d.docs[1].tasks.map(t => t.text), ['참가 학생 조사', '신청서 제출 (담당)']);
  assert.equal(d.reports[0].summary, '학년별 탐구 실험(○○○ 부장님 진행)');
  // 학사일정: 공문 일정(gongmun)은 공문에서 모으므로 빼고, 학년도 밖은 뺌
  assert.deepEqual(d.calendar, [{ date: '2026-12-24', title: '겨울방학식' }]);
  assert.ok(d.names.includes('김가람') && d.names.includes('이나래') && d.names.includes('박하늘'));
  const { names, ...rest } = d;
  noPersonal(JSON.stringify(rest), '모은 자료');
});

test('지금 학년도 연간계획이 하나도 없으면 모두 고름', () => {
  store.useStorage(mem());
  savePlan({ ...newPlan(), year: 2027, name: '내년 업무' });
  assert.deepEqual(collectHandover({ year: 2026 }).duties.map(x => x.on), [true]);
});

test('고르기: 처음 값(on) 위에 선생님이 바꾼 것(picks)', () => {
  seed();
  const d = collectHandover({ year: 2026 });
  const read = d.duties.find(x => x.name === '독서 교육'), old = d.duties.find(x => x.name === '작년 과학 교육');
  assert.equal(isOn(read, {}), true);
  assert.equal(isOn(read, { [read.id]: false }), false);
  assert.equal(isOn(old, { [old.id]: true }), true);
  const p = pickData(d, { [read.id]: false, pc1: false });
  assert.deepEqual(p.duties.map(x => x.name), ['과학 교육']);
  assert.deepEqual(p.purchases.map(x => x.id), ['pc2']);
  assert.equal(p.events.length, 2); assert.equal(p.docs.length, 2); assert.equal(p.reports.length, 1);
  assert.equal(p.calendar.length, 1);
});

test('문서: 1~6 차례, 표, 품의 합계, 월별 할 일, 「다음 담당자에게」, 이름·전화번호 없음', () => {
  seed();
  const d = collectHandover({ year: 2026, school: '한빛초등학교' });
  const doc = buildHandover(pickData(d, {}), { note: '- 3월에 계획부터 확정해요.\n- 김가람 선생님께 장비를 받아요. 010-1234-5678', today: '2026-11-06' });
  assert.equal(doc.title, '2026학년도 업무 인수인계서');
  assert.deepEqual(doc.blocks.filter(b => b.type === 'h').map(b => b.text), ['1. 맡은 업무 한눈에', '2. 월별 할 일', '3. 행사와 개선 메모', '4. 예산 집행', '5. 주요 공문·제출', '6. 다음 담당자에게']);
  assert.equal(doc.blocks[0].text, '한빛초등학교 · 2026. 11. 6. 기준');
  const tables = doc.blocks.filter(b => b.type === 'table');
  const [duty, month, ev, budget, gm, rp] = tables;
  assert.deepEqual(duty.rows[0], ['업무', '목표', '일정']);
  assert.deepEqual(duty.rows.find(r => r[0] === '과학 교육'), ['과학 교육', '탐구하는 즐거움을 느끼게 해요. 문의 ○○○', '4·6·2월 · 3개']);
  assert.deepEqual(month.rows.map(r => r[0]), ['월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '1월', '2월']);
  assert.equal(month.rows[2][1], '21일 과학 교육: 과학의 날 행사');
  assert.equal(month.rows[4][1], '과학 교육: 발명 대회 신청');
  assert.equal(month.rows[8][1], '8일 독서 교육: 독서 골든벨\n15일 행사: 가을 운동회');
  assert.equal(month.rows[9][1], '13일 할 일: 참가 학생 조사\n20일 제출: 2026 과학의 날 운영 안내');
  assert.equal(month.rows[10][1], '24일 겨울방학식');
  assert.equal(month.rows[12][1], '5일 과학 교육: 탐구 보고서 제출(○○○ 선생님께)');
  assert.deepEqual(ev.rows[0], ['행사', '날짜', '상태', '내년에 고칠 점']);
  assert.deepEqual(ev.rows.find(r => r[0] === '가을 운동회').slice(0, 3), ['가을 운동회', '2026. 10. 15.', '확정']);
  assert.deepEqual(budget.rows.at(-1), ['합계', '', '245,600', '']);
  assert.deepEqual(budget.rows[2], ['5학년 과학 실험 재료 구입', '물품 구입', '45,600', '2026. 11. 2.']);
  assert.deepEqual(gm.rows[2], ['2026 과학의 날 운영 안내', '2026. 11. 20.', '- 참가 학생 조사 (11. 13.)\n- 신청서 제출 (담당) (11. 20.) ✓', '진행 중']);
  assert.deepEqual(gm.rows[1].slice(1), ['2026. 5. 30.', '', '완료']);
  assert.deepEqual(rp.rows[1], ['2026 과학의 날 행사 운영 결과 보고서', '2026. 4. 21.', '학년별 탐구 실험(○○○ 부장님 진행)']);
  assert.equal(doc.blocks.at(-1).text, '- 3월에 계획부터 확정해요.\n- ○○○ 선생님께 장비를 받아요.');
  noPersonal(JSON.stringify(doc), '문서');
});

test('문서: 고른 것이 없으면 「(없음)」, 학년도 밖·고르지 않은 것은 들어가지 않음', () => {
  store.useStorage(mem());
  const doc = buildHandover({ year: 2026, duties: [], events: [], purchases: [], docs: [], reports: [], calendar: [] }, {});
  assert.equal(doc.blocks.filter(b => b.type === 'p' && b.text === '(없음)').length, 5);
  assert.equal(doc.blocks.at(-1).text, '');
  seed();
  const d = collectHandover({ year: 2026 });
  const text = JSON.stringify(buildHandover(pickData(d, {}), {}));
  assert.ok(!text.includes('작년 과학 교육') && !text.includes('작년 운동회') && !text.includes('다음 학년도 입학식'), '처음에 고르지 않은 것이 들어감');
});

test('표 조각: 일정 없는 업무, 품의 합계, 할 일 없는 공문은 회신 내용', () => {
  assert.deepEqual(dutyRows([{ name: '안전 교육', goal: '', schedule: [] }]), [['안전 교육', '', '']]);
  assert.deepEqual(budgetRows([{ title: 'a', kind: '협의회', amount: 1000, date: '' }, { title: 'b', kind: '협의회', amount: 2500, date: '2026-05-01' }]),
    { rows: [['a', '협의회', '1,000', ''], ['b', '협의회', '2,500', '2026. 5. 1.']], sum: 3500 });
  assert.deepEqual(docRows([{ title: 'x', due: '', dueNote: '참가 신청서 회신', tasks: [], done: false }]), [['x', '', '참가 신청서 회신', '진행 중']]);
  assert.equal(monthEntries({ docs: [{ title: 'x', due: '2026-04-01', tasks: [{ text: '같은 날 할 일', due: '2026-04-01' }] }] }).length, 1);
});

test('AI 글: 1~5만(「다음 담당자에게」는 빼고), 이름·전화번호 없음 → 답은 3~6줄로 다듬음', () => {
  seed();
  const d = collectHandover({ year: 2026 });
  const doc = buildHandover(pickData(d, {}), { note: '보내면 안 되는 글 김가람' });
  const text = handoverText(doc);
  assert.ok(text.startsWith('2026학년도 업무 인수인계서'));
  assert.ok(text.includes('과학 교육 | 탐구하는 즐거움을 느끼게 해요. 문의 ○○○') && text.includes('합계 |  | 245,600'), text.slice(0, 300));
  assert.ok(text.includes('8일 독서 교육: 독서 골든벨 / 15일 행사: 가을 운동회'), '표 칸의 줄바꿈');
  assert.ok(!text.includes('다음 담당자에게') && !text.includes('보내면 안 되는 글'), '6을 보냄');
  noPersonal(text, 'AI 글');
  const prompt = handoverPrompt(text);
  assert.ok(prompt.includes('3~6줄') && prompt.includes('해요체') && prompt.includes('{"lines"') && prompt.endsWith(text));
  noPersonal(prompt, 'AI 요청');
  assert.deepEqual(normNote({ lines: ['- 3월에 계획부터 확정해요.', '2) 김가람 선생님께 물어봐요 010-1111-2222', '', 3, '• 공문 회신을 챙겨요.', 'a', 'b', 'c', 'd'] }, ['김가람']),
    ['3월에 계획부터 확정해요.', '○○○ 선생님께 물어봐요', '공문 회신을 챙겨요.', 'a', 'b', 'c']);
  assert.deepEqual(normNote(['줄 하나']), ['줄 하나']);
  assert.deepEqual(normNote(null), []);
  assert.deepEqual(normNote({ text: '모양이 틀림' }), []);
});

test('저장: 고른 것을 바꾼 것과 「다음 담당자에게」 (학년도 자료 handover), 망가진 값', () => {
  store.useStorage(mem());
  assert.deepEqual(getSaved(), { note: '', picks: {} });
  assert.ok(saveHandover({ note: '- 메모', picks: { a: false, b: true } }));
  assert.deepEqual(getSaved(), { note: '- 메모', picks: { a: false, b: true } });
  store.set('handover', { note: 3, picks: { a: 'x', b: false } });
  assert.deepEqual(getSaved(), { note: '', picks: { b: false } });
  store.set('handover', '망가짐');
  assert.deepEqual(getSaved(), { note: '', picks: {} });
});
