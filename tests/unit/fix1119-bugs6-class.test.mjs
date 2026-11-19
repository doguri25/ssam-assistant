/* 2026-11-19 여섯 번째 버그 찾기(학급 메뉴) — 다시 생기지 않게. 예시 이름은 지어낸 것 */
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));
const at = t => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date(t + 'T08:00:00') }); };
const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const md = d => `${+d.slice(5, 7)}.${+d.slice(8, 10)}`;
/* start(월요일)부터 한 주 5줄씩 n차시(날짜 있는 진도표) */
const sem = (start, n, tag) => Array.from({ length: n }, (_, i) => {
  const mon = add(start, 7 * Math.floor(i / 5));
  return { week: Math.floor(i / 5) + 1, period: `${md(mon)}~${md(add(mon, 4))}`, from: mon, unit: tag, title: `${tag} ${i + 1}차시`, no: '', pages: '', memo: '' };
});

test('[0] 체크 없이 쓴 1학기 교과에 2학기 진도표(1학기 날짜 뒤)를 넣으면 다음 학기 진도표 — 1학기 진도 자리를 잇지 않음', async () => {
  const C = await import('../../web/menus/class/class-model.js');
  const r = ['국어', '수학', '사회', '과학', '체육', '음악'];
  try {
    for (const placed of ['2026-06-15', '2026-03-02']) { // 6/15에 넣어 진도표대로 맞춤(진도 자리 있음) · 3/2에 넣고 그대로
      store.useStorage(mem());
      at(placed);
      C.setTimetable({ periods: 6, cells: [r, r, r, r, r] });
      const first = C.addSubject({ name: '국어', lessons: sem('2026-03-02', 85, '1학기') });
      assert.ok(first);
      if (placed === '2026-06-15') assert.ok(first.offset > 0, `진도 자리 ${first.offset}`);
      at('2026-08-26');
      const old = C.listSubjects()[0];
      assert.equal(C.termStart(C.makeCtx(), old, sem('2026-08-24', 85, '2학기')), '2026-08-24', placed);
      const neu = C.replaceLessons(old, sem('2026-08-24', 85, '2학기'));
      const ctx = C.makeCtx(), slot = C.dayView(ctx, '2026-08-26').slots.find(s => s.subject === '국어');
      assert.equal(slot.lesson && slot.lesson.title, '2학기 3차시', placed);
      const p = C.progressOf(ctx, neu);
      assert.deepEqual([p.done, p.left, p.diff, p.next], [2, 83, 0, 3], placed);
      // 주간학습안내(체크하지 않은 지난 칸도 진도표대로)도 2학기 차시
      const wk = C.weekView({ ...ctx, assume: true }, '2026-08-31');
      assert.equal(C.weekCell(wk, { cells: {} }, 0, 1), '국어 · 2학기 6차시', placed);
      assert.equal(C.yearHours(ctx, neu), 2 + first.hours0, '연간 실시에 1학기 체크 전 실시를 더함');
    }
  } finally { mock.timers.reset(); }
});

test('[0] 그대로 지킴: 같은 진도표를 고쳐 넣거나 앞 진도표 기간 안에서 시작하는 진도표는 체크 기록이 없으면 그대로(기준일 없음)', async () => {
  const C = await import('../../web/menus/class/class-model.js');
  const r = ['국어', '수학', '사회', '과학', '체육', '음악'];
  try {
    at('2026-06-15');
    C.setTimetable({ periods: 6, cells: [r, r, r, r, r] });
    C.addSubject({ name: '국어', lessons: sem('2026-03-02', 85, '1학기') });
    const old = C.listSubjects()[0], ctx = C.makeCtx();
    // 글자만 고친 같은 진도표
    assert.equal(C.termStart(ctx, old, sem('2026-03-02', 85, '1학기').map((l, i) => (i === 3 ? { ...l, title: '고침' } : l))), null);
    // 앞 진도표 기간 안(5/4)에서 시작하는 진도표(앞 마지막 날짜보다 앞)
    assert.equal(C.termStart(ctx, old, sem('2026-05-04', 40, '고친 1학기')), null);
    // 앞 진도표에 날짜가 없으면(주만) 그대로
    const plain = { ...old, lessons: old.lessons.map(l => ({ ...l, from: '', period: '' })) };
    assert.equal(C.termStart(ctx, plain, sem('2026-08-24', 85, '2학기')), null);
  } finally { mock.timers.reset(); }
});

test('[1] 진도표 두 시간 줄 「2～3/4」(전각 물결표)·「2–3/4」(줄표)도 두 차시로 읽음', async () => {
  const { parseJindo } = await import('../../web/menus/class/class-import.js');
  for (const sep of ['~', '∼', '〜', '～', '–', '-']) {
    const text = ['2026학년도 3학년 국어 교육과정 연간지도계획', '주 | 기간 | 단원 | 차시 주제 | 차시 | 쪽수',
      `1 | 3.2${sep}3.6 | 1. 생각을 나누며 읽어요 | 단원 도입 | 1/4 | 8~9`, ` |  |  | 글 읽고 생각 나누기 | 2${sep}3/4 | 10~13`, ' |  |  | 정리 | 4/4 | 14'].join('\n');
    const ls = parseJindo(text, { today: '2026-11-19', year: 2026 }).subjects[0].lessons;
    assert.deepEqual(ls.map(l => l.no), ['1/4', '2/4', '3/4', '4/4'], sep);
    assert.deepEqual(ls.map(l => l.from), Array(4).fill('2026-03-02'), sep);
    assert.equal(ls[1].title, '글 읽고 생각 나누기', sep);
  }
});

const PLAN = t => ['겨울방학 기초학력 캠프 운영 계획', '대상: 3학년', '교과: 국어, 수학', '기간: 2027. 1. 11.~1. 22. 평일', t].join('\n');
const CTX = { year: 2026, today: '2026-11-19' };

test('[2] 기초학력 계획 파일(AI 없이): 「09:00~12:40 (5교시)」「5교시(09:00~12:40)」「1~4교시」처럼 「하루」 없이 적은 교시 수도 읽음', async () => {
  const { readPlan, planSchedule } = await import('../../web/menus/class/camp-plan.js');
  const { buildSessions } = await import('../../web/menus/class/camp-ai.js');
  const M = await import('../../web/menus/class/camp-model.js');
  for (const [t, n] of [['시간: 09:00~12:40 (5교시)', 5], ['운영 시간: 5교시(09:00~12:40)', 5], ['시간: 09:00 ~ 12:40 ( 5 교시 )', 5], ['일과: 1~4교시 09:00~12:10', 4],
    ['시간: 09:00~12:10 (1교시 40분, 4교시)', 4], ['시간: 09:00~12:40 (하루 5교시)', 5]]) {
    const p = readPlan(PLAN(t), CTX);
    assert.equal(p.periods, n, t);
    const camp = M.normCamp({ id: 'c', unit: 'period', subjects: ['국어', '수학'] });
    const b = buildSessions(planSchedule(p, camp), camp);
    assert.equal(b.sessions.length, 10 * n, t);
    assert.equal(M.hoursTotal({ ...camp, sessions: b.sessions }), 10 * n, t);
    // 날마다 캠프도 지도 시간은 같음
    const day = M.normCamp({ id: 'd', unit: 'day', subjects: ['국어', '수학'] });
    assert.equal(M.hoursTotal({ ...day, sessions: buildSessions(planSchedule(p, day), day).sessions }), 10 * n, t);
  }
  // 교시 수가 아닌 것: 시작 때(「6교시 후」「5교시 이후」), 교시마다 시각, 캠프 전체 차시, 그 시간에 안 들어가는 교시
  for (const t of ['운영 시간: 매주 수요일 6교시 후(14:30~15:10)', '시간: 14:00~14:40 (5교시 이후)', '시간: 1교시 09:00~09:40, 2교시 09:50~10:30',
    '시간: 13:00~16:00 (총 6차시)', '시간: 5교시(13:00~13:40)', '시간: 09:00~12:00 (4시간)']) {
    assert.equal(readPlan(PLAN(t), CTX).periods, null, t);
  }
});

test('[3] 기초학력 계획 파일(AI 없이): 교시 길이·쉬는 시간이 없으면 한 교시 40분으로 쉬는 시간을 셈(09:00~12:40 하루 5교시 → 40분·쉬는 5분)', async () => {
  const { readPlan, planSchedule, planDraft } = await import('../../web/menus/class/camp-plan.js');
  const { buildSessions } = await import('../../web/menus/class/camp-ai.js');
  const M = await import('../../web/menus/class/camp-model.js');
  const camp = M.normCamp({ id: 'c', unit: 'period', subjects: ['국어', '수학'] });
  const first = t => { const p = readPlan(PLAN(t), CTX); return [p, buildSessions(planSchedule(p, camp), camp).sessions.filter(s => s.date === '2027-01-11').map(s => `${s.start}~${s.end}`)]; };
  let [p, d] = first('시간: 09:00~12:40, 하루 5교시');
  assert.deepEqual([p.minutes, p.rest], [40, 5]);
  assert.deepEqual(d, ['09:00~09:40', '09:45~10:25', '10:30~11:10', '11:15~11:55', '12:00~12:40']);
  assert.match(planDraft(p), /09:00~12:40 하루 5교시\(40분·쉬는 5분\)/);
  [p, d] = first('시간: 09:00~13:00, 하루 5교시');
  assert.deepEqual([p.minutes, p.rest, d[4]], [40, 10, '12:20~13:00']);
  // 한 교시면 시작~끝 그대로, 적힌 쉬는 시간·교시 길이는 그대로
  [p, d] = first('시간: 14:00~14:50, 하루 1교시');
  assert.deepEqual([p.minutes, d], [50, ['14:00~14:50']]);
  [p] = first('시간: 09:00~12:40, 하루 5교시, 쉬는 시간 10분');
  assert.deepEqual([p.minutes, p.rest], [36, 10]);
  [p] = first('시간: 09:00~12:10, 하루 4교시, 1교시 40분');
  assert.equal(p.minutes, 40);
});
