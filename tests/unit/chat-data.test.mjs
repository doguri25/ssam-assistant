// 「쌤」 채팅 — 앱 자료로 바로 답하기(스펙 2026-11-14-chat-smarter §1): 묻는 글 알아보기 + 답 글(AI 없이, 학생은 번호로만)
import test from 'node:test';
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), key: () => null, length: 0 };
const D = await import('../../web/core/chat-data.js');

test('묻는 글 알아보기: 평균·학생 점수·도달·진도·시간표·출석률·공문 기한', () => {
  const q = t => D.dataQuestion(t, { today: '2026-11-11' });
  assert.equal(q('우리 반 단원평가 평균 몇 점이야').kind, 'unit');
  assert.deepEqual([q('수학 단원평가 결과 어때?').kind, q('수학 단원평가 결과 어때?').subject], ['unit', '수학']);
  const s = q('3번 학생 수학 점수 어때?');
  assert.deepEqual([s.kind, s.nos, s.subject], ['student', [3], '수학']);
  assert.deepEqual(q('12번 성적 알려줘').nos, [12]);
  assert.equal(q('도달 못한 학생 누구야').kind, 'gap');
  assert.equal(q('기초학력 들어갈 애들 몇 명이야?').kind, 'gap');
  assert.deepEqual([q('수학 진도 어디까지 나갔지').kind, q('수학 진도 어디까지 나갔지').subject], ['progress', '수학']);
  assert.equal(q('진도 늦은 과목 있어?').kind, 'progress');
  const tt = q('내일 시간표');
  assert.deepEqual([tt.kind, tt.day], ['timetable', '2026-11-12']);
  const fr = q('금요일 3교시 뭐야?');
  assert.deepEqual([fr.kind, fr.day, fr.period], ['timetable', '2026-11-13', 3]);
  assert.deepEqual([q('월요일 시간표 알려줘').day], ['2026-11-16'], '지난 월요일이 아니라 다가오는 월요일');
  assert.equal(q('기초학력 출석률 알려줘').kind, 'attendance');
  assert.deepEqual(q('캠프 2번 출석 어때?').nos, [2]);
  assert.equal(q('이번 주 공문 마감 뭐 남았어?').kind, 'gongmun');
  assert.equal(q('기한 남은 공문 있어?').kind, 'gongmun');
});

test('묻는 글이 아니면(메모·명령·하는 법) 자료 질문이 아님', () => {
  const q = t => D.dataQuestion(t, { today: '2026-11-11' });
  for (const t of ['3번 오늘 수학 점수가 많이 올랐음', '3번 발표 잘함', '단원평가 결과지 뽑아 줘', '수학 단원평가 채점해 줘', '진도표 넣어 줘', '시간표 바꾸고 싶어',
    '공문 처리해 줘', '가정통신문 써 줘', '단원평가 결과지 어떻게 뽑아?', '진도표는 어떻게 넣어?', '오늘 할 일 뭐야', '출석부 양식 만들어 줘', '평균 내는 방법 알려줘'])
    assert.equal(q(t), null, t);
});

test('단원평가 답: 교과로 거르고 최근 것부터, 평균·채점 인원·정답률 낮은 문항(번호만), 예시는 진짜가 있으면 뺌', () => {
  const units = [
    { id: 'a', title: '3학년 2학기 수학 2단원', subject: '수학', date: '2026-11-10', n: 18, avg: 82.4, low: [{ no: 3, rate: 0.45 }, { no: 7, rate: 0.52 }] },
    { id: 'b', title: '3학년 2학기 국어 1단원', subject: '국어', date: '2026-11-05', n: 20, avg: 76, low: [] },
    { id: 's', title: '예시 수학', subject: '수학', date: '2026-11-11', n: 5, avg: 90, low: [], sample: true }];
  const a = D.answerUnit({ kind: 'unit', subject: '수학' }, units);
  assert.ok(a.text.includes('「3학년 2학기 수학 2단원」') && a.text.includes('평균 82.4점') && a.text.includes('18명'), a.text);
  assert.ok(a.text.includes('3번 45%') && a.text.includes('7번 52%'), a.text);
  assert.ok(!a.text.includes('국어') && !a.text.includes('예시'), a.text);
  assert.equal(a.go, 'unit');
  const all = D.answerUnit({ kind: 'unit' }, units);
  assert.ok(all.text.indexOf('수학 2단원') < all.text.indexOf('국어 1단원'), '최근 것부터');
  assert.ok(D.answerUnit({ kind: 'unit' }, []).text.includes('아직 채점한 단원평가가 없어요'));
  assert.ok(D.answerUnit({ kind: 'unit', subject: '과학' }, units).text.includes('과학 단원평가'), '그 교과가 없으면 알림');
});

test('학생 답: 번호만, 평가마다 점수·반 평균, 가장 낮은 영역', () => {
  const a = D.answerStudent({ kind: 'student', nos: [3] }, [{ no: 3, rows: [{ title: '수학 2단원', score: 18, total: 20, pct: 90, classAvg: 82.4 }, { title: '수학 1단원', score: 12, total: 20, pct: 60, classAvg: 75 }], domains: [{ name: '도형', rate: 0.45 }, { name: '수와 연산', rate: 0.9 }] }]);
  assert.ok(a.text.startsWith('3번 학생'), a.text);
  assert.ok(a.text.includes('「수학 2단원」 18/20점(90%) · 반 평균 82.4%'), a.text);
  assert.ok(a.text.includes('도형 45%'), a.text);
  assert.ok(D.answerStudent({ kind: 'student', nos: [9] }, [{ no: 9, rows: [], domains: [] }]).text.includes('9번 학생은 채점한 단원평가가 없어요'));
});

test('도달하지 못한 학생 답: 번호와 가장 낮은 영역, 기준', () => {
  const a = D.answerGap({ kind: 'gap' }, [{ no: 3, areas: [{ name: '도형', subject: '수학', pct: 45 }], n: 2 }, { no: 7, areas: [{ name: '덧셈', subject: '수학', pct: 52.5 }], n: 2 }], 60);
  assert.ok(a.text.includes('2명') && a.text.includes('60%') && a.text.includes('3번(수학 도형 45%)') && a.text.includes('7번(수학 덧셈 52.5%)'), a.text);
  assert.equal(a.go, 'unit');
  assert.ok(D.answerGap({ kind: 'gap' }, [], 60).text.includes('기준(60%)보다 낮은 학생이 없어요'));
});

test('진도 답: 교과마다 한 차시·남은 차시·다음 차시·진도표보다 늦음/빠름', () => {
  const rows = [
    { name: '수학', actual: 23, plan: 60, expected: 25, diff: -2, started: true, next: { unit: '2. 나눗셈', title: '몫 구하기', no: '3/10' } },
    { name: '국어', actual: 30, plan: 30, expected: 30, diff: 0, started: true, next: null }];
  const a = D.answerProgress({ kind: 'progress', subject: '수학' }, rows);
  assert.ok(a.text.includes('수학 23/60차시') && a.text.includes('다음 「2. 나눗셈 · 몫 구하기(3/10)」') && a.text.includes('진도표보다 2차시 늦어요'), a.text);
  assert.ok(!a.text.includes('국어'));
  const all = D.answerProgress({ kind: 'progress' }, rows);
  assert.ok(all.text.includes('국어 30/30차시') && all.text.includes('다 했어요'), all.text);
  assert.equal(all.go, 'progress');
  assert.ok(D.answerProgress({ kind: 'progress' }, []).text.includes('진도표가 아직 없어요'));
});

test('시간표 답: 날짜·교시·교과·차시, 그 교시만, 쉬는 날·시간표 없음', () => {
  const v = { date: '2026-11-12', has: true, off: '', slots: [{ period: 1, subject: '국어', lesson: { title: '시 바꿔 쓰기' } }, { period: 2, subject: '수학', lesson: null }] };
  const a = D.answerTimetable({ kind: 'timetable', day: '2026-11-12' }, v, '2026-11-11');
  assert.ok(a.text.startsWith('내일 11월 12일(목)') && a.text.includes('1교시 국어(시 바꿔 쓰기)') && a.text.includes('2교시 수학'), a.text);
  assert.equal(a.go, 'today');
  const p = D.answerTimetable({ kind: 'timetable', day: '2026-11-12', period: 2 }, v, '2026-11-11');
  assert.ok(p.text.includes('2교시는 수학') && !p.text.includes('국어'), p.text);
  assert.ok(D.answerTimetable({ kind: 'timetable', day: '2026-11-15' }, { date: '2026-11-15', has: true, off: '주말', slots: [] }, '2026-11-11').text.includes('수업이 없어요(주말)'));
  assert.ok(D.answerTimetable({ kind: 'timetable', day: '2026-11-12' }, { date: '2026-11-12', has: false, off: '', slots: [] }, '2026-11-11').text.includes('시간표가 아직 없어요'));
});

test('기초학력 출석 답: 출석률(체크한 수업 기준), 낮은 학생 번호, 그 번호만', () => {
  const camp = { name: '수학 교과캠프', sessions: 12, students: [
    { label: '3-1 1번', no: 1, present: 9, absent: 1, marked: 10 }, { label: '3-1 2번', no: 2, present: 3, absent: 4, marked: 7 }] };
  const a = D.answerAttendance({ kind: 'attendance' }, camp);
  assert.ok(a.text.includes('「수학 교과캠프」') && a.text.includes('출석률 71%') && a.text.includes('3-1 2번 3/7'), a.text);
  assert.equal(a.go, 'camp');
  const one = D.answerAttendance({ kind: 'attendance', nos: [2] }, camp);
  assert.ok(one.text.includes('3-1 2번') && one.text.includes('출석 3번 · 결석 4번') && !one.text.includes('3-1 1번'), one.text);
  assert.ok(D.answerAttendance({ kind: 'attendance' }, null).text.includes('기초학력 프로그램이 아직 없어요'));
});

test('공문 답: 기한 지남·가까운 순, 다 한 것 빼고', () => {
  const docs = [{ title: '과학의 날 참가 신청', due: '2026-11-13', done: false }, { title: '안전 점검 결과 보고', due: '2026-11-09', done: false },
    { title: '다 한 공문', due: '2026-11-12', done: true }, { title: '기한 없는 공문', due: '', done: false }];
  const a = D.answerGongmun({ kind: 'gongmun' }, docs, '2026-11-11');
  assert.ok(a.text.indexOf('안전 점검') < a.text.indexOf('과학의 날'), a.text);
  assert.ok(a.text.includes('기한 지남(11/9)') && a.text.includes('D-2(11/13)') && !a.text.includes('다 한 공문'), a.text);
  assert.ok(a.text.includes('기한 없는 공문 1개'), a.text);
  assert.equal(a.go, 'gongmun');
  assert.ok(D.answerGongmun({ kind: 'gongmun' }, [], '2026-11-11').text.includes('남은 공문이 없어요'));
});
