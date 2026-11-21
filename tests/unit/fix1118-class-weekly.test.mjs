/* 학급 › 주간학습안내 손보기(스펙 2026-11-18-class-fix-design §B). 예시 이름은 지어낸 것 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellText, weekPeriods, weeklyDoc } from '../../web/menus/class/class-model.js';
import { notesPrompt, notesToFill, autoEvents, forParents } from '../../web/menus/class/weekly-ai.js';

const day = (date, slots, off = '') => ({ date, off, slots });
const L = (subject, title, pages = '', memo = '') => ({ subject, lesson: { unit: '4. 이야기', title, pages, memo } });
const days = [
  day('2026-11-16', [{ period: 1, ...L('국어', '이야기 이어 쓰기', '120~121') }, { period: 2, ...L('수학', '분수', '', '색종이 준비') }]),
  day('2026-11-17', [{ period: 1, ...L('국어', '이야기', '교과서 30쪽') }]),
  day('2026-11-18', [], '개교기념일'),
  day('2026-11-19', [{ period: 1, subject: '영어', lesson: null }]),
  day('2026-11-20', [])
];

test('칸 글에 교과서 쪽수(2026-11-21부터 단원도 — 교과 · 단원 · 학습 주제 (쪽수))', () => {
  assert.equal(cellText(days[0].slots[0]), '국어 · 4. 이야기 · 이야기 이어 쓰기 (120~121쪽)');
  assert.equal(cellText(days[1].slots[0]), '국어 · 4. 이야기 · 이야기 (교과서 30쪽)');
  assert.equal(cellText(days[0].slots[1]), '수학 · 4. 이야기 · 분수');
  assert.equal(cellText(days[3].slots[0]), '영어');
});

test('교시 수는 시간표 교시 수까지(줄인 뒤 숨은 칸은 내보내지 않음)', () => {
  const w = { cells: { '0-6': '방과후 교실' } };
  assert.equal(weekPeriods(days, w), 6);
  assert.equal(weekPeriods(days, w, 4), 4);
});

test('한글 문서: 학교 이름, 교시 칸 폭, 수업 없는 날은 그날 칸 모두에, 「알려 드립니다」', () => {
  const doc = weeklyDoc(days, { title: '3학년 1반 주간학습안내', cells: {}, notes: {}, announce: '다음 주 화요일은 현장체험학습이에요.\n도시락을 챙겨 주세요.' }, { periods: 2, school: '새싹초등학교' });
  assert.equal(doc.blocks[0].text, '새싹초등학교 · 11월 16일 (월) ~ 11월 20일 (금)');
  const t1 = doc.blocks.find(b => b.type === 'table');
  assert.deepEqual(t1.widths, [0.7, 2, 2, 2, 2, 2]);
  assert.equal(t1.rows.length, 3);
  assert.deepEqual(t1.rows.map(r => r[3]), ['수 11/18', '개교기념일', '-']);
  const i = doc.blocks.findIndex(b => b.type === 'h' && b.text === '알려 드립니다');
  assert.ok(i > 0 && doc.blocks[i + 1].text.includes('도시락'), JSON.stringify(doc.blocks.map(b => b.text || b.type)));
  // 알릴 글이 없으면 그 칸은 없음, 학교 이름이 없으면 날짜만
  const d2 = weeklyDoc(days, { title: 't', cells: {}, notes: {} });
  assert.ok(!d2.blocks.some(b => b.text === '알려 드립니다'));
  assert.equal(d2.blocks[0].text, '11월 16일 (월) ~ 11월 20일 (금)');
});

test('학부모께 가는 학사일정: 공문·연간계획 업무 일정은 뺌', () => {
  const ev = [{ date: '2026-11-17', title: '학부모 공개수업', source: '' }, { date: '2026-11-17', title: '정보통신윤리교육 계획: 교직원 연수', source: 'year:y1' },
    { date: '2026-11-17', title: '과학의 날 제출', source: 'gongmun' }, { date: '2026-11-17', title: '가을 운동회', source: 'event:e1' }];
  assert.equal(autoEvents(ev, '2026-11-17'), '학부모 공개수업, 가을 운동회');
  assert.ok(!forParents(ev[1]) && !forParents(ev[2]) && forParents(ev[3]));
});

test('AI 알림 지시: 화면 칸 그대로·비고, 이름·전화번호는 가려 보내고 답은 되돌림', () => {
  const notes = [{ events: '한가람 생일 잔치', notice: '김하늘 어머니 상담 010-1234-5678' }, { events: '박솔빛 선생님 공개수업' }, {}, {}, {}];
  const cells = { '1-1': '현장체험학습(이바다 학생 인솔)' };
  const cellAt = (d, p) => cells[`${d}-${p}`] ?? (days[d].off ? (p === 1 ? days[d].off : '') : (days[d].slots.find(s => s.period === p) ? cellText(days[d].slots.find(s => s.period === p)) : ''));
  const { prompt, back } = notesPrompt(days, notes, { cellAt, periods: 2 });
  for (const n of ['한가람', '김하늘', '박솔빛', '이바다', '010-1234-5678']) assert.ok(!prompt.includes(n), `${n} 남음:\n${prompt}`);
  assert.ok(prompt.includes('현장체험학습') && prompt.includes('수학 비고 색종이 준비') && prompt.includes('수요일(11/18): 수업 없음(개교기념일)'), prompt);
  assert.ok(prompt.includes('1교시 국어 · 4. 이야기 · 이야기 이어 쓰기 (120~121쪽)'), prompt);
  const tok = (prompt.match(/〔이름\d+〕/) || [])[0];
  assert.ok(tok, '자리 표시');
  assert.ok(!back(`${tok} 생일 축하`).includes('〔'), back(`${tok} 생일 축하`));
});

test('AI 답 채우기: 빈 칸만, 수업 없는 날은 건너뜀', () => {
  const got = [{ prep: '색연필', safety: '복도에서 걷기' }, { prep: '' }, { prep: '색연필', safety: '안전' }, {}, { homework: '독서록' }];
  const notes = [{ prep: '이미 씀' }, {}, {}, {}, {}];
  assert.deepEqual(notesToFill(days, notes, got), [[0, 'safety', '복도에서 걷기'], [4, 'homework', '독서록']]);
  assert.deepEqual(notesToFill(days, [{}, {}, {}, {}, {}], [{ prep: '〔이름9〕 준비' }, {}, {}, {}, {}], { bad: t => t.includes('〔이름9〕') }), []);
});

test('이름 가리기: 맡은 일 말 앞·「인솔:」 뒤의 이름(흔한 이름 목록에 없어도)', async () => {
  const { makeRedactor } = await import('../../web/core/redact.js');
  const one = s => makeRedactor().lines([s])[0].text;
  for (const [s, n] of [['사전 교육(이바다 인솔)', '이바다'], ['인솔: 박솔빛', '박솔빛'], ['박솔빛 기록 담당', '박솔빛'], ['이바다 촬영, 김하늘 발표', '이바다']]) {
    const out = one(s);
    assert.ok(!out.includes(n) && out.includes('〔이름'), `${s} → ${out}`);
  }
  // 사람이 아닌 낱말은 그대로
  for (const s of ['체험학습 인솔', '교사 인솔', '6학년 인솔', '전원 인솔', '학부모 인솔']) assert.equal(one(s), s);
  // 아는 이름 + 조사는 조사를 남기고 가림
  const r = makeRedactor();
  r.names.push('이솔');
  assert.equal(r.lines(['이솔은 기록을 맡음.'])[0].text, '〔이름1〕은 기록을 맡음.');
  const back = r.back('〔이름1〕은 기록 담당');
  assert.equal(back, '이솔은 기록 담당');
});

test('주간학습안내: 체크하지 않은 지난 칸도 진도표대로 한 것으로 셈(오늘 수업은 그대로)', async () => {
  const m = await import('../../web/menus/class/class-model.js');
  const sub0 = m.normSubject({ id: 's1', name: '국어', offset: 0, lessons: Array.from({ length: 20 }, (_, i) => ({ title: `차시 ${i + 1}` })) });
  const base = sub => ({ tt: m.normTimetable({ periods: 1, cells: [['국어'], ['국어'], ['국어'], ['국어'], ['국어']] }), subjects: [sub], breaks: [], events: [], extra: {},
    log: { '2026-11-02': { 1: { subject: '국어', status: 'done' } } }, today: '2026-11-06' });
  const idx = (ctx, date) => m.dayView(ctx, date).slots[0].index;
  // 체크: 11/2 완료, 11/3~5 체크 안 함, 오늘(11/6)은 앞날처럼 한 시간
  assert.equal(idx(base(sub0), '2026-11-09'), 2, '오늘 수업 셈');
  assert.equal(idx({ ...base(sub0), assume: true }, '2026-11-09'), 2, '진도 자리를 정한 날이 없으면(0.36 앞에 넣은 교과) 세지 않음 — 예전 진도 자리가 이미 담고 있음');
  assert.equal(idx({ ...base({ ...sub0, posAt: '2026-11-01' }), assume: true }, '2026-11-09'), 5, '정한 다음 날부터');
  const at = { ...sub0, posAt: '2026-11-04' };
  assert.equal(idx({ ...base(at), assume: true }, '2026-11-09'), 3, '진도 자리를 정한 다음 날부터');
  assert.equal(idx({ ...base({ ...sub0, posAt: '2026-11-01', since: '2026-11-05' }), assume: true }, '2026-11-09'), 2, '다음 학기 기준일 앞은 기록도 체크 안 한 칸도 세지 않음(11/5 + 오늘)');
  // 지난 날의 칸: 그 앞 체크 안 한 칸만큼
  assert.equal(idx({ ...base({ ...sub0, posAt: '2026-11-01' }), assume: true }, '2026-11-04'), 2);
  // 다음 차시 고르기는 그날을 남김
  assert.equal(m.setNext(base(sub0), sub0, 4).posAt, '2026-11-06');
  assert.equal(m.normSubject({ ...sub0, posAt: '2026-11-04' }).posAt, '2026-11-04');
});
