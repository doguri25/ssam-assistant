// 학급 › 기초학력 손보기(스펙 docs/superpowers/specs/2026-11-18-class-fix-design.md §C). 이름은 지어낸 것(김하늘·이바다·한가람·박솔빛).
// 1 학생 이름(성 뺀 이름 + 어떤 말이 붙어도, 띄어 쓴 이름)이 AI로 가지 않음 · 2 결과 보고서 빈 칸도 저장(칸마다 id, 내보낼 때만 뺌)
// 3 지도 시간 = 줄마다 교시 수(시각으로 셈) · 4 지금 줄에 날짜 넣기: 체크가 있는 줄을 알려 줌 · 5 날마다: 같은 날 줄 합치기·하루 한 번 체크
// 7 결재란은 비운 대로 · 8 이름 없는 학생은 「3-2 5번」 · 11 날짜 없는 줄은 출석부 준비에서 수업 일정으로
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../web/menus/class/camp-model.js';
import { campSteps, docReadiness } from '../../web/menus/class/camp-steps.js';
import { obsPrompt, reportPrompt, schedulePrompt, normSchedule, buildSessions } from '../../web/menus/class/camp-ai.js';
import { attendTable, observePages, reportDoc, confirmTable, hoursText } from '../../web/menus/class/camp-docs.js';
import { applyDates } from '../../web/menus/class/camp-sched.js';
import { tableSessions } from '../../web/menus/class/camp-plan.js';
import { maskPersons } from '../../web/core/chat-names.js';

const byId = list => Object.fromEntries(list.map(x => [x.id, x]));

/* ---------- 1. 이름 가리기 ---------- */
// 고치기 전 toAlias(견줌용 — 새 코드가 이것보다 더 새면 안 됨)
const OLD_TAIL = '(?:이)?(?:가|는|를|랑|도|의|한테|에게|하고|와|과|은|을|이|야|아|네|처럼|보다|만)?(?![가-힣])';
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function oldToAlias(text, camp) {
  let s = String(text == null ? '' : text);
  if (!s) return '';
  const map = M.aliasMap(camp);
  const pairs = camp.students.map(st => [st.name.trim(), map[st.id]]).filter(([n]) => n.length >= 2).sort((a, b) => b[0].length - a[0].length);
  for (const [n, a] of pairs) s = s.split(n).join(a);
  for (const [n, a] of pairs) { if (!/^[가-힣]{3}$/.test(n)) continue; s = s.replace(new RegExp(`(^|[^가-힣])${reEsc(n.slice(1))}(?=${OLD_TAIL})`, 'g'), `$1${a}`); }
  const t = (camp.teacher || '').trim();
  if (t.length >= 2) s = s.split(t).join('지도교사');
  s = s.replace(/(학생[A-Z])이(?=(?:가|는|를|랑|도|의|한테|에게|하고|와|야|네|처럼|보다|만)(?![가-힣]))/g, '$1')
    .replace(/(학생[A-Z])이(?![가-힣])/g, '$1가').replace(/(학생[A-Z])(은|을|과)(?![가-힣])/g, (m, a, j) => a + { 은: '는', 을: '를', 과: '와' }[j]);
  return s.split('\n').map(l => maskPersons(l).text).join('\n');
}
const three = () => M.newCamp({ name: '기초학력 교실', students: [{ id: 'p', name: '박솔빛' }, { id: 'h', name: '한가람' }, { id: 'l', name: '이바다' }] });
const GIVEN = ['솔빛', '가람', '바다'];
const leaks = (out, camp) => camp.students.flatMap(st => { const n = st.name.replace(/\s+/g, ''); return [n, n.slice(1)]; }).filter(n => out.includes(n));

test('1. 성 뺀 이름 뒤에 무엇이 붙어도 AI 글에 남지 않음(검토에서 샌 예)', () => {
  const c = three();
  const leaked = ['솔빛이에게서', '솔빛이로부터', '솔빛이께', '솔빛이었음', '바다부터', '바다마저', '바다였음', '가람이조차', '가람이랑은', '가람이며',
    '솔빛이로부터 배움', '가람이까지 통과', '바다부터 발표', '솔빛이께 칭찬', '가람이조차 어려워함', '바다마저 결석', '가람이며 바다며', '솔빛·가람 받아쓰기'];
  for (const t of leaked) {
    const out = M.toAlias(t, c);
    assert.deepEqual(GIVEN.filter(g => out.includes(g)), [], `${t} → ${out}`);
    assert.match(out, /학생[ABC]/, `${t} → ${out}`);
  }
  assert.equal(M.toAlias('솔빛이에게서 배움', c), '학생A에게서 배움', '「이」는 학생A에 맞춤');
  assert.equal(M.toAlias('솔빛이었음', c), '학생A였음');
  assert.equal(M.toAlias('가람이랑은 다름', c), '학생B랑은 다름');
  assert.equal(M.toAlias('바다부터 발표', c), '학생C부터 발표');
});

test('1. 띄어 써 넣은 이름(「김 하늘」)도 성 뺀 이름까지 가림, 글에 띄어 쓴 이름도', () => {
  const c = M.newCamp({ students: [{ id: 'a', name: '김 하늘' }, { id: 'b', name: '박솔빛' }] });
  for (const t of ['하늘 덧셈 잘함', '하늘이가 받아쓰기를 어려워함', '김하늘은 열심히 함', '김 하늘 결석', '박 솔빛이 발표', '솔빛 받아쓰기 80점']) {
    const out = M.toAlias(t, c);
    assert.ok(!/하늘|솔빛/.test(out), `${t} → ${out}`);
  }
  assert.equal(M.toAlias('하늘 덧셈 잘함', c), '학생A 덧셈 잘함');
  assert.equal(M.toAlias('김 하늘 결석', c), '학생A 결석');
});

test('1. 성 뺀 이름 + 붙는 말 모두(앞이 한글이 아니면 가림) — 줄 앞·띄어쓰기·괄호·가운뎃점·쉼표·따옴표·줄바꿈 뒤', () => {
  const c = three();
  const TAILS = ['', '이', '이가', '가', '는', '이는', '를', '이를', '랑', '이랑', '랑은', '이랑은', '도', '이도', '의', '이의', '한테', '이한테', '에게', '이에게', '에게서', '이에게서',
    '한테서', '이한테서', '로부터', '이로부터', '으로부터', '께', '이께', '께서', '이께서', '부터', '이부터', '까지', '이까지', '마저', '이마저', '조차', '이조차', '밖에', '이밖에',
    '였음', '이었음', '였다', '이었다', '이에요', '예요', '이야', '야', '아', '이며', '며', '이고', '고', '이나', '나', '이든', '든', '이라고', '라고', '와', '과', '하고', '이하고',
    '처럼', '이처럼', '보다', '이보다', '만', '이만', '네', '이네', '씨', '님', '이랑도', '에게도', '한테는', '은', '을', '이와', '이요', '이다', '이지만', '으로', '로', '이로', '와는'];
  const HEADS = ['', ' ', '(', '·', ',', '"', '\n', '- ', '1. ', '「'];
  for (const g of GIVEN) for (const h of HEADS) for (const tl of TAILS) {
    const t = `${h}${g}${tl} 받아쓰기`;
    const out = M.toAlias(t, c);
    assert.ok(!out.includes(g), `${JSON.stringify(t)} → ${JSON.stringify(out)}`);
  }
});

test('1. 새 코드는 고치기 전보다 더 새지 않음(이름 넣은 글 묶음으로 견줌), 내용 낱말은 그대로', () => {
  const camps = [three(), M.newCamp({ teacher: '한가람', students: [{ id: 'a', name: '김하늘' }, { id: 'b', name: '이바다' }] }), M.newCamp({ students: [{ id: 'a', name: '김 하늘' }] })];
  const LINES = ['김하늘이 받아쓰기를 잘함. 이바다는 하늘이와 짝. 바다가 조금 늦음. 한가람 선생님이 칭찬. 친구 박지훈과 다툼', '하늘이가 잘함. 김하늘이 발표함. 이바다은 늦음',
    '솔빛이랑 가람이는 짝 활동', '솔빛 받아쓰기 80점', '가람 결석', '하늘 덧셈 잘함', '(바다) 받아쓰기 60→85', '박솔빛·한가람·이바다 출석', '바다를 보러 감', '하늘색 색연필',
    '솔빛이에게서 배움', '가람이조차 어려워함', '바다였음', '김 하늘 결석', '박 솔빛이 발표', '가람이며 바다며', '한가람이가 발표', '이바다이었음'];
  for (const c of camps) for (const l of LINES) {
    const was = leaks(oldToAlias(l, c), c), now = leaks(M.toAlias(l, c), c);
    for (const n of now) assert.ok(was.includes(n), `고치기 전에는 가리던 이름이 샘: ${n} in ${M.toAlias(l, c)}`);
    assert.deepEqual(now, [], `${l} → ${M.toAlias(l, c)}`);
  }
  // 고치기 전에도 가리던 꼴은 그대로(조사를 학생A에 맞춤)
  const c = camps[1];
  assert.equal(M.toAlias('하늘이가 잘함. 김하늘이 발표함. 이바다은 늦음', c), '학생A가 잘함. 학생A가 발표함. 학생B는 늦음');
  assert.ok(M.toAlias('김하늘이 받아쓰기를 잘함', c).includes('받아쓰기를 잘함'));
  assert.equal(M.toAlias('푸른하늘 그림', c), '푸른하늘 그림', '앞이 한글이면 낱말(앞이 한글이 아닌 자리만 가림)');
  assert.equal(M.toAlias('하늘을 보고 그림을 그림', M.newCamp()), '하늘을 보고 그림을 그림', '학생이 없으면 그대로');
});

test('1. AI로 가는 글(관찰 메모·관찰 글·보고서 메모·지도 내용·교과·일정 글)에 성 뺀 이름이 없음', () => {
  const c = M.newCamp({ name: '기초학력 교실', teacher: '김하늘', target: '3학년', subjects: ['국어', '바다반'],
    students: [{ id: 'p', name: '박솔빛' }, { id: 'h', name: '한 가람' }, { id: 'l', name: '이바다' }],
    sessions: [{ id: 's1', date: '2027-01-08', start: '09:00', end: '09:40', subject: '국어', content: '솔빛이로부터 낱말 읽기 배움' }, { id: 's2', date: '2027-01-11', start: '09:00', end: '09:40', subject: '바다반', content: '가람이조차 덧셈 어려워함' }],
    memo: { p: '솔빛이에게서 배운 친구가 많음', h: '가람 덧셈 잘함', l: '바다마저 결석' },
    obs: { p: '솔빛이었음', h: '가람이며', l: '바다였음' },
    report: { prompt: '솔빛이께 칭찬, 가람이랑은 달리 바다부터 발표' } });
  const ps = [obsPrompt(c, ['p', 'h', 'l']), reportPrompt(c), schedulePrompt('솔빛이랑 가람이 바다 1/8~1/22 평일', c, { year: 2026, today: '2026-11-18' }).prompt];
  for (const p of ps) for (const g of [...GIVEN, '김하늘', '하늘']) assert.ok(!p.includes(g), `「${g}」 남음: ${p.slice(0, 300)}`);
});

/* ---------- 2. 결과 보고서 칸 ---------- */
test('2. 빈 칸도 저장(칸마다 id), id는 다시 읽어도 같음, 내보낼 때만 뺌', () => {
  const c = M.normCamp({ id: 'cp1', report: { sections: [{ head: '운영 목적', text: '- 목적' }, { head: '', text: '' }, { head: '운영 성과', text: '' }] } });
  assert.equal(c.report.sections.length, 3, '빈 칸도 남음');
  assert.ok(c.report.sections.every(s => typeof s.id === 'string' && s.id), JSON.stringify(c.report.sections));
  assert.equal(new Set(c.report.sections.map(s => s.id)).size, 3, 'id는 서로 다름');
  const again = M.normCamp(JSON.parse(JSON.stringify({ ...c, report: { ...c.report, sections: c.report.sections.map(({ head, text }) => ({ head, text })) } })));
  assert.deepEqual(again.report.sections.map(s => s.id), c.report.sections.map(s => s.id), 'id 없는 예전 자료도 읽을 때마다 같은 id');
  assert.deepEqual(M.normCamp(c).report.sections.map(s => s.id), c.report.sections.map(s => s.id), '있는 id는 그대로');
  const dup = M.normCamp({ id: 'cp2', report: { sections: [{ id: 'x', head: '가' }, { id: 'x', head: '나' }] } });
  assert.notEqual(dup.report.sections[0].id, dup.report.sections[1].id, '겹친 id는 고침');
  const n = M.newSection('운영 목적');
  assert.ok(n.id && n.head === '운영 목적' && n.text === '');
  // 내보내기: 머리도 글도 없는 칸은 빼고 번호를 다시 셈
  const d = reportDoc(c);
  assert.deepEqual(d.blocks.filter(b => b.type === 'h').map(b => b.text), ['1. 운영 목적', '2. 운영 성과']);
  assert.deepEqual(M.reportSections(c).map(s => s.head), ['운영 목적', '운영 성과']);
});

test('2. 단계·문서 준비: 비워 둔 [+ 칸]은 세지 않고, 글 머리만 있는 칸은 아직 안 쓴 칸', () => {
  const base = { students: [{ id: 'a', name: '김하늘' }] };
  const c = M.newCamp({ ...base, report: { sections: [{ head: '운영 목적', text: '- 목적' }, { head: '', text: '' }] } });
  const s = byId(campSteps(c));
  assert.equal(s.report.line, '1칸'); assert.equal(s.report.done, true);
  assert.equal(byId(docReadiness(c)).report.state, 'ready');
  const h = M.newCamp({ ...base, report: { sections: M.REPORT_HEADS.select.map(x => M.newSection(x)) } });
  assert.equal(byId(campSteps(h)).report.line, '아직 안 씀');
  assert.equal(byId(docReadiness(h)).report.state, 'none');
  h.report.sections[0].text = '- 목적';
  assert.equal(byId(campSteps(h)).report.line, '1 / 3칸 씀');
});

/* ---------- 3. 지도 시간 ---------- */
test('3. 지도 시간: 앱 예시(1/11~1/22, 09:00~12:40, 하루 5교시)는 날마다·교시마다 모두 총 50시간', () => {
  const spec = normSchedule({ start: '09:00', periods: 5, minutes: 40, rest: 5, order: ['국어', '수학', '국어', '수학', '국어'] }, { range: { from: '2027-01-11', to: '2027-01-22' }, weekdays: [1, 2, 3, 4, 5] });
  const day = M.newCamp({ unit: 'day', subjects: ['국어', '수학'] }), per = M.newCamp({ unit: 'period', subjects: ['국어', '수학'] });
  day.sessions = buildSessions(spec, day).sessions; per.sessions = buildSessions(spec, per).sessions;
  assert.equal(day.sessions.length, 10); assert.equal(per.sessions.length, 50);
  assert.equal(day.sessions[0].periods, 5, '날마다 줄에 교시 수');
  assert.equal(M.hoursTotal(day), 50); assert.equal(M.hoursTotal(per), 50);
  assert.equal(hoursText(day), '지도 시간: 총 ( 50 )시간');
  assert.ok(confirmTable(day).footer.includes('지도 시간: 총 ( 50 )시간'));
  assert.equal(byId(campSteps(day)).sched.line, '10줄 · 총 50시간');
  assert.ok(obsPrompt({ ...day, students: [] }, []).includes('총 50시간'), '보고서·관찰 AI 줄도');
  // 교시 수가 없는 예전 날마다 줄은 시각으로 셈(40분 + 쉬는 10분 = 한 교시)
  const old = M.newCamp({ unit: 'day', sessions: [{ id: 'd1', date: '2027-01-11', start: '09:00', end: '12:40' }, { id: 'd2', date: '2027-01-12', start: '13:40', end: '14:20' }, { id: 'd3', date: '2027-01-13' }] });
  assert.deepEqual(old.sessions.map(s => M.rowHours(old, s)), [5, 1, 1]);
  assert.equal(M.hoursTotal(old), 7);
  // 교시마다는 줄 하나가 한 시간(적은 교시 수가 있으면 그것)
  const p = M.newCamp({ sessions: [{ id: 'a', date: '2027-01-11', start: '09:00', end: '10:30' }, { id: 'b', date: '2027-01-11', start: '10:40', end: '11:20', periods: 2 }] });
  assert.equal(M.hoursTotal(p), 3);
  assert.equal(M.newSession({ periods: '3' }).periods, 3); assert.equal(M.newSession({ periods: 0 }).periods, null); assert.equal(M.newSession({}).periods, null);
});

test('3. 계획서 지도 계획 표의 같은 날 차시를 날마다 한 줄로 합치면 그 차시 수가 교시 수', () => {
  const t = { kind: 'rows', dated: 3, rows: [{ no: 1, date: '2026-09-02', start: '09:00', end: '09:40', subject: '국어', content: '읽기' }, { no: 2, date: '2026-09-02', start: '09:50', end: '10:30', subject: '수학', content: '덧셈' },
    { no: 3, date: '2026-09-03', start: '09:00', end: '09:40', subject: '국어', content: '쓰기' }] };
  const { sessions } = tableSessions(t, {}, M.newCamp({ unit: 'day' }));
  assert.deepEqual(sessions.map(s => [s.date, M.rowHours(M.newCamp({ unit: 'day' }), s)]), [['2026-09-02', 2], ['2026-09-03', 1]]);
});

/* ---------- 4. 지금 줄에 날짜 넣기 ---------- */
test('4. 지금 줄에 날짜 넣기: 날짜가 바뀌는 줄 가운데 체크가 있는 줄을 알려 주고, 체크 지우기는 그 줄만', () => {
  const c = M.newCamp({ students: [{ id: 'a', name: '김하늘' }, { id: 'b', name: '이바다' }],
    sessions: ['2026-11-16', '2026-11-17', '2026-11-18'].map((d, i) => ({ id: `s${i}`, date: d, start: '13:40', end: '14:20', subject: '국어', content: `낱말 ${i}` })),
    att: { s0: { a: 'O', b: 'X' }, s2: { a: 'O' } } });
  const specs = [{ date: '2026-11-23', start: '13:40', end: '14:20', subject: '국어' }, { date: '2026-11-24', start: '13:40', end: '14:20', subject: '국어' }, { date: '2026-11-18', start: '13:40', end: '14:20', subject: '국어' }, { date: '2026-11-25', start: '13:40', end: '14:20', subject: '' }];
  const r = applyDates(c, specs);
  assert.deepEqual(r.camp.sessions.map(s => s.date), ['2026-11-23', '2026-11-24', '2026-11-18', '2026-11-25']);
  assert.deepEqual(r.camp.sessions.slice(0, 3).map(s => s.content), ['낱말 0', '낱말 1', '낱말 2'], '지도 내용은 그대로');
  assert.deepEqual(r.moved, ['s0'], '체크가 있고 날짜가 바뀐 줄만(11/18은 같은 날)');
  assert.equal(r.added, 1); assert.equal(r.kept, 0);
  assert.deepEqual(c.sessions.map(s => s.date), ['2026-11-16', '2026-11-17', '2026-11-18'], '원래 캠프는 그대로');
  const cl = M.clearMarks(r.camp, r.moved);
  assert.equal(cl.att.s0, undefined); assert.deepEqual(cl.att.s2, { a: 'O' });
  assert.equal(applyDates(c, specs.slice(0, 1)).kept, 2, '뒤의 줄은 그대로');
});

/* ---------- 5. 날마다: 같은 날 줄 ---------- */
function dayMulti() {
  // 교시마다로 하루 5교시 × 2일 만든 뒤 날마다로 바꿈, 첫 교시만 둘 다 출석 · 둘째 날 이바다는 둘째 교시에 결석
  const c = M.newCamp({ name: '겨울 교과캠프', unit: 'day', students: [{ id: 'a', name: '김하늘' }, { id: 'b', name: '이바다' }] });
  for (const d of ['2027-01-11', '2027-01-12']) M.periodSlots('09:00', 5, 40, 10).forEach((sl, i) => c.sessions.push(M.newSession({ date: d, ...sl, subject: i % 2 ? '수학' : '국어', content: `${d.slice(-2)}일 ${i + 1}교시` })));
  for (const d of ['2027-01-11', '2027-01-12']) { const s = M.sessionsOn(c, d)[0]; c.att[s.id] = { a: 'O', b: 'O' }; }
  const s12 = M.sessionsOn(c, '2027-01-12');
  c.att[s12[0].id] = { a: 'O' }; c.att[s12[1].id] = { b: 'X' };
  return c;
}
test('5. 날마다: 같은 날 줄이 여럿이어도 단계·출석 화면(남은 칸)·출석 수가 날짜로 맞음', () => {
  const c = dayMulti();
  const att = byId(campSteps(c)).att;
  assert.equal(att.line, '2 / 2일 체크');
  assert.equal(M.remainingOn(c, '2027-01-11'), 0, '날마다는 학생마다 그날 한 칸');
  assert.equal(M.dayDone(c, '2027-01-11'), true);
  assert.deepEqual(M.attStats(c, 'a'), { present: 2, absent: 0, marked: 2, total: 2, rate: 100 });
  assert.deepEqual(M.attStats(c, 'b'), { present: 1, absent: 1, marked: 2, total: 2, rate: 50 });
  assert.equal(M.dayMarkOf(c, '2027-01-12', 'b'), 'X');
  assert.equal(attendTable(c).rows.map(r => r.at(-1)).join(), '2,1');
  assert.equal(M.sameDateCount(c), 2);
  // 하루 칸 누르기: 그날 줄 모두에
  const c2 = M.setDayMark(c, '2027-01-12', 'b', 'O');
  assert.ok(M.sessionsOn(c2, '2027-01-12').every(s => c2.att[s.id] && c2.att[s.id].b === 'O'));
  const c3 = M.setDayMark(c2, '2027-01-12', 'b', '');
  assert.ok(M.sessionsOn(c3, '2027-01-12').every(s => !(c3.att[s.id] || {}).b), '빈칸으로');
  // 남은 칸 모두 출석(날마다): 그날 표시가 없는 학생만 ○
  const c4 = M.markRest(c3, '2027-01-12');
  assert.equal(M.dayMarkOf(c4, '2027-01-12', 'b'), 'O');
  assert.equal(M.remainingOn(c3, '2027-01-12'), 1);
  // 교시마다는 예전 그대로(줄마다 셈)
  const p = { ...c, unit: 'period' };
  assert.equal(M.remainingOn(p, '2027-01-11'), 8);
  assert.equal(M.attStats(p, 'a').total, 10);
});

test('5. 같은 날 줄 합치기: 하루 한 줄(첫 시작~끝, 교과 묶음, 지도 내용 이음, 교시 수 더함), 출석은 그날 ○가 하나라도 있으면 ○', () => {
  const c = dayMulti(), m = M.mergeSameDate(c);
  assert.equal(m.sessions.length, 2);
  const [a, b] = M.sortSessions(m.sessions);
  assert.deepEqual([a.date, a.start, a.end, a.subject, a.periods], ['2027-01-11', '09:00', '13:00', '국어·수학', 5]);
  assert.ok(a.content.startsWith('국어: 11일 1교시') && a.content.includes('수학: 11일 2교시'), a.content);
  assert.equal(M.hoursTotal(m), 10, '합쳐도 지도 시간 그대로');
  assert.deepEqual(m.att[a.id], { a: 'O', b: 'O' });
  assert.deepEqual(m.att[b.id], { a: 'O', b: 'X' });
  assert.equal(Object.keys(m.att).length, 2, '지운 줄의 체크는 남기지 않음');
  assert.equal(M.sameDateCount(m), 0);
  const one = M.newCamp({ unit: 'day', sessions: [{ id: 'x', date: '2027-01-11', start: '09:00', end: '09:40' }, { id: 'y', date: '', start: '', end: '' }, { id: 'z', date: '', start: '', end: '' }] });
  assert.deepEqual(M.mergeSameDate(one).sessions.map(s => s.id), ['x', 'y', 'z'], '날짜 없는 줄은 합치지 않음');
});

/* ---------- 7. 결재란 ---------- */
test('7. 결재란: 새 프로그램만 기본값, 비운 것은 비운 대로', () => {
  assert.deepEqual(M.newCamp().approval, ['계(담당자)', '교감', '교장']);
  assert.deepEqual(M.normCamp({ id: 'c', approval: [] }).approval, []);
  assert.deepEqual(M.normCamp({ id: 'c', approval: ['', ' '] }).approval, []);
  assert.deepEqual(M.normCamp({ id: 'c' }).approval, ['계(담당자)', '교감', '교장'], '값이 없던 자료는 기본값');
  assert.deepEqual(M.normCamp({ id: 'c', approval: ['담당', '교장'] }).approval, ['담당', '교장']);
});

/* ---------- 8. 이름 없는 학생 ---------- */
test('8. 이름 없는 학생(도달하지 못한 학생에서 옴)은 「3-2 5번」, 문서 머리 칸도', () => {
  const c = M.newCamp({ students: [{ id: 'a', grade: 3, cls: 2, no: 5, name: '' }, { id: 'b', grade: 3, cls: 2, no: 9, name: '' }, { id: 'c', name: '김하늘' }, { id: 'd', name: '' }],
    sessions: [{ id: 's1', date: '2027-01-08', start: '09:00', end: '09:40', subject: '국어', content: '읽기' }] });
  assert.deepEqual(c.students.map(s => M.shownName(s)), ['3-2 5번', '3-2 9번', '김하늘', '이름 없음']);
  assert.deepEqual(attendTable(c).head.slice(3), ['3-2 5번', '3-2 9번', '김하늘', '']);
  assert.deepEqual(attendTable({ ...c, unit: 'day' }).rows.map(r => r[2]), ['3-2 5번', '3-2 9번', '김하늘', '']);
  assert.deepEqual(observePages(c)[0].map(p => p.name), ['3-2 5번', '3-2 9번', '김하늘', '']);
});

/* ---------- 11. 날짜 없는 줄 ---------- */
test('11. 날짜 없는 줄이 있으면 출석부 준비는 수업 일정으로(출석 체크에서는 고칠 수 없음)', () => {
  const c = M.newCamp({ students: [{ id: 'a', name: '김하늘' }],
    sessions: [{ id: 's1', date: '2027-01-08', start: '09:00', end: '09:40', subject: '국어', content: '읽기' }, { id: 's2', date: '', start: '', end: '', subject: '국어', content: '쓰기' }],
    att: { s1: { a: 'O' } } });
  const r = byId(docReadiness(c)).attend;
  assert.deepEqual([r.state, r.note, r.sec], ['todo', '날짜 없는 줄 1개', 'sched']);
  const d = M.newCamp({ ...c, unit: 'day' });
  assert.deepEqual([byId(docReadiness(d)).attend.sec, byId(campSteps(d)).att.done], ['sched', false], '날마다도');
});
