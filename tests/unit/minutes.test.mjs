// 문서·소통 › 회의록(스펙 2026-11-15 2장): 메모 → 가려 보내기(redact) → AI(업무 doc) → 안건·협의·결정·할 일 칸, 고친 칸은 다시 정리해도 그대로,
// 개조식 복사 글·쌤비서 기본 회의록 문서, 최근 회의록 20개·할 일 체크, 끝내지 않은 할 일(7일 안·지남) → 「오늘」 카드·채팅 「오늘 할 일」.
// 이름은 모두 지어낸 것(김하늘·이바다·한가람·새싹초등학교)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { isYearKey } from '../../web/core/years.js';
import {
  KINDS, kindLabel, guessKind, redactInput, minutesPrompt, validMinutes, backAll, normMinutes, keepFields, keptKeys, FIELD_KEYS,
  minutesText, minutesDoc, docName, dueTodos
} from '../../web/menus/etc/minutes-ai.js';
import {
  MAX_MINUTES, newMinutesId, blankMinutes, hasContent, listMinutes, getMinutes, putMinutes, removeMinutes, currentId, setCurrent
} from '../../web/menus/etc/minutes-model.js';
import { minutesCard, gongmunCard, todoCount, continueRows, isBlank } from '../../web/menus/home/home-model.js';
import { briefing } from '../../web/core/briefing.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }
store.useStorage(mem());

const TODAY = '2026-11-15';
const MEMO = ['3학년 학년 협의회 11월 12일 15시 3학년 연구실', '참석: 김하늘 이바다 한가람 박솔 최하은',
  '1. 현장체험학습 장소 — 과학관과 박물관 두 곳 이야기함. 과학관으로 정함', '- 버스 예약은 이바다 선생님이 11월 20일까지 (문의 010-1234-5678)',
  '- 학생 김하늘 학생 안전 지도 따로 챙기기', '김하늘 080101-3123456'].join('\n');

test('[minutes-kinds] 회의 종류 다섯 가지, 이름 → 종류 짐작', () => {
  assert.deepEqual(KINDS.map(k => k[1]), ['학년 협의회', '교과 협의회', '부서 협의회', '학교운영위원회', '기타']);
  assert.equal(kindLabel('council'), '학교운영위원회');
  assert.equal(kindLabel('없는'), '기타');
  assert.equal(guessKind('3학년 학년 협의회'), 'grade');
  assert.equal(guessKind('6학년 과학 교과 협의회'), 'subject');
  assert.equal(guessKind('수학과 협의회'), 'subject');
  assert.equal(guessKind('교무부 부서 협의회'), 'dept');
  assert.equal(guessKind('제5차 학교운영위원회'), 'council');
  assert.equal(guessKind('교직원 회의'), 'etc');
});

test('[minutes-redact] 메모·칸은 한 가리개로 가림: 교직원·학생 이름 〔이름n〕, 연락처 {{n}}, 명단·주민번호 줄은 뺌, 참석 칸은 보내지 않음', () => {
  const r = redactInput(MEMO, { kind: 'grade', title: '3학년 학년 협의회', date: '2026-11-12', time: '15:00', place: '3학년 연구실', attendees: '교장 이바다 외 5명' });
  assert.ok(!/김하늘|이바다|한가람|010-1234-5678|080101/.test(r.text), r.text);
  assert.equal(r.dropped, 2); // 명단 줄·주민번호 줄
  assert.match(r.text, /〔이름1〕 선생님이 11월 20일까지/);
  assert.match(r.text, /\{\{1\}\}/);
  assert.equal(r.meta.attendees, undefined, '참석 칸은 보내지 않음');
  assert.equal(r.meta.title, '3학년 학년 협의회');
  // 돌아온 글은 원래 이름으로(같은 이름은 같은 자리 표시)
  assert.equal(r.back('버스 예약(담당: 〔이름1〕 선생님, 문의 {{1}})'), '버스 예약(담당: 이바다 선생님, 문의 010-1234-5678)');
  assert.ok(r.masked >= 2, '가린 수 ' + r.masked);
});

test('[minutes-prompt] 업무 지시: 개조식(~함·~임), 지어내지 않음, 연도 없는 날, 자리 표시는 그대로, 선생님이 적은 칸, JSON 꼴', () => {
  const p = minutesPrompt({ text: '메모 글', meta: { kind: 'grade', title: '3학년 학년 협의회', date: '', time: '15:00', place: '' }, today: TODAY, year: 2026, nImages: 2 });
  assert.ok(p.startsWith('[회의록 정리]'), p.slice(0, 30));
  for (const s of ['~함', '~임', '지어내지', 'MM-DD', '〔이름1〕', '회의 종류: 학년 협의회', '회의 이름: 3학년 학년 협의회', '시간: 15:00', '그림 2장', '"agenda"', '"todos"', '"next"', '메모 글'])
    assert.ok(p.includes(s), s);
  assert.ok(!p.includes('장소: \n') && !/날짜: $/m.test(p), '빈 칸은 쓰지 않음');
  assert.ok(minutesPrompt({ text: 'x'.repeat(20000) }).length < 15000, '메모는 12,000자까지');
});

test('[minutes-valid] AI 답 모양: 객체이고 안건·할 일·제목 가운데 하나', () => {
  assert.equal(validMinutes({ agenda: [] }), true);
  assert.equal(validMinutes({ title: '협의회' }), true);
  assert.equal(validMinutes([]), false);
  assert.equal(validMinutes(null), false);
  assert.equal(validMinutes({ foo: 1 }), false);
});

test('[minutes-norm] AI 답 → 칸: 글·목록 정리, 머리 기호 뺌, 날짜는 학년도 규칙, 할 일 기한은 회의 날 기준, 체크는 안 함', () => {
  const v = {
    title: ' 3학년   학년 협의회 ', date: '11-12', time: '15:00~16:00', place: '3학년 연구실', attendees: ['3학년 담임 5명', '교감'],
    agenda: [{ title: '1. 현장체험학습 장소', discussion: '- 과학관과 박물관을 두고 협의함\n· 거리·비용을 비교함', decisions: ['과학관으로 정함', ''] },
      '학부모 상담 주간', { title: '', discussion: [], decisions: [] }],
    todos: [{ task: '버스 예약', who: '이바다 선생님', due: '11월 20일' }, '안전 교육 자료 만들기', { task: '', who: 'x' }, { task: '날 이상함', due: '13-45' }],
    next: { date: '11-26', topic: '체험학습 사전 교육' }
  };
  const n = normMinutes(v, { year: 2026, today: TODAY });
  assert.equal(n.title, '3학년 학년 협의회');
  assert.equal(n.kind, 'grade');
  assert.equal(n.date, '2026-11-12');
  assert.equal(n.time, '15:00~16:00');
  assert.equal(n.attendees, '3학년 담임 5명, 교감');
  assert.deepEqual(n.agenda, [
    { title: '현장체험학습 장소', discussion: ['과학관과 박물관을 두고 협의함', '거리·비용을 비교함'], decisions: ['과학관으로 정함'] },
    { title: '학부모 상담 주간', discussion: [], decisions: [] }]);
  assert.deepEqual(n.todos, [
    { task: '버스 예약', who: '이바다 선생님', due: '2026-11-20', done: false },
    { task: '안전 교육 자료 만들기', who: '', due: '', done: false },
    { task: '날 이상함', who: '', due: '', done: false }]);
  assert.deepEqual(n.next, { date: '2026-11-26', topic: '체험학습 사전 교육' });
  // 1·2월은 다음 해(학년도 규칙), 지난 회의(60일 넘게 앞)도 그 해 그대로(회의 날은 지난 날) —
  // 붙인 날이 오늘보다 7일 넘게 뒤면 지난해(11월에 적은 「2-10」 회의는 지난 2월, 2026-11-15 검토 고침)
  assert.equal(normMinutes({ date: '2-10' }, { year: 2026, today: '2027-02-12' }).date, '2027-02-10');
  assert.equal(normMinutes({ date: '2-10' }, { year: 2026, today: TODAY }).date, '2026-02-10');
  assert.equal(normMinutes({ date: '9-3', todos: [{ task: '보고', due: '9-10' }] }, { year: 2026, today: TODAY }).date, '2026-09-03');
  assert.equal(normMinutes({ date: '9-3', todos: [{ task: '보고', due: '9-10' }] }, { year: 2026, today: TODAY }).todos[0].due, '2026-09-10');
  // 망가진 답
  const e = normMinutes(null, { year: 2026, today: TODAY });
  assert.deepEqual([e.title, e.date, e.agenda, e.todos, e.next, e.kind], ['', '', [], [], { date: '', topic: '' }, 'etc']);
  assert.equal(normMinutes({ agenda: Array.from({ length: 30 }, (_, i) => ({ title: `안건 ${i}` })) }).agenda.length, 12);
  assert.equal(normMinutes({ todos: Array.from({ length: 30 }, (_, i) => `할 일 ${i}`) }).todos.length, 20);
});

test('[minutes-back] 돌아온 답의 모든 글에 이름을 되돌림', () => {
  const r = redactInput('담당 이바다 선생님이 버스 예약', {});
  const v = backAll({ todos: [{ task: '버스 예약', who: '〔이름1〕 선생님' }], n: 3 }, r.back);
  assert.deepEqual(v, { todos: [{ task: '버스 예약', who: '이바다 선생님' }], n: 3 });
});

test('[minutes-keep] 다시 정리해도 선생님이 고친 칸은 그대로, 할 일 체크는 같은 할 일이면 이어 감', () => {
  const prev = { kind: 'subject', title: '고친 이름', date: '2026-11-13', time: '', place: '교무실', attendees: '교과 담당 4명',
    agenda: [{ title: '내가 쓴 안건', discussion: ['협의함'], decisions: [] }], todos: [{ task: '버스 예약', who: '', due: '', done: true }, { task: '없어질 일', who: '', due: '', done: true }], next: { date: '', topic: '' } };
  const next = normMinutes({ title: 'AI 이름', date: '11-12', place: 'AI 장소', agenda: [{ title: 'AI 안건' }], todos: [{ task: '버스 예약' }, { task: '새 일' }] }, { year: 2026, today: TODAY });
  const k = keepFields(next, prev, ['title', 'kind', 'attendees', 'agenda']);
  assert.equal(k.title, '고친 이름');
  assert.equal(k.kind, 'subject');
  assert.equal(k.attendees, '교과 담당 4명');
  assert.equal(k.date, '2026-11-12', '고치지 않은 날짜는 AI 값');
  assert.equal(k.place, 'AI 장소');
  assert.deepEqual(k.agenda, prev.agenda);
  assert.deepEqual(k.todos.map(t => [t.task, t.done]), [['버스 예약', true], ['새 일', false]]);
  // 할 일을 고쳤으면 할 일 통째로 그대로
  assert.deepEqual(keepFields(next, prev, ['todos']).todos, prev.todos);
  // 고쳤어도 빈 칸(잘못 누른 [안건 더하기]·지운 이름)은 AI 값, 그대로 둘 칸 목록
  const empty = { ...prev, title: ' ', agenda: [{ title: '', discussion: [''], decisions: [] }] };
  assert.equal(keepFields(next, empty, ['title', 'agenda']).title, 'AI 이름');
  assert.deepEqual(keepFields(next, empty, ['title', 'agenda']).agenda.map(a => a.title), ['AI 안건']);
  assert.deepEqual(keptKeys(empty, ['title', 'agenda', 'place', 'todos']), ['place', 'todos']);
  assert.ok(FIELD_KEYS.includes('next') && FIELD_KEYS.includes('todos'));
});

const REC = {
  id: 'mn1', kind: 'grade', title: '3학년 학년 협의회', date: '2026-11-12', time: '15:00', place: '3학년 연구실', attendees: '3학년 담임 5명',
  agenda: [{ title: '현장체험학습 장소', discussion: ['과학관과 박물관을 두고 협의함'], decisions: ['과학관으로 정함'] }, { title: '학부모 상담 주간', discussion: ['상담 신청을 받기로 함'], decisions: [] }],
  todos: [{ task: '버스 예약', who: '이바다 선생님', due: '2026-11-20', done: false }, { task: '안내장 보내기', who: '', due: '', done: true }],
  next: { date: '2026-11-26', topic: '체험학습 사전 교육' }
};

test('[minutes-text] [복사] 개조식 글: 머리(종류·이름)·일시·장소·참석, 안건마다 협의 내용·결정 사항, 할 일(담당·기한), 다음 회의', () => {
  const t = minutesText(REC);
  assert.equal(t, ['[학년 협의회] 3학년 학년 협의회', '□ 일시: 2026. 11. 12.(목) 15:00', '□ 장소: 3학년 연구실', '□ 참석: 3학년 담임 5명', '',
    '1. 현장체험학습 장소', '  ○ 협의 내용', '    - 과학관과 박물관을 두고 협의함', '  ○ 결정 사항', '    - 과학관으로 정함',
    '2. 학부모 상담 주간', '  ○ 협의 내용', '    - 상담 신청을 받기로 함', '',
    '□ 할 일', '  - 버스 예약 (담당: 이바다 선생님, 기한: 11. 20.(금))', '  - [완료] 안내장 보내기', '',
    '□ 다음 회의: 11. 26.(목) / 체험학습 사전 교육'].join('\n'));
  assert.equal(minutesText({}), '회의록');
});

test('[minutes-doc] 쌤비서 기본 회의록 문서: 제목(회의록), 일시·장소 표, 안건 제목·협의·결정, 할 일 표, 다음 회의', () => {
  const d = minutesDoc(REC);
  assert.equal(d.title, '3학년 학년 협의회 회의록');
  assert.equal(docName(REC), '3학년 학년 협의회 회의록');
  assert.equal(docName({ title: '교과 협의록' }), '교과 협의록');
  assert.equal(docName({}), '회의록');
  const info = d.blocks[0];
  assert.equal(info.type, 'table');
  assert.deepEqual(info.rows, [['회의 종류', '학년 협의회'], ['일시', '2026. 11. 12.(목) 15:00'], ['장소', '3학년 연구실'], ['참석', '3학년 담임 5명']]);
  const hs = d.blocks.filter(b => b.type === 'h').map(b => b.text);
  assert.deepEqual(hs, ['1. 현장체험학습 장소', '2. 학부모 상담 주간', '할 일', '다음 회의']);
  const ps = d.blocks.filter(b => b.type === 'p').map(b => b.text);
  assert.ok(ps.includes('가. 협의 내용\n  - 과학관과 박물관을 두고 협의함') && ps.includes('나. 결정 사항\n  - 과학관으로 정함'), JSON.stringify(ps));
  const todo = d.blocks.find(b => b.type === 'table' && b.head);
  assert.deepEqual(todo.rows, [['할 일', '담당', '기한', '확인'], ['버스 예약', '이바다 선생님', '2026. 11. 20.(금)', ''], ['안내장 보내기', '', '', '완료']]);
  assert.ok(ps.includes('2026. 11. 26.(목) · 체험학습 사전 교육'), JSON.stringify(ps));
});

test('[minutes-store] 회의록은 학년도 자료, 최근 20개(늦게 고친 것 먼저), 같은 id는 그 자리, 지우기, 지금 회의록', () => {
  assert.equal(isYearKey('minutes:list'), true);
  assert.equal(listMinutes().length, 0);
  const b = blankMinutes();
  assert.ok(/^mn/.test(b.id) && b.id !== newMinutesId());
  assert.equal(hasContent(b), false);
  assert.equal(hasContent({ ...b, title: '협의회' }), true);
  assert.equal(hasContent({ ...b, todos: [{ task: '할 일' }] }), true);
  for (let i = 0; i < 25; i++) putMinutes({ ...blankMinutes(), id: `m${i}`, title: `회의 ${i}`, at: 1000 + i });
  const l = listMinutes();
  assert.equal(l.length, MAX_MINUTES);
  assert.equal(l[0].id, 'm24');
  assert.ok(!l.some(x => x.id === 'm0'));
  putMinutes({ ...getMinutes('m10'), title: '고친 회의', todos: [{ task: '버스 예약', who: '이바다', due: '2026-11-20', done: true, x: 1 }] });
  const m = getMinutes('m10');
  assert.equal(listMinutes()[0].id, 'm10');
  assert.equal(m.title, '고친 회의');
  assert.deepEqual(m.todos, [{ task: '버스 예약', who: '이바다', due: '2026-11-20', done: true }]);
  removeMinutes('m10');
  assert.equal(getMinutes('m10'), null);
  setCurrent('m11');
  assert.equal(currentId(), 'm11');
  store.set('minutes:list', [{ id: 3 }, 'x', { id: 'ok', title: 'ok', agenda: 'x', todos: [{ task: '' }, null] }]);
  assert.deepEqual(listMinutes().map(x => [x.id, x.agenda.length, x.todos.length]), [['ok', 0, 0]]);
});

const MEETINGS = [
  { id: 'a', title: '3학년 학년 협의회', todos: [{ task: '버스 예약', due: '2026-11-20', done: false }, { task: '끝낸 일', due: '2026-11-16', done: true }, { task: '먼 일', due: '2026-11-30', done: false }, { task: '기한 없음', due: '', done: false }] },
  { id: 'b', title: '교무부 부서 협의회', todos: [{ task: '지난 일', due: '2026-11-13', done: false }, { task: '오늘 할 일', due: TODAY, done: false }] }];

test('[minutes-due] 끝내지 않은 할 일 가운데 기한이 7일 안(지남 포함), 가까운 차례', () => {
  const d = dueTodos(MEETINGS, TODAY);
  assert.deepEqual(d.map(x => [x.id, x.i, x.task, x.n]), [['b', 0, '지난 일', -2], ['b', 1, '오늘 할 일', 0], ['a', 0, '버스 예약', 5]]);
  assert.equal(d[2].title, '3학년 학년 협의회');
  assert.equal(dueTodos(MEETINGS, TODAY, { max: 1 }).length, 1);
  assert.deepEqual(dueTodos(null, TODAY), []);
});

test('[minutes-home] 「오늘」 기한 카드의 회의 할 일: 공문 기한과 같은 배지, 할 일 수에 더함, 이어서 하기에는 넣지 않음', () => {
  const c = minutesCard(MEETINGS, TODAY);
  // 오늘·D-n 먼저, 지난 할 일은 그 뒤(today-1115)
  assert.deepEqual(c.map(x => [x.id, x.title, x.badge, x.tone, x.sym]), [['b', '오늘 할 일', '오늘', 'err', '!'], ['a', '버스 예약', 'D-5', 'info', ''], ['b', '지난 일', '지남', 'err', '!']]);
  assert.equal(c[2].note, '2일 지났어요');
  // 공문 카드와 같은 배지 꼴
  const g = gongmunCard([{ id: 'g', title: '공문', due: '2026-11-20', done: false }], TODAY)[0];
  assert.deepEqual([g.badge, g.tone, g.note], [c[1].badge, c[1].tone, c[1].note]);
  assert.equal(todoCount({ gongmun: [{}], minutes: c, lessons: null, camp: null }), 4);
  const rows = continueRows({ brief: [{ kind: 'minutes', text: '회의 할 일 「버스 예약」' }, { kind: 'plan', text: '행사계획' }] });
  assert.deepEqual(rows.map(r => r.kind), ['plan']);
  assert.equal(isBlank({ docs: [], minutes: [MEETINGS[0]], hasTimetable: false, camps: [], rows: [] }), false);
  assert.equal(isBlank({ docs: [], hasTimetable: false, camps: [], rows: [] }), true);
});

test('[minutes-brief] 채팅 「오늘 할 일」에 「회의 할 일」: 지남·7일 안, 공문 기한과 같은 때 표시, 누르면 그 회의록', () => {
  const l = briefing({ today: TODAY, meetings: MEETINGS, docs: [{ id: 'g', title: '안전 점검', due: '2026-11-17', done: false }] });
  const k = l.filter(x => x.kind === 'minutes');
  assert.deepEqual(k.map(x => x.text), ['회의 할 일 「지난 일」', '회의 할 일 「오늘 할 일」', '회의 할 일 「버스 예약」']);
  assert.deepEqual(k.map(x => x.when), ['2일 지남', '오늘', 'D-5']);
  assert.deepEqual(k.map(x => x.hot), [true, true, false]);
  assert.deepEqual(k[0].route, { to: 'minutes', id: 'b' });
  // 공문 기한(D-2)과 섞어 가까운 차례(today-1115)
  assert.deepEqual(l.slice(0, 4).map(x => x.kind), ['minutes', 'minutes', 'gongmun', 'minutes']);
  assert.deepEqual(briefing({ today: TODAY, meetings: [null, { id: 'x', todos: 'x' }] }), []);
});
