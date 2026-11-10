// 계획 메뉴 버그 잡기(2026-11-10): 설문 서술형 답의 이름·전화번호, 연간계획 AI에 담당자 이름, 작년 학년도 날짜를 그대로 쓴 초안 일정,
// (역할 분담표는 뺐음) (화면 쪽은 tests/e2e/hunt-plan.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { summarize } from '../../web/core/survey.js';
import { maskResult, saveEvent, getEvent, newEvent } from '../../web/menus/plan/event-model.js';
import { ownerForAI, textForAI, fitSchedule } from '../../web/menus/plan/year-model.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

test('[ev-survey-names] 설문 서술형 답 속 학생·보호자 이름, 전화번호는 ○○○로, 척도 문항·다른 답은 그대로', () => {
  store.useStorage(mem());
  const rows = [['타임스탬프', '즐거웠나요?', '좋았던 점'], ['1', '5', '김민수랑 같이 달리기 해서 좋았어요'], ['2', '4', '010-1234-5678로 연락 주세요. 이서연 엄마예요'],
    ['3', '4', '줄다리기가 재밌었어요'], ['4', '5', '박지훈 학생이 다쳤는데 빨리 도와주셔서 감사해요'], ['5', '3', '정우진 선생님 감사합니다']];
  const r = maskResult(summarize(rows));
  const text = r.questions.find(q => q.type === 'text');
  assert.deepEqual(text.answers, ['○○○랑 같이 달리기 해서 좋았어요', '○○○로 연락 주세요. ○○○ 엄마예요', '줄다리기가 재밌었어요', '○○○ 학생이 다쳤는데 빨리 도와주셔서 감사해요', '○○○ 선생님 감사합니다']);
  assert.equal(text.count, 5);
  assert.deepEqual(r.questions.find(q => q.type === 'scale'), summarize(rows).questions.find(q => q.type === 'scale'));
  assert.equal(r.n, 5);
  // 저장해도 가린 글 그대로, 개수도 그대로
  const e = saveEvent({ ...newEvent(), name: '운동회', survey: { target: 'parent', items: [], formUrl: '', result: r, textSummary: '', report: '', nextMemo: '' } });
  const st = JSON.stringify(getEvent(e.id).survey.result);
  for (const w of ['김민수', '이서연', '박지훈', '정우진', '010-1234-5678']) assert.ok(!st.includes(w), w);
  assert.equal(getEvent(e.id).survey.result.questions[1].count, 5);
});

test('[ev-survey-names] 흔한 설문 답(운동회·강당·고학년·선생님들)은 가리지 않음', () => {
  const ans = ['정말 재밌었어요', '그늘막이 더 있으면 좋겠어요', '한국 전통 놀이가 좋았어요', '강당이 좁았어요', '고학년 경기가 재밌었다', '선생님들이 친절했어요', '5학년 2반 응원이 멋있었어요', '이번 운동회는 최고였어요', '한글날에 행사를 했어요'];
  const r = maskResult(summarize([['소감'], ...ans.map(a => [a])]));
  assert.deepEqual(r.questions[0].answers, ans);
});

test('[yp-owner-ai] 담당자 칸: 부서·직함은 두고 교직원 이름·전화번호는 ○○○로', () => {
  const cases = [['독서교육부 박하늘', '독서교육부 ○○○'], ['교무부 김솔', '교무부 ○○○'], ['정보부장 이나래', '정보부장 ○○○'], ['3학년 부장 김가람', '3학년 부장 ○○○'],
    ['체육 담당 이나래 (010-1234-5678)', '체육 담당 ○○○ (○○○)'], ['연구부', '연구부'], ['도서부', '도서부'], ['교무부장', '교무부장'], ['행정실 주무관', '행정실 주무관'],
    ['기간제 교사 정우진', '기간제 교사 ○○○'], ['과학 담당 교사', '과학 담당 교사'], ['독서교육부 ○○○', '독서교육부 ○○○'], ['담당:이나래', '담당:○○○'], ['진로부 남궁민수', '진로부 ○○○']];
  for (const [a, b] of cases) assert.equal(ownerForAI(a), b, a);
  assert.equal(textForAI('책 읽는 학교. 문의 박하늘 010-2222-3333'), '책 읽는 학교. 문의 ○○○ ○○○');
  assert.equal(textForAI('스스로 책을 고르고 즐기는 독서 습관을 기른다.'), '스스로 책을 고르고 즐기는 독서 습관을 기른다.');
  assert.equal(textForAI('120만 원 (도서 구입비 1,200,000원 포함)'), '120만 원 (도서 구입비 1,200,000원 포함)');
});

test('[yp-ai-year] 초안 일정 날짜가 계획 학년도 밖이면 그 학년도의 같은 달·날로(1·2월은 다음 해, 없는 2월 29일은 28일)', () => {
  const s = [{ title: '모집', date: '2026-03-16', month: 3 }, { title: '겨울', date: '2026-01-14', month: 1 }, { title: '봄', date: '2027-04-21', month: 4 },
    { title: '끝', date: '2028-02-29', month: 2 }, { title: '윤년', date: '2024-02-29', month: 2 }, { title: '미정', date: '', month: 5 }, { title: '먼 해', date: '2029-11-02', month: 11 }];
  const r = fitSchedule(s, 2027);
  assert.deepEqual(r.schedule.map(x => x.date), ['2027-03-16', '2028-01-14', '2027-04-21', '2028-02-29', '2028-02-29', '', '2027-11-02']);
  assert.equal(r.moved, 4);
  assert.deepEqual(r.schedule.map(x => x.month), [3, 1, 4, 2, 2, 5, 11]);
  // 2026학년도(2027년 2월은 28일까지)
  assert.equal(fitSchedule([{ title: 'a', date: '2028-02-29', month: 2 }], 2026).schedule[0].date, '2027-02-28');
  assert.equal(fitSchedule(s.slice(2, 4), 2027).moved, 0);
});
