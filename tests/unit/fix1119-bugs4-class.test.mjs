/* 2026-11-19 네 번째 버그 찾기(학급 메뉴) — 다시 생기지 않게. 예시 이름은 지어낸 것(남다율·탁보결도 지어낸 이름) */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));
const NAMES = ['김하늘', '이바다', '한가람', '박솔빛', '남다율', '탁보결'];
const leak = t => NAMES.filter(n => String(t).includes(n));

test('기초학력: 「월요일~금요일」「월~목」은 그 사이 요일 모두, 날짜 범위·「1월~3월」은 요일이 아님', async () => {
  const { findWeekdays } = await import('../../web/menus/class/camp-ai.js');
  for (const s of ['월~금', '월요일~금요일', '월요일 ~ 금요일', '(월)~(금)', '월요일부터 금요일까지', '월～금', '월요일~금요일에 운영']) assert.deepEqual(findWeekdays(s), [1, 2, 3, 4, 5], s);
  for (const s of ['월~목', '월~목요일', '월요일~목요일']) assert.deepEqual(findWeekdays(s), [1, 2, 3, 4], s);
  assert.deepEqual(findWeekdays('화~목'), [2, 3, 4]);
  for (const s of ['1월~3월', '1. 11.(월) ~ 1. 22.(금)', '2027. 1. 11.(월)~1. 22.(금)', '8일~금', '12월~1월 방학']) assert.equal(findWeekdays(s), null, s);
  assert.deepEqual(findWeekdays('월, 수, 금'), [1, 3, 5]);
  assert.deepEqual(findWeekdays('수요일'), [3]);
  const { readPlan, planSchedule, weekTimes } = await import('../../web/menus/class/camp-plan.js');
  const p = readPlan(['겨울방학 기초학력 캠프 운영 계획', '1. 대상: 3학년', '2. 교과: 국어, 수학', '3. 기간: 2027. 1. 11.~1. 22. 월요일~금요일', '4. 시간: 09:00~12:40 (하루 5교시)'].join('\n'), { year: 2026, today: '2026-11-19' });
  assert.deepEqual(p.weekdays, [1, 2, 3, 4, 5]);
  assert.equal(planSchedule(p, { subjects: ['국어', '수학'], unit: 'period', students: [] }).dates.length, 10);
  assert.deepEqual(Object.keys(weekTimes('월요일~목요일 13:40~14:20')), ['1', '2', '3', '4']);
});

test('기초학력: 전각 물결표 「～」 기간·시간도 읽음', async () => {
  const { findRange } = await import('../../web/menus/class/camp-ai.js');
  assert.deepEqual(findRange('1/8～1/23', { year: 2026, today: '2026-11-19' }), { from: '2027-01-08', to: '2027-01-23' });
  assert.deepEqual(findRange('2027. 1. 8.(금) ～ 1. 22.(금)', { year: 2026, today: '2026-11-19' }), { from: '2027-01-08', to: '2027-01-22' });
  const { readPlan } = await import('../../web/menus/class/camp-plan.js');
  const p = readPlan('기초학력 캠프\n기간: 2027. 1. 11.～1. 22. 평일\n시간: 09:00～12:40 (하루 5교시)', { year: 2026, today: '2026-11-19' });
  assert.deepEqual(p.range, { from: '2027-01-11', to: '2027-01-22' });
  assert.equal(p.start, '09:00'); assert.equal(p.end, '12:40');
});

test('진도표: 기간 칸 「3.2∼3.6」「3.2～3.6」「3. 2.~3. 6.」「3.2.(월)~3.6.(금)」「3/2~3/6」도 날짜로, 차시 칸·쪽수는 기간이 아님', async () => {
  const { periodStart, parseJindo } = await import('../../web/menus/class/class-import.js');
  for (const p of ['3.2~3.6', '3.2∼3.6', '3.2～3.6', '3.2〜3.6', '3. 2.~3. 6.', '3.2.(월)~3.6.(금)', '3/2~3/6', '3.2-3.6']) assert.equal(periodStart(p, 2026), '2026-03-02', p);
  for (const p of ['5/14', '2~3/4', '8~9', '10~11']) assert.equal(periodStart(p, 2026), '', p);
  const text = ['2026학년도 3학년 국어 교육과정 연간지도계획', '주 | 기간 | 단원 | 차시 주제 | 차시 | 쪽수',
    '1 | 3.2∼3.6 | 1. 생각을 나누며 읽어요 | 단원 도입 | 1/4 | 8~9', ' |  |  | 글 읽기 | 2/4 | 10~11',
    '2 | 3. 9.~3. 13. |  | 생각 나누기 | 3/4 | 12~13', ' |  |  | 정리 | 4/4 | 14'].join('\n');
  const ls = parseJindo(text, { today: '2026-11-19', year: 2026 }).subjects[0].lessons;
  assert.deepEqual(ls.map(l => l.from), ['2026-03-02', '2026-03-02', '2026-03-09', '2026-03-09']);
  assert.deepEqual([...new Set(ls.map(l => l.unit))], ['1. 생각을 나누며 읽어요'], '기간 글이 단원으로 들어가지 않음');
});

test('기초학력: AI 글의 직함 앞뒤 교직원 이름(협력강사·보조강사·담임)도 가림, 관찰 글 「선생님 도움을」은 그대로', async () => {
  const { toAlias } = await import('../../web/menus/class/camp-model.js');
  const camp = { name: '캠프', subjects: ['국어'], target: '3학년', teacher: '한가람', unit: 'period', students: [{ id: 's1', name: '김하늘' }] };
  for (const s of ['보조강사 이바다 선생님', '협력강사: 박솔빛', '협력강사 박솔빛 선생님과 함께 지도함', '담임 이바다 선생님께 매주 결과를 알림', '보조강사: 탁보결']) assert.deepEqual(leak(toAlias(s, camp)), [], s);
  for (const s of ['선생님 도움을 받아 해결함', '선생님 설명을 듣고 문제를 풂', '담임 선생님과 상담함']) assert.equal(toAlias(s, camp), s, s);
  assert.equal(toAlias('한가람 선생님과 함께 국어 받침 있는 낱말 받아쓰기', camp), '지도교사 선생님과 함께 국어 받침 있는 낱말 받아쓰기');
  const { readPlan, planPrompt } = await import('../../web/menus/class/camp-plan.js');
  const plan = ['기초학력 캠프 운영 계획', '1. 대상: 3학년', '2. 교과: 국어', '3. 기간: 2027. 1. 11.~1. 22. 평일', '4. 시간: 09:00~12:40', '5. 지도교사: 한가람', '6. 협력강사: 박솔빛', '7. 보조강사 이바다 선생님(학습 보조)'].join('\n');
  const p = readPlan(plan, { year: 2026, today: '2026-11-19' });
  assert.deepEqual(leak(planPrompt(plan, { ...camp, teacher: '' }, { year: 2026, today: '2026-11-19' }, p).prompt), []);
});

test('이름 가리기: 이름 뒤 괄호가 붙은 목록·화살표·「3번 이름」·「생일: 이름」도(주간학습안내 알림), 물건 목록은 그대로', async () => {
  const { makeRedactor } = await import('../../web/core/redact.js');
  const line = s => makeRedactor().line(s).text;
  for (const s of ['이번 주 생일 친구: 남다율(11/23), 탁보결(11/27)', '발표 순서 남다율(1번), 탁보결(2번)', '칭찬 릴레이(남다율 → 탁보결)', '3번 남다율', '남다율(3번)', '1인 1역: 남다율(칠판), 탁보결(우유)', '이번 주 생일: 남다율'])
    assert.deepEqual(leak(line(s)), [], s);
  for (const s of ['준비물: 도화지(8절), 사인펜(12색)', '고무줄(1개), 지우개(2개)', '국어(자), 수학(익)', '1번 정답은 3이에요', '생일 선물로 연필', '참석자: 김하늘(교장)']) assert.equal(line(s).replace(/〔이름\d+〕/g, '○○○'), s.replace('김하늘', '○○○'), s);
  const { notesPrompt } = await import('../../web/menus/class/weekly-ai.js');
  const days = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'].map(date => ({ date, off: '', slots: [] }));
  const q = notesPrompt(days, [{ notice: '이번 주 생일 친구: 남다율(11/23), 탁보결(11/27)' }, {}, {}, {}, {}], { cellAt: (d, p) => (d === 2 && p === 1 ? '국어 · 칭찬 릴레이(남다율 → 탁보결)' : ''), periods: 6 });
  assert.deepEqual(leak(q.prompt), []);
  assert.equal(q.back('〔이름1〕(11/23) 생일 축하해요'), '남다율(11/23) 생일 축하해요');
});

test('오늘 수업: 메모만 적은 칸은 시간표를 바꾼 뒤 [완료]·[남은 칸 모두 완료]를 눌러도 메모가 남음', async () => {
  const C = await import('../../web/menus/class/class-model.js');
  const T = C.today(), wd = new Date().getDay();
  if (wd < 1 || wd > 5) return; // 주말에는 그날 칸이 없음
  const r1 = ['국어', '수학', '사회', '과학', '체육', ''];
  C.setTimetable({ periods: 5, cells: [r1, r1, r1, r1, r1] });
  C.setMemo(T, 1, '국어', '색종이·풀 챙기기');
  C.setMemo(T, 2, '수학', '구체물 준비');
  let tt = C.editCell(C.getTimetable(), wd - 1, 0, '미술', T);
  tt = C.editCell(tt, wd - 1, 1, '음악', T);
  C.setTimetable(tt);
  assert.ok(C.setMark(T, 1, '미술', 'done'));
  let v = C.dayView(C.makeCtx(), T).slots;
  assert.equal(v[0].subject, '미술'); assert.equal(v[0].status, 'done'); assert.equal(v[0].memo, '색종이·풀 챙기기');
  C.markDay(C.makeCtx(), T, 'done', 'left');
  v = C.dayView(C.makeCtx(), T).slots;
  assert.equal(v[1].subject, '음악'); assert.equal(v[1].memo, '구체물 준비');
  // 체크를 지워도 메모는 남음
  C.setMark(T, 1, '미술', null);
  assert.equal(C.dayView(C.makeCtx(), T).slots[0].memo, '색종이·풀 챙기기');
});
